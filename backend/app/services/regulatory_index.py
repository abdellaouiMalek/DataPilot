"""Index vectoriel (RAG) du référentiel pour « Veille réglementaire ».

Deux opérations :
- ``reindex_catalog`` : (ré)encode toutes les questions et recommandations
  actives et remplace le contenu de ``regulatory_embeddings``. À relancer
  quand le référentiel change (voir l'endpoint POST .../reindex) -- pas
  déclenché automatiquement à chaque écriture admin.
- ``retrieve`` : pour un texte de requête donné (une section de circulaire),
  renvoie les k questions et k recommandations les plus proches -- une
  version compacte du catalogue (codes + titres courts), comme avant, mais
  construite par similarité plutôt qu'en y mettant tout le référentiel.

Recherche par similarité via **pgvector** (colonne ``vector(1024)``, voir
``app/models/embedding.py``) : ``ORDER BY embedding <#> :query LIMIT k``
exécuté par PostgreSQL, plus le scan numpy en mémoire d'avant. Même
logique de recherche qu'avant (produit scalaire sur des vecteurs déjà
normalisés L2 par ``llm.embeddings.embed`` -- équivalent à la similarité
cosinus), juste poussée côté base : ``max_inner_product`` (l'opérateur
``<#>`` de pgvector) est le produit scalaire NÉGATIF, donc trier par ordre
croissant dessus donne directement le plus proche en premier -- pas
d'index ANN (ivfflat/hnsw) pour l'instant, un scan séquentiel exact
suffit largement à cette échelle (une centaine d'éléments).
"""

from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dimension, Question, Recommendation, RegulatoryEmbedding, SubDimension
from llm.embeddings import embed

# Nombre de candidats renvoyés par recherche -- un prompt court est le
# principal levier de latence (voir Task 7 sur ce même module) ; ces
# valeurs gardent le prompt largement sous ce qu'envoyait l'ancien
# catalogue complet (33 questions + 128 recommandations) tout en couvrant
# largement le cas où plusieurs éléments du référentiel sont pertinents
# pour une même section.
#
# Réduites (8/10 -> 4/6) : la génération locale (CPU) domine le temps sur
# cette machine quand Gemini est indisponible, et son coût scale avec la
# longueur du prompt -- moins de candidats = prompt plus court = plus
# rapide. Bénéfice secondaire déjà constaté empiriquement (Task 7) : un
# petit modèle local raisonne aussi plus fiablement avec moins de
# candidats à comparer (moins de "bruit" pour départager). Gemini n'en
# pâtit pas -- il a très bien fonctionné avec des ensembles de candidats
# tout aussi restreints dans les tests de ce projet.
DEFAULT_K_QUESTIONS = 4
DEFAULT_K_RECOMMENDATIONS = 6


def _question_embedding_text(question: Question, dimension_name: str) -> str:
    parts = [question.text]
    if question.description:
        parts.append(question.description)
    return f"[{dimension_name}] " + " -- ".join(parts)


def _recommendation_embedding_text(reco: Recommendation) -> str:
    return f"[{reco.category}] {reco.title} -- {reco.recommendation_text}"


async def _synthesize_question_codes(db: AsyncSession) -> dict[int, tuple[str, Dimension]]:
    """Même énumération que l'ancien ``build_compact_catalog`` de
    ``services/regulatory.py`` (dimensions puis questions, triées par
    sort_order) -- gardée cohérente pour que les codes affichés ("D4Q4")
    restent stables d'un appel à l'autre tant que le référentiel ne change
    pas d'ordre."""
    dimensions = (
        await db.scalars(
            select(Dimension).where(Dimension.is_active.is_(True)).order_by(Dimension.sort_order)
        )
    ).all()
    result: dict[int, tuple[str, Dimension]] = {}
    for dim_ordinal, dim in enumerate(dimensions, start=1):
        questions = (
            await db.scalars(
                select(Question)
                .where(Question.dimension_id == dim.id, Question.is_active.is_(True))
                .order_by(Question.sort_order)
            )
        ).all()
        for q_ordinal, q in enumerate(questions, start=1):
            result[q.id] = (f"D{dim_ordinal}Q{q_ordinal}", dim)
    return result


