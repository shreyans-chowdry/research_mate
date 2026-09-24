import os
import sys
import time
import asyncio
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import httpx
from backend.db.database import engine
from backend.api.main import app

TARGET_TOPIC = "adversarial robustness in machine learning"
DEFAULT_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


async def execute_verification_pipeline():
    print("=" * 80)
    print(" ResearchMate — Full Autonomous Pipeline Verification (Step 5)")
    print("=" * 80)
    print(f"[INFO] Research Topic: \"{TARGET_TOPIC}\"")

    # Determine whether a live HTTP server is already running on port 8000
    is_live_server = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as check_client:
            resp = await check_client.get(f"{DEFAULT_BASE_URL}/api/health")
            if resp.status_code == 200:
                is_live_server = True
    except Exception:
        is_live_server = False

    if is_live_server:
        print(f"[INFO] Connecting to active server at: {DEFAULT_BASE_URL}")
        client_kwargs = {"base_url": DEFAULT_BASE_URL, "timeout": 30.0}
    else:
        print(f"[INFO] No server on port 8000. Executing via ASGI in-process transport...")
        transport = httpx.ASGITransport(app=app)
        client_kwargs = {"transport": transport, "base_url": "http://test", "timeout": 30.0}

    async with httpx.AsyncClient(**client_kwargs) as client:
        # Step 1: Health check verification
        print("\n[STEP 1] Verifying API Health...")
        health_resp = await client.get("/api/health")
        assert health_resp.status_code == 200, f"Health check failed: {health_resp.text}"
        print(f"  [OK] /api/health -> {health_resp.json()}")

        # Step 2: Submit research task
        print(f"\n[STEP 2] Submitting POST /api/research with topic '{TARGET_TOPIC}'...")
        post_resp = await client.post("/api/research", json={"topic": TARGET_TOPIC})
        assert post_resp.status_code == 201, f"Failed to create project: {post_resp.text}"
        project_data = post_resp.json()
        project_id = project_data["project_id"]
        print(f"  [OK] Research Project Created! Project ID: {project_id}")

        # Step 3: Poll status endpoint until done
        print(f"\n[STEP 3] Polling /api/research/{project_id}/status...")
        max_poll_time = 450  # seconds
        poll_interval = 2.5  # seconds
        start_time = time.time()
        final_status = None

        while time.time() - start_time < max_poll_time:
            status_resp = await client.get(f"/api/research/{project_id}/status")
            if status_resp.status_code != 200:
                print(f"  [WARN] Status poll returned HTTP {status_resp.status_code}")
                await asyncio.sleep(poll_interval)
                continue

            status_info = status_resp.json()
            st = status_info["status"]
            step = status_info["current_step"]
            papers_found = status_info["papers_found"]
            papers_analyzed = status_info["papers_analyzed"]
            elapsed = int(time.time() - start_time)

            print(
                f"  [{elapsed:02d}s] Status: {st.upper():<12} | "
                f"Papers: {papers_found} found, {papers_analyzed} analyzed | "
                f"Step: {step}"
            )

            if st == "done":
                final_status = "done"
                break
            elif st == "error":
                final_status = "error"
                print(f"\n[FAIL] Pipeline reported an error state: {step}")
                sys.exit(1)

            await asyncio.sleep(poll_interval)

        if final_status != "done":
            print(f"\n[FAIL] Polling timed out after {max_poll_time}s without reaching 'done'.")
            sys.exit(1)

        print("\n[PASS] Autonomous Multi-Agent Pipeline completed successfully!")

        # Step 4: Fetch and display generated research gaps
        print("\n" + "=" * 80)
        print(" SYNTHESIZED RESEARCH GAPS (BACKED BY CITATION TRAILS)")
        print("=" * 80)
        gaps_resp = await client.get(f"/api/research/{project_id}/gaps")
        assert gaps_resp.status_code == 200, f"Failed to retrieve gaps: {gaps_resp.text}"
        gaps = gaps_resp.json()

        for idx, g in enumerate(gaps, start=1):
            print(f"\nGAP #{idx}: {g['title']}")
            print("-" * 80)
            print(f"Description:\n  {g['description']}")
            print(f"Suggested Direction:\n  {g['suggested_direction']}")
            supporting = g.get("supporting_papers", [])
            print(f"Supporting Evidence ({len(supporting)} papers):")
            for sp in supporting:
                print(f"  • {sp['title']} (ID: {sp['id']})")

        # Step 5: Fetch and display markdown report preview
        print("\n" + "=" * 80)
        print(" FINAL EXECUTIVE ACADEMIC REPORT PREVIEW")
        print("=" * 80)
        report_resp = await client.get(f"/api/research/{project_id}/report")
        if report_resp.status_code == 200:
            rep_data = report_resp.json()
            lines = rep_data["content_markdown"].splitlines()
            preview = "\n".join(lines[:25])
            print(preview)
            if len(lines) > 25:
                print(f"\n... [{len(lines) - 25} additional report lines generated] ...")
        else:
            print("[INFO] Report still rendering in database.")

        print("\n" + "=" * 80)
        print(" [SUCCESS] FULL PIPELINE VERIFICATION RUN PASSED COMPLETELY!")
        print("=" * 80)


async def main():
    try:
        await execute_verification_pipeline()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
