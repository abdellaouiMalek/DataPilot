from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class AssessmentCreate(BaseModel):
    entity: str
    department: Optional[str] = None
    evaluator_name: Optional[str] = None
    evaluator_role: Optional[str] = None
    score_gouvernance: float = Field(ge=0, le=5)
    score_qualite: float = Field(ge=0, le=5)
    score_architecture: float = Field(ge=0, le=5)
    score_usage: float = Field(ge=0, le=5)
    score_culture: float = Field(ge=0, le=5)
    score_strategie: float = Field(ge=0, le=5)
    notes: Optional[str] = None


class AssessmentRead(AssessmentCreate):
    id: int
    score_global: float
    maturity_label: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DimensionScores(BaseModel):
    gouvernance: float
    qualite: float
    architecture: float
    usage: float
    culture: float
    strategie: float
