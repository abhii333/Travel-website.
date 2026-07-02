# Horizon Travel Website

A production-ready travel website with a **SQLite backend API** for local development and **Netlify Functions + Netlify Blobs** for production booking storage.

## Project structure

- `index.html` - main website and booking form
- `style.css` - responsive layout and styling
- `success.html` - confirmation page after booking
- `public/` - images and frontend scripts
- `backend/` - Express API with SQLite database
- `netlify/functions/` - serverless API used on Netlify
- `netlify.toml` - Netlify build and hosting settings

## Run locally

Install dependencies:

```bash
npm install
npm --prefix backend install
```

Start the backend API (SQLite database):

```bash
npm run dev:backend
```

In a second terminal, start the frontend:

```bash
npm run dev
```

Open the local URL shown in the terminal (usually `http://localhost:3000`).

## Booking database

### Local development

Bookings are saved in:

`backend/data/bookings.db`

API endpoints:

- `GET /api/health` - health check
- `GET /api/bookings` - list all bookings
- `POST /api/bookings` - create a booking

Example to view saved bookings locally:

```bash
curl http://localhost:3001/api/bookings
```

### Production on Netlify

When deployed to Netlify, the form posts to `/api/bookings`, which is handled by a Netlify Function. Bookings are stored in **Netlify Blobs** and can be viewed with:

```bash
curl https://YOUR-SITE.netlify.app/api/bookings
```

## Build for production

```bash
npm run build
```

Production files are generated in `dist/`.

## Push to GitHub

From the `app` folder:

```bash
git init
git add .
git commit -m "Add travel website with backend booking database"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace `YOUR-USERNAME` and `YOUR-REPOSITORY` with your GitHub details.

## Deploy on Netlify

1. Go to [Netlify](https://www.netlify.com/) and click **Add new site**.
2. Choose **Import an existing project**.
3. Connect GitHub and select your repository.
4. Set the **Base directory** to `app` if the repo root is the parent folder, or leave blank if the repo root is `app`.
5. Confirm these settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
6. Click **Deploy site**.

After deployment, submit a test booking on the live site, then open:

`https://YOUR-SITE.netlify.app/api/bookings`

You should see the saved booking data in JSON format.

## Environment notes

- Local dev uses SQLite through the Express backend on port `3001`.
- Netlify production uses Netlify Functions and Netlify Blobs (no extra database setup required).
- If you later want PostgreSQL or Supabase, you can replace the Netlify Function storage layer while keeping the same frontend form.
