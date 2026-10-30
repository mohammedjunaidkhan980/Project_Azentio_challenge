import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.observation import ConsentStatusEnum, ObservationStatusEnum


class ObservationCreate(BaseModel):
    organisation_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=10, max_length=10000)
    product_id: uuid.UUID | None = None
    category: str | None = Field(default=None, max_length=100)


class ConsentChange(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class ConsentEventOut(BaseModel):
    id: uuid.UUID
    action: ConsentStatusEnum
    actor_user_id: uuid.UUID
    organisation_id: uuid.UUID
    created_at: datetime
    reason: str | None

    model_config = {"from_attributes": True}


class ObservationOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    product_id: uuid.UUID | None
    category: str | None
    created_by_user_id: uuid.UUID
    organisation_id: uuid.UUID
    status: ObservationStatusEnum
    consent_status: ConsentStatusEnum
    consent_granted_at: datetime | None
    consent_granted_by_user_id: uuid.UUID | None
    consent_withdrawn_at: datetime | None
    consent_withdrawn_by_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    consent_events: list[ConsentEventOut] = []

    model_config = {"from_attributes": True}
