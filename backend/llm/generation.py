"""Generative layer: LLM-powered reformulation and results narration.

Grounded -- the LLM never invents content, it only rephrases or narrates
what is already computed elsewhere in the pipeline:

1. reformulate_recommendation -- rewrites one catalog recommendation's
   existing text for a specific bank's context, and writes a short
   justification from the real SHAP factors computed in explain.py.
2. explain_results / explain_comparison -- short narratives of a bank's
   maturity profile, built only from scores already computed by scoring.py.

These bank-side features always use the LOCAL model (LLM_* below, Ollama)
-- never sent anywhere else, which matters for real bank records.

Regulatory-circular analysis ("Veille réglementaire") lives in
llm/regulatory_analysis.py, not here -- it uses ``call_regulatory_llm``
(REG_LLM_* below), a separate, cloud-first configuration (Gemini, via its
OpenAI-compatible endpoint) with automatic fallback to the same local
model as everything else if the cloud call fails or REG_LLM_API_KEY is
unset. Only this one feature's GENERATION step ever leaves the machine;
its retrieval step (embeddings/RAG) stays local regardless (see
llm/embeddings.py) -- and regulatory source text/candidates sent to
Gemini contain referential metadata (catalog codes/titles, circular
excerpts), never bank-identifying data.

Calls a local Ollama server through its OpenAI-compatible API (the
`openai` SDK is used purely as an HTTP client here -- no request ever
reaches the public OpenAI API for bank-side features). Configurable via
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
import logging
import os
import re
import threading
import time
from typing import Any

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Modele LOCAL (Ollama) -- fonctionnalites cote banque (reformulation,
# narrative) ET repli de secours pour la veille reglementaire ci-dessous ──
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
# Ollama does not check this value at all -- any non-empty string works.
# Set explicitly to "" (empty) to force the non-LLM fallback, e.g. in
# tests or a deployment with no Ollama server.
LLM_API_KEY = os.getenv("LLM_API_KEY", "ollama")
LLM_MODEL = os.getenv("LLM_MODEL", "llama32cpu")
# Combien de temps Ollama garde le modele charge en memoire apres un appel
# -- evite de repayer un rechargement a froid entre deux appels rapproches
# (typiquement les chunks successifs d'une meme analyse de circulaire).
LLM_KEEP_ALIVE = os.getenv("LLM_KEEP_ALIVE", "30m")
# Optionnel : fixe le nombre de threads CPU utilises par Ollama pour
# l'inference. Laisse Ollama deviner (comportement par defaut) si absent.
LLM_NUM_THREAD = int(os.getenv("LLM_NUM_THREAD", "0")) or None

# ── Modele DEDIE a la veille reglementaire -- Gemini (cloud) par defaut,
# nettement plus rapide/fiable qu'un petit modele local pour l'extraction
# et la reformulation de questions/recommandations. Distinct des LLM_*
# ci-dessus : les fonctionnalites cote banque restent 100% locales. Si
# REG_LLM_API_KEY est vide, la veille reglementaire utilise directement le
# modele local (meme repli qu'en cas d'echec de l'appel Gemini) --------------
REG_LLM_PROVIDER = os.getenv("REG_LLM_PROVIDER", "")
REG_LLM_BASE_URL = os.getenv("REG_LLM_BASE_URL", "")
REG_LLM_API_KEY = os.getenv("REG_LLM_API_KEY", "")
REG_LLM_MODEL = os.getenv("REG_LLM_MODEL", "")

# Low temperature (stable output) and a small output cap, per spec. Kept
# tight since generation time on CPU scales with tokens produced -- this
# is a hard safety ceiling, not a target; the prompts ask for short
# answers directly, which is what actually keeps completions fast.
_TEMPERATURE = 0.2
_MAX_OUTPUT_TOKENS = 250
# Generous timeout: local CPU inference (e.g. a small model on Ollama) is
# much slower than a cloud API, but a request must still fail eventually
# rather than hang the caller forever. 90s was too tight for
# regulatory_analysis's RAG prompts (system prompt + k candidates +
# section text) -- measured up to ~166s on this machine under normal load.
_TIMEOUT_SECONDS = 240.0
# Cloud API: fails fast if unreachable/slow, so the fallback to the local
# model kicks in quickly rather than waiting out the local timeout above.
_REG_TIMEOUT_SECONDS = 45.0
# Gemini 3.5 (and other "thinking" models) spend an unpredictable, often
# large number of tokens on internal reasoning BEFORE any visible output --
# those count against max_tokens too. Verified empirically: max_tokens=100
# on a trivial one-line prompt already truncated (finish_reason="length")
# with the reasoning alone; max_tokens=2000 completed cleanly. Generous
# fixed ceiling, decoupled from the caller's own max_output_tokens (tuned
# for local CPU latency, not relevant to a cloud API's reasoning budget).
_REG_GEMINI_MAX_OUTPUT_TOKENS = int(os.getenv("REG_LLM_MAX_OUTPUT_TOKENS", "8000"))
# Nombre max de tentatives Gemini avant repli local, et base du backoff
# exponentiel entre deux tentatives (delais ~1s, 2s, 4s avec les valeurs
# par defaut) -- uniquement pour les erreurs TRANSITOIRES (429, timeout,
# 5xx), voir ``_is_transient_llm_error``. Une erreur PERSISTANTE (cle
# invalide, modele inconnu...) tombe sur le repli local des la 1re tentative,
# reessayer ne changerait rien.
_REG_LLM_MAX_RETRIES = int(os.getenv("REG_LLM_MAX_RETRIES", "3"))
_REG_LLM_BACKOFF_BASE_SECONDS = float(os.getenv("REG_LLM_BACKOFF_BASE", "1.0"))

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


def _call_llm_raw(
    system_prompt: str,
    user_prompt: str,
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout: float,
    json_schema: dict[str, Any] | None,
    max_output_tokens: int,
    ollama_extras: bool,
) -> str:
    """Calls an OpenAI-compatible chat completions endpoint (local Ollama
    or a cloud provider) and returns the raw text response.

    Raises on any failure (missing key, server unreachable, network
    error, API error, empty content) so callers can catch it and fall
    back -- never lets an exception escape to the API layer.
    """
    if not api_key:
        raise RuntimeError("API key is not configured")

    import openai  # lazy import: not needed on the pure-fallback path

    client = openai.OpenAI(api_key=api_key, base_url=base_url, timeout=timeout)
    kwargs: dict[str, Any] = {}
    if json_schema is not None:
        # "json_schema" (not the generic "json_object") makes the server
        # actually constrain decoding to this schema, so required fields
        # are reliably present -- verified empirically on Ollama:
        # {"type": "json_object"} alone only guarantees *some* valid JSON,
        # a small local model then routinely omits fields the prompt asked
        # for but didn't grammar-enforce (e.g. dropping "excerpt" and
        # "requirement_text" from every item in regulatory_analysis).
        kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "response", "schema": json_schema, "strict": True},
        }

    extra_body: dict[str, Any] = {}
    if ollama_extras:
        # keep_alive et options.num_thread sont des extensions specifiques
        # a Ollama, absentes du schema OpenAI standard (et rejetees ou
        # ignorees par un vrai fournisseur cloud) -- extra_body les injecte
        # tels quels dans le corps JSON envoye, sans que le SDK openai les
        # valide (il les ignorerait sinon).
        extra_body["keep_alive"] = LLM_KEEP_ALIVE
        if LLM_NUM_THREAD:
            extra_body["options"] = {"num_thread": LLM_NUM_THREAD}

    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=max_output_tokens,
            temperature=_TEMPERATURE,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            extra_body=extra_body or None,
            **kwargs,
        )
    except Exception as exc:
        raise RuntimeError(f"LLM call failed: {exc}") from exc

    content = response.choices[0].message.content
    if not content:
        raise RuntimeError("LLM response had no content")
    return content


def _call_llm(
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any] | None = None,
    max_output_tokens: int = _MAX_OUTPUT_TOKENS,
) -> str:
    """Calls the LOCAL Ollama server (LLM_*) -- used by every bank-side
    feature (reformulation, narrative), and as the automatic fallback for
    ``call_regulatory_llm`` below. See ``_call_llm_raw`` for behavior."""
    return _call_llm_raw(
        system_prompt,
        user_prompt,
        base_url=LLM_BASE_URL,
        api_key=LLM_API_KEY,
        model=LLM_MODEL,
        timeout=_TIMEOUT_SECONDS,
        json_schema=json_schema,
        max_output_tokens=max_output_tokens,
        ollama_extras=True,
    )


def _is_transient_llm_error(exc: BaseException) -> bool:
    """Distingue une erreur TRANSITOIRE (429 rate limit, timeout, 5xx --
    vaut la peine de reessayer) d'une erreur PERSISTANTE/dure (cle
    invalide, requete malformee, modele inconnu -- reessayer ne changera
    rien, autant tomber sur le repli local tout de suite).

    Inspecte la cause d'origine (``exc.__cause__``, wrappee par
    ``_call_llm_raw`` en ``RuntimeError``) plutot que ``exc`` lui-meme.
    Se base sur ``status_code`` (present sur toutes les ``APIStatusError``
    du SDK openai : RateLimitError=429, InternalServerError=5xx...) plutot
    que sur des ``isinstance`` nommes explicitement, pour rester correct
    meme si le SDK ajoute de nouvelles sous-classes. Les erreurs de
    connexion/timeout (pas de reponse HTTP, donc pas de status_code) sont
    identifiees par leur nom de type."""
    cause = exc.__cause__ or exc
    status_code = getattr(cause, "status_code", None)
    if status_code is not None:
        return status_code == 429 or status_code >= 500
    return type(cause).__name__ in (
        "APITimeoutError", "APIConnectionError", "Timeout", "ConnectError", "ReadTimeout",
    )


def _is_quota_exhaustion(exc: BaseException) -> bool:
    """Quota EPUISE (typiquement journalier, palier gratuit Gemini) --
    distinct d'un simple pic de charge (429 générique) ou d'une erreur 5xx
    ponctuelle : réessayer dans la foulée (quelques secondes de backoff)
    ne sert à rien, le quota ne va pas se régénérer entretemps. Vérifié
    empiriquement sur ce projet : Gemini renvoie précisément
    "RESOURCE_EXHAUSTED" pour ce cas, avec un ``retryDelay`` suggéré de
    plusieurs dizaines de secondes -- bien au-delà de notre fenêtre de
    backoff normale (voir ``_REG_LLM_BACKOFF_BASE_SECONDS``)."""
    return "RESOURCE_EXHAUSTED" in str(exc)


def _is_daily_quota_exhaustion(exc: BaseException) -> bool:
    """Sous-cas de ``_is_quota_exhaustion`` : le quota épuisé est
    spécifiquement le palier JOURNALIER (le message Gemini précise
    "PerDay" dans son ``quotaId``, ex. "GenerateRequestsPerDayPer...").
    Ce quota ne se régénère typiquement pas avant plusieurs heures --
    contrairement à un quota par minute, qui peut se régénérer vite --
    donc mérite un délai avant nouvel essai beaucoup plus long (voir
    ``_REG_QUOTA_COOLDOWN_DAILY_SECONDS``)."""
    return "PerDay" in str(exc)


# Une fois un quota épuisé détecté, on arrête d'essayer Gemini pendant ce
# délai plutôt que de re-découvrir le même échec (avec son aller-retour
# réseau) à CHAQUE chunk d'une même circulaire -- sur un document à
# plusieurs sections, ça economise potentiellement des dizaines de
# secondes par chunk. Deux durées : un quota JOURNALIER (constaté sur ce
# projet, palier gratuit -- 20 requêtes/jour) ne se régénère pas avant des
# heures, donc mérite un délai bien plus long que le cas générique (qui
# pourrait n'être qu'un pic de charge minute par minute). État en mémoire
# du process (pas persisté) : un redémarrage du serveur retente Gemini une
# fois au prochain appel avant de se remettre en pause -- acceptable, le
# coût est un seul appel qui échoue vite (pas 3 tentatives avec backoff).
_REG_QUOTA_COOLDOWN_SECONDS = float(os.getenv("REG_LLM_QUOTA_COOLDOWN_SECONDS", "300"))
_REG_QUOTA_COOLDOWN_DAILY_SECONDS = float(os.getenv("REG_LLM_QUOTA_COOLDOWN_DAILY_SECONDS", "3600"))
_quota_exhausted_until = 0.0


def call_regulatory_llm(
    system_prompt: str,
    user_prompt: str,
    json_schema: dict[str, Any] | None = None,
    max_output_tokens: int = _MAX_OUTPUT_TOKENS,
) -> str:
    """Appel LLM pour la generation de « Veille reglementaire » (extraction
    et reformulation des questions/recommandations/traductions proposees) :
    tente d'abord le fournisseur cloud dedie (REG_LLM_*, Gemini par
    defaut) -- nettement plus rapide et fiable qu'un petit modele local
    pour cette tache. Sur une erreur TRANSITOIRE (429, timeout, 5xx),
    reessaie Gemini jusqu'a ``_REG_LLM_MAX_RETRIES`` fois avec un backoff
    exponentiel (``_REG_LLM_BACKOFF_BASE_SECONDS`` * 2^tentative), pour
    respecter la limite de debit du palier gratuit sans abandonner trop
    vite. Une erreur PERSISTANTE (ou les tentatives epuisees) fait
    retomber sur le modele local (LLM_*, meme chemin que les
    fonctionnalites cote banque) -- ou si REG_LLM_API_KEY est vide.

    ``max_output_tokens`` ne s'applique qu'au repli local : l'appel Gemini
    utilise son propre plafond, plus genereux (voir
    ``_REG_GEMINI_MAX_OUTPUT_TOKENS``), car ce modele consomme une part
    imprevisible de son budget de tokens en raisonnement interne avant
    meme de produire la sortie visible.

    Si un quota EPUISE (typiquement journalier) a été détecté récemment,
    saute même la première tentative Gemini pendant
    ``_REG_QUOTA_COOLDOWN_SECONDS`` -- inutile de repayer l'aller-retour
    réseau pour re-découvrir le même échec à chaque chunk d'une même
    circulaire (voir ``_is_quota_exhaustion``).

    Ne leve que si Gemini (avec ses tentatives) ET le repli local echouent
    tous les deux -- l'appelant (regulatory_analysis.py) capture deja
    largement pour retomber sur une liste vide plutot que de planter ou
    d'inventer, conformement a la regle du human-in-the-loop."""
    global _quota_exhausted_until
    now = time.time()
    if REG_LLM_API_KEY and now < _quota_exhausted_until:
        logger.info(
            "Veille reglementaire : Gemini en pause (quota épuisé), encore "
            "%.0fs avant nouvel essai -- repli direct sur le modele local.",
            _quota_exhausted_until - now,
        )
    elif REG_LLM_API_KEY:
        for attempt in range(1, _REG_LLM_MAX_RETRIES + 1):
            try:
                result = _call_llm_raw(
                    system_prompt,
                    user_prompt,
                    base_url=REG_LLM_BASE_URL,
                    api_key=REG_LLM_API_KEY,
                    model=REG_LLM_MODEL,
                    timeout=_REG_TIMEOUT_SECONDS,
                    json_schema=json_schema,
                    max_output_tokens=_REG_GEMINI_MAX_OUTPUT_TOKENS,
                    ollama_extras=False,
                )
                logger.info(
                    "Veille reglementaire : appel Gemini reussi (tentative %d/%d).",
                    attempt, _REG_LLM_MAX_RETRIES,
                )
                return result
            except Exception as exc:
                if _is_quota_exhaustion(exc):
                    cooldown = (
                        _REG_QUOTA_COOLDOWN_DAILY_SECONDS
                        if _is_daily_quota_exhaustion(exc)
                        else _REG_QUOTA_COOLDOWN_SECONDS
                    )
                    _quota_exhausted_until = time.time() + cooldown
                    logger.warning(
                        "Veille reglementaire : quota Gemini épuisé -- pas de "
                        "nouvelle tentative Gemini avant %.0fs (%.1f min), "
                        "repli sur le modele local (%s).",
                        cooldown, cooldown / 60, exc,
                    )
                    break
                transient = _is_transient_llm_error(exc)
                if transient and attempt < _REG_LLM_MAX_RETRIES:
                    delay = _REG_LLM_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        "Veille reglementaire : erreur transitoire Gemini "
                        "(tentative %d/%d) : %s -- nouvel essai dans %.1fs.",
                        attempt, _REG_LLM_MAX_RETRIES, exc, delay,
                    )
                    time.sleep(delay)
                    continue
                # Erreur persistante (ou plus de tentatives) : on arrete
                # d'essayer Gemini et on tombe sur le repli local.
                logger.warning(
                    "Veille reglementaire : Gemini indisponible apres %d "
                    "tentative(s) (%s, %s) -- repli sur le modele local.",
                    attempt, "transitoire" if transient else "persistante", exc,
                )
                break
    result = _call_llm(system_prompt, user_prompt, json_schema, max_output_tokens)
    logger.info("Veille reglementaire : modele local (%s) utilise.", LLM_MODEL)
    return result


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

