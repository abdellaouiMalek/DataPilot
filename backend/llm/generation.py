"""Generative layer: LLM-powered reformulation and results narration.

Two things, both grounded -- the LLM never invents content, it only
rephrases what is already computed elsewhere in the pipeline:

1. reformulate_recommendation -- rewrites one catalog recommendation's
   existing text for a specific bank's context, and writes a short
   justification from the real SHAP factors computed in explain.py.
2. explain_results -- a short narrative of a bank's maturity profile,
   built only from scores already computed by scoring.py.

Calls a local Ollama server through its OpenAI-compatible API (the
`openai` SDK is used purely as an HTTP client here -- no request ever
reaches the public OpenAI API). That keeps every bank record on the
machine, which matters in this banking context. Configurable via
LLM_BASE_URL / LLM_API_KEY / LLM_MODEL, defaulting to a local Ollama
server, so a fresh checkout works with no .env changes as long as Ollama
is running with the expected model pulled.

Every public function degrades to a non-LLM fallback (the catalog text
as-is, or a templated sentence) if the LLM call fails -- server not
running, network error, invalid JSON -- or if LLM_API_KEY is explicitly
set empty, so the caller always gets a usable result.

Caller responsibility: only reformulate recommendations that are actually
displayed (the top-N of a ranked plan), never the full 128-row catalog --
this module does not enforce that limit itself, it just serves one call at
a time.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import unicodedata
from typing import Any

from dotenv import load_dotenv

load_dotenv()

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
# Ollama does not check this value at all -- any non-empty string works.
# Set explicitly to "" (empty) to force the non-LLM fallback, e.g. in
# tests or a deployment with no Ollama server.
LLM_API_KEY = os.getenv("LLM_API_KEY", "ollama")
LLM_MODEL = os.getenv("LLM_MODEL", "llama32cpu")

# Low temperature (stable output) and a small output cap, per spec. Kept
# tight since generation time on CPU scales with tokens produced -- this
# is a hard safety ceiling, not a target; the prompts ask for short
# answers directly, which is what actually keeps completions fast.
_TEMPERATURE = 0.2
_MAX_OUTPUT_TOKENS = 250
# Generous timeout: local CPU inference (e.g. a small model on Ollama) is
# much slower than a cloud API, but a request must still fail eventually
# rather than hang the caller forever.
_TIMEOUT_SECONDS = 90.0

# System prompts are in French: the LLM reformulates French bank content
# for French-speaking bank staff, and the grounding rules read most
# unambiguously to the model in the same language as the content it edits.
_SYSTEM_PROMPT_REFORMULATE = """\
Tu es un assistant qui reformule des recommandations data pour une banque.
Tu ne dois JAMAIS inventer d'action, d'obligation reglementaire precise, de
chiffre ou de reference de circulaire. Tu reformules fidelement le texte
source fourni : meme action, ton adapte, aucune action nouvelle inventee.
Tu t'appuies UNIQUEMENT sur les facteurs de priorite fournis pour rediger
la justification -- n'invente aucune autre raison.
Ton : professionnel, clair, oriente banque. Vocabulaire metier simple.
Sois CONCIS : titre de 8 mots maximum, texte_reformule et justification
de 2 phrases maximum chacun.
Reponds uniquement en JSON strict conforme au schema demande."""

_SYSTEM_PROMPT_EXPLAIN = """\
Tu es un assistant qui explique en langage clair le profil de maturite
data d'une banque, a partir de scores deja calcules.
Tu ne dois JAMAIS inventer de chiffre : n'utilise que les scores fournis
dans le message.
Ton : professionnel, clair, oriente banque. Sois CONCIS : 3 phrases
maximum au total."""

_SYSTEM_PROMPT_COMPARE = """\
Tu es un assistant qui analyse l'evolution de la maturite data d'une
banque entre deux evaluations, a partir de scores deja calcules.
Tu ne dois JAMAIS inventer de chiffre : n'utilise que les scores fournis
dans le message.
Ton : professionnel, clair, oriente banque. Analyse les deux periodes
ENSEMBLE comme une seule evolution (progression, recul ou stagnation
globale, dimensions qui expliquent le plus ce changement) -- ne decris
jamais chaque periode separement l'une apres l'autre. Sois CONCIS : 4
phrases maximum au total."""

_REFORMULATE_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "titre": {"type": "string"},
        "texte_reformule": {"type": "string"},
        "justification": {"type": "string"},
    },
    "required": ["titre", "texte_reformule", "justification"],
    "additionalProperties": False,
}

# reco_code -> already-built result. Keyed by (reco_code, trigger_level,
# hash of bank_context + shap_factors) so an identical context never pays
# for a repeat LLM call.
_reformulation_cache: dict[str, dict[str, str]] = {}

# Per-key locks so two threads racing on the *same* cache key (e.g. a
# background prewarm task and a live page request computing the same
# assessment's plan at once) never both pay for the LLM call -- the
# second thread just blocks until the first is done, then reads the
# cache. ``_locks_guard`` only protects creating/looking-up the
# per-key lock itself, which is cheap and never contended for long.
_reformulation_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for_key(key: str) -> threading.Lock:
    with _locks_guard:
        lock = _reformulation_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _reformulation_locks[key] = lock
        return lock


def _call_llm(
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any] | None = None,
    max_output_tokens: int = _MAX_OUTPUT_TOKENS,
) -> str:
    """Calls the local Ollama server via its OpenAI-compatible API and
    returns the raw text response.

    Raises on any failure (missing key, server unreachable, network
    error, API error) so callers can catch it and fall back to the
    non-LLM path -- never lets an exception escape to the API layer.
    """
    if not LLM_API_KEY:
        raise RuntimeError("LLM_API_KEY is not configured")

    import openai  # lazy import: not needed on the pure-fallback path

    client = openai.OpenAI(
        api_key=LLM_API_KEY, base_url=LLM_BASE_URL, timeout=_TIMEOUT_SECONDS
    )
    kwargs: dict[str, Any] = {}
    if json_schema is not None:
        kwargs["response_format"] = {"type": "json_object"}

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            max_tokens=max_output_tokens,
            temperature=_TEMPERATURE,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            **kwargs,
        )
    except Exception as exc:
        raise RuntimeError(f"LLM call failed: {exc}") from exc

    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("LLM response had no content")
    return content


def _cache_key(
    reco_code: str,
    trigger_level: int,
    bank_context: dict[str, Any],
    shap_factors: list[dict[str, Any]],
) -> str:
    """Deterministic cache key: reco_code + level + a hash of the context."""
    signature = json.dumps(
        {"bank_context": bank_context, "shap_factors": shap_factors},
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha256(signature.encode("utf-8")).hexdigest()[:16]
    return f"{reco_code}:{trigger_level}:{digest}"


# Stray placeholder tokens a small local model can leak verbatim into
# otherwise well-formed JSON -- e.g. echoing Python's own "None" instead
# of the number it was given. This is a different failure mode than
# invalid JSON (the JSON here parses fine, the *content* is just wrong),
# so it needs its own check after parsing succeeds, not just a try/except.
_GARBAGE_TOKENS = {"none", "null", "undefined", "nan"}


def _contains_garbage_token(*texts: str) -> bool:
    for text in texts:
        words = re.findall(r"[a-zA-Z]+", text.lower())
        if any(w in _GARBAGE_TOKENS for w in words):
            return True
    return False


def fallback_reformulation(
    reco: Any, shap_factors: list[dict[str, Any]]
) -> dict[str, str]:
    """Builds a reformulation with no LLM call: the catalog text unchanged,
    plus a justification assembled directly from the SHAP factor labels.

    Public (not just an internal implementation detail of
    ``reformulate_recommendation``): callers that already know they don't
    want an LLM call for a given item -- e.g. to cap how many
    recommendations actually pay for one -- can call this directly
    instead of going through the LLM-call-then-catch-exception path.
    """
    positive_labels = [
        f["label"] for f in shap_factors if f.get("direction") == "positif"
    ]
    if positive_labels:
        justification = (
            "Priorite elevee car " + " et ".join(positive_labels) + "."
        )
    else:
        justification = "Recommandation issue du plan d'action priorise."
    return {
        "reco_code": reco.code,
        "titre": reco.title,
        "texte_reformule": reco.recommendation_text,
        "justification": justification,
    }


def _build_reformulate_user_prompt(
    reco: Any,
    bank_context: dict[str, Any],
    shap_factors: list[dict[str, Any]],
) -> str:
    factors_text = "\n".join(
        f"- {f['label']} ({f['direction']})" for f in shap_factors
    )
    dimension = getattr(reco, "dimension", None) or "n/a"
    return f"""Recommandation source (catalogue) :
