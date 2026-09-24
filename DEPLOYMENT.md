# 🚀 ResearchMate Deployment Guide

ResearchMate consists of two components:
1. **Frontend**: Next.js 16 (React, Tailwind CSS, Lucide icons) — best hosted on **Vercel**.
2. **Backend**: FastAPI (Python 3.11, PostgreSQL, Uvicorn) — best hosted on **Railway** or **Render**.

---

## 📋 Architecture & Environment Flow

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│        Vercel (Frontend)        │           │     Railway / Render (Backend)  │
│      Next.js 16 Application     │  HTTPS    │       FastAPI + Uvicorn         │
│  https://researchmate.vercel.app│ ────────> │ https://api.yourdomain.com      │
│                                 │           │                                 │
│  NEXT_PUBLIC_API_URL=           │           │  DATABASE_URL=postgres://...    │
│  https://api.yourdomain.com     │           │  GOOGLE_API_KEY=AIzaSy...       │
│                                 │           │  FRONTEND_URL=https://...       │
└─────────────────────────────────┘           └────────────────┬────────────────┘
                                                               │
                                                               ▼
                                              ┌─────────────────────────────────┐
                                              │      PostgreSQL Database        │
                                              │  (Railway Postgres / Supabase)  │
                                              └─────────────────────────────────┘
```

---

## Part 1: Deploy Backend (Railway — Recommended)

Railway provides both a Docker runtime for FastAPI and a managed PostgreSQL database in one click.

### Step 1: Create a Railway Project
1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project** → **Provision PostgreSQL**.
3. Once Postgres is created, click **New** → **GitHub Repo** → Select `shreyans-chowdry/research_mate`.
4. Choose the `develop` (or `main`) branch.

### Step 2: Configure Backend Service
1. Click on the newly added GitHub service in your Railway canvas.
2. Go to **Settings**:
   - **Root Directory**: Leave blank (Railway reads `railway.toml` from root) or set to `/`
   - **Build**: Railway automatically detects `railway.toml` which points to `backend/Dockerfile`.
   - **Healthcheck Path**: `/api/health`
3. Go to **Variables** and add:
   | Variable | Value | Description |
   |----------|-------|-------------|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Connects directly to the Railway Postgres service |
   | `GOOGLE_API_KEY` | `your_gemini_api_key_here` | Your Google Gemini API Key |
   | `FRONTEND_URL` | `https://your-frontend.vercel.app` | Your Vercel frontend URL (or leave blank initially) |
   | `PORT` | `8000` | Port listened by Uvicorn |

4. Go to **Networking** → Click **Generate Domain** (e.g., `researchmate-backend-production.up.railway.app`).
5. Wait for deployment to complete. Test by opening:
   ```bash
   https://<your-railway-domain>/api/health
   # Expected response: {"status":"healthy"}
   ```

---

## Part 2: Deploy Backend (Render — Alternative)

If you prefer Render:

1. Go to [render.com](https://render.com) and sign in.
2. Click **New +** → **Blueprint**.
3. Connect your GitHub repository `research_mate`.
4. Render will read [`render.yaml`](file:///Users/shreyanschowdry/Desktop/ResearchMate/render.yaml) automatically, provisioning:
   - A free PostgreSQL database (`researchmate-db`)
   - A Docker web service (`researchmate-backend`) with `DATABASE_URL` pre-wired.
5. In the Render Dashboard, go to `researchmate-backend` → **Environment** and add:
   - `GOOGLE_API_KEY`: Your Gemini API key.
   - `FRONTEND_URL`: Your Vercel URL (can update after frontend deployment).
6. Note your Render URL: `https://researchmate-backend.onrender.com`.

---

## Part 3: Deploy Frontend (Vercel)

Vercel provides native, ultra-fast hosting for Next.js 16 applications.

### Step 1: Import Project into Vercel
1. Go to [vercel.com](https://vercel.com) and log in with your GitHub account.
2. Click **Add New…** → **Project**.
3. Select your repository: `shreyans-chowdry/research_mate`.

### Step 2: Configure Project Settings
In the **Configure Project** screen:

1. **Framework Preset**: `Next.js` (detected automatically).
2. **Root Directory**: Click **Edit** and select **`frontend`** (🚨 **Critical**: The Next.js app is inside `frontend/`).
3. **Build and Output Settings**: Defaults are already optimal (`npm run build`, `.next`).
4. **Environment Variables**: Expand the section and add:
   | Variable | Value |
   |----------|-------|
   | `NEXT_PUBLIC_API_URL` | `https://<your-backend-railway-domain>` (e.g. `https://researchmate-production.up.railway.app`) |

   > ⚠️ **Important**: Do not include a trailing slash in `NEXT_PUBLIC_API_URL`.

5. Click **Deploy**.

---

## Part 4: Connect & Close the Loop

1. Once Vercel finishes deploying, copy your Vercel production domain (e.g., `https://research-mate-seven.vercel.app`).
2. Go back to Railway or Render.
3. Update the `FRONTEND_URL` environment variable to match your Vercel URL.
   *(This ensures CORS headers allow full credentials and multipart PDF uploads from your live domain).*
4. Both services are now connected and live!

---

## 🔍 Verification Checklist

- [ ] `GET https://<backend-domain>/api/health` returns `{"status":"healthy"}`.
- [ ] `GET https://<backend-domain>/api/research/recent` returns an empty array `[]` or previous projects.
- [ ] Open `https://<vercel-domain>/` — the home page renders cleanly with search bar and sample topics.
- [ ] Submit a research query (e.g., *"Adversarial robustness in spiking neural networks"*).
- [ ] Watch the live multi-agent execution tracker progress through Node A → B → C → D → E → F.
- [ ] Verify synthesis dashboard tabs: Gaps, Papers, Comparative Matrix, Executive Report.
- [ ] Test the **Paper Critic** tab by uploading a PDF research draft.
