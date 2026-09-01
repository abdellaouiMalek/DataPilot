"""Import + analysis pipeline for "Veille réglementaire".

Two phases, split so the HTTP request never blocks on LLM inference:

1. Request-time (fast): fetch the source bytes (upload or URL), hash them,
   and either reuse an already-analyzed ``RegulatoryCircular`` with the same
   hash (cache hit -- ``find_circular_by_hash``) or create a fresh one in
   "en_cours" state (``create_pending_circular``). Owned by the router.
2. Background (slow, run via ``BackgroundTasks``): extract the PDF's text
   (native or OCR, see ``llm.pdf_extract``) ; si la langue détectée est
   l'arabe, traduit le DOCUMENT ENTIER en français en un seul passage
   (``translate_document_to_french``) AVANT le découpage, pour ne payer
   qu'un seul appel LLM de traduction (ou quelques-uns sur un très long
   document) plutôt qu'un par chunk ; extrait automatiquement la
   référence/le thème/l'institution/la date réelle
   (``extract_document_metadata``) ; puis pour chaque
   section (chunk, avec chevauchement -- voir ``pdf_extract.chunk_text``),
   récupère les candidats du catalogue les plus proches par similarité
   d'embeddings (RAG, ``regulatory_index.retrieve``) et analyse ce chunk
   contre ces seuls candidats
   (``llm.regulatory_analysis.analyze_chunk_with_candidates``) -- entièrement
   sur sa propre session DB, la requête ayant déjà répondu
   (``run_circular_analysis``).

RÈGLE ABSOLUE (rappel) : ce module ne persiste que des PROPOSITIONS
("proposed_data" sur chaque ``RegulatoryImpact``, action=None) -- rien n'est
appliqué au référentiel tant qu'un humain ne l'a pas validé.
"""

from __future__ import annotations

import asyncio
import difflib
import hashlib
import ipaddress
import json
import logging
import re
import socket
import time
from datetime import date
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal
from app.models import (
    Dimension,
    Question,
    Recommendation,
    RegulatoryCircular,
    RegulatoryEmbedding,
    RegulatoryImpact,
    SubDimension,
)
from app.services.regulatory_index import retrieve
from llm.pdf_extract import chunk_text, extract_text
from llm.regulatory_analysis import (
    analyze_chunk_with_candidates,
    build_retrieval_query,
    extract_document_metadata,
    find_original_context,
    generate_palier_recommendations,
    translate_document_to_french,
)

logger = logging.getLogger(__name__)

MAX_SOURCE_BYTES = 20 * 1024 * 1024  # 20 MB
FETCH_TIMEOUT_SECONDS = 20.0
# Ce qu'on garde du texte extrait pour affichage/relecture -- l'analyse LLM,
# elle, voit le texte complet (voir run_circular_analysis).
_RAW_TEXT_STORE_CHARS = 50_000


def _looks_internal_host(hostname: str) -> bool:
    """Best-effort SSRF guard: this endpoint lets an authenticated admin
    trigger a server-side fetch of an arbitrary URL, so it's worth refusing
    the obvious cases (loopback/private/link-local) even though the caller
    is trusted -- cheap to check, meaningfully reduces blast radius."""
    if not hostname or hostname.lower() == "localhost":
        return True
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    except Exception:
        return False  # can't resolve here -- let the real fetch fail naturally


async def fetch_source(*, file_bytes: bytes | None, filename: str | None, url: str | None) -> tuple[bytes, str]:
    """Returns (raw_bytes, filename) from either an uploaded file or a URL."""
    if file_bytes is not None:
        if len(file_bytes) > MAX_SOURCE_BYTES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Fichier trop volumineux (max 20 Mo)."
            )
        return file_bytes, filename or "document.pdf"

    assert url is not None
    parsed = httpx.URL(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Seuls les liens http(s) sont acceptés."
        )
    if _looks_internal_host(parsed.host or ""):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cette adresse n'est pas accessible."
        )

    try:
        async with httpx.AsyncClient(
            timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Impossible de récupérer le document : {exc}",
        )

    if len(resp.content) > MAX_SOURCE_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Fichier trop volumineux (max 20 Mo)."
        )

    source_filename = (parsed.path.rsplit("/", 1)[-1] or "document").strip()
    return resp.content, source_filename


def _looks_like_pdf(data: bytes) -> bool:
    return data[:5] == b"%PDF-"


def compute_source_hash(data: bytes) -> str:
    """Empreinte du document source, pour éviter de ré-analyser deux fois
    le même PDF (voir ``find_circular_by_hash``)."""
    return hashlib.sha256(data).hexdigest()


async def find_circular_by_hash(db: AsyncSession, source_hash: str) -> RegulatoryCircular | None:
    return await db.scalar(
        select(RegulatoryCircular).where(RegulatoryCircular.source_hash == source_hash)
    )


async def create_pending_circular(
    db: AsyncSession,
    *,
    reference: str,
    publication_date: Any,
    theme: str,
    source_filename: str | None,
    source_url: str | None,
    source_hash: str,
) -> RegulatoryCircular:
    """Crée la ligne circulaire immédiatement (analysis_status="en_cours"),
    avant même l'extraction/analyse -- c'est cette ligne que la requête HTTP
    renvoie tout de suite, pendant que ``run_circular_analysis`` tourne en
    arrière-plan."""
    circular = RegulatoryCircular(
        reference=reference,
        publication_date=publication_date,
        theme=theme,
        source_filename=source_filename,
        source_url=source_url,
        source_hash=source_hash,
        analysis_status="en_cours",
    )
    db.add(circular)
    await db.commit()
    await db.refresh(circular)
    return circular