- Code : {reco.code}
- Titre : {reco.title}
- Texte source : {reco.recommendation_text}
- Categorie : {reco.category}
- Dimension : {dimension}
- Transition : niveau {reco.trigger_level} -> niveau {reco.target_level}

Contexte de la banque :
- Score global : {bank_context.get("score_global")}
- Niveau de maturite : {bank_context.get("maturity_level")}
- Score de la dimension concernee : {bank_context.get("dimension_score")}
- Niveau actuel de la question : {bank_context.get("current_level")}
- Niveau cible de la question : {bank_context.get("target_level")}

Facteurs de priorite (deja calcules, a utiliser tels quels pour la
justification) :
{factors_text}

Reformule cette recommandation pour ce contexte precis. Reponds en JSON
avec exactement ces cles : titre, texte_reformule, justification."""


def reformulate_recommendation(
    reco: Any,
    bank_context: dict[str, Any],
    shap_factors: list[dict[str, Any]],
) -> dict[str, str]:
    """Reformulates one catalog recommendation for a bank's specific context.

    ``reco`` needs ``code``, ``title``, ``recommendation_text``,
    ``category``, ``trigger_level``, ``target_level``, and (optionally)
    ``dimension`` attributes -- a ``Recommendation`` ORM row works directly
    if the caller attaches a ``dimension`` attribute first.

    ``bank_context`` carries the numeric context: ``score_global``,
    ``maturity_level``, ``dimension_score``, ``current_level``,
    ``target_level`` (the question's own current/target level).

    ``shap_factors`` are the already-translated SHAP factors for this
    candidate (same shape as ``explain.explain_recommendations`` output:
    ``feature``/``shap_value``/``direction``/``label``).

    Returns ``{"reco_code", "titre", "texte_reformule", "justification"}``.
    Always attached to ``reco.code`` for traceability. Falls back to the
    catalog's own text (+ a factor-based justification) if the LLM call
    fails, returns invalid JSON, or ``LLM_API_KEY`` is unset -- so this
    function always returns a usable result.
    """
    key = _cache_key(reco.code, reco.trigger_level, bank_context, shap_factors)
    if key in _reformulation_cache:
        return _reformulation_cache[key]

    # Only one thread should ever pay for a given key's LLM call. If a
    # background prewarm and a live page request race on the same
    # recommendation, the loser just waits here for the winner's result
    # instead of firing a second, redundant (and slow) LLM call.
    with _lock_for_key(key):
        if key in _reformulation_cache:
            return _reformulation_cache[key]

        fallback = fallback_reformulation(reco, shap_factors)

        if not LLM_API_KEY:
            _reformulation_cache[key] = fallback
            return fallback

        user_prompt = _build_reformulate_user_prompt(
            reco, bank_context, shap_factors
        )

        try:
            raw = _call_llm(
                _SYSTEM_PROMPT_REFORMULATE, user_prompt, _REFORMULATE_JSON_SCHEMA
            )
            parsed = json.loads(raw)
            result = {
                "reco_code": reco.code,
                "titre": str(parsed["titre"]),
                "texte_reformule": str(parsed["texte_reformule"]),
                "justification": str(parsed["justification"]),
            }
            if _contains_garbage_token(
                result["titre"], result["texte_reformule"], result["justification"]
            ):
                result = fallback
        except Exception:
            result = fallback

        _reformulation_cache[key] = result
        return result


def _fallback_narrative(score_result: dict[str, Any]) -> str:
    """Templated narrative used when the LLM call fails or is unconfigured."""
    return (
        f"Avec un score global de {score_result.get('score_global'):.1f}/5, "
        "la banque se situe au niveau de maturite "
        f'"{score_result.get("maturity_label")}". Sa dimension la plus '
        f"forte est {score_result.get('strongest_dimension')}, tandis que "
        f"{score_result.get('weakest_dimension')} reste la moins avancee et "
        "constitue l'axe prioritaire d'amelioration."
    )


def _build_explain_user_prompt(score_result: dict[str, Any]) -> str:
    scores_text = "\n".join(
        f"- {name} : {score:.2f}/5"
        for name, score in score_result.get("dimension_scores", {}).items()
    )
    return f"""Score global : {score_result.get("score_global"):.2f}/5
Niveau de maturite : {score_result.get("maturity_label")}
Dimension la plus forte : {score_result.get("strongest_dimension")}
Dimension la plus faible : {score_result.get("weakest_dimension")}

Scores par dimension :
{scores_text}

Redige un court recit (3 phrases maximum) qui situe la banque et met en
avant ses forces et ses faiblesses. N'utilise QUE les chiffres ci-dessus,
n'en invente aucun autre."""


def explain_results(score_result: dict[str, Any]) -> str:
    """Produces a short (3-5 sentence) plain-language narrative of a bank's
    maturity profile.

    ``score_result`` carries ``score_global``, ``maturity_label``,
    ``dimension_scores`` (a ``{name: score}`` mapping), ``weakest_dimension``,
    and ``strongest_dimension`` -- all already computed elsewhere; this
    function only narrates them, it never invents a figure.

    Falls back to a templated sentence built from the same numbers if the
    LLM call fails or ``LLM_API_KEY`` is unset.
    """
    fallback = _fallback_narrative(score_result)

    if not LLM_API_KEY:
        return fallback

    user_prompt = _build_explain_user_prompt(score_result)
    try:
        narrative = _call_llm(_SYSTEM_PROMPT_EXPLAIN, user_prompt).strip()
        if _contains_garbage_token(narrative):
            return fallback
        return narrative
    except Exception:
        return fallback


def _fallback_comparison_narrative(comparison_result: dict[str, Any]) -> str:
    """Templated narrative used when the LLM call fails or is unconfigured."""
    initial = comparison_result.get("score_global_initial") or 0.0
    current = comparison_result.get("score_global_current") or 0.0
    delta = current - initial
    trend = "progresse" if delta > 0 else "recule" if delta < 0 else "stagne"
    return (
        f"Le score global {trend} de {initial:.1f}/5 a {current:.1f}/5 "
        f"({delta:+.1f} pt), passant du niveau de maturite "
        f'"{comparison_result.get("maturity_label_initial")}" a '
        f'"{comparison_result.get("maturity_label_current")}".'
    )


def _build_compare_user_prompt(comparison_result: dict[str, Any]) -> str:
    dims_text = "\n".join(
        f"- {name} : {scores['initial']:.2f}/5 -> {scores['current']:.2f}/5"
        for name, scores in comparison_result.get("dimension_scores", {}).items()
    )
    return f"""Periode initiale : score global {comparison_result.get("score_global_initial"):.2f}/5, niveau de maturite "{comparison_result.get("maturity_label_initial")}"
Periode actuelle : score global {comparison_result.get("score_global_current"):.2f}/5, niveau de maturite "{comparison_result.get("maturity_label_current")}"

Evolution par dimension (initial -> actuel) :
{dims_text}

Redige une courte analyse comparative (4 phrases maximum) de l'evolution
GLOBALE entre ces deux periodes : progression ou recul d'ensemble, quelles
dimensions expliquent le plus ce changement, quelles dimensions restent en
retard. N'utilise QUE les chiffres ci-dessus, n'en invente aucun autre."""


def explain_comparison(comparison_result: dict[str, Any]) -> str:
    """Produces a single (3-4 sentence) narrative analyzing the evolution
    between two assessments together, rather than one independent
    narrative per period.

    ``comparison_result`` carries ``score_global_initial``,
    ``score_global_current``, ``maturity_label_initial``,
    ``maturity_label_current``, and ``dimension_scores`` (a
    ``{name: {"initial": score, "current": score}}`` mapping) -- all
    already computed elsewhere; this function only narrates them.

    Falls back to a templated sentence built from the same numbers if the
    LLM call fails or ``LLM_API_KEY`` is unset.
    """
    fallback = _fallback_comparison_narrative(comparison_result)

    if not LLM_API_KEY:
        return fallback

    user_prompt = _build_compare_user_prompt(comparison_result)
    try:
        narrative = _call_llm(_SYSTEM_PROMPT_COMPARE, user_prompt).strip()
        if _contains_garbage_token(narrative):
            return fallback
        return narrative
    except Exception:
        return fallback


# ── Regulatory circular extraction (Veille reglementaire) ───────────────────

_SYSTEM_PROMPT_CIRCULAR = """\
Tu es un assistant qui analyse des circulaires reglementaires bancaires
(ex. Banque Centrale de Tunisie) pour en extraire les exigences concretes.
Tu ne dois JAMAIS inventer d'exigence absente du texte fourni : chaque
impact doit correspondre a une phrase ou obligation reellement presente
dans le texte. Si le texte ne contient aucune exigence exploitable,
renvoie une liste d'impacts vide plutot que d'en inventer.
Pour chaque exigence, choisis target_type parmi exactement ces trois
valeurs : "reglementaire" (contrainte de conformite), "nouvelle question"
(suggere une nouvelle question d'evaluation), "recommandation"
(bonne pratique non obligatoire).
Si une date de publication est indiquee dans le texte, convertis-la au
format ISO AAAA-MM-JJ ; sinon renvoie une chaine vide.
Ton : professionnel, concis. Reponds uniquement en JSON strict conforme
au schema demande, en francais."""

_CIRCULAR_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "reference": {"type": "string"},
        "theme": {"type": "string"},
        "publication_date": {"type": "string"},
        "impacts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "requirement_text": {"type": "string"},
                    "target_type": {"type": "string"},
                    "target_description": {"type": "string"},
                },
                "required": ["requirement_text"],
            },
        },
    },
    "required": ["reference", "theme", "impacts"],
    "additionalProperties": False,
}

