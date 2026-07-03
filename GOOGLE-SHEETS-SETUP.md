# Google Sheets Setup for "Horizon Travel" Bookings

Every booking submitted via the contact form will now also appear as a new
row in your Google Sheet. This guide walks you through the one-time setup.

> **Time required:** ~10 minutes.
> **Cost:** $0 (Google Sheets API has a generous free quota — 60 requests/minute
> per user; for the booking volume of a travel agency you'll never bump into it).

---

## How it works

```
User clicks "Submit Inquiry"
         │
         ▼
POST /api/bookings → your backend
         │
         ├─► save to DB / Netlify Blobs (existing behavior, never breaks)
         │
         └─► push the same row to your Google Sheet (best-effort)
                  │
                  └─ failure? log it, return success to user anyway
```

Booking is saved FIRST. If Sheets is down, the user still gets their
confirmation page. Best of both worlds.

---

## Step 1 — Create the Google Sheet

1. Go to https://sheets.google.com → **+ Blank**.
2. Name it e.g. `Horizon Travel Bookings`.
3. Rename the bottom tab from `Sheet1` to **`Bookings`** (or set a different
   tab name later — see env var below).
4. Copy the sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ←THIS_LONG_STRING→  /edit#gid=0
   ```
   Save it somewhere — you'll paste it into env vars.

> Don't add any header row manually. The code writes the header row on
> the very first booking.

---

## Step 2 — Create a Google Cloud service account

A "service account" is a non-human Google identity you grant API access to.

1. Open https://console.cloud.google.com/.
2. Top bar → **Select a project** → **New project** → name it
   `horizon-travel-sheets` → **Create**.
3. Wait ~10 seconds, make sure the new project is selected.
4. Left menu → **APIs & Services** → **Library**.
5. Search for **Google Sheets API** → click it → **Enable**.
6. Left menu → **APIs & Services** → **Credentials**.
7. Click **+ Create credentials** → **Service account**.
8. Service account name: `horizon-sheets-writer` → **Create and continue**.
9. Skip the optional "Grant access" step → **Done**.
10. You should now see the service account in the list. Click its email
    (looks like `horizon-sheets-writer@horizon-travel-sheets.iam.gserviceaccount.com`).

**Create a JSON key:**

11. On the service account page → **Keys** tab → **Add key** → **Create new key**
    → **JSON** → **Create**.
12. A file downloads — e.g. `horizon-travel-sheets-abc123.json`. This is your
    **service account key**. Treat it like a password — anyone with this file
    can write to your Sheet.

> ⚠️ **Never commit this file to git.** It's already in `.gitignore` via
> `*.local` and the explicit `backend/.env` / `.env` lines, but double-check
> you don't accidentally drag it into a commit.

---

## Step 3 — Share the Sheet with the service account

This is the step everyone forgets. Without it, you get a `403 PERMISSION_DENIED`.

1. Open the Sheet you created in Step 1.
2. Top right → **Share**.
3. Paste the service account email from Step 2
   (`horizon-sheets-writer@horizon-travel-sheets.iam.gserviceaccount.com`).
4. Role: **Editor**.
5. Uncheck "Notify people" → **Share**.

---

## Step 4 — Encode the key file as a single-line env var

Service account JSON has lots of newlines that env vars hate. Encode it:

**macOS / Linux:**

```bash
base64 -w 0 path/to/horizon-travel-sheets-abc123.json
```

**Windows (PowerShell):**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\horizon-travel-sheets-abc123.json"))
```

You'll get a single long string. Copy it.

---

## Step 5a — Local development

In the repo root:

```bash
cp .env.example backend/.env   # if backend/.env doesn't exist yet
# OR just create backend/.env with the contents below
```

Fill `backend/.env`:

```ini
GOOGLE_SHEET_ID=1aBcD...        # from Step 1
GOOGLE_SHEET_TAB_NAME=Bookings  # or your tab name
GOOGLE_SERVICE_ACCOUNT_JSON=eyJ0eXAiOiJKV1Q...  # base64 from Step 4
```

Then restart your dev server:

```bash
npm run dev:all
```

Submit a test booking via the form — you should see a new row appear in
your Google Sheet within ~1 second.

> If you don't see a row, scroll to "Debugging" below.

---

## Step 5b — Netlify production

1. Open the Netlify dashboard → your site → **Site settings** → **Environment variables**.
2. Add the three variables (paste the same values as local):

   | Key                            | Value                                          |
   |--------------------------------|------------------------------------------------|
   | `GOOGLE_SHEET_ID`              | The ID from Step 1                             |
   | `GOOGLE_SHEET_TAB_NAME`        | `Bookings` (or your tab name)                  |
   | `GOOGLE_SERVICE_ACCOUNT_JSON`  | The base64 string from Step 4                  |

3. **Important:** scope the env vars to **All** scopes (or at minimum
   "Functions" + "Post processing" + "Build").
4. Trigger a redeploy (Deploys → **Trigger deploy** → **Deploy site**).
5. Submit a real booking — row appears in the Sheet.

---

## What columns appear in the Sheet

| Column           | Source                                                   |
|------------------|----------------------------------------------------------|
| `id`             | DB auto-increment (local) / blob array id (Netlify)      |
| `created_at`     | ISO timestamp                                            |
| `name`           | Form input                                               |
| `email`          | Form input                                               |
| `phone`          | Form input                                               |
| `package`        | Basic / Premium / Luxury / Custom                        |
| `departure_city` | Mumbai / Delhi / etc.                                    |
| `destination`    | Amalfi / Kyoto / Maldives / Swiss / Custom               |
| `travel_month`   | Form input (YYYY-MM)                                     |
| `travelers`      | Number                                                   |
| `budget`         | Form input (free-text INR)                               |
| `passport_status`| "Passports ready" / "Need passport guidance" / etc.      |
| `message`        | Free text                                                |
| `consent`        | "Customer agreed to be contacted"                        |

Headers are written on the very first booking, automatically. If you want
to add custom columns yourself, leave column A through N for the code and
start your own notes in column O onward.

---

## Debugging

### "Nothing happens, no row appears"

1. Did you **share the Sheet with the service account email** (Step 3)?
   This is the #1 reason. You'll see a log line like
   `The caller does not have permission` in your server logs.
2. Is the sheet ID correct? It should be ~44 characters, all letters/digits/`-`/`_`.
3. Is the tab name an exact match? It's case-sensitive.

### Logs you can grep for

Local dev server logs:
```
[google-sheets] Wrote header row to sheet    # first push, header was missing
[google-sheets] Failed to push booking: ...  # any error
[server] Booking saved to SQLite but Sheets push failed: ...
```

Netlify function logs (Dashboard → Functions → bookings → Logs):
```
[google-sheets] Wrote header row to sheet
[google-sheets] Failed to push booking: ...
[bookings] Booking saved to Blobs but Sheets push failed: ...
```

If you see `reason: "not_configured"` it means env vars weren't loaded —
double-check the env var names are spelled exactly right.

### Want a fresh sheet?

Delete the rows, share the new sheet with the service account, update
`GOOGLE_SHEET_ID`. The code will write the header row again on the next
booking.

---

## Why not Zapier / Make / SheetDB?

| Option         | Pros                       | Cons                                                  |
|----------------|----------------------------|-------------------------------------------------------|
| **This (Direct API)** | Free, fast, owned           | Needs one-time Google Cloud setup                    |
| Zapier         | Zero code                  | $20+/mo at scale, fragile webhooks, data lives elsewhere |
| Make.com       | Visual flows               | $9+/mo, similar issues                              |
| SheetDB        | Quick to set up            | Free tier caps (250 rows/wk), not for real production |

Going direct means the data lives in your Sheet, your backend, and your
billing — not in a third party.

---

## FAQ

**Q: Does this expose my service account key?**
A: No — it lives in env vars that only your server reads. The frontend
never sees it.

**Q: Can a malicious user dump all bookings via this endpoint?**
A: The Sheets write uses Editor permissions but only for sheets shared
with the service account. Read access from the front-end is unchanged
(no `GET /api/bookings` exposure on the static site).

**Q: What if two bookings land at the same time?**
A: Sheets appends are atomic. No risk of partial-row collisions.

**Q: Can I get an email/SMS for each new booking?**
A: Yes — set up a Google Sheets trigger in Gmail, or in Apps Script.
Out of scope for this integration.
