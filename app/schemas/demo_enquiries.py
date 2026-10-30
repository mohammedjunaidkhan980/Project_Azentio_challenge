import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.demo_enquiry import EnquiryStatusEnum

# Valid status transitions: new -> in_review -> responded -> closed
VALID_TRANSITIONS: dict[EnquiryStatusEnum, set[EnquiryStatusEnum]] = {
    EnquiryStatusEnum.NEW: {EnquiryStatusEnum.IN_REVIEW, EnquiryStatusEnum.CLOSED},
    EnquiryStatusEnum.IN_REVIEW: {EnquiryStatusEnum.RESPONDED, EnquiryStatusEnum.CLOSED},
    EnquiryStatusEnum.RESPONDED: {EnquiryStatusEnum.CLOSED},
    EnquiryStatusEnum.CLOSED: set(),
}


class EnquiryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    work_email: EmailStr
    organisation_name: str = Field(min_length=1, max_length=255)
    product_id: uuid.UUID | None = None
    product_interest: str = Field(min_length=1, max_length=255)
    requirements: str = Field(min_length=10, max_length=5000)


class EnquiryStatusUpdate(BaseModel):
    status: EnquiryStatusEnum


# Public-safe output — no internal status exposed
class EnquiryPublicOut(BaseModel):
    id: uuid.UUID
    name: str
    organisation_name: str
    product_interest: str
    created_at: datetime

    model_config = {"from_attributes": True}


# Full output for staff
class EnquiryOut(BaseModel):
    id: uuid.UUID
    name: str
    work_email: str
    organisation_name: str
    product_id: uuid.UUID | None
    product_interest: str
    requirements: str
    status: EnquiryStatusEnum
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
