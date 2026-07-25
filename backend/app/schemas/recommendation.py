"""Response schema for ``GET /api/assessments/{id}/recommendations``."""

from __future__ import annotations

from pydantic import BaseModel


class ExplanationFactor(BaseModel):
    """One SHAP-derived factor explaining a recommendation's rank."""

    feature: str
    shap_value: float
    direction: str
    label: str


class RecommendationOut(BaseModel):
    """One ranked, explained recommendation."""

    rank: int
    score: float
    code: str
    title: str
    recommendation_text: str
    category: str
    regulatory_flag: bool
    effort: int
    question_id: int
    dimension_id: int
    trigger_level: int
    target_level: int
    explanation_factors: list[ExplanationFactor]
    texte_reformule: str
    justification: str


class NarrativeOut(BaseModel):
    """Plain-language narrative of an assessment's maturity results."""

    narrative: str


class DimensionNoteOut(BaseModel):
    """"A niveau" note for a strong dimension not otherwise represented
    in the priority plan (see app.services.action_plan)."""

    dimension_id: int
    dimension_name: str
    dimension_score: float
    message: str


class RecommendationPlanOut(BaseModel):
    """Response for ``GET /api/assessments/{id}/recommendations``: a
    tightened priority plan plus the full ranked set and per-dimension
    notes. Field names are in French to match the product's own
    vocabulary for this feature.
    """

    plan_prioritaire: list[RecommendationOut]
    recommandations_completes: list[RecommendationOut]
    notes_dimensions: list[DimensionNoteOut]
