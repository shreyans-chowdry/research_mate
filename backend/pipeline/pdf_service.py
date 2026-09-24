import re
import logging
from typing import Optional
import httpx
import pymupdf as fitz

logger = logging.getLogger(__name__)

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/pdf,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

REFERENCE_PATTERNS = [
    r"\n\s*(?:[0-9IVX]+\.?\s*)?(?:REFERENCES|References|BIBLIOGRAPHY|Bibliography)\b",
    r"\n\s*(?:Works\s+Cited|WORKS\s+CITED)\b",
]


def strip_reference_list(text: str) -> str:
    """
    Heuristically strip reference/bibliography sections to conserve LLM token context.
    Looks for standard academic reference section markers occurring in the latter portion of the paper.
    """
    if not text:
        return ""

    # Academic references almost always occur after the first 40% of the paper
    min_split_point = int(len(text) * 0.40)

    cutoff_index = -1
    for pattern in REFERENCE_PATTERNS:
        for match in re.finditer(pattern, text):
            if match.start() >= min_split_point:
                cutoff_index = match.start()
                break
        if cutoff_index != -1:
            break

    # If no match in the latter 60%, check shorter papers where sections start earlier
    if cutoff_index == -1 and len(text) < 10000:
        for pattern in REFERENCE_PATTERNS:
            match = re.search(pattern, text)
            if match and match.start() > 500:
                cutoff_index = match.start()
                break

    if cutoff_index != -1:
        logger.info(f"Stripped reference section at character index {cutoff_index} (saving {len(text) - cutoff_index} chars).")
        return text[:cutoff_index].strip()

    return text.strip()


def download_and_extract_pdf(pdf_url: str) -> str:
    """
    Downloads an academic PDF via HTTP/HTTPS and extracts clean textual content using PyMuPDF.
    Heuristically cuts off reference lists and bibliographies to optimize LLM token limits.

    Args:
        pdf_url: Web URL linking directly to the PDF or repository open-access version.

    Returns:
        Extracted plain text string, or empty string on network/parsing failure.
    """
    if not pdf_url or not pdf_url.startswith(("http://", "https://")):
        return ""

    logger.info(f"Downloading PDF from: {pdf_url}")

    try:
        with httpx.Client(
            timeout=httpx.Timeout(3.5, connect=2.0, read=2.5),
            headers=BROWSER_HEADERS,
            follow_redirects=True,
        ) as client:
            resp = client.get(pdf_url)

            if resp.status_code != 200:
                logger.warning(f"Failed to download PDF. HTTP status {resp.status_code} for {pdf_url}")
                return ""

            content = resp.content
            if not content:
                logger.warning(f"Empty content returned for PDF at {pdf_url}")
                return ""

            # Check if server returned HTML instead of PDF
            if not content.startswith(b"%PDF") and b"<html" in content[:1024].lower():
                logger.warning(f"URL {pdf_url} returned an HTML landing page rather than a raw PDF stream.")
                return ""

            # Open PDF byte stream with PyMuPDF
            try:
                doc = fitz.open(stream=content, filetype="pdf")
            except Exception as e:
                logger.warning(f"PyMuPDF failed to parse document stream for {pdf_url}: {e}")
                return ""

            extracted_pages = []
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                page_text = page.get_text()
                if page_text and page_text.strip():
                    extracted_pages.append(page_text.strip())

            doc.close()

            if not extracted_pages:
                logger.warning(f"No readable text extracted from PDF at {pdf_url}")
                return ""

            raw_full_text = "\n\n".join(extracted_pages)
            logger.info(f"Successfully extracted {len(raw_full_text)} characters across {len(extracted_pages)} pages.")

            # Heuristically strip references and sanitize null bytes for PostgreSQL UTF-8 compliance
            processed_text = strip_reference_list(raw_full_text).replace("\x00", "")
            return processed_text

    except httpx.TimeoutException:
        logger.warning(f"Timeout (15s) exceeded while downloading PDF from {pdf_url}")
        return ""
    except httpx.HTTPError as http_err:
        logger.warning(f"HTTP error downloading PDF from {pdf_url}: {http_err}")
        return ""
    except Exception as exc:
        logger.warning(f"Unexpected error processing PDF from {pdf_url}: {exc}")
        return ""