async def reindex_catalog(db: AsyncSession) -> dict[str, int]:
    """(Ré)indexe tout le référentiel actif. Remplace entièrement le
    contenu de la table (pas de mise à jour incrémentale -- le catalogue
    est petit, ré-encoder tout est simple et évite les incohérences si des
    éléments ont été désactivés entre deux réindexations).

    Retourne ``{"questions": N, "recommandations": M}``.
    """
    question_codes = await _synthesize_question_codes(db)
    # Chargé une fois, pas par question (N+1) : sert à afficher la
    # sous-dimension de chaque question candidate au LLM (voir
    # llm.regulatory_analysis._build_candidates_text) -- pour qu'une
    # nouvelle question proposée puisse être rattachée à une sous-dimension
    # EXISTANTE plutôt que d'en créer systématiquement une nouvelle (voir
    # app.services.regulatory.resolve_or_create_subdimension).
    subdim_names = {s.id: s.name for s in (await db.scalars(select(SubDimension))).all()}

    rows: list[dict[str, Any]] = []
    texts: list[str] = []
    for q_id, (code, dim) in question_codes.items():
        question = await db.get(Question, q_id)
        assert question is not None
        text = _question_embedding_text(question, dim.name)
        texts.append(text)
        rows.append(
            {
                "entity_type": "question",
                "entity_code": code,
                "title": question.text[:300],
                "text": text,
                "dimension": dim.name,
                "subdimension": subdim_names.get(question.sub_dimension_id),
            }
        )

    recommendations = (
        await db.scalars(select(Recommendation).where(Recommendation.is_active.is_(True)))
    ).all()
    for reco in recommendations:
        if reco.question_id not in question_codes:
            continue
        question_code, _ = question_codes[reco.question_id]
        text = _recommendation_embedding_text(reco)
        texts.append(text)
        rows.append(
            {
                "entity_type": "recommandation",
                "entity_code": reco.code,
                "title": reco.title[:300],
                "text": text,
                "question_code": question_code,
                "category": reco.category,
                "regulatory_flag": reco.regulatory_flag,
            }
        )

    await db.execute(delete(RegulatoryEmbedding))
    if rows:
        # embed() is a blocking `requests.post` call (see llm/embeddings.py)
        # -- offloaded to a thread so it never stalls the event loop, even
        # though this endpoint is normally awaited synchronously by an
        # admin request (see routers/regulatory.py's /reindex).
        vectors = await asyncio.to_thread(embed, texts)
        for row, vector in zip(rows, vectors):
            # pgvector's SQLAlchemy Vector type takes the array directly --
            # no manual float32 packing needed (that was only ever there to
            # serialize into the old bytea column).
            db.add(RegulatoryEmbedding(**row, embedding=vector))
    await db.commit()

    return {
        "questions": sum(1 for r in rows if r["entity_type"] == "question"),
        "recommandations": sum(1 for r in rows if r["entity_type"] == "recommandation"),
    }


async def retrieve(
    db: AsyncSession,
    query_text: str,
    *,
    k_questions: int = DEFAULT_K_QUESTIONS,
    k_recommendations: int = DEFAULT_K_RECOMMENDATIONS,
) -> dict[str, list[dict[str, Any]]]:
    """Cherche, par similarité cosinus, les k questions et k recommandations
    les plus proches de ``query_text`` (une section de circulaire, déjà
    traduite en français si la source est en arabe -- voir
    ``llm.embeddings.translate_to_french_for_retrieval``).

    Retourne ``{"questions": [...], "recommandations": [...]}`` au même
    format compact que consomme ``llm.regulatory_analysis.analyze_circular``.
    """
    if not query_text.strip():
        return {"questions": [], "recommandations": []}
    if not await db.scalar(select(RegulatoryEmbedding.id).limit(1)):
        return {"questions": [], "recommandations": []}

    # embed() is a blocking `requests.post` call (see llm/embeddings.py),
    # not an async one -- called directly (without to_thread) here, it
    # would stall the WHOLE event loop for its duration on every single
    # chunk of every analysis, freezing every other concurrent request
    # (even unrelated ones like a health check) for as long as Ollama
    # takes to respond. Confirmed empirically: the backend became fully
    # unresponsive to plain GET requests during a background analysis
    # before this fix.
    query_vec = (await asyncio.to_thread(embed, [query_text]))[0]

    # <#> is pgvector's max-inner-product operator -- it returns the
    # NEGATIVE inner product, so ordering ascending on it (what
    # max_inner_product() does under the hood) surfaces the highest actual
    # inner product first. Both sides are already unit-normalized (see
    # llm.embeddings.embed), so inner product = cosine similarity: same
    # ranking as the old np.dot scan, computed by Postgres instead of
    # pulled into memory first. One query per entity type rather than one
    # big scan + Python-side split, since the LIMIT can be pushed down per
    # type directly.
    top_questions = (
        await db.scalars(
            select(RegulatoryEmbedding)
            .where(RegulatoryEmbedding.entity_type == "question")
            .order_by(RegulatoryEmbedding.embedding.max_inner_product(query_vec))
            .limit(k_questions)
        )
    ).all()
    top_recos = (
        await db.scalars(
            select(RegulatoryEmbedding)
            .where(RegulatoryEmbedding.entity_type == "recommandation")
            .order_by(RegulatoryEmbedding.embedding.max_inner_product(query_vec))
            .limit(k_recommendations)
        )
    ).all()

    return {
        "questions": [
            {
                "code": r.entity_code, "title": r.title, "dimension": r.dimension or "",
                "subdimension": r.subdimension or "",
            }
            for r in top_questions
        ],
        "recommandations": [
            {
                "code": r.entity_code,
                "title": r.title,
                "category": r.category or "",
                "regulatory_flag": bool(r.regulatory_flag),
                "question_code": r.question_code or "",
            }
            for r in top_recos
        ],
    }
