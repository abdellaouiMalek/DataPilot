"""Schemas for the admin back-office endpoints.

Unlike the public `config` schemas, these expose `is_active` and accept
create/update payloads.
"""

from typing import Optional

from pydantic import BaseModel, Field


class QuestionAdminRead(BaseModel):
    id: int
    dimension_id: int
    text: str
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class DimensionAdminRead(BaseModel):
    id: int
    key: str
    code: str
    name: str
    short_name: str
    description: str
    sort_order: int
    is_active: bool
    questions: list[QuestionAdminRead]

    model_config = {"from_attributes": True}


class DimensionCreate(BaseModel):
    key: str = Field(min_length=1, max_length=50)
    code: str = Field(min_length=1, max_length=10)
    name: str = Field(min_length=1, max_length=200)
    short_name: str = Field(min_length=1, max_length=100)
    description: str = ""
    sort_order: int = 0
    is_active: bool = True


class DimensionUpdate(BaseModel):
    """All fields optional — only provided ones are applied (PATCH semantics)."""

    key: Optional[str] = Field(default=None, min_length=1, max_length=50)
    code: Optional[str] = Field(default=None, min_length=1, max_length=10)
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    short_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