# Generous output cap: unlike the other calls here, this one returns a list
# of several impact items, not one short sentence -- 250 tokens would
# truncate the JSON mid-array on anything but a trivial circular.
_CIRCULAR_MAX_OUTPUT_TOKENS = 1200
# Local small-model inference is slow; keep the prompt itself bounded so a
# multi-page circular doesn't balloon latency further. Most circulars make
# their substantive points in the first couple of pages.
_CIRCULAR_TEXT_CHARS = 6000

_TARGET_TYPE_DISPLAY = {
    "reglementaire": "réglementaire",
    "nouvelle question": "nouvelle question",
    "recommandation": "recommandation",
}


def _strip_accents(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def _fallback_circular_extraction(text: str, filename: str) -> dict[str, Any]:
    """No-LLM fallback: splits the text on "Article N" markers so the admin
    still gets one impact candidate per article to triage manually, instead
    of an empty result. Reference/theme default to the filename since
    there's no reliable way to identify them without the LLM."""
    articles = re.findall(
        r"(Art(?:icle)?\.?\s*\d+)\s*[:.\-]?\s*(.{20,400}?)"
        r"(?=Art(?:icle)?\.?\s*\d+|\Z)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    impacts = [
        {
            "requirement_text": re.sub(r"\s+", " ", f"{art} : {body}").strip()[:500],
            "target_type": "réglementaire",
            "target_description": "À qualifier manuellement",
        }
        for art, body in articles[:10]
    ]
    reference = re.sub(r"\.[a-zA-Z0-9]+$", "", filename).strip()[:200] or "Circulaire"
    return {
        "reference": reference,
        "theme": "À qualifier",
        "publication_date": None,
        "impacts": impacts,
    }


def _build_circular_user_prompt(text: str) -> str:
    truncated = text[:_CIRCULAR_TEXT_CHARS]
    return f"""Texte de la circulaire :
---
{truncated}
---

Extrait de ce texte : une reference courte du document (ex. "BCT n°2024-03"
si presente, sinon un intitule court), un theme en quelques mots, sa date de
publication (publication_date, format AAAA-MM-JJ, chaine vide si absente),
et la liste des exigences concretes qu'il impose (maximum 8). Pour chaque
exigence : le texte de l'obligation (requirement_text, fidele au texte
source), son type (target_type), et une courte description de l'element du
referentiel qu'elle concerne ou justifie (target_description, ex. "Chiffrement
des donnees sensibles").

Reponds en JSON avec exactement ces cles : reference, theme, publication_date,
impacts (liste d'objets avec requirement_text, target_type, target_description)."""


def _parse_iso_date(value: Any) -> str | None:
    text = str(value or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    return None


def extract_circular(text: str, filename: str) -> dict[str, Any]:
    """Extracts a short reference/theme/date and a list of candidate
    requirement impacts from a regulatory circular's raw text, for an admin
    to review (accept/modify/reject) before any of it is applied to the
    framework -- this function never writes to the framework itself, it
    only proposes. ``publication_date`` is an ISO "YYYY-MM-DD" string or
    ``None`` if the model couldn't find one.

    Falls back to a naive "Article N" split (no reference/theme/date,
    generic target descriptions) if the LLM call fails, returns invalid
    JSON, or ``LLM_API_KEY`` is unset -- the caller always gets something
    to review, never an empty result silently.
    """
    fallback = _fallback_circular_extraction(text, filename)

    if not LLM_API_KEY or not text.strip():
        return fallback

    user_prompt = _build_circular_user_prompt(text)
    try:
        raw = _call_llm(
            _SYSTEM_PROMPT_CIRCULAR,
            user_prompt,
            _CIRCULAR_JSON_SCHEMA,
            max_output_tokens=_CIRCULAR_MAX_OUTPUT_TOKENS,
        )
        parsed = json.loads(raw)
        impacts = []
        for item in parsed.get("impacts", []):
            requirement_text = str(item.get("requirement_text") or "").strip()
            if not requirement_text:
                continue
            raw_type = _strip_accents(str(item.get("target_type") or "")).strip().lower()
            target_type = _TARGET_TYPE_DISPLAY.get(raw_type, "réglementaire")
            impacts.append({
                "requirement_text": requirement_text,
                "target_type": target_type,
                "target_description": str(
                    item.get("target_description") or "À qualifier manuellement"
                ).strip(),
            })

        reference = str(parsed.get("reference") or "").strip() or fallback["reference"]
        theme = str(parsed.get("theme") or "").strip() or fallback["theme"]
        publication_date = _parse_iso_date(parsed.get("publication_date"))

        if _contains_garbage_token(reference, theme) or not impacts:
            return fallback

        return {
            "reference": reference,
            "theme": theme,
            "publication_date": publication_date,
            "impacts": impacts,
        }
    except Exception:
        return fallback
