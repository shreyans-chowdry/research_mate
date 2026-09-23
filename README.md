# ResearchMate

Autonomous Agentic AI Research Assistant

## Architecture
- **Backend**: FastAPI, LangGraph Multi-Agent System, OpenAlex / Semantic Scholar pipeline, PostgreSQL / Supabase
- **Frontend**: Next.js (App Router), Tailwind CSS, shadcn/ui

## Getting Started

### Database Setup
1. Copy `backend/.env.example` to `backend/.env` and update `DATABASE_URL`.
2. Run database initialization and tests:
   ```bash
   python3 backend/db/test_db.py
   ```
