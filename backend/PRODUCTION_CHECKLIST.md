# Backend production readiness

Last audited against **https://uniflow-backend-v1.onrender.com/api** (live smoke tests).

## Live status summary

| Area | Status | Notes |
|------|--------|--------|
| Health / DB / auth | OK | `GET /api/health` 200; register/login/courses work |
| Google OAuth config | OK | `GET /api/auth/google/config` returns web + iOS client IDs |
| **LibreOffice / PPTX** | **FAIL** | `.txt` upload → **422** — `soffice` not available on deployed service |
| **Cloudinary** | **FAIL** | PDF upload returns **no `cloudinaryUrl`** — files only on ephemeral disk |
| PDF upload (no convert) | Partial | Works until redeploy; download 200 while file still on disk |

**Conclusion:** Production does **not** yet match localhost for notes. Switch Render to **Docker** and set **`CLOUDINARY_URL`**.

---

## Required: Render Web Service

1. **Runtime: Docker** (not Node buildpack)  
   - Root directory: `backend`  
   - Dockerfile: `Dockerfile` (includes `libreoffice-impress` for `.pptx`)

2. **Environment variables** (Render dashboard → Environment):

   | Variable | Required | Purpose |
   |----------|----------|---------|
   | `DATABASE_URL` | Yes | Render Postgres connection string |
   | `NODE_ENV` | Yes | `production` |
   | `JWT_SECRET` | Yes | Long random string (never use code default) |
   | `CLOUDINARY_URL` | Yes | `cloudinary://key:secret@cloud` — PDF persistence |
   | `GOOGLE_CLIENT_ID` | Yes | Web OAuth |
   | `GOOGLE_CLIENT_SECRET` | Yes | Web OAuth |
   | `GOOGLE_IOS_CLIENT_ID` | If using TestFlight Google sign-in | Native token `aud` |
   | `FRONTEND_GOOGLE_REDIRECT_URI` | Yes for web | Hosted SPA callback, **not** `localhost:5173` |
   | `INTERNAL_API_KEY` | If Django AI ingests PDFs | Same as `MAIN_API_INTERNAL_KEY` on UNIFLOW_AI |
   | `OPENAI_API_KEY` | If using `/api/voice/*` | Ruby voice assistant |

   Optional:

   - `FRONTEND_URL` — web app origin for CORS/links  
   - `SEQUELIZE_SYNC_ALTER=false` — leave unset (default sync is create-only)  
   - `DISABLE_EVENT_REMINDERS=true` — if Redis not configured  
   - `OAUTH_DEBUG=1` — temporary OAuth troubleshooting only  

3. **After deploy**, verify:

   ```bash
   cd backend
   API_BASE_URL=https://uniflow-backend-v1.onrender.com/api npm run test:apis
   ```

   Must pass:

   - `POST .../files — converted to PDF` (txt → pdf)  
   - Upload response includes `cloudinaryUrl` OR download works after redeploy via redirect  

   Quick manual check:

   ```bash
   # txt → pdf (needs Docker)
   curl -s -X POST "$API/courses/COURSE_ID/files" -H "Authorization: Bearer $TOKEN" \
     -F "file=@smoke.txt"
   ```

---

## Codebase items already correct

- `Dockerfile` — Node 20 + LibreOffice writer/calc/impress  
- `trust proxy` enabled for Render (`app.ts`)  
- `DATABASE_URL` + SSL for Render Postgres (`config/database.ts`)  
- Course file upload + conversion logic (`courseFiles.ts`)  
- Cloudinary helper (`courseFileCloudinary.ts`) — **only runs when `CLOUDINARY_URL` is set**  
- `lf-temp-*` upload guard (400)  
- Migrations for `cloudinaryUrl` / `cloudinaryPublicId` columns  
- `scripts/test-all-apis.mjs` — full route smoke suite  
- `scripts/check-google-auth.mjs` — OAuth env + live config  

---

## Security / ops warnings

1. **`JWT_SECRET` fallback** in `auth.ts` / `middleware/auth.ts` — if unset on Render, tokens use a hardcoded default. Always set a strong secret in production.

2. **CORS** is `cors()` (allow all origins). Acceptable for mobile + SPA; tighten later if needed.

3. **Ephemeral disk** — without Cloudinary, every deploy can 404 old notes.

4. **Run DB migrations** on first Docker deploy if tables pre-exist without Cloudinary columns:

   ```bash
   DATABASE_URL="..." npx sequelize-cli db:migrate
   ```

5. **Backfill** old rows missing Cloudinary (optional):

   ```bash
   npm run backfill:cloudinary:dry
   npm run backfill:cloudinary
   ```

---

## Local `.env` vs production

Your local `backend/.env` includes `CLOUDINARY_URL`, `DATABASE_URL`, Google keys, `JWT_SECRET`, etc.  
**Copy the same variable names to Render** (production values / URLs). Do not commit `.env`.

`FRONTEND_GOOGLE_REDIRECT_URI` on your machine may still point at `localhost:5173` — update on Render to your **hosted** web URL before shipping TestFlight/web prod.
