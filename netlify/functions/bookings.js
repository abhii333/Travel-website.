import { getStore } from "@netlify/blobs";
import { jsonResponse, normalizeBooking, validateBooking } from "./lib/booking-utils.js";
import { pushBookingToSheet } from "./lib/google-sheets.js";

const STORE_NAME = "travel-bookings";

async function getBookingsStore() {
  return getStore(STORE_NAME);
}

async function readBookings() {
  const store = await getBookingsStore();
  const raw = await store.get("bookings", { type: "json" });
  return Array.isArray(raw) ? raw : [];
}

async function writeBookings(bookings) {
  const store = await getBookingsStore();
  await store.setJSON("bookings", bookings);
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  const booking = normalizeBooking(body);
  const errors = validateBooking(booking);

  if (errors.length > 0) {
    return jsonResponse(400, { error: errors.join(" ") });
  }

  const bookings = await readBookings();
  const saved = {
    id: bookings.length > 0 ? bookings[0].id + 1 : 1,
    ...booking,
    created_at: new Date().toISOString(),
  };

  bookings.unshift(saved);
  await writeBookings(bookings);

  // Best-effort push to Google Sheets. Never throws, never fails the request —
  // the booking is already safely in Netlify Blobs above.
  const sheetResult = await pushBookingToSheet(saved);
  if (!sheetResult.ok && sheetResult.reason !== "not_configured") {
    console.warn(
      "[bookings] Booking saved to Blobs but Sheets push failed:",
      sheetResult
    );
  }

  return jsonResponse(201, { message: "Booking saved.", booking: saved });
};

export const config = {
  path: "/api/bookings",
};
