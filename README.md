# Horizon Travel Website

A production-ready travel website with a **SQLite backend API** for local development and **Netlify Functions + Netlify Blobs** for production booking storage. Now with **Google Sheets integration** so every booking shows up in a spreadsheet the team already lives in.

## Quick start (3 commands)

```bash
npm install                    # install root + backend deps
npm run dev:backend            # terminal A: start API on :3001
npm run dev                    # terminal B: start frontend on :3000
```

Open `http://localhost:3000`, scroll to the **Contact** section, submit a booking → it's saved to SQLite immediately. ✅

Then, when you're ready, wire in Google Sheets:

```bash
npm run setup                  # interactive wizard — paste your Sheet ID + service account JSON
npm run smoke                  # spawn backend + post a fake booking + verify everything
```

That's it. The setup wizard prompts for everything in plain English and writes all the right files. Smoke test proves it works end-to-end.

## Project structure

- `index.html` - main website and booking form
- `style.css` - responsive layout and styling
- `success.html` - confirmation page after booking
- `public/` - images and frontend scripts
- `backend/` - Express API + SQLite (`server.js`, `database.js`, `google-sheets.js`)
- `netlify/functions/` - serverless API used on Netlify (`bookings.js`, `lib/google-sheets.js`)
- `scripts/` - `setup.js` (interactive wizard) + `smoke-test.js` (end-to-end verification)
- `netlify.toml` - Netlify build and hosting settings

## Run locally (manual)

If you prefer the older two-terminal flow:

```bash
npm install
npm --prefix backend install
```

Start the backend (SQLite database on port 3001):

```bash
npm run dev:backend
```

In a second terminal, start the frontend (port 3000):

```bash
npm run dev
```

Open the local URL shown in the terminal — usually `http://localhost:3000`.

## Booking database

### Local development

Bookings are saved in `backend/data/bookings.db`.

API endpoints:

- `GET /api/health` - health check
- `GET /api/bookings` - list all bookings (for inspection)
- `POST /api/bookings` - create a booking

```bash
curl http://localhost:3001/api/bookings
```

### Production on Netlify

When deployed, `POST /api/bookings` is handled by a Netlify Function and bookings are stored in **Netlify Blobs**:

```bash
curl https://YOUR-SITE.netlify.app/api/bookings
```

## Google Sheets integration (built in)

Every booking is also pushed to a Google Sheet as a new row, on top of being saved to the database. Uses **Google Sheets API v4** with a Google Cloud service account — free, no third-party subscriptions, **zero extra npm dependencies**.

The booking is saved to your existing storage FIRST, then mirrored to the sheet. If the sheet push fails, the booking is still saved and the user still sees the success page. Safe by design.

Header row written automatically. Headers (in order):

| Column           |
|------------------|
| `id`             |
| `created_at`     |
| `name`           |
| `email`          |
| `phone`          |
| `package`        |
| `departure_city` |
| `destination`    |
| `travel_month`   |
| `travelers`      |
| `budget`         |
| `passport_status`|
| `message`        |
| `consent`        |

### One-time setup (~10 min)

1. **Create a Google Sheet** and grab its ID from the URL.
2. **Create a service account** in Google Cloud → APIs & Services → Credentials → enable **Google Sheets API** first.
3. **Download the service account JSON key.**
4. **Share the Sheet with the service account email** (Editor role — this is the step everyone forgets).
5. Run `npm run setup` and paste those values when prompted.

The wizard writes `backend/.env` automatically, generates a `netlify-env.txt` snippet for the Netlify dashboard, and tests the connection live.

Full guide with click-by-click instructions: **[GOOGLE-SHEETS-SETUP.md](./GOOGLE-SHEETS-SETUP.md)**

## Available npm scripts

| Script              | What it does                                            |
|---------------------|---------------------------------------------------------|
| `npm run setup`     | Interactive setup wizard (Google Sheets env vars)        |
| `npm run smoke`     | End-to-end test (boots backend, posts fake booking)     |
| `npm run dev`       | Start frontend on :3000                                 |
| `npm run dev:backend` | Start backend on :3001                                |
| `npm run dev:all`   | Backend + frontend in one process                        |
| `npm run build`     | Production build → `dist/`                              |
| `npm start:backend` | Production-style backend start (no --watch)             |

## Build for production

```bash
npm run build
```

Production files are generated in `dist/`.

## Push to GitHub

```bash
git init
git add .
git commit -m "Add travel website with Google Sheets booking integration"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace `YOUR-USERNAME` and `YOUR-REPOSITORY` with your GitHub details.

## Deploy on Netlify

1. Go to [Netlify](https://www.netlify.com/) → **Add new site** → **Import an existing project**.
2. Connect GitHub and select your repository.
3. Confirm these settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Open **Site settings → Environment variables** and paste the three values from `netlify-env.txt` (or skip if you only want database storage for now).
5. **Deploy site.**

After deployment, submit a test booking on the live site, then open:

`https://YOUR-SITE.netlify.app/api/bookings`

You should see the saved booking data in JSON format. If Sheets is configured, your Google Sheet has a new row too.

## Environment notes

- Local dev uses SQLite through the Express backend on port `3001`.
- Netlify production uses Netlify Functions and Netlify Blobs (no extra database setup required).
- Google Sheets integration is **optional** — without the env vars set, the app behaves exactly like a vanilla booking site. The integration is purely additive.
- Google Sheets uses **zero extra npm dependencies** (signed JWT via Node `crypto`, REST via native `fetch`) — so your bundle stays small and your cold starts stay fast.
- If you later want PostgreSQL or Supabase, you can replace the storage layer while keeping the same frontend form.
