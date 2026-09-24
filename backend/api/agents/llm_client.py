import os
import re
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables
current_dir = Path(__file__).resolve().parent
backend_env = current_dir.parent.parent / ".env"
root_env = current_dir.parent.parent.parent / ".env"

if backend_env.exists():
    load_dotenv(backend_env)
elif root_env.exists():
    load_dotenv(root_env)
else:
    load_dotenv()

# Read keys strictly from GOOGLE_API_KEY and ANTHROPIC_API_KEY
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "").strip()

GEMINI_PRIMARY_MODEL = "gemini-3-flash-preview"
GEMINI_FALLBACK_MODELS = [
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
]


def extract_json_string(text: str) -> str:
    """Extract clean JSON substring from model responses that may contain markdown fences or surrounding commentary."""
    text = text.strip()
    # Check for markdown code fences
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fence_match:
        return fence_match.group(1).strip()

    # Find first { or [ and matching last } or ]
    first_brace = text.find("{")
    first_bracket = text.find("[")

    start_idx = -1
    if first_brace != -1 and first_bracket != -1:
        start_idx = min(first_brace, first_bracket)
    elif first_brace != -1:
        start_idx = first_brace
    elif first_bracket != -1:
        start_idx = first_bracket

    if start_idx != -1:
        last_brace = text.rfind("}")
        last_bracket = text.rfind("]")
        end_idx = max(last_brace, last_bracket)
        if end_idx > start_idx:
            return text[start_idx : end_idx + 1].strip()

    return text


def call_flash(prompt: str, json_mode: bool = False) -> str:
    """
    Invokes Google Gemini / Gemma for fast structured reasoning or extraction.
    Raises an error if no API key is configured or all models fail.

    Args:
        prompt: User prompt string.
        json_mode: Whether to enforce JSON formatted output.

    Returns:
        String response from Gemini/Gemma (or extracted JSON string when json_mode=True).
    """
    api_key = os.getenv("GOOGLE_API_KEY", "").strip() or GOOGLE_API_KEY

    if not api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY is not configured. Please set your Google Gemini API key in the .env file. "
            "No dummy/fallback data will be generated."
        )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        # Attempt with primary model, then fallbacks
        candidate_models = [GEMINI_PRIMARY_MODEL] + GEMINI_FALLBACK_MODELS
        last_error = None

        for model_name in candidate_models:
            config_args: Dict[str, Any] = {}
            if "gemini-3" in model_name:
                config_args["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
            if json_mode and not model_name.startswith("gemma"):
                config_args["response_mime_type"] = "application/json"

            config = types.GenerateContentConfig(**config_args) if config_args else None

            effective_prompt = prompt
            if json_mode and model_name.startswith("gemma") and "json" not in prompt.lower():
                effective_prompt += "\n\nRespond ONLY with a valid JSON object or array. Do not include markdown codeblocks or text outside the JSON."

            for attempt in range(3):
                try:
                    logger.info(f"Invoking LLM ({model_name}, attempt {attempt + 1}/3, json={json_mode})...")
                    if config:
                        response = client.models.generate_content(
                            model=model_name,
                            contents=effective_prompt,
                            config=config,
                        )
                    else:
                        response = client.models.generate_content(
                            model=model_name,
                            contents=effective_prompt,
                        )

                    if response and response.text:
                        raw_text = response.text.strip()
                        logger.info(f"LLM ({model_name}) succeeded with {len(raw_text)} chars.")
                        if json_mode:
                            return extract_json_string(raw_text)
                        return raw_text
                except Exception as e:
                    last_error = e
                    err_str = str(e)
                    if "503" in err_str or "UNAVAILABLE" in err_str or "500" in err_str or "INTERNAL" in err_str:
                        sleep_time = 1.5 * (attempt + 1)
                        logger.warning(
                            f"Model {model_name} transient error ({err_str[:60]}). Retrying in {sleep_time}s..."
                        )
                        import time
                        time.sleep(sleep_time)
                        continue
                    if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                        if "GenerateRequestsPerDay" in err_str or "free_tier_requests" in err_str:
                            logger.warning(f"Model {model_name} reached daily limit. Trying fallback model...")
                            break
                        sleep_time = 3.0 * (attempt + 1)
                        logger.warning(
                            f"Rate limit on {model_name} (attempt {attempt + 1}/3). "
                            f"Waiting {sleep_time}s before retry..."
                        )
                        import time
                        time.sleep(sleep_time)
                        continue
                    logger.warning(f"LLM model {model_name} failed: {e}. Trying fallback...")
                    break

        raise RuntimeError(
            f"All Gemini models failed. Last error: {last_error}. "
            "This may be due to API rate limits on the free tier. Please wait a moment and retry."
        )

    except ImportError:
        raise RuntimeError(
            "The 'google-genai' package is not installed. "
            "Please install it with: pip install google-genai"
        )


def call_opus(prompt: str, system: str = "", json_mode: bool = False) -> str:
    """
    Invokes the reasoning LLM for comparative synthesis, gap derivation, and report composition.
    Routes to Google Gemini.

    Args:
        prompt: User prompt string.
        system: Optional system instruction.
        json_mode: Optional boolean to enforce JSON formatted output.

    Returns:
        Generated text response string.
    """
    full_prompt = f"System Instructions:\n{system}\n\nTask:\n{prompt}" if system else prompt
    effective_json = json_mode or ("json" in full_prompt.lower() and "array" in full_prompt.lower())
    return call_flash(full_prompt, json_mode=effective_json)
