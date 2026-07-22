from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class ProfileRead(BaseModel):
    id: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    organization: Optional[str] = None
    role: Optional[str] = None


class ProfileUpdate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    organization: Optional[str] = Field(default=None, max_length=200)
