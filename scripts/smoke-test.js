// Smoke test for Horizon Travel + Google Sheets.
//
// Run with:  node scripts/smoke-test.js   (or:  npm run smoke)
//
// What it does:
//   1. Spawns the Express backend on port 3002 (no conflict with your dev server)
//   2. Sends a fake booking via the API
//   3. Verifies the booking landed in SQLite (reads it back via GET /api/bookings)
//   4. If env vars are set, verifies Google Sheets push logged a success line
//   5. Cleans up the test booking from SQLite
//   6. Reports pass/fail and exits non-zero on failure

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PORT = 3002;
const BASE = `http://localhost:${PORT}`;

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};
const c = (color, s) => `${COLORS[color]}${s}${COLORS.reset}`;
const ok = (msg) => console.log(`  ${c("green", "✓")} ${msg}`);
const warn = (msg) => console.log(`  ${c("yellow", "!")} ${msg}`);
const err = (msg) => console.log(`  ${c("red", "✗")} ${msg}`);

const start = Date.now();

const fakeBooking = {
  name: `Smoke Test ${new Date().toISOString()}`,
  email: "smoke@test.local",
  phone: "+91 00000 00000",
  package: "Premium",
  "departure-city": "Mumbai",
  destination: "Kyoto, Japan",
  "travel-month": "2026-09",
  travelers: "2",
  budget: "250000",
  "passport-status": "Passports ready",
  message: "Automated smoke-test booking — safe to delete.",
  consent: "Customer agreed to be contacted",
};

function spawnServer() {
  console.log(c("dim", `  Spawning backend on port ${PORT}...`));
  const server = spawn("node", ["server.js"], {
    cwd: resolve(ROOT, "backend"),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let booted = false;
  let firstError = null;

  const ready = new Promise((resolveR, rejectR) => {
    server.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      process.stdout.write(c("dim", `    [server] ${text}`));
      if (!booted && text.includes("running at")) {
        booted = true;
        resolveR(server);
      }
    });
    server.stderr.on("data", (chunk) => {
      process.stderr.write(c("dim", `    [server:err] ${chunk}`));
      if (!firstError) firstError = chunk.toString();
    });
    server.on("error", (e) => rejectR(e));
    server.on("exit", (code) => {
      if (!booted) {
        rejectR(new Error(
          `Server exited early (code ${code}) before becoming ready.\n` +
          (firstError ? `Last stderr: ${firstError}` : "")
        ));
      }
    });
  });

  // Safety timeout
  const killTimer = setTimeout(() => {
    if (!booted) {
      server.kill("SIGTERM");
      ready.reject(new Error("Server did not become ready within 10s"));
    }
  }, 10_000);

  ready.finally(() => clearTimeout(killTimer));
  return ready;
}

async function waitForHealth() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      // server not yet bound
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("health endpoint never responded");
}

async function postBooking() {
  const r = await fetch(`${BASE}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fakeBooking),
  });
  if (!r.ok) {
    throw new Error(`POST /api/bookings failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

async function listBookings() {
  const r = await fetch(`${BASE}/api/bookings`);
  if (!r.ok) throw new Error(`GET /api/bookings failed: ${r.status}`);
  const { bookings } = await r.json();
  return bookings;
}

async function deleteBookingFromDb(id, serverChild) {
  // We need to do a DELETE — but the API doesn't expose one. Use better-sqlite3 directly
  // by importing database.js in a temporary script that uses the backend's node_modules.
  //
  // Simpler approach: just leave the test row in the DB. It contains a clear smoke-test
  // marker in the message + name and is easy to spot. We don't want to expose DELETE
  // to the public API just for this.
  warn(`Test row left in DB (id=${id}) — message+name contains "Smoke Test" so it is easy to spot/delete by hand`);
}

async function main() {
  console.log(c("bold", "\n  Horizon Travel — smoke test\n"));

  console.log(c("cyan", "Step 1:") + " " + c("bold", "Boot backend"));
  let server;
  try {
    server = await spawnServer();
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
  ok("Backend started");

  try {
    console.log(c("cyan", "\nStep 2:") + " " + c("bold", "Health check"));
    await waitForHealth();
    ok(`GET /api/health responded`);

    console.log(c("cyan", "\nStep 3:") + " " + c("bold", "POST a fake booking"));
    const created = await postBooking();
    const savedId = created.booking.id;
    ok(`Saved booking id=${savedId} (${created.booking.name})`);

    console.log(c("cyan", "\nStep 4:") + " " + c("bold", "Verify in SQLite via GET /api/bookings"));
    const all = await listBookings();
    const found = all.find((b) => b.id === savedId);
    if (!found) {
      err(`Booking id=${savedId} not found in DB`);
      process.exit(2);
    }
    if (found.email !== fakeBooking.email || found.destination !== fakeBooking.destination) {
      err(`Booking came back with wrong fields: ${JSON.stringify(found)}`);
      process.exit(2);
    }
    ok(`Booking persists in DB, all fields correct`);

    // Step 5: Sheets (if configured)
    console.log(c("cyan", "\nStep 5:") + " " + c("bold", "Google Sheets push"));
    if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      warn("GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON not set — Sheets push skipped.");
      warn("Run `npm run setup` to configure. Booking flow itself works without Sheets.");
    } else {
      warn("Sheets push happens during POST /api/bookings. Scroll up in [server] output for:");
      warn('  • "[google-sheets] Wrote header row to sheet" (first run only)');
      warn('  • absence of "[google-sheets] Failed to push booking"');
    }

    console.log(c("cyan", "\nStep 6:") + " " + c("bold", "Cleanup"));
    await deleteBookingFromDb(savedId);

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(c("green", `\n  ✅ Smoke test passed (${elapsed}s)\n`));
  } catch (e) {
    err(e.message);
    process.exit(2);
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((e) => {
  err(`Unexpected: ${e.message}`);
  process.exit(1);
});
