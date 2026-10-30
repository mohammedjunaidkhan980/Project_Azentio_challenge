import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Enum, String, Text, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID


class EnquiryStatusEnum(str, enum.Enum):
    NEW = "new"
    IN_REVIEW = "in_review"
    RESPONDED = "responded"
    CLOSED = "closed"


class DemoEnquiry(Base):
    __tablename__ = "demo_enquiries"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    work_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    organisation_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[uuid.UUID | None] = mapped_column(GUID, nullable=True, index=True)
    product_interest: Mapped[str] = mapped_column(String(255), nullable=False)
    requirements: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[EnquiryStatusEnum] = mapped_column(
        Enum(EnquiryStatusEnum, native_enum=False, length=32),
        default=EnquiryStatusEnum.NEW,
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
