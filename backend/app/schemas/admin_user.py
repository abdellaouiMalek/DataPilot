from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

BusinessRole = Literal["admin", "consultant", "repondant", "validateur"]


class UserRead(BaseModel):
    id: str
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    enabled: bool = True
    status: str
    organization: Optional[str] = None
    role: Optional[BusinessRole] = None
    created_at: Optional[datetime] = None


class UserCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    role: BusinessRole = "consultant"
    organization: Optional[str] = Field(default=None, max_length=200)
    status: Literal["Actif", "En attente", "Désactivé", "Archivé"] = "Actif"


class ActionEmailResult(BaseModel):
    sent: bool = True
    email: Optional[str] = None


class UserUpdate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    role: BusinessRole
    organization: Optional[str] = Field(default=None, max_length=200)
    status: Literal["Actif", "En attente", "Désactivé", "Archivé"]


class UserEnabledUpdate(BaseModel):
    enabled: bool


class UserArchivedUpdate(BaseModel):
    archived: bool
