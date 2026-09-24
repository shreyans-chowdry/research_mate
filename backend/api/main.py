import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
current_dir = Path(__file__).resolve().parent
backend_env = current_dir.parent / ".env"
if backend_env.exists():
    load_dotenv(backend_env)
else:
    load_dotenv()

from backend.db.database import init_db
from backend.api.routers.research import router as research_router

logger = logging.getLogger("researchmate")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle event handler: verifies database connection and tables on startup."""
    logger.info("Initializing ResearchMate backend application...")
    try:
        db_status = await init_db()
        logger.info(f"Database initialized successfully: {db_status['status']}")
    except Exception as e:
        logger.error(f"Failed to initialize database during startup: {e}")
    yield
    logger.info("Shutting down ResearchMate backend...")


# Initialize FastAPI Application
app = FastAPI(
    title="ResearchMate API",
    description="Autonomous Agentic AI Literature & Gap Synthesis Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware — accepts Vercel and local frontends
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

# Add production frontend URL from environment (set this on Railway/Render)
frontend_url = os.getenv("FRONTEND_URL", "").strip()
if frontend_url:
    origins.append(frontend_url)

# Also allow all *.vercel.app subdomains for preview deployments
allowed_origin_regex = r"https://.*\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Top-level API Router mounted at /api
api_router = APIRouter(prefix="/api")

# Mount research endpoints at /api/research
api_router.include_router(research_router)


# Health Check Endpoints
@api_router.get("/health", tags=["Health"])
async def api_health_check():
    """Health check endpoint required by contract: GET /api/health."""
    return {"status": "ok"}


@app.get("/health", tags=["Health"])
async def root_health_check():
    """Convenience root health check endpoint."""
    return {"status": "ok"}


# Mount /api router onto main application
app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("backend.api.main:app", host="0.0.0.0", port=port, reload=True)
