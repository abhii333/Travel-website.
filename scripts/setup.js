// Interactive setup wizard for Horizon Travel + Google Sheets.
//
// Run with:  node scripts/setup.js   (or: npm run setup)
//
// What it does:
//   1. Checks your Node version
//   2. Installs dependencies (root + backend) if missing
//   3. Asks for your Google Sheet ID (validates format)
//   4. Asks for your service account JSON, accepts any of:
//        - a path to a .json file you've downloaded
//        - the raw JSON pasted inline (pretty, minified, or with \n escapes)
//        - an already-base64-encoded value
//   5. Writes backend/.env and a snippet for Netlify
//   6. Does a connection test (auth + read sheet headers) so you know it works

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENV_PATH = resolve(ROOT, "backend/.env");

// ---------- Pretty printing ----------

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const c = (color, s) => `${COLORS[color]}${s}${COLORS.reset}`;
const step = (n, msg) => console.log(`\n${c("cyan", `Step ${n}:`)} ${c("bold", msg)}`);
const ok = (msg) => console.log(`  ${c("green", "✓")} ${msg}`);
const warn = (msg) => console.log(`  ${c("yellow", "!")} ${msg}`);
const err = (msg) => console.log(`  ${c("red", "✗")} ${msg}`);
const hint = (msg) => console.log(`  ${c("dim", msg)}`);

// ---------- Input ----------

// (ask is now defined above, near makeRl)

function makeRl() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Queue every line. ask() consumes one at a time. Avoids the
  // rl.question() bug where the Promise never resolves with piped + closed stdin.
  const queue = [];
  let closed = false;
  rl.on("line", (line) => queue.push(line));
  rl.on("close", () => { closed = true; });
  rl._queue = queue;
  Object.defineProperty(rl, "_closed", { get: () => closed });
  return rl;
}

function nextLine(rl) {
  return new Promise((resolve) => {
    function check() {
      if (rl._queue.length > 0) return resolve(rl._queue.shift());
      // wait for next line via setImmediate polling
      setImmediate(check);
    }
    check();
  });
}

async function ask(rl, question, { defaultValue } = {}) {
  const suffix = defaultValue ? ` ${c("dim", `[${defaultValue}]`)}` : "";
  process.stdout.write(`\n${c("magenta", "❯")} ${question}${suffix}\n  `);
  const line = await nextLine(rl);
  const trimmed = line.trim();
  return trimmed || defaultValue || "";
}

// ---------- Logic ----------

async function step1_checkNode() {
  step(1, "Check Node version");
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 18) {
    ok(`Node ${process.versions.node} — supported`);
    return true;
  }
  err(`Node ${process.versions.node} is too old. Need 18+. Install from https://nodejs.org`);
  return false;
}

function step2_installDeps() {
  step(2, "Install dependencies (root + backend)");
  const rootNm = resolve(ROOT, "node_modules");
  const backendNm = resolve(ROOT, "backend/node_modules");

  if (existsSync(rootNm) && existsSync(backendNm)) {
    ok("Already installed (node_modules present)");
    return;
  }

  warn("Running npm install — this can take a minute on first run...");

  if (!existsSync(rootNm)) {
    const r = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (r.status !== 0) process.exit(1);
  }

  if (!existsSync(backendNm)) {
    const r = spawnSync(
      "npm",
      ["install", "--no-audit", "--no-fund", "--prefix", "backend"],
    { cwd: ROOT, stdio: "inherit" }
    );
    if (r.status !== 0) process.exit(1);
  }

  ok("Dependencies installed");
}

const SHEET_ID_RE = /^[a-zA-Z0-9-_]{20,80}$/;

async function step3_collectSheetId(rl) {
  step(3, "Google Sheet ID");
  hint("Open your sheet in a browser; the URL looks like:");
  hint('  https://docs.google.com/spreadsheets/d/  <THIS>  /edit');
  hint("The middle bit is the ID. It is usually ~44 characters.");

  let value;
  while (true) {
    value = await ask(rl, "Paste your Google Sheet ID:");
    if (!value) {
      err("Sheet ID is required.");
      continue;
    }
    if (SHEET_ID_RE.test(value)) {
      ok(`Looks valid: ${c("dim", value.slice(0, 12) + "…" + value.slice(-4))}`);
      break;
    }
    warn(`Doesn't look right (got ${value.length} chars, expected 20-80 letters/digits/-/_). Paste again, or type 'skip' to set up later.`);
    const action = await ask(rl, "", { defaultValue: "skip" });
    if (action === "skip") return null;
  }
  return value;
}

function tryDecodeBase64(s) {
  try {
    const buf = Buffer.from(s, "base64");
    const text = buf.toString("utf8").trim();
    return text.startsWith("{") ? text : null;
  } catch {
    return null;
  }
}

function tryParseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Accept: file path, raw JSON, or base64. Coerce + re-emit as base64.
function resolveServiceAccount(input) {
  // Mode 1: a path to a .json file
  if (input.startsWith("/") || input.startsWith("./") || input.startsWith("~") || input.endsWith(".json")) {
    const p = input.startsWith("~")
      ? input.replace("~", process.env.HOME || "")
      : resolve(process.cwd(), input);
    if (!existsSync(p)) return { error: `File not found: ${p}` };
    const stat = statSync(p);
    if (!stat.isFile()) return { error: `${p} is not a file` };
    const text = readFileSync(p, "utf8").trim();
    const parsed = tryParseJson(text);
    if (!parsed) return { error: `File exists but its content is not valid JSON` };
    return base64Result(parsed, p);
  }

  // Mode 2: already-base64 of a JSON object
  const maybeDecoded = tryDecodeBase64(input);
  if (maybeDecoded) {
    const parsed = tryParseJson(maybeDecoded);
    if (parsed?.client_email && parsed?.private_key) {
      return { json: parsed, b64: input };
    }
  }

  // Mode 3: raw JSON (any whitespace, may contain \n escapes)
  const cleaned = input.replace(/\\n/g, "\n");
  const parsed = tryParseJson(cleaned);
  if (parsed?.client_email && parsed?.private_key) {
    return base64Result(parsed, "(pasted JSON)");
  }

  return {
    error:
      "Could not recognise the input as a file path, raw JSON, or base64. " +
      "Try pasting the entire file contents (from { to }) on one line.",
  };
}

function base64Result(json, source) {
  if (!json.client_email || !json.private_key) {
    return { error: "JSON does not contain client_email + private_key — is this a service account key?" };
  }
  // Re-emit via JSON.stringify to normalize whitespace
  const b64 = Buffer.from(JSON.stringify(json), "utf8").toString("base64");
  return { json, b64, source };
}

async function step4_collectCredentials(rl) {
  step(4, "Service account JSON");
  hint("You should have a file like horizon-travel-sheets-abc123.json");
  hint("(the JSON key downloaded from Google Cloud Console).");
  hint("");
  hint("You can paste any of:");
  hint(`  ${c("dim", "a)")} the full path to the .json file`);
  hint(`  ${c("dim", "b)")} the entire JSON contents (paste from { to })`);
  hint(`  ${c("dim", "c)")} an already-base64-encoded value`);
  hint("");
  hint("Type 'paste' if you want to paste JSON, 'skip' to set up later.");

  while (true) {
    const action = await ask(rl, "How will you provide credentials?", {
      defaultValue: "skip",
    });

    if (action === "skip") return null;

    if (action === "paste" || action === "p") {
      console.log(c("dim", "  Paste JSON, end with an empty line:"));
      const chunks = [];
      // Read lines until we see an empty line OR stdin closes.
      while (true) {
        // If stdin has closed and queue is empty, break.
        if (rl._closed && rl._queue.length === 0) break;
        if (rl._queue.length === 0) {
          await new Promise((r) => setImmediate(r));
          continue;
        }
        const line = rl._queue.shift();
        chunks.push(line);
        if (line === "" && chunks.length > 1) break;
        if (line === "" && chunks.length === 1) continue; // skip leading blank lines
      }
      const raw = chunks.join("\n").trim();
      if (!raw) {
        err("Empty input, try again.");
        continue;
      }
      const result = resolveServiceAccount(raw);
      if (result.error) { err(result.error); continue; }
      ok(`Parsed service account: ${result.json.client_email} ${c("dim", "(from " + result.source + ")")}`);
      return result;
    }

    const result = resolveServiceAccount(action);
    if (result.error) { err(result.error); continue; }
    ok(`Parsed service account: ${result.json.client_email} ${c("dim", "(from " + result.source + ")")}`);
    return result;
  }
}

