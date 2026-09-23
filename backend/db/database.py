import os
import re
from pathlib import Path
from typing import AsyncGenerator, List, Dict, Any, Optional
from uuid import UUID as PyUUID

from dotenv import load_dotenv
from sqlalchemy import (
    text,
    Column,
    String,
    Integer,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    AsyncEngine,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.orm import declarative_base, relationship

# Load environment variables from backend/.env or root .env
current_dir = Path(__file__).resolve().parent
backend_env = current_dir.parent / ".env"
root_env = current_dir.parent.parent / ".env"

if backend_env.exists():
    load_dotenv(backend_env)
elif root_env.exists():
    load_dotenv(root_env)
else:
    load_dotenv()

# Read DATABASE_URL from environment variables
RAW_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/researchmate",
)

def format_async_database_url(url: str) -> str:
    """
    Ensure the database URL uses postgresql+asyncpg:// driver scheme.
    Handles postgres://, postgresql://, and asyncpg compatibility for sslmode.
    """
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    # asyncpg expects 'ssl' parameter instead of 'sslmode'
    if "sslmode=" in url:
        url = re.sub(r"sslmode=([a-zA-Z0-9_-]+)", r"ssl=\1", url)

    return url

ASYNC_DATABASE_URL = format_async_database_url(RAW_DATABASE_URL)

# SQLAlchemy Async Engine and SessionMaker
engine: AsyncEngine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()


# ---------------------------------------------------------------------------
# SQLAlchemy Declarative Models (Exact contract from Section 2.2)
# ---------------------------------------------------------------------------

class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    topic = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="pending", server_default=text("'pending'"))
    current_step = Column(Text, default="Initializing...", server_default=text("'Initializing...'"))
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))

    # Relationships
    papers = relationship("Paper", back_populates="project", cascade="all, delete-orphan")
    comparisons = relationship("Comparison", back_populates="project", cascade="all, delete-orphan")
    gaps = relationship("Gap", back_populates="project", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="project", cascade="all, delete-orphan")


class Paper(Base):
    __tablename__ = "papers"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    title = Column(Text, nullable=False)
    authors = Column(ARRAY(Text), nullable=True)
    year = Column(Integer, nullable=True)
    source = Column(Text, nullable=True)  # 'openalex' | 'semanticscholar'
    doi = Column(Text, nullable=True)
    pdf_url = Column(Text, nullable=True)
    oa_status = Column(Boolean, default=False, server_default=text("false"))
    raw_text = Column(Text, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="papers")
    analysis = relationship("PaperAnalysis", back_populates="paper", uselist=False, cascade="all, delete-orphan")


class PaperAnalysis(Base):
    __tablename__ = "paper_analysis"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    paper_id = Column(UUID(as_uuid=True), ForeignKey("papers.id", ondelete="CASCADE"), nullable=True)
    problem = Column(Text, nullable=True)
    methodology = Column(Text, nullable=True)
    dataset = Column(Text, nullable=True)
    results = Column(Text, nullable=True)
    limitations = Column(Text, nullable=True)
    future_work = Column(Text, nullable=True)
    model_used = Column(Text, nullable=True)

    # Relationships
    paper = relationship("Paper", back_populates="analysis")


class Comparison(Base):
    __tablename__ = "comparisons"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    dimension = Column(Text, nullable=True)  # 'methodology' | 'dataset' | 'results'
    summary = Column(Text, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="comparisons")


class Gap(Base):
    __tablename__ = "gaps"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    suggested_direction = Column(Text, nullable=False)
    supporting_paper_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="gaps")


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    content_markdown = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))

    # Relationships
    project = relationship("Project", back_populates="reports")


# ---------------------------------------------------------------------------
# Helper Connection & Management Functions
# ---------------------------------------------------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency helper that provides an async session for FastAPI endpoints.
    Ensures commits on successful execution, rollbacks on errors, and closing on exit.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_connection() -> bool:
    """Verifies that the database is reachable."""
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        return result.scalar() == 1


async def get_existing_tables() -> List[str]:
    """Retrieves list of existing table names in the public schema."""
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name"
            )
        )
        return [row[0] for row in result.fetchall()]


async def init_db() -> Dict[str, Any]:
    """
    Initializes database tables by executing schema.sql DDL statements
    and verifies that all required tables exist.
    """
    schema_path = current_dir / "schema.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found at: {schema_path}")

    sql_content = schema_path.read_text(encoding="utf-8")

    # Split SQL file into discrete statements while ignoring comments and blank lines
    raw_statements = sql_content.split(";")
    clean_statements = []
    for stmt in raw_statements:
        cleaned = "\n".join(
            line for line in stmt.splitlines() if not line.strip().startswith("--")
        ).strip()
        if cleaned:
            clean_statements.append(cleaned)

    async with engine.begin() as conn:
        for statement in clean_statements:
            await conn.execute(text(statement))

    # Verify required tables
    required_tables = {"projects", "papers", "paper_analysis", "comparisons", "gaps", "reports"}
    existing = set(await get_existing_tables())
    missing = required_tables - existing

    return {
        "status": "ok" if not missing else "incomplete",
        "verified_tables": sorted(list(required_tables.intersection(existing))),
        "missing_tables": sorted(list(missing)),
        "all_public_tables": sorted(list(existing)),
    }