async def _resolve_dimension_by_name(db: AsyncSession, name_hint: str) -> Dimension | None:
    """Rattache un nom de dimension libre (proposé par le LLM, ou lu depuis
    l'index d'embeddings pour une question candidate) à une vraie
    ``Dimension`` -- correspondance approchée (difflib), le LLM ne recopie
    pas toujours le nom exact."""
    if not name_hint.strip():
        return None
    dimensions = (
        await db.scalars(select(Dimension).where(Dimension.is_active.is_(True)))
    ).all()
    best: Dimension | None = None
    best_ratio = 0.0
    for dim in dimensions:
        ratio = difflib.SequenceMatcher(None, name_hint.lower(), dim.name.lower()).ratio()
        if ratio > best_ratio:
            best_ratio, best = ratio, dim
    return best if best_ratio >= 0.5 else None


async def compute_weight_recalc(db: AsyncSession, dimension: Dimension, delta: int) -> dict[str, Any]:
    """Calcule (sans rien écrire) l'effet d'un ajout (delta=+1) ou d'une
    désactivation (delta=-1) de question sur le poids intra-dimension des
    questions actives -- signalé dans la proposition pour que l'admin en
    ait conscience avant de valider, jamais appliqué automatiquement."""
    current = await db.scalar(
        select(func.count())
        .select_from(Question)
        .where(Question.dimension_id == dimension.id, Question.is_active.is_(True))
    ) or 0
    after = max(current + delta, 1)
    return {
        "dimension": dimension.name,
        "questions_actives_avant": current,
        "questions_actives_apres": after,
        "poids_avant": round(1 / current, 4) if current else None,
        "poids_apres": round(1 / after, 4),
    }


async def _fetch_question_context(db: AsyncSession, question_code: str) -> dict[str, str] | None:
    """Résout un code de question SYNTHÉTIQUE ("D4Q4", non persisté --
    voir ``regulatory_index._synthesize_question_codes``) vers son texte
    et sa dimension réels, via l'index RAG qui l'a déjà indexé sous ce
    même code (``RegulatoryEmbedding``) -- évite de re-dériver
    l'énumération dimension/question à chaque fois."""
    if not question_code:
        return None
    row = await db.scalar(
        select(RegulatoryEmbedding).where(
            RegulatoryEmbedding.entity_type == "question",
            RegulatoryEmbedding.entity_code == question_code,
        )
    )
    if row is None:
        return None
    return {"title": row.title, "dimension": row.dimension or ""}


async def _fetch_recommendation_context(db: AsyncSession, reco_code: str) -> dict[str, Any] | None:
    """Résout un code de recommandation vers son contenu RÉEL ACTUEL --
    directement depuis la table ``Recommendation`` (contrairement aux
    questions, son ``code`` est une vraie colonne persistée, pas besoin de
    passer par l'index RAG pour ce cas)."""
    if not reco_code:
        return None
    reco = await db.scalar(select(Recommendation).where(Recommendation.code == reco_code))
    if reco is None or reco.question_id is None:
        return None
    question_ctx = None
    question = await db.get(Question, reco.question_id)
    if question is not None:
        dim = await db.get(Dimension, question.dimension_id)
        question_ctx = {"title": question.text, "dimension": dim.name if dim else ""}
    return {
        "title": reco.title,
        "text": reco.recommendation_text,
        "category": reco.category,
        "question": question_ctx,
    }


