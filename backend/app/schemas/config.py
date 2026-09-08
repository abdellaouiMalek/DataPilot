"""Read schemas for the public reference-data (config) endpoints."""

from typing import Optional

from pydantic import BaseModel


class QuestionRead(BaseModel):
    id: int
    text: str
    description: Optional[str] = None
    sort_order: int

    model_config = {"from_attributes": True}


class DimensionRead(BaseModel):
    id: int
    key: str
    code: str
    name: str
    short_name: str
    description: str
    sort_order: int
    questions: list[QuestionRead]

    model_config = {"from_attributes": True}


class LookupRead(BaseModel):
    """Shared shape for banks / departments / roles selectors."""

    id: int
    name: str

    model_config = {"from_attributes": True}


class BankLookupRead(LookupRead):
    """Banks carry a logo the plain lookup shape doesn't need."""

    logo_url: Optional[str] = None


class MaturityLevelRead(BaseModel):
    id: int
    label: str
    min_score: float
    max_score: float
    color: str
    description: str

    model_config = {"from_attributes": True}
