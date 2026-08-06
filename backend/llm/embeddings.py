"""Embeddings pour la recherche RAG de « Veille réglementaire » : encode les
questions/recommandations du référentiel et les sections de circulaires via
**bge-m3** (servi localement par Ollama, comme le reste de llm/generation.py --
aucune donnée ne quitte la machine).

bge-m3 est annoncé cross-lingue (FR/AR), mais des tests empiriques sur cette
installation Ollama montrent que la similarité cosinus directe entre une
phrase française et sa traduction arabe est comparable au "bruit" entre deux
phrases françaises SANS rapport (~0.30 dans les deux cas), alors que deux
phrases françaises sur le MÊME sujet atteignent ~0.70 -- le signal cross-
lingue direct n'est pas assez fiable pour classer correctement le top-k.
Palliatif retenu : traduire la requête (jamais le catalogue, toujours en
français) vers le français avant de l'encoder -- voir
``translate_to_french_for_retrieval``. Le texte source original reste
utilisé tel quel pour les citations ("excerpt") présentées à l'admin.
"""

from __future__ import annotations

import os

import numpy as np
import requests

from llm.generation import LLM_API_KEY, LLM_BASE_URL, REG_LLM_API_KEY, call_regulatory_llm

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "bge-m3")
EMBEDDING_DIM = 1024
_EMBED_TIMEOUT_SECONDS = 60.0

# Ollama expose les embeddings sur son API native (/api/embed), pas sur le
# chemin OpenAI-compatible (/v1/...) utilisé par _call_llm -- on dérive donc
# la racine du serveur depuis LLM_BASE_URL en retirant le suffixe "/v1".
_OLLAMA_ROOT = LLM_BASE_URL[: -len("/v1")] if LLM_BASE_URL.endswith("/v1") else LLM_BASE_URL


def embed(texts: list[str]) -> np.ndarray:
    """Encode une liste de textes en vecteurs bge-m3, **normalisés** (norme
    L2 = 1) pour que la similarité cosinus se réduise à un simple produit
    scalaire au moment de la recherche. Retourne un tableau ``(n, 1024)``.

    Lève une exception si le serveur Ollama est injoignable ou si le modèle
    n'est pas chargé -- pas de repli silencieux ici, contrairement à
    ``llm.generation`` : sans embeddings, la recherche RAG ne peut
    fonctionner du tout, mieux vaut échouer bruyamment que router vers du
    "presque vide" sans que l'appelant s'en aperçoive.
    """
    if not texts:
        return np.zeros((0, EMBEDDING_DIM), dtype=np.float32)
    resp = requests.post(
        f"{_OLLAMA_ROOT}/api/embed",
        json={"model": EMBEDDING_MODEL, "input": texts},
        timeout=_EMBED_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    arr = np.array(resp.json()["embeddings"], dtype=np.float32)
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return arr / norms


_TRANSLATE_SYSTEM_PROMPT = """\
Tu traduis un texte de l'arabe vers le francais. Traduction directe et
fidele, sans commentaire, sans reformulation, sans rien ajouter ni omettre.
Le resultat sert uniquement a une recherche documentaire interne, pas a une
publication -- privilegie la fidelite au sens sur le style."""


def translate_to_french_for_retrieval(text: str) -> str:
    """Traduit un texte (arabe, typiquement) en français, uniquement pour
    construire une requête de recherche dans le même espace que le
    catalogue (toujours indexé en français) -- voir le docstring du module
    pour pourquoi la comparaison cross-lingue directe n'est pas fiable ici.

    Le texte source original reste utilisé tel quel pour l'"excerpt" -- ne
    jamais présenter cette traduction comme une citation de la circulaire.

    Retourne le texte tel quel (non traduit) si l'appel échoue ou si
    aucun modèle (cloud REG_LLM_* ou local LLM_*) n'est configuré : la
    recherche reste alors possible, juste moins précise, plutôt que de
    bloquer l'analyse.
    """
    if not (REG_LLM_API_KEY or LLM_API_KEY) or not text.strip():
        return text
    try:
        translated = call_regulatory_llm(_TRANSLATE_SYSTEM_PROMPT, text[:2000]).strip()
        return translated or text
    except Exception:
        return text