async def _enrich_impact(db: AsyncSession, exigence: dict[str, Any]) -> dict[str, Any]:
    """Complète CHAQUE proposition avec le CONTEXTE réel actuel du
    catalogue -- l'admin ne doit jamais avoir à deviner ce qu'un code seul
    ("D4Q4-1") désigne. Puise toujours dans les tables réelles (jamais ce
    que le LLM a proposé), donc reflète l'état ACTUEL du référentiel même
    s'il a changé depuis l'analyse.

    Ajoute, selon (entity_type, proposed_action) :
    - "reco_title"/"reco_text"/"reco_category" + "question_title"/
      "question_dimension" pour une recommandation modifiée/désactivée/
      activée (le contexte de LA recommandation existante visée) ;
    - "question_title"/"question_dimension" pour une nouvelle
      recommandation (la question EXISTANTE à laquelle elle sera
      rattachée) ou une question modifiée/désactivée (la question
      existante visée) ;
    - "weight_recalc" (ajouter/desactiver une question, voir
      ``compute_weight_recalc``) et "associated_recommendations" (4
      recommandations de progression par palier, ajouter uniquement,
      rédigées par le LLM -- voir
      ``llm.regulatory_analysis.generate_palier_recommendations``, avec
      repli sur des ébauches génériques en cas d'échec).

    Best-effort partout : un code qui ne résout à rien (référentiel
    changé entretemps, incohérence) laisse simplement le champ absent
    plutôt que d'échouer -- l'admin voit alors juste moins de contexte,
    jamais une erreur."""
    entity_type = exigence["entity_type"]
    action = exigence["proposed_action"]
    proposed = exigence["proposed"]

    if entity_type == "recommandation":
        if action == "ajouter":
            q_ctx = await _fetch_question_context(db, proposed.get("question_code") or "")
            if q_ctx:
                proposed["question_title"] = q_ctx["title"]
                proposed["question_dimension"] = q_ctx["dimension"]
        else:  # modifier | desactiver | activer_flag -- reco_code = recommandation EXISTANTE
            reco_ctx = await _fetch_recommendation_context(db, proposed.get("reco_code") or "")
            if reco_ctx:
                proposed["reco_title"] = reco_ctx["title"]
                proposed["reco_text"] = reco_ctx["text"]
                proposed["reco_category"] = reco_ctx["category"]
                if reco_ctx["question"]:
                    proposed["question_title"] = reco_ctx["question"]["title"]
                    proposed["question_dimension"] = reco_ctx["question"]["dimension"]
        return exigence

    # entity_type == "question"
    if action in ("modifier", "desactiver"):
        q_ctx = await _fetch_question_context(db, proposed.get("question_code") or "")
        if q_ctx:
            proposed["question_title"] = q_ctx["title"]
            proposed["question_dimension"] = q_ctx["dimension"]

    if action not in ("ajouter", "desactiver"):
        return exigence

    if action == "ajouter":
        dim = await _resolve_dimension_by_name(db, proposed.get("dimension_hint", ""))
        dimension_name = dim.name if dim is not None else proposed.get("dimension_hint", "")
        # Un appel LLM dedie (voir generate_palier_recommendations) --
        # jamais bloquant, retombe sur des ebauches generiques
        # (is_placeholder=True) en cas d'echec, jamais une liste vide.
        proposed["associated_recommendations"] = await asyncio.to_thread(
            generate_palier_recommendations,
            proposed.get("title", ""),
            dimension_name,
            proposed.get("level_labels") or [],
        )
        delta = 1
    else:  # desactiver -- reuse the dimension just resolved above
        dim = await _resolve_dimension_by_name(db, proposed.get("question_dimension", ""))
        delta = -1

    if dim is not None:
        proposed["weight_recalc"] = await compute_weight_recalc(db, dim, delta)
        if action == "ajouter":
            proposed["dimension"] = dim.name
            # Aperçu en lecture seule -- indique si subdimension_hint
            # (proposé par le LLM) réutilisera une sous-dimension
            # existante ou en créera une nouvelle à la publication (voir
            # resolve_or_create_subdimension) ; ne crée rien ici.
            proposed.update(await preview_subdimension_status(db, dim.id, proposed.get("subdimension_hint", "")))
    return exigence


# ── Application au référentiel réel (à la publication uniquement) ────────

def _parse_edited_payload(edited_text: str | None) -> dict[str, Any]:
    """Miroir Python de ``parseEditedPayload`` côté frontend
    (AdminVeille.tsx) : le contenu RICHE édité par l'expert (recommandation/
    question/justification/paliers) est sérialisé en JSON dans l'unique
    colonne ``edited_text`` -- voir EditedFields côté frontend. Retourne
    ``{}`` si ``edited_text`` est vide, ou si ce n'est pas du JSON structuré
    (un edit "résumé" fait avant l'éditeur riche -- legacy, ignoré ici :
    il n'y a pas de champ exploitable à en tirer pour la publication)."""
    if not edited_text:
        return {}
    try:
        parsed = json.loads(edited_text)
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


async def _resolve_question_by_code(db: AsyncSession, question_code: str) -> Question | None:
    """Résout un code de question SYNTHÉTIQUE ("D4Q4", non persisté) vers
    la VRAIE ligne ``Question`` -- via son texte + sa dimension ACTUELS
    (``_fetch_question_context``, qui lit l'index RAG), jamais en
    re-dérivant l'énumération dimension/question (fragile si le
    référentiel a changé depuis la dernière réindexation).

    Contrairement à ``_fetch_question_context`` (qui n'affiche qu'un
    contexte informatif), cette fonction doit retrouver la ligne réelle --
    utilisée UNIQUEMENT à la publication, quand une proposition doit
    effectivement être écrite en base. Retourne ``None`` si la résolution
    est absente, introuvable, ou AMBIGUË (plusieurs questions au texte
    identique dans la même dimension) -- ne jamais deviner laquelle."""
    ctx = await _fetch_question_context(db, question_code)
    if ctx is None:
        return None
    title = ctx["title"]
    # RegulatoryEmbedding.title est `question.text[:300]` -- un texte
    # tronqué à exactement 300 caractères ne peut donc être comparé que
    # par préfixe, jamais par égalité stricte.
    text_filter = Question.text.startswith(title) if len(title) == 300 else Question.text == title
    stmt = select(Question).where(text_filter)
    if ctx["dimension"]:
        stmt = stmt.join(Dimension).where(Dimension.name == ctx["dimension"])
    rows = (await db.scalars(stmt)).all()
    return rows[0] if len(rows) == 1 else None


# Le prompt demande au LLM de RECOPIER EXACTEMENT le nom d'une
# sous-dimension candidate quand il en réutilise une (voir _SYSTEM_PROMPT
# dans llm/regulatory_analysis.py) -- le seuil de réutilisation est donc
# volontairement strict : une correspondance qui ne l'atteint pas signale
# que le LLM a proposé un libellé réellement NOUVEAU (ou une reformulation
# trop différente pour être fiable), pas la même sous-dimension mal
# recopiée. Comparer avec _QUESTION_DUPLICATE_WARNING_THRESHOLD (0.55,
# volontairement permissif) : les deux vérifications ont des conséquences
# opposées en cas d'erreur -- rater un vrai doublon de question est corrigé
# par une simple alerte (voir ce seuil-là), alors qu'ici un faux "match"
# fusionnerait à tort deux sous-dimensions distinctes.
_SUBDIMENSION_REUSE_THRESHOLD = 0.75


