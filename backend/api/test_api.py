import asyncio
import sys
import uuid
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import httpx
from sqlalchemy import select
from backend.db.database import (
    engine,
    AsyncSessionLocal,
    Project,
    Paper,
    PaperAnalysis,
    Comparison,
    Gap,
    Report,
)
from backend.api.main import app


async def run_api_tests():
    print("=" * 80)
    print(" ResearchMate — Step 4: FastAPI Application & REST API Endpoints Verification")
    print("=" * 80)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

        # ---------------------------------------------------------------------
        # TEST 1: Health Check Endpoint
        # ---------------------------------------------------------------------
        print("\n[TEST 1] Testing health check GET /api/health...")
        resp = await client.get("/api/health")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert resp.json() == {"status": "ok"}, f"Unexpected health response: {resp.json()}"
        print(f"  [OK] /api/health response: {resp.json()}")
        print("[PASS] Health check verified!")

        # ---------------------------------------------------------------------
        # TEST 2: POST /api/research Endpoint
        # ---------------------------------------------------------------------
        print("\n[TEST 2] Testing POST /api/research...")
        topic = "Quantum Key Distribution Protocols"
        resp = await client.post("/api/research", json={"topic": topic})
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "project_id" in data, f"Missing project_id in response: {data}"
        created_project_id = data["project_id"]
        print(f"  [OK] Successfully created project with ID: {created_project_id}")
        print("[PASS] POST /api/research verified!")

        # ---------------------------------------------------------------------
        # TEST 3: GET /api/research/{id}/status Endpoint
        # ---------------------------------------------------------------------
        print(f"\n[TEST 3] Testing GET /api/research/{created_project_id}/status...")
        resp = await client.get(f"/api/research/{created_project_id}/status")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        status_data = resp.json()
        expected_status_fields = {"status", "current_step", "papers_found", "papers_analyzed"}
        assert expected_status_fields.issubset(set(status_data.keys())), f"Missing keys in status: {status_data}"
        print(f"  [OK] Status response: {status_data}")
        print("[PASS] GET /api/research/{id}/status verified!")

        # ---------------------------------------------------------------------
        # TEST 4: Dedicated Fixture Project for Full Contract Validation
        # ---------------------------------------------------------------------
        print("\n[TEST 4] Testing full REST API contract with dedicated fixture project...")
        fixture_project_id = uuid.uuid4()
        paper_uuid = uuid.uuid4()
        analysis_uuid = uuid.uuid4()
        comp_uuid = uuid.uuid4()
        gap_uuid = uuid.uuid4()
        report_uuid = uuid.uuid4()

        async with AsyncSessionLocal() as session:
            # Add Project
            proj = Project(
                id=fixture_project_id,
                topic="Optical Quantum Entanglement Networks",
                status="done",
                current_step="Research synthesis complete!",
            )
            session.add(proj)

            # Add Paper
            paper = Paper(
                id=paper_uuid,
                project_id=fixture_project_id,
                title="Continuous-Variable Quantum Key Distribution: A Survey",
                authors=["Dr. Alice Qubit", "Dr. Bob Photon"],
                year=2024,
                source="openalex",
                doi="10.1103/PhysRevA.99.012345",
                pdf_url="https://arxiv.org/pdf/2401.00001.pdf",
                oa_status=True,
                raw_text="Sample quantum research paper full text content.",
            )
            session.add(paper)

            # Add Paper Analysis
            analysis = PaperAnalysis(
                id=analysis_uuid,
                paper_id=paper_uuid,
                problem="Decoherence limits in metropolitan fiber channels.",
                methodology="Piloted Gaussian-modulated coherent states with digital signal processing.",
                dataset="100km standard single-mode optical fiber testbed.",
                results="Sustained secret key rate of 1.2 Mbps over 50km attenuation.",
                limitations="High computational overhead of continuous-variable post-processing.",
                future_work="Photonic integrated circuits for real-time reconciliation.",
                model_used="gemini-2.5-flash",
            )
            session.add(analysis)

            # Add Comparison
            comp = Comparison(
                id=comp_uuid,
                project_id=fixture_project_id,
                dimension="methodology",
                summary="Discrete-variable systems achieve longer reach while continuous-variable yields higher local secret rates.",
            )
            session.add(comp)

            # Add Gap
            gap = Gap(
                id=gap_uuid,
                project_id=fixture_project_id,
                title="Hardware Reconciliation Latency in High-Rate CV-QKD",
                description="Current post-processing error reconciliation algorithms cannot match raw optical detector bitrates.",
                suggested_direction="Develop dedicated FPGA LDPC decoders supporting multi-gigabit throughput.",
                supporting_paper_ids=[paper_uuid],
            )
            session.add(gap)

            # Add Report
            report = Report(
                id=report_uuid,
                project_id=fixture_project_id,
                content_markdown="# Quantum Key Distribution: Executive Academic Review\n\n## 1. Summary\nThorough review.",
            )
            session.add(report)

            await session.commit()
        print(f"  [OK] Committed fixture records for project: {fixture_project_id}")

        # 4a: GET /api/research/{id}/papers
        print(f"\n[TEST 4a] Testing GET /api/research/{fixture_project_id}/papers...")
        resp = await client.get(f"/api/research/{fixture_project_id}/papers")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        papers_data = resp.json()
        assert len(papers_data) == 1, f"Expected 1 paper, got {len(papers_data)}"
        p0 = papers_data[0]
        assert p0["id"] == str(paper_uuid)
        assert p0["title"] == "Continuous-Variable Quantum Key Distribution: A Survey"
        assert p0["authors"] == ["Dr. Alice Qubit", "Dr. Bob Photon"]
        assert p0["year"] == 2024
        assert p0["oa_status"] is True
        assert p0["analysis"]["problem"] == "Decoherence limits in metropolitan fiber channels."
        print(f"  [OK] Verified paper and joined analysis: '{p0['title']}'")
        print("[PASS] GET /api/research/{id}/papers verified!")

        # 4b: GET /api/research/{id}/comparison
        print(f"\n[TEST 4b] Testing GET /api/research/{fixture_project_id}/comparison...")
        resp = await client.get(f"/api/research/{fixture_project_id}/comparison")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        comps_data = resp.json()
        assert len(comps_data) == 1, f"Expected 1 comparison, got {len(comps_data)}"
        assert comps_data[0]["dimension"] == "methodology"
        assert "Discrete-variable" in comps_data[0]["summary"]
        print(f"  [OK] Verified comparison: dimension='{comps_data[0]['dimension']}'")
        print("[PASS] GET /api/research/{id}/comparison verified!")

        # 4c: GET /api/research/{id}/gaps
        print(f"\n[TEST 4c] Testing GET /api/research/{fixture_project_id}/gaps...")
        resp = await client.get(f"/api/research/{fixture_project_id}/gaps")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        gaps_data = resp.json()
        assert len(gaps_data) == 1, f"Expected 1 gap, got {len(gaps_data)}"
        g0 = gaps_data[0]
        assert g0["title"] == "Hardware Reconciliation Latency in High-Rate CV-QKD"
        assert len(g0["supporting_papers"]) == 1
        assert g0["supporting_papers"][0]["id"] == str(paper_uuid)
        assert g0["supporting_papers"][0]["title"] == "Continuous-Variable Quantum Key Distribution: A Survey"
        print(f"  [OK] Verified gap: '{g0['title']}' (supporting paper: '{g0['supporting_papers'][0]['title']}')")
        print("[PASS] GET /api/research/{id}/gaps verified!")

        # 4d: GET /api/research/{id}/report
        print(f"\n[TEST 4d] Testing GET /api/research/{fixture_project_id}/report...")
        resp = await client.get(f"/api/research/{fixture_project_id}/report")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        report_data = resp.json()
        assert "content_markdown" in report_data and "created_at" in report_data
        assert "# Quantum Key Distribution" in report_data["content_markdown"]
        print(f"  [OK] Verified report: {report_data['content_markdown'][:60]}...")
        print("[PASS] GET /api/research/{id}/report verified!")

        # ---------------------------------------------------------------------
        # TEST 5: 404 Error Handling on Invalid IDs
        # ---------------------------------------------------------------------
        print("\n[TEST 5] Testing 404 handling on non-existent project ID...")
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"/api/research/{fake_id}/status")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        resp_bad_uuid = await client.get("/api/research/not-a-valid-uuid/status")
        assert resp_bad_uuid.status_code == 400, f"Expected 400, got {resp_bad_uuid.status_code}"
        print("  [OK] Handled non-existent project with 404 and invalid UUID format with 400.")
        print("[PASS] Error handling verified!")

        # ---------------------------------------------------------------------
        # CLEANUP
        # ---------------------------------------------------------------------
        print("\n[CLEANUP] Cleaning up test projects...")
        async with AsyncSessionLocal() as session:
            for pid in [uuid.UUID(created_project_id), fixture_project_id]:
                p = await session.get(Project, pid)
                if p:
                    await session.delete(p)
            await session.commit()
        print("  [OK] Cleaned up test database rows.")

    print("\n" + "=" * 80)
    print(" [SUCCESS] ALL STEP 4 FASTAPI APPLICATION & REST API TESTS PASSED!")
    print("=" * 80)
    return True


async def main():
    try:
        await run_api_tests()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
