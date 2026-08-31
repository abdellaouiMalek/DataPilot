"""Schemas for the scoring referential (maturity bands).

Bands are matched against a score on the questionnaire's own scale (1→5, see
``app.services.scoring``), not a 0–100 percentage: a band's ``min_score`` /
``max_score`` are compared directly to the weighted average of the answers.
"""

from typing import Optional

from pydantic import BaseModel, Field


class MaturityLevelAdminRead(BaseModel):
    id: int
    label: str
    min_score: float
    max_score: float
    color: str
    description: str
    sort_order: int

    model_config = {"from_attributes": True}


class MaturityLevelUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=50)
    min_score: Optional[float] = Field(default=None, ge=0)
    max_score: Optional[float] = Field(default=None, ge=0)
    color: Optional[str] = Field(default=None, max_length=20)
    description: Optional[str] = None


class ScoringScale(BaseModel):
    """The bounds every band must stay inside, so the UI never invents its own."""

    min: float
    max: float


class ScoringReferentialRead(BaseModel):
    """Everything the scoring page needs in one round-trip."""

    scale: ScoringScale
    levels: list[MaturityLevelAdminRead]
    # Bands that overlap each other, or ranges the bands leave uncovered --
    # both make `map_to_maturity_level` return a wrong/None label, so the page
    # surfaces them instead of letting them rot silently.
    overlaps: list[str]
    gaps: list[str]