async function step5_testConnection(sheetId, creds) {
  step(5, "Connection test (Google Sheets API)");
  console.log(`  ${c("dim", "Requesting an access token and reading sheet headers...")}`);

  // Dynamic import so this module isn't loaded when --help or similar.
  // Set env vars BEFORE importing so the helper picks them up.
  process.env.GOOGLE_SHEET_ID = sheetId;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = creds.b64;

  const helper = await import("../backend/google-sheets.js");
  const result = await helper.pushBookingToSheet({
    id: -1,
    created_at: "test",
    name: "test",
    email: "test",
    phone: "test",
    package: "test",
    departure_city: "test",
    destination: "test",
    travel_month: "test",
    travelers: "0",
    budget: "test",
    passport_status: "test",
    message: "test",
    consent: "test",
  });

  if (result.ok) {
    ok(`Connected to Google Sheets. A header row was ${c("dim", "(re-)written if it didn't already exist")}.`);
    return true;
  }
  if (result.reason === "auth_failed") {
    err("Could not parse the service account JSON. Double-check the file is a service account key.");
  } else if (result.reason === "api_error") {
    err(`API call failed: ${result.error}`);
    hint("Most common causes:");
    hint("  - The Sheet has NOT been shared with the service account email (Step 3 of the setup guide).");
    hint("  - The Sheets API is not enabled on the Google Cloud project.");
    hint("  - Sheet ID is wrong / sheet was deleted.");
  }
  return false;
}

function step6_writeEnv(sheetId, creds, tabName) {
  step(6, "Write env files");

  const backendEnv =
    `# Generated by scripts/setup.js — safe to edit\n` +
    `GOOGLE_SHEET_ID=${sheetId}\n` +
    `GOOGLE_SHEET_TAB_NAME=${tabName}\n` +
    `GOOGLE_SERVICE_ACCOUNT_JSON=${creds.b64}\n`;

  mkdirSync(dirname(ENV_PATH), { recursive: true });
  writeFileSync(ENV_PATH, backendEnv, "utf8");
  ok(`Wrote ${c("dim", "backend/.env")} (git-ignored, do not commit)`);

  const snippetPath = resolve(ROOT, "netlify-env.txt");
  const netlifySnippet =
    `# Paste these into Netlify → Site settings → Environment variables:\n` +
    `# (Each as a separate key — split the long base64 line if your UI needs it on one line)\n` +
    `GOOGLE_SHEET_ID=${sheetId}\n` +
    `GOOGLE_SHEET_TAB_NAME=${tabName}\n` +
    `GOOGLE_SERVICE_ACCOUNT_JSON=${creds.b64}\n`;
  writeFileSync(snippetPath, netlifySnippet, "utf8");
  ok(`Wrote ${c("dim", "netlify-env.txt")} for your Netlify dashboard paste.`);
}

function buildStartupChecklist(sheetId, creds) {
  const tabName = "Bookings";
  const snippet = [
    `=============================================`,
    `  Horizon Travel is ready to run`,
    `=============================================`,
    ``,
    `  Sheet ID:  ${sheetId}`,
    `  Tab name:  ${tabName}`,
    `  Service:   ${creds.json.client_email}`,
    ``,
    `  Next steps:`,
    ``,
    `    1. Share your Google Sheet with:`,
    `         ${creds.json.client_email}`,
    `       (Editor access — see GOOGLE-SHEETS-SETUP.md Step 3)`,
    ``,
    `    2. Start the dev server:`,
    `         npm run dev`,
    ``,
    `    3. Submit a test booking at http://localhost:3000`,
    `       (form is at the bottom of the page, "Contact" section)`,
    ``,
    `    4. Run the smoke test to verify end-to-end:`,
    `         npm run smoke`,
    ``,
    `    5. To deploy to Netlify, paste the values from`,
    `       netlify-env.txt into the Netlify dashboard and redeploy.`,
    ``,
  ].join("\n");
  console.log(c("bold", snippet));
}

async function main() {
  console.log(c("bold", "\n  Horizon Travel — setup wizard\n"));

  // Step 1
  const nodeOk = await step1_checkNode();
  if (!nodeOk) process.exit(1);

  // Step 2
  step2_installDeps();

  // Step 3-4: ask user
  const rl = makeRl();
  let sheetId;
  let creds;
  try {
    sheetId = await step3_collectSheetId(rl);
    if (!sheetId) {
      warn("Skipping Sheet ID — booking flow will work but Sheets integration is OFF.");
      console.log(`\n  To enable later, run ${c("cyan", "npm run setup")} again.\n`);
      rl.close();
      return;
    }

    creds = await step4_collectCredentials(rl);
    if (!creds) {
      warn("Skipping credentials — booking flow works without them, Sheets integration OFF.");
      rl.close();
      return;
    }
  } finally {
    rl.close();
  }

  const tabName = "Bookings";

  // Step 5: live connection test
  const ok5 = await step5_testConnection(sheetId, creds);
  if (!ok5) {
    warn("Connection test failed. Writing env anyway — you can fix creds and try `npm run smoke` later.");
  }

  // Step 6: write env files
  step6_writeEnv(sheetId, creds, tabName);

  // Final checklist
  buildStartupChecklist(sheetId, creds);
}

main().catch((e) => {
  console.error(`\n${c("red", "Setup failed:")} ${e.message}\n`);
  process.exit(1);
});
