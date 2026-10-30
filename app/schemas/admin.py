import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.membership import RoleEnum


class MembershipAdminOut(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    organisation_name: str
    role: RoleEnum
    is_active: bool
    joined_at: datetime

    model_config = {"from_attributes": True}


class AdminUserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime
    memberships: list[MembershipAdminOut] = []

    model_config = {"from_attributes": True}


class MembershipCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organisation_id: uuid.UUID
    role: RoleEnum


class MembershipUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: RoleEnum | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def at_least_one_change(self):
        if self.role is None and self.is_active is None:
            raise ValueError("At least one of role or is_active must be provided")
        return self


class UserStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool
