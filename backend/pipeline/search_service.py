import os
import re
import time
import logging
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import httpx

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

OPENALEX_BASE_URL = "https://api.openalex.org/works"
SEMANTIC_SCHOLAR_BASE_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
EUROPE_PMC_BASE_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
ARXIV_BASE_URL = "https://export.arxiv.org/api/query"

# Polite User-Agents for Academic APIs
OPENALEX_HEADERS = {
    "User-Agent": "ResearchMate/1.0 (mailto:team@researchmate.ai; Autonomous Academic Agent)"
}

SEMANTIC_SCHOLAR_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}

EUROPE_PMC_HEADERS = {
    "User-Agent": "ResearchMate/1.0 (Autonomous Academic Synthesis System; mailto:contact@researchmate.org)"
}

ARXIV_HEADERS = {
    "User-Agent": "ResearchMate/1.0 (Preprint Academic Analyzer; mailto:contact@researchmate.org)"
}

# Cooldown timestamp for API rate limits
_s2_rate_limited_until: float = 0.0
_openalex_rate_limited_until: float = 0.0


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


def _invert_openalex_abstract(inv_index: Optional[Dict[str, List[int]]]) -> str:
    """Reconstruct human-readable abstract from OpenAlex abstract_inverted_index."""
    if not isinstance(inv_index, dict) or not inv_index:
        return ""
    try:
        word_positions: List[tuple] = []
        for word, positions in inv_index.items():
            if isinstance(positions, list):
                for pos in positions:
                    word_positions.append((pos, word))
        word_positions.sort(key=lambda x: x[0])
        return " ".join(w for _, w in word_positions)
    except Exception:
        return ""


def _request_with_retry(
    client: httpx.Client,
    url: str,
    params: Dict[str, Any],
    headers: Dict[str, str],
    max_retries: int = 0,
    initial_backoff: float = 0.3,
) -> Optional[httpx.Response]:
    """Execute HTTP GET request with fast failure on rate limits and transient errors."""
    global _s2_rate_limited_until, _openalex_rate_limited_until

    try:
        response = client.get(url, params=params, headers=headers)
        if response.status_code == 200:
            return response
        elif response.status_code == 429:
            if "semanticscholar" in url:
                logger.info("Semantic Scholar free-tier 429 rate limit hit. Fast-skipping and activating 60s cooldown.")
                _s2_rate_limited_until = time.time() + 60.0
            elif "openalex" in url:
                logger.info("OpenAlex 429 rate limit hit. Fast-skipping and activating 120s cooldown.")
                _openalex_rate_limited_until = time.time() + 120.0
            return None
        elif 500 <= response.status_code < 600:
            return None
        else:
            logger.warning(f"Request failed on {url} with status {response.status_code}")
            return None
    except (httpx.TimeoutException, httpx.NetworkError) as err:
        logger.warning(f"Network timeout/error on {url}: {err}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error querying {url}: {e}")
        return None


def _query_openalex(
    client: httpx.Client,
    query: str,
    year_min: int,
    limit: int,
) -> List[Dict[str, Any]]:
    """Query OpenAlex API and return normalized paper dictionaries with reconstructed abstracts."""
    global _openalex_rate_limited_until

    if time.time() < _openalex_rate_limited_until:
        return []
    params = {
        "search": query,
        "filter": f"from_publication_date:{year_min}-01-01",
        "per-page": limit,
        "mailto": "team@researchmate.ai",
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

        abstract = _invert_openalex_abstract(item.get("abstract_inverted_index"))

        papers.append(
            {
                "title": title.strip(),
                "authors": authors,
                "year": year,
                "source": "openalex",
                "doi": doi,
                "pdf_url": pdf_url or "",
                "oa_status": oa_status,
                "abstract": abstract,
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
        return []

    params = {
        "query": query,
        "year": f"{year_min}-",
        "limit": limit,
        "fields": "title,authors,year,abstract,externalIds,openAccessPdf,url",
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

        abstract = item.get("abstract") or ""

        papers.append(
            {
                "title": title.strip(),
                "authors": authors,
                "year": year,
                "source": "semanticscholar",
                "doi": doi,
                "pdf_url": pdf_url,
                "oa_status": oa_status,
                "abstract": abstract,
            }
        )

    return papers


def _query_europe_pmc(
    client: httpx.Client,
    query: str,
    year_min: int,
    limit: int,
) -> List[Dict[str, Any]]:
    """Query Europe PMC API for peer-reviewed life sciences and interdisciplinary literature."""
    clean_q = re.sub(r"[^\w\s]", " ", query).strip()
    if not clean_q:
        return []

    params = {
        "query": f"{clean_q} (PUB_YEAR:[{year_min} TO 2026])",
        "format": "json",
        "pageSize": limit,
        "resultType": "core",
    }

    resp = _request_with_retry(client, EUROPE_PMC_BASE_URL, params, EUROPE_PMC_HEADERS)
    if not resp:
        return []

    papers: List[Dict[str, Any]] = []
    try:
        data = resp.json()
        results = data.get("resultList", {}).get("result", [])
        for item in results:
            title = item.get("title")
            if not title:
                continue
            title = re.sub(r"<[^>]+>", "", title).strip()

            authors_str = item.get("authorString", "")
            authors = [a.strip() for a in authors_str.split(",") if a.strip()][:5]

            year = item.get("pubYear")
            try:
                year = int(year) if year else None
            except ValueError:
                year = None

            doi = normalize_doi(item.get("doi"))
            abstract = re.sub(r"<[^>]+>", "", item.get("abstractText") or "").strip()

            oa_status = item.get("isOpenAccess") == "Y"
            pdf_url = ""
            full_text_list = item.get("fullTextUrlList", {}).get("fullTextUrl", [])
            if isinstance(full_text_list, list):
                for ft in full_text_list:
                    if ft.get("documentStyle") == "pdf":
                        pdf_url = ft.get("url", "")
                        oa_status = True
                        break

            papers.append(
                {
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "source": "europe_pmc",
                    "doi": doi,
                    "pdf_url": pdf_url,
                    "oa_status": oa_status,
                    "abstract": abstract,
                }
            )
    except Exception as e:
        logger.warning(f"Failed to parse Europe PMC response for '{query}': {e}")

    return papers


def _query_arxiv(
    client: httpx.Client,
    query: str,
    year_min: int,
    limit: int,
) -> List[Dict[str, Any]]:
    """Query ArXiv API for cutting-edge preprints with guaranteed open-access fulltext."""
    clean_q = re.sub(r"[^\w\s]", " ", query).strip()
    if not clean_q:
        return []

    params = {
        "search_query": f"all:{clean_q}",
        "start": 0,
        "max_results": limit,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }

    resp = _request_with_retry(client, ARXIV_BASE_URL, params, ARXIV_HEADERS)
    if not resp:
        return []

    papers: List[Dict[str, Any]] = []
    try:
        root = ET.fromstring(resp.text)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.findall("atom:entry", ns):
            title_elem = entry.find("atom:title", ns)
            if title_elem is None or not title_elem.text:
                continue
            title = re.sub(r"\s+", " ", title_elem.text).strip()

            summary_elem = entry.find("atom:summary", ns)
            abstract = re.sub(r"\s+", " ", summary_elem.text).strip() if summary_elem is not None and summary_elem.text else ""

            published_elem = entry.find("atom:published", ns)
            year = int(published_elem.text[:4]) if published_elem is not None and published_elem.text else None

            if year and year < year_min:
                continue

            authors = []
            for a in entry.findall("atom:author", ns):
                name_elem = a.find("atom:name", ns)
                if name_elem is not None and name_elem.text:
                    authors.append(name_elem.text.strip())

            pdf_url = ""
            for link in entry.findall("atom:link", ns):
                if link.attrib.get("title") == "pdf" or link.attrib.get("type") == "application/pdf":
                    pdf_url = link.attrib.get("href", "")
                    break

            if not pdf_url:
                id_elem = entry.find("atom:id", ns)
                if id_elem is not None and id_elem.text:
                    arxiv_id = id_elem.text.split("/abs/")[-1]
                    pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"

            papers.append(
                {
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "source": "arxiv",
                    "doi": "",
                    "pdf_url": pdf_url,
                    "oa_status": True,
                    "abstract": abstract,
                }
            )
    except Exception as e:
        logger.warning(f"Error parsing ArXiv feed for query '{query}': {e}")

    return papers


def search_papers(
    queries: List[str],
    year_min: int = 2017,
    limit_per_query: int = 6,
) -> List[Dict[str, Any]]:
    """
    Search academic literature across OpenAlex, Semantic Scholar, Europe PMC, and ArXiv APIs.
    Deduplicates results across multiple queries and extracts rich abstracts and open-access PDFs.

    Args:
        queries: List of search query strings.
        year_min: Minimum publication year (default: 2017).
        limit_per_query: Max results per provider per query (default: 6).

    Returns:
        List of normalized paper dictionaries:
        `[{"title": str, "authors": list[str], "year": int, "source": str, "doi": str, "pdf_url": str, "oa_status": bool, "abstract": str}]`
    """
    dedup_map: Dict[str, Dict[str, Any]] = {}

    valid_queries = [q.strip() for q in queries if q.strip()]
    if not valid_queries:
        valid_queries = ["research literature"]

    def _fetch_single_query(q: str, client: httpx.Client) -> List[Dict[str, Any]]:
        # Query providers
        oa_papers = _query_openalex(client, q, year_min, limit_per_query)
        s2_papers = _query_semantic_scholar(client, q, year_min, limit_per_query)
        epmc_papers = _query_europe_pmc(client, q, year_min, limit_per_query)
        arxiv_papers = _query_arxiv(client, q, year_min, limit_per_query)
        return oa_papers + s2_papers + epmc_papers + arxiv_papers

    combined_batches: List[Dict[str, Any]] = []
    with httpx.Client(timeout=8.0, follow_redirects=True) as client:
        with ThreadPoolExecutor(max_workers=min(len(valid_queries), 4)) as executor:
            futures = [executor.submit(_fetch_single_query, q, client) for q in valid_queries]
            for f in as_completed(futures):
                try:
                    res = f.result()
                    if res:
                        combined_batches.extend(res)
                except Exception as err:
                    logger.warning(f"Error executing parallel academic query: {err}")

    for paper in combined_batches:
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
            if doi_key:
                dedup_map[title_key] = paper
        else:
            # Merge complementary fields
            existing = dedup_map[match_key]
            if not existing.get("pdf_url") and paper.get("pdf_url"):
                existing["pdf_url"] = paper["pdf_url"]
                existing["oa_status"] = True
            if not existing.get("abstract") and paper.get("abstract"):
                existing["abstract"] = paper["abstract"]
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

    if not unique_papers:
        logger.warning(
            "External academic APIs returned 0 results for all queries. "
            "No fallback papers will be injected — only real results are used."
        )

    logger.info(f"Retrieved {len(unique_papers)} unique papers across {len(queries)} queries.")
    return unique_papers
