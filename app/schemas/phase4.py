import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.phase4 import (
    ImprovementStatusEnum,
    ModerationDecisionEnum,
    SharedLearningStatusEnum,
)


class ModerationDecision(BaseModel):
    decision: ModerationDecisionEnum
    reason: str | None = Field(default=None, max_length=500)
    redacted_title: str | None = Field(default=None, min_length=1, max_length=255)
    redacted_content: str | None = Field(default=None, min_length=10, max_length=10000)


class ModerationQueueOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    product_id: uuid.UUID | None
    category: str | None
    organisation_id: uuid.UUID
    consent_status: str
    consent_granted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ModerationReviewOut(BaseModel):
    id: uuid.UUID
    observation_id: uuid.UUID
    reviewer_user_id: uuid.UUID
    decision: ModerationDecisionEnum
    reason: str | None
    redacted_title: str | None
    reviewed_at: datetime

    model_config = {"from_attributes": True}


class SharedLearningOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    category: str | None
    title: str
    content: str
    status: SharedLearningStatusEnum
    published_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SharedLearningFilter(BaseModel):
    pass


class OrganisationProductEntitlementCreate(BaseModel):
    organisation_id: uuid.UUID
    product_id: uuid.UUID
    is_active: bool = True


class ProductImprovementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=10, max_length=5000)
    product_id: uuid.UUID
    organisation_id: uuid.UUID | None = None
    evidence_entry_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)


class ImprovementStatusChange(BaseModel):
    status: ImprovementStatusEnum
    reason: str | None = Field(default=None, max_length=500)


class ImprovementEvidenceOut(BaseModel):
    id: uuid.UUID
    shared_learning_entry_id: uuid.UUID
    active: bool
    title: str | None
    created_at: datetime


class ProductImprovementOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    product_id: uuid.UUID
    organisation_id: uuid.UUID | None
    status: ImprovementStatusEnum
    created_by_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    evidence: list[ImprovementEvidenceOut] = []


class AuditEventOut(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    organisation_id: uuid.UUID | None
    action: str
    resource_type: str
    resource_id: uuid.UUID
    outcome: str
    created_at: datetime

    model_config = {"from_attributes": True}
