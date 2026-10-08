# 🚀 ResearchMate Deployment Guide: Render + Vercel

This guide walks you through deploying **ResearchMate** using:
1. **Render** for the Backend (FastAPI + PostgreSQL Database)
2. **Vercel** for the Frontend (Next.js 16)

---

## 📋 Architecture & Data Flow

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│        Vercel (Frontend)        │           │        Render (Backend)         │
│      Next.js 16 Application     │  HTTPS    │       FastAPI + Uvicorn         │
│  https://researchmate.vercel.app│ ────────> │ https://researchmate.onrender.com│
│                                 │           │                                 │
│  NEXT_PUBLIC_API_URL=           │           │  DATABASE_URL=postgres://...    │
│  https://...onrender.com        │           │  GOOGLE_API_KEY=AIzaSy...       │
│                                 │           │  FRONTEND_URL=https://...       │
└─────────────────────────────────┘           └────────────────┬────────────────┘
                                                               │
                                                               ▼
                                              ┌─────────────────────────────────┐
                                              │    Render PostgreSQL Database   │
                                              │         (Free Tier)             │
                                              └─────────────────────────────────┘
```

---

## Part 1: Deploy Backend on Render

You can deploy on Render in either of two ways:
- **Method A (Easiest — 1-Click Blueprint)**: Render reads `render.yaml` from your repo and creates both Postgres and the FastAPI service together.
- **Method B (Manual Dashboard)**: Create the database and web service manually using the Render web UI.

---

### Method A: Using Render Blueprint (Recommended — 2 Minutes)

1. Log in to **[dashboard.render.com](https://dashboard.render.com/)** with your GitHub account.
2. Click the **New +** button in the top right → select **Blueprint**.
3. Under **Connect a repository**, choose **`shreyans-chowdry/research_mate`**.
4. Render will read `render.yaml` and show:
   - **Service 1**: `researchmate-db` (PostgreSQL Database)
   - **Service 2**: `researchmate-backend` (Docker Web Service)
5. Fill in the required environment variable:
   - **`GOOGLE_API_KEY`**: Paste your Google Gemini API key (`AIzaSy...`).
6. Click **Apply**.
7. Render will automatically:
   - Provision your PostgreSQL database.
   - Inject the internal `DATABASE_URL` into your FastAPI service.
   - Build the Docker container from `backend/Dockerfile`.
   - Start Uvicorn and run the initial database schema migration.
8. Once deployed, copy your backend URL (e.g., `https://researchmate-backend.onrender.com`).
9. Test by opening in your browser:
   ```
   https://<your-render-url>/api/health
   ```
   Expected response: `{"status":"ok"}`.

---

### Method B: Manual Setup via Render Dashboard (Alternative)

If you prefer to configure it step-by-step without Blueprint:

#### Step 1: Create PostgreSQL Database on Render
1. In the Render Dashboard, click **New +** → **PostgreSQL**.
2. Name it: `researchmate-db`.
3. Database: `researchmate`.
4. User: `postgres`.
5. Region: Pick the region closest to you (e.g. Frankfurt, Oregon, Ohio).
6. Plan: **Free**.
7. Click **Create Database**.
8. Once created, copy the **Internal Database URL** (e.g. `postgres://postgres:xxx@dpg-xxx-a/researchmate`).

#### Step 2: Create FastAPI Web Service
1. Click **New +** → **Web Service**.
2. Connect your GitHub repository: `shreyans-chowdry/research_mate`.
3. Configure the settings:
   - **Name**: `researchmate-backend`
   - **Region**: Same region as your database
   - **Branch**: `main` (or `develop`)
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `./backend/Dockerfile`
   - **Docker Build Context Directory**: `./backend`
   - **Instance Type**: **Free**
4. Scroll down to **Environment Variables** and add:
   | Key | Value | Description |
   |-----|-------|-------------|
   | `DATABASE_URL` | *(paste the Internal Database URL from Step 1)* | Database connection |
   | `GOOGLE_API_KEY` | `AIzaSy...` | Your Google Gemini API Key |
   | `PORT` | `8000` | Port listened by Uvicorn |
5. Under **Advanced** → **Health Check Path**: set to `/api/health`.
6. Click **Create Web Service**.
7. Render will build and launch your backend!

---

## Part 2: Deploy Frontend on Vercel

1. Log in to **[vercel.com](https://vercel.com/)** with your GitHub account.
2. Click **Add New…** → **Project**.
3. Under **Import Git Repository**, choose `shreyans-chowdry/research_mate`.
4. In the **Configure Project** screen:
   - **Framework Preset**: `Next.js` (detected automatically)
   - **Root Directory**: Click **Edit** and choose **`frontend`** 🚨 *(Do not skip this step!)*
5. Open the **Environment Variables** accordion and add:
   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_API_URL` | `https://your-backend-name.onrender.com` |

   > ⚠️ **Important**: Use your actual Render service URL and **do not include a trailing slash**.

6. Click **Deploy**.
7. In ~1-2 minutes, Vercel will give you a live production URL (e.g. `https://research-mate.vercel.app`).

---

## Part 3: Allow Vercel in Render CORS (Final Step)

1. Open your **Render Dashboard** → click your `researchmate-backend` service.
2. Go to the **Environment** tab.
3. Add or update:
   - `FRONTEND_URL` = `https://your-frontend-project.vercel.app`
4. Click **Save Changes** (Render will reload the service with CORS enabled for your domain).

---

## 🔍 Verification & Testing

Once both are live:
1. Open `https://<your-render-domain>/api/health` → Should return `{"status":"ok"}`.
2. Open your Vercel URL in your browser.
3. Type an academic topic in the search box (e.g., *"Adversarial robustness in spiking neural networks"*).
4. Click **Start Autonomous Synthesis**.
5. Watch the 6-agent LangGraph pipeline execute live:
   - **Node A**: Query Expansion
   - **Node B**: Academic Search & PDF Parsing
   - **Node C**: 6-D Dimension Extraction
   - **Node D**: Cross-Paper Comparative Matrix
   - **Node E**: Research Gap Identification
   - **Node F**: Executive Report Drafting
6. Try out the **Paper Critic** tab by uploading a research paper PDF!