def _best_subdimension_match(subs: list[SubDimension], hint: str) -> tuple[SubDimension, float] | None:
    """Pure (pas de DB) : le meilleur candidat par similarité de texte
    entre ``hint`` et chaque nom de sous-dimension -- factorisé pour être
    réutilisé à la fois par ``resolve_or_create_subdimension`` (qui AGIT
    sur ce résultat, à la publication) et ``preview_subdimension_status``
    (qui ne fait que l'AFFICHER pendant la revue, sans rien créer)."""
    best: SubDimension | None = None
    best_ratio = 0.0
    for sub in subs:
        ratio = difflib.SequenceMatcher(None, hint.lower(), sub.name.lower()).ratio()
        if ratio > best_ratio:
            best_ratio, best = ratio, sub
    return (best, best_ratio) if best is not None else None


async def preview_subdimension_status(db: AsyncSession, dimension_id: int, subdimension_hint: str) -> dict[str, Any]:
    """Aperçu en LECTURE SEULE (jamais d'écriture -- appelé pendant
    l'analyse, avant toute validation humaine) de ce que
    ``resolve_or_create_subdimension`` ferait à la publication : indique
    à l'admin si la sous-dimension proposée sera RÉUTILISÉE (une existante
    correspond) ou CRÉÉE (aucune ne correspond d'assez près), sans jamais
    créer quoi que ce soit ici -- voir la règle absolue du module (rien
    n'est appliqué avant publication)."""
    hint = subdimension_hint.strip()
    if not hint:
        return {}
    subs = (
        await db.scalars(
            select(SubDimension)
            .where(SubDimension.dimension_id == dimension_id, SubDimension.is_active.is_(True))
        )
    ).all()
    match = _best_subdimension_match(subs, hint)
    if match is not None and match[1] >= _SUBDIMENSION_REUSE_THRESHOLD:
        return {"subdimension_status": "existante", "subdimension_name": match[0].name}
    return {"subdimension_status": "nouvelle", "subdimension_name": hint}


async def resolve_or_create_subdimension(
    db: AsyncSession, dimension_id: int, subdimension_hint: str, fallback_title: str,
) -> SubDimension | None:
    """Rattache une question NOUVELLEMENT créée depuis une circulaire à une
    sous-dimension -- RÉUTILISE une sous-dimension existante si
    ``subdimension_hint`` (proposé par le LLM, voir le system prompt de
    ``llm.regulatory_analysis``) lui correspond fortement, sinon en CRÉE
    une nouvelle avec ce libellé. C'est le LLM qui décide reprendre-ou-créer
    (il voit la liste des sous-dimensions candidates dans le prompt) ;
    cette fonction ne fait qu'exécuter ce choix, avec une vérification de
    similarité comme garde-fou plutôt que de faire confiance aveuglément
    au nom recopié.

    ``sub_dimension_id`` est nullable sur ``Question``, mais le laisser
    vide rend la question INVISIBLE sur /super-admin/dimensions : tout son
    affichage itère dimension -> sous-dimensions -> questions, sans repli
    pour une question orpheline.

    ``fallback_title`` : repli pour les propositions ANTÉRIEURES à
    l'introduction de ``subdimension_hint`` (champ vide -- une analyse
    faite avant cette version) -- correspondance approchée entre le TITRE
    de la question et les sous-dimensions existantes ; ne crée jamais de
    nouvelle sous-dimension dans ce cas (aucun libellé n'a été proposé
    pour elle), retombe sur la première si rien ne correspond."""
    subs = (
        await db.scalars(
            select(SubDimension)
            .where(SubDimension.dimension_id == dimension_id, SubDimension.is_active.is_(True))
            .order_by(SubDimension.sort_order)
        )
    ).all()

    hint = subdimension_hint.strip()
    if hint:
        match = _best_subdimension_match(subs, hint)
        if match is not None and match[1] >= _SUBDIMENSION_REUSE_THRESHOLD:
            return match[0]
        # Aucune sous-dimension existante ne correspond d'assez près : le
        # LLM a donc proposé un NOUVEAU libellé (consigne du prompt) -- on
        # la crée, à la suite des sous-dimensions existantes de la dimension.
        max_sort = await db.scalar(
            select(func.max(SubDimension.sort_order)).where(SubDimension.dimension_id == dimension_id)
        )
        new_sub = SubDimension(
            dimension_id=dimension_id, name=hint[:200],
            sort_order=(max_sort or 0) + 1, is_active=True,
        )
        db.add(new_sub)
        await db.flush()  # peuple new_sub.id, nécessaire pour l'affecter à la question
        return new_sub

    # Repli legacy (proposition antérieure à subdimension_hint) : ne crée
    # jamais rien, seulement une correspondance approchée par titre.
    if not subs:
        return None
    best = None
    best_ratio = 0.0
    for sub in subs:
        ratio = difflib.SequenceMatcher(None, fallback_title.lower(), sub.name.lower()).ratio()
        if ratio > best_ratio:
            best_ratio, best = ratio, sub
    return best if best_ratio >= 0.2 else subs[0]


async def _rebalance_dimension_weights(db: AsyncSession, dimension_id: int) -> None:
    """Ré-équilibre le poids de TOUTES les questions actives d'une
    dimension à parts égales (``1 / nombre de questions actives``) --
    même règle que ``compute_weight_recalc`` (qui ne fait que la PRÉVOIR
    pendant la revue), appliquée ici pour de vrai après qu'une question a
    été ajoutée ou désactivée par cette publication. Sans ce
    rééquilibrage, une question nouvellement ajoutée resterait à
    ``weight=0`` (défaut du modèle) et ne compterait pour rien dans le
    score de sa dimension."""
    questions = (
        await db.scalars(
            select(Question).where(Question.dimension_id == dimension_id, Question.is_active.is_(True))
        )
    ).all()
    if not questions:
        return
    new_weight = round(1 / len(questions), 6)
    for q in questions:
        q.weight = new_weight


