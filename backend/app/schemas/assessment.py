"""Request/response schemas for submitting a questionnaire and getting scores."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AnswerIn(BaseModel):
    """One Likert response to a question, as sent by the questionnaire."""

    question_id: int
    value: int = Field(ge=1, le=5)


class AssessmentCreate(BaseModel):
    """Payload for ``POST /api/assessments`` — the raw questionnaire submission."""

    bank_id: int
    department: Optional[str] = Field(default=None, max_length=200)
    evaluator_role: Optional[str] = Field(default=None, max_length=200)
    answers: list[AnswerIn] = Field(min_length=1)


class DimensionScoreRead(BaseModel):
    """One dimension's computed score, enriched with identity for the UI."""

    dimension_id: int
    key: str
    name: str
    score: float


class AssessmentResult(BaseModel):
    """The scored assessment returned after submission."""

    id: int
    bank_id: int
    bank: str  # resolved bank name, for display
    department: Optional[str]
    evaluator_role: Optional[str]
    score_global: Optional[float]
    maturity_label: Optional[str]
    created_at: datetime
    dimension_scores: list[DimensionScoreRead]
    # True if the calling user is the one who submitted this assessment --
    # relevant now that a bank's history shows every colleague's
    # submissions, not just the caller's own.
    submitted_by_me: bool

    model_config = {"from_attributes": True}
