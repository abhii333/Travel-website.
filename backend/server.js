import cors from "cors";
import express from "express";
import { createBooking, getAllBookings } from "./database.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function validateBooking(body) {
  const errors = [];

  if (!body.name?.trim()) errors.push("Name is required.");
  if (!body.email?.trim()) errors.push("Email is required.");
  if (!body.phone?.trim()) errors.push("Phone is required.");
  if (!body.message?.trim()) errors.push("Message is required.");
  if (!body.consent) errors.push("Contact consent is required.");

  return errors;
}

function normalizeBooking(body) {
  return {
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim(),
    phone: String(body.phone || "").trim(),
    package: String(body.package || "").trim(),
    departure_city: String(body["departure-city"] || body.departure_city || "").trim(),
    destination: String(body.destination || "").trim(),
    travel_month: String(body["travel-month"] || body.travel_month || "").trim(),
    travelers: Number.parseInt(body.travelers, 10) || 1,
    budget: String(body.budget || "").trim(),
    passport_status: String(body["passport-status"] || body.passport_status || "").trim(),
    message: String(body.message || "").trim(),
    consent: String(body.consent || "").trim(),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", database: "sqlite" });
});

app.get("/api/bookings", (_req, res) => {
  res.json({ bookings: getAllBookings() });
});

app.post("/api/bookings", (req, res) => {
  const booking = normalizeBooking(req.body);
  const errors = validateBooking(booking);

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  try {
    const saved = createBooking(booking);
    res.status(201).json({ message: "Booking saved.", booking: saved });
  } catch (error) {
    console.error("Failed to save booking:", error);
    res.status(500).json({ error: "Could not save booking." });
  }
});

app.listen(PORT, () => {
  console.log(`Horizon Travel API running at http://localhost:${PORT}`);
});
