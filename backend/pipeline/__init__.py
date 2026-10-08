"""Data acquisition and PDF processing pipeline for ResearchMate."""
from backend.pipeline.search_service import search_papers
from backend.pipeline.pdf_service import download_and_extract_pdf

__all__ = ["search_papers", "download_and_extract_pdf"]
