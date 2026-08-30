from __future__ import annotations

from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, DateTime, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.database import Base

# bge-m3's embedding size (see llm/embeddings.py::EMBEDDING_DIM) -- fixed
# per pgvector column, so it has to be a plain constant here too, not
# imported from llm/embeddings.py (would pull the whole LLM stack into
# every module that just needs the model layer).
EMBEDDING_DIM = 1024


class RegulatoryEmbedding(Base):
    """Index vectoriel (RAG) du référentiel pour « Veille réglementaire » :
    une ligne par question ou recommandation active, avec son embedding
    bge-m3 -- voir ``llm/embeddings.py`` et ``app/services/regulatory_index.py``.

    Stocké avec l'extension **pgvector** (colonne ``vector(1024)``) : la
    recherche par similarité se fait dans PostgreSQL (``ORDER BY embedding
    <#> :query LIMIT k``), pas en mémoire via numpy comme avant -- même
    logique de recherche (produit scalaire sur des vecteurs déjà
    normalisés L2, équivalent à la similarité cosinus), juste exécutée
    côté base. Voir ``app/services/regulatory_index.py::retrieve``.

    Pas d'index ANN (ivfflat/hnsw) pour l'instant : à cette échelle (une
    centaine d'éléments), un scan séquentiel exact est déjà rapide et
    reste exact (pas d'approximation) -- à reconsidérer si le catalogue
    grossit d'un ordre de grandeur.

    Reconstruit entièrement à chaque réindexation (pas de mise à jour
    incrémentale) : le catalogue est petit, ré-encoder tout est simple et
    rapide, et évite les incohérences si des éléments ont été
    supprimés/désactivés entre deux réindexations.
    """

    __tablename__ = "regulatory_embeddings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # "question" | "recommandation"
    entity_type: Mapped[str] = mapped_column(String(20), index=True)
    # Code affiché : "D{n}Q{m}" synthétique pour une question (voir
    # regulatory_index.py), code réel (ex. "D4Q4-1") pour une recommandation.
    entity_code: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(300))
    # Texte complet qui a été embeddé -- réutilisé tel quel comme
    # description du candidat dans le prompt LLM (pas besoin de rejoindre
    # la table d'origine à chaque recherche).
    text: Mapped[str] = mapped_column(Text)
    # Renseigné seulement pour entity_type="recommandation".
    question_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    regulatory_flag: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    # Renseigné seulement pour entity_type="question".
    dimension: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Renseigné seulement pour entity_type="question", si la question a une
    # sous-dimension (nullable côté Question aussi -- voir son modèle).
    # Montré au LLM parmi les candidats (voir
    # llm.regulatory_analysis._build_candidates_text) pour qu'une nouvelle
    # question proposée puisse être rattachée à une sous-dimension
    # EXISTANTE plutôt que d'en créer une par défaut -- voir
    # app.services.regulatory.resolve_or_create_subdimension.
    subdimension: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("entity_type", "entity_code", name="uq_regulatory_embedding_entity"),
    )