async def apply_impacts_to_catalog(db: AsyncSession, circular: RegulatoryCircular) -> dict[str, int]:
    """Applique au référentiel RÉEL (tables ``questions``/``recommendations``)
    chaque impact ``accepté`` ou ``modifié`` de cette circulaire -- jamais
    ``rejeté`` ni en attente. Appelée UNE SEULE FOIS, à la publication
    (voir ``routers/regulatory.py::publish_circular``), jamais avant
    qu'un humain n'ait explicitement validé chaque impact (règle absolue
    du module, voir son docstring).

    "accepté" applique la proposition TELLE QUE l'analyse l'a produite
    (``proposed_data``). "modifié" applique le contenu édité par l'expert
    (voir ``_parse_edited_payload``) quand il existe, sinon retombe sur la
    proposition d'origine -- un "modifié" sans édition structurée
    récupérable (ex. legacy) est donc traité comme un "accepté".

    Best-effort par impact : si un code ne se résout plus à rien (le
    référentiel a changé depuis l'analyse -- ex. l'admin a supprimé la
    question entretemps ailleurs dans l'admin), CET impact est ignoré
    (journalisé) plutôt que de faire échouer toute la publication -- les
    autres impacts de la même circulaire s'appliquent normalement.

    Retourne un décompte par catégorie (créations/mises à jour/
    désactivations), pour le message de confirmation et l'audit."""
    stats = {
        "questions_created": 0, "questions_updated": 0, "questions_deactivated": 0,
        "recommendations_created": 0, "recommendations_updated": 0,
        "recommendations_deactivated": 0, "recommendations_flagged": 0,
        "skipped": 0,
    }
    dimensions_touched: set[int] = set()

    for impact in circular.impacts:
        if impact.action not in ("accepté", "modifié"):
            continue  # rejeté, ou jamais tranché (ne devrait pas arriver -- publish_circular l'exige)

        p = impact.proposed_data
        edited = _parse_edited_payload(impact.edited_text) if impact.action == "modifié" else {}
        key = f"{impact.entity_type}:{impact.proposed_action}"

        try:
            if key == "question:ajouter":
                title = edited.get("question") or p.get("title") or ""
                dim = await _resolve_dimension_by_name(db, p.get("dimension") or p.get("dimension_hint") or "")
                if dim is None or not title.strip():
                    logger.warning("Publication circular id=%s: question:ajouter ignorée (dimension ou titre introuvable).", circular.id)
                    stats["skipped"] += 1
                    continue
                max_sort = await db.scalar(
                    select(func.max(Question.sort_order)).where(Question.dimension_id == dim.id)
                ) or 0
                level_labels = p.get("level_labels") or []
                edited_levels = edited.get("levels") or {}
                level_responses = [
                    {
                        "label": (edited_levels.get(str(i + 1)) or edited_levels.get(i + 1) or {}).get("answer") or lbl,
                        "score": i + 1,
                    }
                    for i, lbl in enumerate(level_labels[:5])
                ] or None
                # JAMAIS None ici (voir resolve_or_create_subdimension) :
                # une question sans sous-dimension est invisible sur
                # /super-admin/dimensions, qui n'affiche que
                # dimension -> sous-dimensions -> questions, sans repli
                # pour une question orpheline. Le LLM a déjà choisi
                # reprendre-une-existante ou en-proposer-une-nouvelle
                # (subdimension_hint) ; fallback_title ne sert que pour une
                # proposition antérieure à ce champ.
                sub_dim = await resolve_or_create_subdimension(
                    db, dim.id, p.get("subdimension_hint", "") or "", title.strip(),
                )

                question = Question(
                    dimension_id=dim.id, sub_dimension_id=sub_dim.id if sub_dim else None, text=title.strip(),
                    weight=0,  # rééquilibré ci-dessous, avec les autres questions actives de la dimension
                    sort_order=int(max_sort) + 1,
                    level_responses=level_responses,
                    is_active=True,
                )
                db.add(question)
                await db.flush()  # peuple question.id, nécessaire pour les codes des recommandations ci-dessous
                stats["questions_created"] += 1
                dimensions_touched.add(dim.id)

                # Recommandations par palier déjà rédigées par le LLM (voir
                # generate_palier_recommendations) -- une ébauche encore
                # vide ("À rédiger", is_placeholder=True) n'est PAS publiée :
                # rien d'exploitable à écrire, l'admin devra l'ajouter à la
                # main plus tard si besoin.
                for reco in p.get("associated_recommendations") or []:
                    trigger = reco.get("trigger_level")
                    text = (reco.get("recommendation_text") or "").strip()
                    if trigger not in (1, 2, 3, 4) or not text:
                        continue
                    db.add(Recommendation(
                        code=f"{dim.code}Q{question.id}-{trigger}",
                        question_id=question.id,
                        trigger_level=trigger, target_level=trigger + 1,
                        title=(reco.get("title") or "Recommandation")[:200],
                        recommendation_text=text,
                        category=reco.get("category") or "gouvernance",
                        # Née d'une exigence réglementaire par construction.
                        regulatory_flag=True,
                        effort=reco.get("effort") if isinstance(reco.get("effort"), int) else 2,
                        is_active=True,
                    ))
                    stats["recommendations_created"] += 1

            elif key == "question:modifier":
                question = await _resolve_question_by_code(db, p.get("question_code") or "")
                if question is None:
                    logger.warning("Publication circular id=%s: question:modifier ignorée (code %r introuvable).", circular.id, p.get("question_code"))
                    stats["skipped"] += 1
                    continue
                new_text = (edited.get("question") or p.get("modification") or "").strip()
                if new_text:
                    question.text = new_text
                    stats["questions_updated"] += 1

            elif key == "question:desactiver":
                question = await _resolve_question_by_code(db, p.get("question_code") or "")
                if question is None:
                    logger.warning("Publication circular id=%s: question:desactiver ignorée (code %r introuvable).", circular.id, p.get("question_code"))
                    stats["skipped"] += 1
                    continue
                question.is_active = False
                stats["questions_deactivated"] += 1
                dimensions_touched.add(question.dimension_id)

            elif key == "recommandation:ajouter":
                question = await _resolve_question_by_code(db, p.get("question_code") or "")
                trigger = p.get("trigger_level")
                text = (edited.get("recommandation") or p.get("recommendation_text") or "").strip()
                if question is None or trigger not in (1, 2, 3, 4) or not text:
                    logger.warning("Publication circular id=%s: recommandation:ajouter ignorée (question/palier/texte invalide).", circular.id)
                    stats["skipped"] += 1
                    continue
                # Le palier est peut-être déjà occupé (contrainte unique
                # question_id+trigger_level) -- l'admin doit alors passer
                # par "activer_flag"/"modifier" plutôt, jamais planter toute
                # la publication pour cet unique impact.
                clash = await db.scalar(
                    select(Recommendation).where(
                        Recommendation.question_id == question.id, Recommendation.trigger_level == trigger,
                    )
                )
                if clash is not None:
                    logger.warning("Publication circular id=%s: recommandation:ajouter ignorée (palier %s déjà occupé sur la question).", circular.id, trigger)
                    stats["skipped"] += 1
                    continue
                dim = await db.get(Dimension, question.dimension_id)
                db.add(Recommendation(
                    code=f"{dim.code}Q{question.id}-{trigger}",
                    question_id=question.id, trigger_level=trigger, target_level=trigger + 1,
                    title=(p.get("title") or "Recommandation")[:200],
                    recommendation_text=text,
                    category=p.get("category") or "gouvernance",
                    regulatory_flag=True,
                    effort=p.get("effort") if isinstance(p.get("effort"), int) else 2,
                    is_active=True,
                ))
                stats["recommendations_created"] += 1

            elif key == "recommandation:modifier":
                reco = await db.scalar(select(Recommendation).where(Recommendation.code == (p.get("reco_code") or "")))
                if reco is None:
                    logger.warning("Publication circular id=%s: recommandation:modifier ignorée (code %r introuvable).", circular.id, p.get("reco_code"))
                    stats["skipped"] += 1
                    continue
                new_text = (edited.get("recommandation") or p.get("modification") or "").strip()
                if new_text:
                    reco.recommendation_text = new_text
                    stats["recommendations_updated"] += 1

            elif key == "recommandation:desactiver":
                reco = await db.scalar(select(Recommendation).where(Recommendation.code == (p.get("reco_code") or "")))
                if reco is None:
                    logger.warning("Publication circular id=%s: recommandation:desactiver ignorée (code %r introuvable).", circular.id, p.get("reco_code"))
                    stats["skipped"] += 1
                    continue
                reco.is_active = False
                stats["recommendations_deactivated"] += 1

            elif key == "recommandation:activer_flag":
                reco = await db.scalar(select(Recommendation).where(Recommendation.code == (p.get("reco_code") or "")))
                if reco is None:
                    logger.warning("Publication circular id=%s: recommandation:activer_flag ignorée (code %r introuvable).", circular.id, p.get("reco_code"))
                    stats["skipped"] += 1
                    continue
                reco.regulatory_flag = True
                stats["recommendations_flagged"] += 1
        except Exception:
            logger.exception("Publication circular id=%s: impact id=%s (%s) ignoré après erreur.", circular.id, impact.id, key)
            stats["skipped"] += 1
            continue

    for dim_id in dimensions_touched:
        await _rebalance_dimension_weights(db, dim_id)

    return stats


