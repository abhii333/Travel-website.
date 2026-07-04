// Google Sheets integration for the Express + SQLite backend.
// Identical behavior to netlify/functions/lib/google-sheets.js — kept in
// backend/ because the backend has its own package.json (no cross-folder
// imports required).
//
// ZERO npm dependencies — uses only Node built-ins (crypto + native fetch).
// Tiny bundle, fast cold start, easy to audit.

import crypto from "node:crypto";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB_NAME = process.env.GOOGLE_SHEET_TAB_NAME || "Bookings";
const CREDENTIALS_B64 =
  process.env.GOOGLE_CREDENTIALS_BASE64 ||
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Column order MUST stay stable — we read/write the sheet by position.
const HEADERS = [
  "id",
  "created_at",
  "name",
  "email",
  "phone",
  "package",
  "departure_city",
  "destination",
  "travel_month",
  "travelers",
  "budget",
  "passport_status",
  "message",
  "consent",
];

let cachedToken = null;
let cachedCreds = null;

function isConfigured() {
  return Boolean(SHEET_ID && CREDENTIALS_B64);
}

function base64UrlEncode(input) {
  const buf =
    typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function loadCredentials() {
  if (cachedCreds) return cachedCreds;
  try {
    const json = Buffer.from(CREDENTIALS_B64, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("Missing client_email or private_key");
    }
    cachedCreds = parsed;
    return cachedCreds;
  } catch (error) {
    console.error(
      "[google-sheets] GOOGLE_CREDENTIALS_BASE64 is not valid base64 JSON:",
      error.message
    );
    return null;
  }
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiryMs - 10 * 60 * 1000) {
    return cachedToken.accessToken;
  }

  const creds = loadCredentials();
  if (!creds) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: creds.client_email,
    scope: SCOPES.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const claimB64 = base64UrlEncode(JSON.stringify(claim));
  const signingInput = `${headerB64}.${claimB64}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(creds.private_key);
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(
      `Token exchange failed (${tokenRes.status}): ${errText.slice(0, 200)}`
    );
  }

  const body = await tokenRes.json();
  cachedToken = {
    accessToken: body.access_token,
    expiryMs: Date.now() + (body.expires_in || 3600) * 1000,
  };
  return cachedToken.accessToken;
}

function bookingToRow(booking) {
  return HEADERS.map((key) => {
    const value = booking[key];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

async function fetchWithRetry(url, options, { attempts = 3 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const delay = 200 * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
      }
    }
  }
  throw lastError || new Error("fetchWithRetry exhausted");
}

async function ensureHeaders(token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(
    TAB_NAME
  )}!A1:Z1`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `Header check failed (${res.status}): ${(await res.text()).slice(0, 200)}`
    );
  }
  const data = await res.json();
  const firstRow = data.values?.[0] || [];
  const alreadyHasHeaders =
    firstRow.length >= HEADERS.length &&
    HEADERS.every((h, i) => firstRow[i] === h);
  if (alreadyHasHeaders) return;

  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(
    TAB_NAME
  )}!A1?valueInputOption=RAW`;
  const writeRes = await fetchWithRetry(writeUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [HEADERS] }),
  });
  if (!writeRes.ok) {
    throw new Error(
      `Header write failed (${writeRes.status}): ${(await writeRes.text()).slice(
        0,
        200
      )}`
    );
  }
  console.log("[google-sheets] Wrote header row to sheet");
}

async function appendRow(token, row) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(
      `${TAB_NAME}!A:A`
    )}:append`
  );
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  url.searchParams.set("insertDataOption", "INSERT_ROWS");

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    throw new Error(
      `Append failed (${res.status}): ${(await res.text()).slice(0, 200)}`
    );
  }
}

/**
 * Append a single booking to the Google Sheet.
 * Returns { ok: true } on success, { ok: false, reason } on any failure.
 * Never throws — booking is already saved by the caller.
 */
export async function pushBookingToSheet(booking) {
  if (!isConfigured()) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, reason: "auth_failed" };

    await ensureHeaders(token);
    await appendRow(token, bookingToRow(booking));

    return { ok: true };
  } catch (error) {
    console.error("[google-sheets] Failed to push booking:", error.message);
    return { ok: false, reason: "api_error", error: error.message };
  }
}

export const _internal = { HEADERS, isConfigured };
