import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "bookings.db");

mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    package TEXT,
    departure_city TEXT,
    destination TEXT,
    travel_month TEXT,
    travelers INTEGER,
    budget TEXT,
    passport_status TEXT,
    message TEXT,
    consent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const insertBooking = db.prepare(`
  INSERT INTO bookings (
    name, email, phone, package, departure_city, destination,
    travel_month, travelers, budget, passport_status, message, consent
  ) VALUES (
    @name, @email, @phone, @package, @departure_city, @destination,
    @travel_month, @travelers, @budget, @passport_status, @message, @consent
  )
`);

const listBookings = db.prepare(`
  SELECT * FROM bookings ORDER BY created_at DESC
`);

export function createBooking(booking) {
  const result = insertBooking.run(booking);
  return getBookingById(result.lastInsertRowid);
}

export function getBookingById(id) {
  return db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
}

export function getAllBookings() {
  return listBookings.all();
}

export default db;