def _normalize_display_text(text: str) -> str:
    """Nettoie un texte avant de le stocker pour affichage (``raw_text``/
    ``raw_text_original``) : réduit les longues suites de lignes vides à
    au plus une (paragraphe) -- l'extraction PDF, en particulier l'OCR sur
    une circulaire arabe scannée, produit parfois beaucoup de lignes vides
    consécutives (mise en page, artefacts de reconnaissance) qui, combinées
    à un rendu ``white-space: pre-wrap`` côté front, créaient un grand
    espace blanc au lieu du texte. N'affecte que l'affichage : le texte
    envoyé au LLM pour l'analyse n'est pas modifié par cette fonction."""
    return re.sub(r"\n{3,}", "\n\n", text.strip())


# Détecte un marqueur d'article en début de ligne : "Art. 3 :", "Article 5
# -", "Art 12.", "Article premier", éventuellement suivi de "bis"/"ter"
# (numérotation d'un article inséré après coup, courante dans les textes
# réglementaires). Le séparateur (":", "-", ".") est optionnel pour
# couvrir "Article 3" seul sur sa ligne.
_ARTICLE_HEADER_RE = re.compile(
    r"(?im)^[ \t]*("
    r"article\s+(?:\d+|premier)(?:\s+(?:bis|ter|quater))?"
    r"|art\.?\s*\d+(?:\s*(?:bis|ter|quater))?"
    r")\s*[:.\-–]?\s*"
)


