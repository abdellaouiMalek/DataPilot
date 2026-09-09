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
    # Admin-managed only (see app.routers.admin_users) -- deliberately not
    # in ProfileUpdate, since this is a real permission boundary (which
    # bank's data the user can see), not a self-editable preference.
    bank_id: Optional[int] = None
    bank_name: Optional[str] = None
    bank_logo_url: Optional[str] = None


class ProfileUpdate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    organization: Optional[str] = Field(default=None, max_length=200)
