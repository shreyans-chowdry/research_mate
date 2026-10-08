import sys
import os
import re
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.pipeline.search_service import search_papers, normalize_doi, normalize_title
from backend.pipeline.pdf_service import download_and_extract_pdf, strip_reference_list

EXPECTED_FIELDS = {"title", "authors", "year", "source", "doi", "pdf_url", "oa_status"}


def run_pipeline_tests() -> bool:
    print("=" * 80)
    print(" ResearchMate — Step 2: Academic Search & PDF Extraction Verification")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # TEST 1: Academic Search & Deduplication
    # -------------------------------------------------------------------------
    print("\n[TEST 1] Querying academic search APIs with queries on 'AI ransomware detection'...")
    test_queries = [
        "AI ransomware detection",
        "machine learning ransomware detection SCADA",
        "AI ransomware detection",  # duplicate query intentional to test deduplication
    ]

    papers = search_papers(test_queries, year_min=2020, limit_per_query=4)
    print(f"[INFO] Retrieved {len(papers)} unique papers across {len(test_queries)} queries.")

    if not papers:
        print("[FAIL] No papers returned from search APIs.")
        return False

    print(f"[PASS] Successfully retrieved {len(papers)} papers!")

    # -------------------------------------------------------------------------
    # TEST 2: Validate Schema & Type Contracts
    # -------------------------------------------------------------------------
    print("\n[TEST 2] Verifying normalized dictionary contract for all papers...")
    seen_dois = set()
    seen_titles = set()

    for idx, paper in enumerate(papers):
        # Verify required keys
        missing_keys = EXPECTED_FIELDS - set(paper.keys())
        if missing_keys:
            print(f"[FAIL] Paper {idx} missing keys: {missing_keys}")
            return False

        # Verify field types
        if not isinstance(paper["title"], str) or not paper["title"].strip():
            print(f"[FAIL] Paper {idx} has invalid title: {paper['title']}")
            return False

        if not isinstance(paper["authors"], list):
            print(f"[FAIL] Paper {idx} authors is not a list: {type(paper['authors'])}")
            return False

        if paper["year"] is not None and not isinstance(paper["year"], int):
            print(f"[FAIL] Paper {idx} year is not an integer: {paper['year']}")
            return False

        if not isinstance(paper["source"], str) or paper["source"] not in {"openalex", "semanticscholar"}:
            print(f"[FAIL] Paper {idx} source is invalid: {paper['source']}")
            return False

        if not isinstance(paper["doi"], str):
            print(f"[FAIL] Paper {idx} doi is not a string: {paper['doi']}")
            return False

        if not isinstance(paper["pdf_url"], str):
            print(f"[FAIL] Paper {idx} pdf_url is not a string: {paper['pdf_url']}")
            return False

        if not isinstance(paper["oa_status"], bool):
            print(f"[FAIL] Paper {idx} oa_status is not boolean: {paper['oa_status']}")
            return False

        # Verify uniqueness / deduplication
        norm_title = normalize_title(paper["title"])
        if norm_title in seen_titles:
            print(f"[FAIL] Duplicate title detected in results: {paper['title']}")
            return False
        seen_titles.add(norm_title)

        if paper["doi"]:
            norm_d = normalize_doi(paper["doi"])
            if norm_d in seen_dois:
                print(f"[FAIL] Duplicate DOI detected in results: {paper['doi']}")
                return False
            seen_dois.add(norm_d)

    print(f"[PASS] All {len(papers)} papers strictly satisfy schema contracts and uniqueness constraints!")

    # Display sample papers
    print("\n[INFO] Sample papers found:")
    for idx, p in enumerate(papers[:3]):
        print(f"  {idx + 1}. [{p['source'].upper()}] ({p['year']}) {p['title']}")
        print(f"     Authors: {', '.join(p['authors'][:3]) if p['authors'] else 'N/A'}")
        print(f"     DOI: {p['doi'] or 'None'} | OA: {p['oa_status']} | PDF: {p['pdf_url'] or 'None'}")

    # -------------------------------------------------------------------------
    # TEST 3: PDF Retrieval & PyMuPDF Extraction
    # -------------------------------------------------------------------------
    print("\n[TEST 3] Testing PDF retrieval and text extraction with PyMuPDF...")

    # First attempt to extract from any search result that has an open-access direct PDF URL
    extracted_text = ""
    candidate_tested = None
    for p in papers:
        url = p.get("pdf_url", "")
        if url and (url.endswith(".pdf") or "arxiv.org/pdf" in url):
            candidate_tested = url
            print(f"[INFO] Attempting extraction from search result: {url}")
            extracted_text = download_and_extract_pdf(url)
            if extracted_text:
                print(f"[PASS] Extracted {len(extracted_text)} characters directly from search candidate!")
                break

    # If publishers blocked candidate with landing pages/captchas, verify using standard academic OA paper
    if not extracted_text:
        reference_oa_url = "https://arxiv.org/pdf/2307.03172.pdf"
        print(f"[INFO] Testing PDF extraction using standard academic open-access paper: {reference_oa_url}")
        extracted_text = download_and_extract_pdf(reference_oa_url)

    if not extracted_text:
        print("[FAIL] PDF extraction returned empty content.")
        return False

    print(f"[PASS] Successfully verified PDF download and PyMuPDF text extraction ({len(extracted_text)} chars)!")
    print(f"[INFO] Text excerpt (first 250 chars):\n---\n{extracted_text[:250].strip()}\n---")

    # -------------------------------------------------------------------------
    # TEST 4: Reference List Stripping Heuristic
    # -------------------------------------------------------------------------
    print("\n[TEST 4] Testing reference list heuristic stripping...")
    sample_text = (
        "1. Introduction\nRansomware attacks have surged exponentially.\n\n"
        "2. Methodology\nWe trained an ensemble of deep neural networks.\n\n"
        "3. Results\nAchieved 99.4% precision and 98.9% recall.\n\n"
        "4. Limitations\nLimited validation in real-time industrial SCADA testbeds.\n\n"
        "REFERENCES\n"
        "[1] A. Smith, 'Ransomware Evolution', IEEE, 2021.\n"
        "[2] B. Jones, 'SCADA Security', ACM, 2022.\n"
    )

    stripped = strip_reference_list(sample_text)
    if "REFERENCES" in stripped or "[1]" in stripped:
        print("[FAIL] Reference list was not stripped from sample text.")
        return False
    if "3. Results" not in stripped or "4. Limitations" not in stripped:
        print("[FAIL] Main body content was improperly truncated.")
        return False

    print("[PASS] Reference list heuristic stripping verified!")

    # -------------------------------------------------------------------------
    # TEST 5: Graceful Error Handling on Corrupted/Invalid PDF URLs
    # -------------------------------------------------------------------------
    print("\n[TEST 5] Testing graceful error handling on invalid URL...")
    invalid_url = "https://invalid-non-existent-domain-404.org/fake.pdf"
    result_empty = download_and_extract_pdf(invalid_url)
    if result_empty != "":
        print(f"[FAIL] Expected empty string for invalid URL, got: {result_empty}")
        return False

    print("[PASS] Handled invalid PDF gracefully without crashing!")

    print("\n" + "=" * 80)
    print(" [SUCCESS] ALL STEP 2 PIPELINE VERIFICATIONS PASSED!")
    print("=" * 80)
    return True


if __name__ == "__main__":
    success = run_pipeline_tests()
    sys.exit(0 if success else 1)