def split_into_articles(text: str) -> list[dict[str, str]]:
    """Découpe un texte réglementaire en articles ("Art. N :" / "Article N
    :"), en préservant le texte de CHAQUE article EXACTEMENT tel qu'il
    apparaît dans le document -- pur découpage structurel par expression
    régulière sur les marqueurs d'article, sans aucun appel LLM et sans
    aucune reformulation.

    Volontairement PAS un résumé généré par LLM : en contexte bancaire, un
    chiffre, un délai ou une référence normative mal reproduits par un
    modèle de langage (même invités à "copier fidèlement") auraient des
    conséquences réelles -- la précision prime sur la concision. Ceci ne
    fait que présenter le document existant de façon plus lisible (un bloc
    par article, comme le sommaire d'un texte de loi) qu'un unique pavé de
    texte brut ; le contenu affiché reste un sous-découpage verbatim du
    texte déjà stocké (``raw_text``), jamais un contenu généré.

    Le texte AVANT le premier marqueur d'article (préambule -- objet,
    visas "Vu la loi...", en-tête institution/référence/date) n'est PAS
    inclus ici : il fait presque toujours doublon avec ce que
    ``extract_document_metadata`` a déjà extrait séparément (institution,
    référence, thème, date -- affichés en en-tête par l'appelant, voir
    ``routers/regulatory.py``). Rien n'est perdu pour autant : le document
    COMPLET (préambule inclus) reste disponible tel quel via ``raw_text``
    -- l'appelant propose un accès au texte intégral en plus de cette vue
    par article, plutôt que de dupliquer le préambule dans les deux vues.

    Retourne une liste vide si aucun marqueur d'article n'est détecté (ex.
    une note ou un communiqué non structuré en articles) -- l'appelant
    affiche alors le texte brut tel quel plutôt qu'une liste vide qui en
    masquerait le contenu."""
    if not text or not text.strip():
        return []
    matches = list(_ARTICLE_HEADER_RE.finditer(text))
    if not matches:
        return []

    articles: list[dict[str, str]] = []
    for i, m in enumerate(matches):
        label = re.sub(r"\s+", " ", m.group(1)).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if body:
            articles.append({"label": label, "text": body})
    return articles


def _extract_text_and_language(raw_bytes: bytes) -> tuple[str, str]:
    if _looks_like_pdf(raw_bytes):
        result = extract_text(raw_bytes)
        return result.text, result.language
    # Source non-PDF (ex. page web texte) : pas d'OCR à faire, on décode
    # tel quel -- la détection de langue vit dans pdf_extract pour rester
    # cohérente entre les deux chemins.
    from llm.pdf_extract import detect_language

    text = raw_bytes.decode("utf-8", errors="ignore")
    return text, detect_language(text)


