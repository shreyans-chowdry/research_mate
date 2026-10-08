import asyncio
import os
import sys
from pathlib import Path
from uuid import uuid4

# Ensure root directory is on sys.path
root_dir = Path(__file__).resolve().parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from sqlalchemy import select, delete
from backend.db.database import (
    engine,
    AsyncSessionLocal,
    check_connection,
    init_db,
    get_existing_tables,
    Project,
    Paper,
    RAW_DATABASE_URL,
    ASYNC_DATABASE_URL,
)

REQUIRED_TABLES = [
    "projects",
    "papers",
    "paper_analysis",
    "comparisons",
    "gaps",
    "reports",
]

async def run_tests() -> bool:
    print("=" * 80)
    print(" ResearchMate — Step 1: Database Setup & Connection Verification")
    print("=" * 80)
    print(f"[INFO] Target Raw DB URL   : {RAW_DATABASE_URL}")
    print(f"[INFO] Formatted Async URL : {ASYNC_DATABASE_URL}")

    # Step 1: Test basic connectivity
    print("\n[TEST 1] Testing basic connection...")
    try:
        is_connected = await check_connection()
        if not is_connected:
            print("[FAIL] Could not verify connection with SELECT 1.")
            return False
        print("[PASS] Successfully connected to PostgreSQL!")
    except Exception as e:
        print(f"[FAIL] Connection test failed with exception: {e}")
        return False

    # Step 2: Initialize tables using schema.sql
    print("\n[TEST 2] Initializing tables via init_db() [executing schema.sql]...")
    try:
        init_result = await init_db()
        print(f"[INFO] init_db() status: {init_result['status']}")
        print(f"[INFO] Verified tables : {', '.join(init_result['verified_tables'])}")

        if init_result["missing_tables"]:
            print(f"[FAIL] Missing tables: {init_result['missing_tables']}")
            return False
        print("[PASS] Table initialization completed successfully!")
    except Exception as e:
        print(f"[FAIL] Table initialization failed: {e}")
        return False

    # Step 3: Verify all 6 contract tables exist in the public schema
    print("\n[TEST 3] Verifying all required tables in PostgreSQL...")
    try:
        existing = await get_existing_tables()
        for table in REQUIRED_TABLES:
            if table in existing:
                print(f"  [OK] Table '{table}' exists.")
            else:
                print(f"  [MISSING] Table '{table}' is missing!")
                return False
        print("[PASS] All 6 contract tables confirmed in database!")
    except Exception as e:
        print(f"[FAIL] Table verification query failed: {e}")
        return False

    # Step 4: Perform a round-trip CRUD transaction
    print("\n[TEST 4] Testing CRUD operations and foreign key cascading...")
    test_project_id = uuid4()
    test_paper_id = uuid4()
    try:
        async with AsyncSessionLocal() as session:
            # 4a: Create a test project
            project = Project(
                id=test_project_id,
                topic="Test Autonomous Agentic AI Research",
                status="pending",
                current_step="Testing database connection",
            )
            session.add(project)
            await session.commit()
            print(f"  [OK] Created test project with ID: {test_project_id}")

            # 4b: Read the project back
            query = select(Project).where(Project.id == test_project_id)
            result = await session.execute(query)
            fetched_project = result.scalar_one_or_none()
            assert fetched_project is not None, "Project could not be retrieved"
            assert fetched_project.topic == "Test Autonomous Agentic AI Research"
            print(f"  [OK] Retrieved test project: '{fetched_project.topic}' (status: {fetched_project.status})")

            # 4c: Insert a test paper linked to the project
            paper = Paper(
                id=test_paper_id,
                project_id=test_project_id,
                title="A Survey on LLM Multi-Agent Coordination",
                authors=["Alice Smith", "Bob Jones"],
                year=2024,
                source="openalex",
                doi="10.1234/test.survey.2024",
                pdf_url="https://example.com/test.pdf",
                oa_status=True,
                raw_text="Extracted sample academic text for testing.",
            )
            session.add(paper)
            await session.commit()
            print(f"  [OK] Inserted test paper linked to project: {test_paper_id}")

            # 4d: Clean up test project (cascades delete to paper)
            await session.delete(fetched_project)
            await session.commit()

            # Verify paper was also cascade-deleted
            paper_check = await session.execute(select(Paper).where(Paper.id == test_paper_id))
            assert paper_check.scalar_one_or_none() is None, "Paper should have been deleted by cascade"
            print("  [OK] Project deleted; cascade deletion of linked paper verified!")

        print("[PASS] Full CRUD and foreign key cascading test passed!")
    except Exception as e:
        print(f"[FAIL] CRUD transaction test failed: {e}")
        # Clean up attempt
        try:
            async with AsyncSessionLocal() as cleanup_session:
                await cleanup_session.execute(delete(Project).where(Project.id == test_project_id))
                await cleanup_session.commit()
        except Exception:
            pass
        return False
    finally:
        await engine.dispose()

    print("\n" + "=" * 80)
    print(" [SUCCESS] ALL STEP 1 DATABASE VERIFICATIONS PASSED!")
    print("=" * 80)
    return True

if __name__ == "__main__":
    success = asyncio.run(run_tests())
    sys.exit(0 if success else 1)
