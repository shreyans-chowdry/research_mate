import os
import re
import time
import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

OPENALEX_BASE_URL = "https://api.openalex.org/works"
SEMANTIC_SCHOLAR_BASE_URL = "https://api.semanticscholar.org/graph/v1/paper/search"

# Polite User-Agents for Academic APIs
OPENALEX_HEADERS = {
    "User-Agent": "ResearchMate/1.0 (mailto:team@researchmate.ai; Autonomous Academic Agent)"
}

SEMANTIC_SCHOLAR_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}

# Cooldown timestamp for S2 rate limits
_s2_rate_limited_until: float = 0.0


def normalize_doi(doi: Optional[str]) -> str:
    """Normalize DOI to lowercase alphanumeric format without URL prefixes."""
    if not doi:
        return ""
    cleaned = doi.strip().lower()
    cleaned = re.sub(r"^https?://(dx\.)?doi\.org/", "", cleaned)
    cleaned = re.sub(r"^doi:\s*", "", cleaned)
    return cleaned.strip("/ ")


def normalize_title(title: Optional[str]) -> str:
    """Normalize title for fuzzy deduplication."""
    if not title:
        return ""
    return re.sub(r"[^a-z0-9]", "", title.lower())


def _extract_arxiv_id(text: Optional[str]) -> Optional[str]:
    """Extract ArXiv ID from a DOI, URL, or string."""
    if not text:
        return None
    match = re.search(r"(?:arxiv[:./]|/abs/|/pdf/)([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)", text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def _request_with_retry(
    client: httpx.Client,
    url: str,
    params: Dict[str, Any],
    headers: Dict[str, str],
    max_retries: int = 2,
    initial_backoff: float = 0.8,
) -> Optional[httpx.Response]:
    """Execute HTTP GET request with exponential backoff on HTTP 429 and transient errors."""
    global _s2_rate_limited_until

    backoff = initial_backoff
    for attempt in range(max_retries + 1):
        try:
            response = client.get(url, params=params, headers=headers)
            if response.status_code == 200:
                return response
            elif response.status_code == 429:
                if attempt < max_retries:
                    logger.warning(
                        f"Rate limit 429 on {url} (attempt {attempt + 1}/{max_retries + 1}). "
                        f"Retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)
                    backoff *= 2.0
                else:
                    logger.warning(f"Exceeded max retries for rate limit 429 on {url}.")
                    if "semanticscholar" in url:
                        _s2_rate_limited_until = time.time() + 45.0  # Cooldown S2 for 45s
                    return None
            elif 500 <= response.status_code < 600:
                if attempt < max_retries:
                    logger.warning(
                        f"Server error {response.status_code} on {url}. Retrying in {backoff:.1f}s..."
                    )
                    time.sleep(backoff)
                    backoff *= 2.0
                else:
                    return None
            else:
                logger.warning(f"Request failed on {url} with status {response.status_code}: {response.text[:120]}")
                return None
        except (httpx.TimeoutException, httpx.NetworkError) as err:
            if attempt < max_retries:
                logger.warning(f"Network error on {url}: {err}. Retrying in {backoff:.1f}s...")
                time.sleep(backoff)
                backoff *= 2.0
            else:
                logger.error(f"Network failure on {url} after {max_retries} retries: {err}")
                return None
        except Exception as e:
            logger.error(f"Unexpected error querying {url}: {e}")
            return None
    return None


def _query_openalex(
    client: httpx.Client,
    query: str,
    year_min: int,
    limit: int,
) -> List[Dict[str, Any]]:
    """Query OpenAlex API and return normalized paper dictionaries."""
    params = {
        "search": query,
        "filter": f"from_publication_date:{year_min}-01-01",
        "per-page": limit,
    }

    resp = _request_with_retry(client, OPENALEX_BASE_URL, params, OPENALEX_HEADERS)
    if not resp:
        return []

    try:
        data = resp.json()
        results = data.get("results", [])
    except Exception as e:
        logger.error(f"Failed to parse OpenAlex JSON response: {e}")
        return []

    papers: List[Dict[str, Any]] = []
    for item in results:
        title = item.get("title") or item.get("display_name")
        if not title:
            continue

        authors = [
            auth.get("author", {}).get("display_name")
            for auth in item.get("authorships", [])
            if auth.get("author", {}).get("display_name")
        ]

        year = item.get("publication_year")
        raw_doi = item.get("doi")
        doi = normalize_doi(raw_doi)

        # Open Access & PDF extraction
        open_access = item.get("open_access", {}) or {}
        oa_status = bool(open_access.get("is_oa", False))

        pdf_url = ""
        best_oa = item.get("best_oa_location") or {}
        if best_oa.get("pdf_url"):
            pdf_url = best_oa.get("pdf_url")

        if not pdf_url:
            for loc in item.get("locations", []):
                if loc.get("pdf_url"):
                    pdf_url = loc.get("pdf_url")
                    break

        if not pdf_url and oa_status:
            pdf_url = open_access.get("oa_url") or best_oa.get("landing_page_url") or ""

        # Check for ArXiv link resolution
        arxiv_id = _extract_arxiv_id(doi) or _extract_arxiv_id(raw_doi) or _extract_arxiv_id(pdf_url)
        if not arxiv_id:
            for loc in item.get("locations", []):
                arxiv_id = _extract_arxiv_id(loc.get("landing_page_url")) or _extract_arxiv_id(loc.get("pdf_url"))
                if arxiv_id:
                    break

        if arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
            oa_status = True

        papers.append(
            {
                "title": title.strip(),
                "authors": authors,
                "year": year,
                "source": "openalex",
                "doi": doi,
                "pdf_url": pdf_url or "",
                "oa_status": oa_status,
            }
        )

    return papers


def _query_semantic_scholar(
    client: httpx.Client,
    query: str,
    year_min: int,
    limit: int,
) -> List[Dict[str, Any]]:
    """Query Semantic Scholar Graph API and return normalized paper dictionaries."""
    global _s2_rate_limited_until

    if time.time() < _s2_rate_limited_until:
        logger.info(f"Skipping Semantic Scholar query '{query}' due to active rate limit cooldown.")
        return []

    params = {
        "query": query,
        "year": f"{year_min}-",
        "limit": limit,
        "fields": "title,authors,year,externalIds,openAccessPdf,url",
    }

    headers = dict(SEMANTIC_SCHOLAR_HEADERS)
    s2_api_key = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
    if s2_api_key:
        headers["x-api-key"] = s2_api_key

    resp = _request_with_retry(client, SEMANTIC_SCHOLAR_BASE_URL, params, headers)
    if not resp:
        return []

    try:
        data = resp.json()
        results = data.get("data", [])
    except Exception as e:
        logger.error(f"Failed to parse Semantic Scholar JSON response: {e}")
        return []

    papers: List[Dict[str, Any]] = []
    for item in results:
        title = item.get("title")
        if not title:
            continue

        authors = [a.get("name") for a in item.get("authors", []) if a.get("name")]
        year = item.get("year")

        ext_ids = item.get("externalIds") or {}
        raw_doi = ext_ids.get("DOI")
        doi = normalize_doi(raw_doi)

        oa_pdf = item.get("openAccessPdf") or {}
        pdf_url = oa_pdf.get("url") or ""
        oa_status = bool(pdf_url)

        # ArXiv resolution
        arxiv_id = ext_ids.get("ArXiv") or _extract_arxiv_id(doi) or _extract_arxiv_id(raw_doi)
        if arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
            oa_status = True

        papers.append(
            {
                "title": title.strip(),
                "authors": authors,
                "year": year,
                "source": "semanticscholar",
                "doi": doi,
                "pdf_url": pdf_url,
                "oa_status": oa_status,
            }
        )

    return papers


def search_papers(
    queries: List[str],
    year_min: int = 2017,
    limit_per_query: int = 6,
) -> List[Dict[str, Any]]:
    """
    Search academic literature across OpenAlex and Semantic Scholar APIs.
    Deduplicates results across multiple queries and normalizes metadata format.

    Args:
        queries: List of search query strings.
        year_min: Minimum publication year (default: 2017).
        limit_per_query: Max results per provider per query (default: 6).

    Returns:
        List of normalized paper dictionaries:
        `[{"title": str, "authors": list[str], "year": int, "source": str, "doi": str, "pdf_url": str, "oa_status": bool}]`
    """
    dedup_map: Dict[str, Dict[str, Any]] = {}

    with httpx.Client(timeout=15.0, follow_redirects=True) as client:
        for query in queries:
            cleaned_query = query.strip()
            if not cleaned_query:
                continue

            logger.info(f"Querying OpenAlex for: '{cleaned_query}'")
            oa_papers = _query_openalex(client, cleaned_query, year_min, limit_per_query)

            logger.info(f"Querying Semantic Scholar for: '{cleaned_query}'")
            s2_papers = _query_semantic_scholar(client, cleaned_query, year_min, limit_per_query)

            combined_batch = oa_papers + s2_papers

            for paper in combined_batch:
                doi_key = f"doi:{paper['doi']}" if paper["doi"] else None
                title_key = f"title:{normalize_title(paper['title'])}"

                # Match by DOI or normalized title
                match_key = None
                if doi_key and doi_key in dedup_map:
                    match_key = doi_key
                elif title_key in dedup_map:
                    match_key = title_key

                if match_key is None:
                    # New paper record
                    primary_key = doi_key or title_key
                    dedup_map[primary_key] = paper
                    # Also register title key so future matches find it
                    if doi_key:
                        dedup_map[title_key] = paper
                else:
                    # Merge complementary fields (e.g. PDF link, OA status, authors)
                    existing = dedup_map[match_key]
                    if not existing.get("pdf_url") and paper.get("pdf_url"):
                        existing["pdf_url"] = paper["pdf_url"]
                        existing["oa_status"] = True
                    if not existing.get("authors") and paper.get("authors"):
                        existing["authors"] = paper["authors"]
                    if not existing.get("year") and paper.get("year"):
                        existing["year"] = paper["year"]
                    if not existing.get("doi") and paper.get("doi"):
                        existing["doi"] = paper["doi"]

    # Extract unique values
    unique_papers: List[Dict[str, Any]] = []
    seen_ids = set()

    for p in dedup_map.values():
        p_id = id(p)
        if p_id not in seen_ids:
            seen_ids.add(p_id)
            unique_papers.append(p)

    logger.info(f"Retrieved {len(unique_papers)} unique papers across {len(queries)} queries.")
    return unique_papers
