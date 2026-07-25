"""Manual test script for generation.py against a local Ollama server.

Run with (from backend/llm/, or `python backend/llm/test_ollama.py` from
anywhere -- Python puts the script's own directory on sys.path):

    python test_ollama.py

generation.py already defaults to a local Ollama server
(http://localhost:11434/v1, model "llama32cpu"), so this script works
with no .env at all as long as Ollama is running with that model
pulled. Override via environment if needed, e.g.:

    LLM_BASE_URL=http://localhost:11434/v1
    LLM_API_KEY=ollama          # any value, unchecked by Ollama
    LLM_MODEL=llama32cpu        # your local Ollama model tag

This is not a pytest suite: it calls a real (local) model, so most of its
output is meant to be read by eye. Two things are checked automatically:
whether the reformulated text stays grounded in the source (a heuristic,
not a semantic check), and whether the result came from the LLM or from
generation.py's own fallback.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass

from generation import (
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_MODEL,
    fallback_reformulation,
    explain_results,
    reformulate_recommendation,
)

# Small, curated French stopword list -- good enough for the grounding
# heuristic below, not meant to be exhaustive.
_STOPWORDS = {
    "les", "des", "une", "un", "de", "du", "la", "le", "et", "en", "sur",
    "pour", "avec", "dans", "afin", "sont", "est", "cette", "ces", "aux",
    "qui", "que", "son", "sa", "ses", "aussi", "plus", "sans", "vers",
    "meme", "elle", "il", "ils", "au", "ce", "ou", "par", "se", "ne", "pas",
}


@dataclass
class FakeRecommendation:
    """Duck-types the subset of Recommendation that generation.py reads."""

    code: str
    title: str
    recommendation_text: str
    category: str
    trigger_level: int
    target_level: int


# A real catalog entry, copied verbatim from the seeded `recommendations`
# table (code D1Q1-1), so the grounding check below has a genuine source
# text to compare against -- not a made-up example.
SAMPLE_RECO = FakeRecommendation(
    code="D1Q1-1",
    title="Identifier un relais data à la Direction générale",
    recommendation_text=(
        "Désigner un interlocuteur à la Direction générale mobilisable "
        "sur les sujets data critiques, afin de sortir d'une absence "
        "totale d'implication."
    ),
    category="strategie",
    trigger_level=1,
    target_level=2,
)

SAMPLE_BANK_CONTEXT = {
    "score_global": 2.1,
    "maturity_level": "Initial",
    "dimension_score": 1.8,
    "current_level": 1,
    "target_level": 2,
}

SAMPLE_SHAP_FACTORS = [
    {
        "feature": "dimension_is_weakest",
        "shap_value": 0.38,
        "direction": "positif",
        "label": "dimension la plus faible de la banque",
    },
    {
        "feature": "gap_to_max",
        "shap_value": 0.21,
        "direction": "positif",
        "label": "marge de progression importante",
    },
    {
        "feature": "effort",
        "shap_value": -0.05,
        "direction": "negatif",
        "label": "effort de mise en oeuvre",
    },
]

SAMPLE_SCORE_RESULT = {
    "score_global": 2.1,
    "maturity_label": "Initial",
    "strongest_dimension": "Securite",
    "weakest_dimension": "Alignement strategique",
    "dimension_scores": {
        "Alignement strategique": 1.4,
        "Gouvernance": 1.9,
        "Securite": 3.2,
    },
}


def check_local_only() -> None:
    """Sanity check for the banking constraint: this script must never
    talk to a remote endpoint. Only warns -- it can't inspect what the
    provider SDK does internally, just what we told it to call."""
    if LLM_BASE_URL and "localhost" not in LLM_BASE_URL and (
        "127.0.0.1" not in LLM_BASE_URL
    ):
        print(
            f"WARNING: LLM_BASE_URL={LLM_BASE_URL!r} does not look like "
            "a local address -- this script is meant to stay fully "
            "offline."
        )


def check_ollama_reachable() -> bool:
    """Confirms the configured endpoint answers before running the real
    calls -- gives a clear error instead of a confusing timeout later."""
    if not LLM_BASE_URL:
        print(
            "LLM_BASE_URL is not set -- this script is meant to test a "
            "local OpenAI-compatible endpoint (e.g. Ollama). Set it in "
            "your .env first."
        )
        return False

    import openai

    client = openai.OpenAI(
        api_key=LLM_API_KEY or "ollama", base_url=LLM_BASE_URL
    )
    try:
        models = [m.id for m in client.models.list().data]
    except Exception as exc:
        print(f"Cannot reach Ollama at {LLM_BASE_URL}: {exc}")
        return False

    print(f"Ollama reachable at {LLM_BASE_URL}. Models available: {models}")
    # Ollama lists tagged names (e.g. "llama32cpu:latest"); compare on the
    # name before ":" so an untagged LLM_MODEL still matches.
    base_names = {m.split(":")[0] for m in models}
    if LLM_MODEL.split(":")[0] not in base_names:
        print(
            f"WARNING: LLM_MODEL={LLM_MODEL!r} is not in the list above "
            "-- check `ollama list` / `ollama pull llama3.2`."
        )
    return True


def _content_words(text: str) -> set[str]:
    words = "".join(c if c.isalnum() else " " for c in text.lower()).split()
    return {w for w in words if len(w) > 3 and w not in _STOPWORDS}


def check_grounding(source_text: str, reformulated_text: str) -> None:
    """Heuristic-only: warns if the reformulated text carries a lot of
    significant words absent from the source. This is a word-overlap
    smoke test, not a semantic entailment check -- it catches a mostly
    invented rewrite, not a single subtly invented figure."""
    source_words = _content_words(source_text)
    reformulated_words = _content_words(reformulated_text)
    if not reformulated_words:
        return
    new_words = reformulated_words - source_words
    ratio = len(new_words) / len(reformulated_words)
    if ratio > 0.5:
        print(
            "WARNING: reformulated text may introduce content absent "
            f"from the source ({ratio:.0%} of its significant words are "
            f"new). New words: {sorted(new_words)}"
        )
    else:
        print(f"Grounding check OK ({ratio:.0%} unseen words).")


def check_reformulation_source(result: dict[str, str]) -> None:
    """Distinguishes an LLM-produced result from generation.py's own
    fallback by comparing against what that fallback would have produced
    for this exact input -- more reliable than guessing from the text."""
    fallback = fallback_reformulation(SAMPLE_RECO, SAMPLE_SHAP_FACTORS)
    same_text = result["texte_reformule"] == fallback["texte_reformule"]
    same_justification = result["justification"] == fallback["justification"]
    if same_text and same_justification:
        print(
            "Result matches the non-LLM fallback -- the LLM call did not "
            "produce a usable result (missing key, network/API error, or "
            "invalid JSON). Check LLM_BASE_URL/LLM_MODEL."
        )
    else:
        print("Result differs from the fallback -- valid LLM JSON was used.")


def main() -> int:
    print(f"LLM_BASE_URL={LLM_BASE_URL!r} LLM_MODEL={LLM_MODEL!r}")
    check_local_only()

    if not check_ollama_reachable():
        return 1

    print("\n--- reformulate_recommendation ---")
    result = reformulate_recommendation(
        SAMPLE_RECO, SAMPLE_BANK_CONTEXT, SAMPLE_SHAP_FACTORS
    )
    for key, value in result.items():
        print(f"{key}: {value}")
    check_reformulation_source(result)
    check_grounding(
        SAMPLE_RECO.recommendation_text, result["texte_reformule"]
    )

    print("\n--- explain_results ---")
    print(explain_results(SAMPLE_SCORE_RESULT))

    return 0


if __name__ == "__main__":
    sys.exit(main())
