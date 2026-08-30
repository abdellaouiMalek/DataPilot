"""Schemas for the admin back-office endpoints.

Models the 3-level framework: Dimension → Sub-dimension → Question, with the
extra attributes the admin UI manages (weight, color, question type).
"""

from typing import Optional

from pydantic import BaseModel, Field

from app.models.question import DEFAULT_QUESTION_TYPE


# ── Shared value types ───────────────────────────────────────────────────────

class LevelResponse(BaseModel):
    """One maturity-scale rung: its label and the points it awards."""

    label: str = ""
    score: float = 0


class ChoiceOption(BaseModel):
    """One selectable option for a Choix unique/Choix multiple question."""

    label: str = ""
    score: float = 0


# ── Read ──────────────────────────────────────────────────────────────────────

class QuestionAdminRead(BaseModel):
    id: int
    dimension_id: int
    sub_dimension_id: Optional[int]
    text: str
    description: Optional[str] = None
    type: str
    weight: float
    sort_order: int
    is_required: bool
    level_responses: Optional[list[LevelResponse]] = None
    choice_options: Optional[list[ChoiceOption]] = None
    is_active: bool

    model_config = {"from_attributes": True}


class SubDimensionAdminRead(BaseModel):
    id: int
    dimension_id: int
    name: str
    sort_order: int
    is_active: bool
    questions: list[QuestionAdminRead]

    model_config = {"from_attributes": True}


class DimensionAdminRead(BaseModel):
    id: int
    key: str
    code: str
    name: str
    short_name: str
    description: str
    weight: float
    color: str
    sort_order: int
    is_active: bool
    sub_dimensions: list[SubDimensionAdminRead]

    model_config = {"from_attributes": True}


# ── Dimension write ───────────────────────────────────────────────────────────

class DimensionCreate(BaseModel):
    # key / code / short_name are auto-generated from the name server-side.
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    weight: float = 0
    color: str = Field(default="#1A1A1A", max_length=20)
    sort_order: Optional[int] = None
    is_active: bool = True


class DimensionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    weight: Optional[float] = None
    color: Optional[str] = Field(default=None, max_length=20)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


# ── Sub-dimension write ───────────────────────────────────────────────────────

class SubDimensionCreate(BaseModel):
    dimension_id: int
    name: str = Field(min_length=1, max_length=200)
    sort_order: Optional[int] = None
    is_active: bool = True


class SubDimensionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    dimension_id: Optional[int] = None  # move to another dimension


# ── Question write ────────────────────────────────────────────────────────────

class QuestionCreate(BaseModel):
    sub_dimension_id: int  # dimension_id is derived from the sub-dimension
    text: str = Field(min_length=1)
    description: Optional[str] = None
    type: str = Field(default=DEFAULT_QUESTION_TYPE, max_length=50)
    weight: float = 0
    sort_order: Optional[int] = None
    is_required: bool = True
    level_responses: Optional[list[LevelResponse]] = None
    choice_options: Optional[list[ChoiceOption]] = None
    is_active: bool = True


# ── Delete impact (force-delete confirmation) ────────────────────────────────

class DeleteImpact(BaseModel):
    """What a force-delete would wipe out, so the admin UI can show a warning
    before permanently removing historical assessment data."""

    answer_count: int
    assessment_count: int
    recommendation_count: int


class QuestionUpdate(BaseModel):
    text: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    type: Optional[str] = Field(default=None, max_length=50)
    weight: Optional[float] = None
    sort_order: Optional[int] = None
    is_required: Optional[bool] = None
    level_responses: Optional[list[LevelResponse]] = None
    choice_options: Optional[list[ChoiceOption]] = None
    is_active: Optional[bool] = None
    sub_dimension_id: Optional[int] = None  # move to another sub-dimension


# ── Recommendation ────────────────────────────────────────────────────────────
# One atomic recommendation moves a single question's answer from
# trigger_level to trigger_level + 1 (see app/models/recommendation.py) --
# there is no "multi-level" recommendation at the DB level, so a wizard that
# targets several trigger levels at once creates one row per level, all
# sharing the same title/text/category/effort/regulatory_flag.

class RecommendationAdminRead(BaseModel):
    id: int
    code: str
    question_id: int
    trigger_level: int
    target_level: int
    title: str
    recommendation_text: str
    category: str
    regulatory_flag: bool
    effort: int
    prerequisite_id: Optional[int] = None
    is_active: bool

    model_config = {"from_attributes": True}


class RecommendationCreate(BaseModel):
    question_id: int
    # One row is created per level (1-4 each, see chk_trigger_level_range) --
    # the endpoint reports per-level success/conflict rather than failing the
    # whole request over one already-occupied level.
    trigger_levels: list[int] = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    recommendation_text: str = Field(min_length=1)
    category: str = Field(min_length=1, max_length=50)
    effort: int = Field(ge=1, le=3)
    regulatory_flag: bool = False
    is_active: bool = True


class RecommendationUpdate(BaseModel):
    # question_id / trigger_level / code are immutable once created (moving a
    # recommendation to another question or level risks colliding with the
    # uq_question_trigger constraint) -- only the content fields are editable.
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    recommendation_text: Optional[str] = Field(default=None, min_length=1)
    category: Optional[str] = Field(default=None, min_length=1, max_length=50)
    effort: Optional[int] = Field(default=None, ge=1, le=3)
    regulatory_flag: Optional[bool] = None
    is_active: Optional[bool] = None


class RecommendationBatchCreateResult(BaseModel):
    """One POST can target several trigger levels at once (one DB row each) --
    reports which were actually created vs. already occupied for that
    question, instead of failing the whole request over one conflict."""

    created: list[RecommendationAdminRead]
    skipped_levels: list[int]
