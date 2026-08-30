from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.database import Base


class RegulatoryCircular(Base):
    """A regulatory circular (e.g. from the Banque Centrale de Tunisie)
    imported for review under "Veille réglementaire". Admin-managed:
    imported (file or URL), analyzed by the LLM in the background, its
    proposed impacts triaged by a human, then published.
    """

    __tablename__ = "regulatory_circulars"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    reference: Mapped[str] = mapped_column(String(200))
    publication_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    theme: Mapped[str] = mapped_column(String(300), default="", server_default="")
    # Autorité émettrice (ex. "Banque Centrale de Tunisie"), extraite
    # automatiquement de l'en-tête -- voir
    # llm.regulatory_analysis.extract_document_metadata. Vide si non
    # déterminée (LLM indisponible, en-tête non reconnaissable).
    institution: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # Statut de PUBLICATION (distinct de analysis_status, qui suit le
    # traitement en arrière-plan) : "Brouillon" | "En vigueur" | "Abrogée".
    status: Mapped[str] = mapped_column(
        String(20), default="Brouillon", server_default="Brouillon"
    )
    version: Mapped[str] = mapped_column(
        String(20), default="Brouillon", server_default="Brouillon"
    )
    source_filename: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    # Le texte ANALYSÉ (français -- soit la langue source, soit une
    # traduction si la circulaire était en arabe) : c'est ce qui est
    # affiché à l'admin par défaut, pour qu'il puisse lire le document
    # quelle que soit sa langue source (voir services/regulatory.py).
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Le texte tel qu'extrait de la circulaire dans sa langue SOURCE,
    # uniquement renseigné quand une traduction a eu lieu (donc
    # généralement vide pour une circulaire déjà en français) --
    # traçabilité, voir RegulatoryImpact.excerpt_original.
    raw_text_original: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Empreinte SHA-256 du PDF source, pour éviter de ré-analyser deux fois
    # le même document (voir services/regulatory.py).
    source_hash: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    detected_language: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # "en_attente" | "en_cours" | "terminee" | "erreur" -- suivi de
    # l'analyse LLM en arrière-plan (voir routers/regulatory.py).
    analysis_status: Mapped[str] = mapped_column(
        String(20), default="en_attente", server_default="en_attente"
    )
    analysis_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Nom d'affichage du super-admin qui a publié cette circulaire (voir
    # routers/regulatory.py::publish_circular) -- pas un id Keycloak :
    # l'identité vit entièrement dans Keycloak (pas de table users locale,
    # voir app.routers.admin_users), donc rien à joindre plus tard ; un nom
    # figé au moment de la publication est la trace d'audit qui compte,
    # même si ce compte est ensuite renommé/désactivé dans Keycloak.
    published_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    impacts: Mapped[List["RegulatoryImpact"]] = relationship(
        back_populates="circular",
        cascade="all, delete-orphan",
        order_by="RegulatoryImpact.id",
    )

    # Plain @property (not mapped_column): read off the already-loaded
    # `impacts` relationship so CircularRead.model_validate(circular) can
    # pick them up via from_attributes without a separate COUNT query.
    @property
    def impact_count(self) -> int:
        return len(self.impacts)

    @property
    def pending_count(self) -> int:
        return sum(1 for i in self.impacts if i.action is None)


class RegulatoryImpact(Base):
    """One candidate requirement extracted from a circular, with the LLM's
    PROPOSED impact on the framework -- never applied automatically. An
    admin accepts, edits, or rejects it before the circular is published.
    """

    __tablename__ = "regulatory_impacts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    circular_id: Mapped[int] = mapped_column(
        ForeignKey("regulatory_circulars.id", ondelete="CASCADE"), index=True
    )
    # Courte citation fidèle de la circulaire justifiant cette exigence --
    # dans la langue ANALYSÉE (français : soit la langue source, soit une
    # traduction si la circulaire était en arabe, voir
    # llm/regulatory_analysis.py::translate_document_to_french).
    excerpt: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Le texte ORIGINAL (langue source de la circulaire) correspondant à
    # `excerpt`, uniquement renseigné quand une traduction a eu lieu (donc
    # généralement vide/null pour une circulaire déjà en français) --
    # traçabilité : l'admin doit pouvoir retrouver le passage réel de la
    # circulaire, pas seulement sa traduction. Best-effort au niveau du
    # bloc de traduction, pas phrase par phrase (voir find_original_context).
    excerpt_original: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requirement_text: Mapped[str] = mapped_column(Text)
    # "question" | "recommandation" -- quel type d'élément du référentiel
    # cette proposition concerne.
    entity_type: Mapped[str] = mapped_column(String(20))
    # "ajouter" | "modifier" | "desactiver" | "activer_flag" (ce dernier
    # uniquement pour entity_type="recommandation") -- voir
    # llm/regulatory_analysis.py pour ce que chacun signifie. Nommé
    # différemment du champ "action" ci-dessous (qui est la décision de
    # l'ADMIN sur cette proposition, pas l'action proposée par l'IA) pour
    # ne jamais confondre les deux.
    proposed_action: Mapped[str] = mapped_column(String(20))
    # Charge utile propre à (entity_type, proposed_action) -- voir
    # llm/regulatory_analysis.py pour la forme exacte par combinaison
    # (ex. question_text/levels/associated_recommendations pour une
    # nouvelle question, reco_code/justification pour une désactivation).
    proposed_data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    # "accepté" | "modifié" | "rejeté" | null (encore en attente de revue)
    action: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Le texte édité par l'admin, uniquement renseigné si action == "modifié".
    edited_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    circular: Mapped["RegulatoryCircular"] = relationship(back_populates="impacts")