async def run_circular_analysis(circular_id: int, raw_bytes: bytes) -> None:
    """Tâche d'arrière-plan : extrait le texte de la circulaire puis lance
    l'analyse réglementaire ancrée sur le catalogue, et persiste le
    résultat -- des PROPOSITIONS uniquement (``RegulatoryImpact.action``
    reste ``None``, à valider par un humain).

    Utilise sa propre session DB (la requête qui a déclenché cette tâche a
    déjà répondu et fermé la sienne). Toute erreur est capturée et
    consignée sur la circulaire elle-même (``analysis_status="erreur"``,
    ``analysis_error``) plutôt que de se perdre silencieusement dans les
    logs uniquement -- l'admin doit pouvoir voir que ça a échoué.
    """
    try:
        async with AsyncSessionLocal() as db:
            circular = await db.get(RegulatoryCircular, circular_id)
            if circular is None:
                return

            try:
                text, language = await asyncio.to_thread(_extract_text_and_language, raw_bytes)
                if not text.strip():
                    circular.analysis_status = "erreur"
                    circular.analysis_error = "Aucun texte n'a pu être extrait de ce document."
                    await db.commit()
                    return

                # Traduction UNE SEULE FOIS pour tout le document (pas par
                # chunk) si la circulaire est en arabe -- tout le reste
                # (extraction reference/theme, retrieval, analyse) travaille
                # ensuite en français. `blocks` est vide pour une circulaire
                # déjà en français : `analysis_text` == `text` sans appel LLM
                # supplémentaire.
                if language == "ar":
                    analysis_text, translation_blocks = await asyncio.to_thread(
                        translate_document_to_french, text
                    )
                else:
                    analysis_text, translation_blocks = text, []

                metadata = await asyncio.to_thread(extract_document_metadata, analysis_text)
                if metadata["reference"]:
                    circular.reference = metadata["reference"][:200]
                if metadata["theme"]:
                    circular.theme = metadata["theme"][:300]
                if metadata["institution"]:
                    circular.institution = metadata["institution"][:300]
                if metadata["publication_date"]:
                    # La date REELLE de la circulaire (ecrite dans le texte)
                    # prime sur la date d'import posee par defaut a la
                    # creation (voir create_pending_circular) -- important en
                    # contexte bancaire pour le suivi reglementaire. Repli
                    # silencieux sur la date d'import si le format renvoye
                    # par le LLM n'est pas un ISO AAAA-MM-JJ valide (jamais
                    # bloquant : mieux vaut garder la date d'import qu'une
                    # date mal parsee).
                    try:
                        circular.publication_date = date.fromisoformat(metadata["publication_date"])
                    except ValueError:
                        logger.warning(
                            "Regulatory circular analysis: date de publication non "
                            "parsable (%r) pour circular id=%s -- date d'import conservee.",
                            metadata["publication_date"], circular_id,
                        )

                all_exigences: list[dict[str, Any]] = []
                chunks = chunk_text(analysis_text)
                skipped_chunks = 0
                analysis_t0 = time.time()
                logger.info(
                    "[Veille reglementaire] circular id=%s : demarrage de "
                    "l'analyse, %d section(s) a traiter.",
                    circular_id, len(chunks),
                )
                for chunk_index, chunk in enumerate(chunks, start=1):
                    # Chaque chunk est traite isolement : une panne locale
                    # (ex. Ollama qui echoue a charger bge-m3 sous pression
                    # memoire -- voir llm/embeddings.py) ne doit faire
                    # perdre que CE chunk, pas jeter les exigences deja
                    # extraites des chunks precedents en faisant echouer
                    # toute la circulaire (c'etait le comportement avant ce
                    # fix : une seule section en panne = "erreur" globale,
                    # meme si le reste du document avait deja ete analyse
                    # avec succes).
                    chunk_t0 = time.time()
                    try:
                        query_text = await asyncio.to_thread(build_retrieval_query, chunk, "fr")
                        t_retrieve = time.time()
                        candidates = await retrieve(db, query_text)
                        t_retrieved = time.time()
                        chunk_exigences = await asyncio.to_thread(
                            analyze_chunk_with_candidates, chunk, "fr", candidates
                        )
                    except Exception:
                        logger.exception(
                            "Regulatory circular analysis: section %d/%d ignoree "
                            "apres echec (circular id=%s)",
                            chunk_index, len(chunks), circular_id,
                        )
                        skipped_chunks += 1
                        continue
                    # Repere ce qui prend le temps sur CE chunk (retrieval --
                    # embeddings, voir llm/embeddings.py -- vs. generation --
                    # Gemini ou local, voir call_regulatory_llm dans
                    # llm/generation.py, qui logue deja lequel des deux a
                    # servi) : utile pour voir a l'oeil si un chunk lent
                    # vient d'Ollama (embeddings/local, souvent la pression
                    # memoire de cette machine) ou d'un aller-retour Gemini.
                    logger.info(
                        "[Veille reglementaire] circular id=%s section %d/%d : "
                        "retrieval %.1fs, analyse %.1fs (total section %.1fs).",
                        circular_id, chunk_index, len(chunks),
                        t_retrieved - t_retrieve, time.time() - t_retrieved,
                        time.time() - chunk_t0,
                    )
                    if translation_blocks:
                        # Tracabilite : le chunk (donc l'excerpt que le LLM
                        # en tire) est en francais -- retrouve le passage
                        # ORIGINAL (arabe) correspondant, best-effort au
                        # niveau du bloc de traduction (voir
                        # find_original_context).
                        original_context = find_original_context(chunk, analysis_text, translation_blocks)
                        for exigence in chunk_exigences:
                            exigence["excerpt_original"] = original_context
                    all_exigences.extend(chunk_exigences)

                logger.info(
                    "[Veille reglementaire] circular id=%s : analyse terminee "
                    "en %.1fs (%d exigence(s), %d section(s) ignoree(s)).",
                    circular_id, time.time() - analysis_t0, len(all_exigences), skipped_chunks,
                )

                # `raw_text` garde le texte ANALYSÉ (français) pour
                # l'affichage -- l'admin doit pouvoir lire le document quelle
                # que soit sa langue source, donc la traduction si la
                # circulaire était en arabe. `raw_text_original` garde alors
                # le texte langue SOURCE à part (traçabilité), plutôt vide
                # pour une circulaire déjà en français (rien de différent à
                # garder). `_normalize_display_text` évite les longues
                # suites de lignes vides que l'extraction PDF (surtout OCR
                # arabe) produit parfois.
                circular.raw_text = _normalize_display_text(analysis_text)[:_RAW_TEXT_STORE_CHARS]
                circular.raw_text_original = (
                    _normalize_display_text(text)[:_RAW_TEXT_STORE_CHARS] if translation_blocks else None
                )
                circular.detected_language = language
                circular.analysis_status = "terminee"
                circular.analysis_error = (
                    f"{skipped_chunks} section(s) sur {len(chunks)} n'ont pas pu "
                    "etre analysees (panne temporaire, ex. surcharge memoire "
                    "locale) -- resultat partiel, voir les logs backend pour le "
                    "detail. Vous pouvez relancer l'analyse (re-uploader la "
                    "circulaire) pour retenter les sections manquees."
                    if skipped_chunks
                    else None
                )
                for exigence in all_exigences:
                    exigence = await _enrich_impact(db, exigence)
                    db.add(
                        RegulatoryImpact(
                            circular_id=circular.id,
                            excerpt=exigence["excerpt"],
                            excerpt_original=exigence.get("excerpt_original"),
                            requirement_text=exigence["requirement_text"],
                            entity_type=exigence["entity_type"],
                            proposed_action=exigence["proposed_action"],
                            proposed_data=exigence["proposed"],
                        )
                    )
                await db.commit()
            except Exception as exc:
                logger.exception("Regulatory circular analysis failed for id=%s", circular_id)
                await db.rollback()
                circular = await db.get(RegulatoryCircular, circular_id)
                if circular is not None:
                    circular.analysis_status = "erreur"
                    circular.analysis_error = str(exc)[:500]
                    await db.commit()
    except Exception:
        logger.exception("Regulatory circular analysis: DB session failure for id=%s", circular_id)
