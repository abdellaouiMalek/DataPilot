from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.database import Base


class RegulatoryEmbedding(Base):
    """Index vectoriel (RAG) du référentiel pour « Veille réglementaire » :
    une ligne par question ou recommandation active, avec son embedding
    bge-m3 -- voir ``llm/embeddings.py`` et ``app/services/regulatory_index.py``.

    Pas d'extension pgvector ici (indisponible sans droits admin sur cette
    installation Postgres native Windows) : l'embedding est stocké en
    ``bytea`` (float32 packé, déjà normalisé L2) et la recherche par
    similarité se fait en mémoire via numpy, au moment de la requête --
    largement suffisant à l'échelle du catalogue (une centaine
    d'éléments), pas besoin d'un index ANN dédié.

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
    embedding: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("entity_type", "entity_code", name="uq_regulatory_embedding_entity"),
    )
