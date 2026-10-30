import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text, TIMESTAMP, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID


class ModerationDecisionEnum(str, enum.Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class SharedLearningStatusEnum(str, enum.Enum):
    PUBLISHED = "published"
    UNPUBLISHED = "unpublished"


class ImprovementStatusEnum(str, enum.Enum):
    PROPOSED = "proposed"
    UNDER_REVIEW = "under_review"
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    REJECTED = "rejected"


class ModerationReview(Base):
    __tablename__ = "moderation_reviews"
    __table_args__ = (UniqueConstraint("observation_id", name="uq_moderation_observation"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    observation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("observations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    decision: Mapped[ModerationDecisionEnum] = mapped_column(
        Enum(ModerationDecisionEnum, native_enum=False, length=32),
        nullable=False,
        index=True,
    )
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    redacted_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    redacted_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=lambda: datetime.now(timezone.utc), nullable=False
    )


class SharedLearningEntry(Base):
    __tablename__ = "shared_learning_entries"
    __table_args__ = (UniqueConstraint("observation_id", name="uq_shared_learning_observation"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    observation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("observations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    redacted_title: Mapped[str] = mapped_column(String(255), nullable=False)
    redacted_content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[SharedLearningStatusEnum] = mapped_column(
        Enum(SharedLearningStatusEnum, native_enum=False, length=32),
        default=SharedLearningStatusEnum.PUBLISHED,
        nullable=False,
        index=True,
    )
    published_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    published_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    unpublished_at: Mapped[datetime | None] = mapped_column(TIMESTAMP, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class OrganisationProductEntitlement(Base):
    __tablename__ = "organisation_product_entitlements"
    __table_args__ = (
        UniqueConstraint("organisation_id", "product_id", name="uq_org_product_entitlement"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=lambda: datetime.now(timezone.utc), nullable=False
    )


class ProductImprovement(Base):
    __tablename__ = "product_improvements"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[ImprovementStatusEnum] = mapped_column(
        Enum(ImprovementStatusEnum, native_enum=False, length=32),
        default=ImprovementStatusEnum.PROPOSED,
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
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


class ProductImprovementEvidence(Base):
    __tablename__ = "product_improvement_evidence"
    __table_args__ = (
        UniqueConstraint("improvement_id", "shared_learning_entry_id", name="uq_improvement_evidence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    improvement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_improvements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shared_learning_entry_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("shared_learning_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=lambda: datetime.now(timezone.utc), nullable=False
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resource_id: Mapped[uuid.UUID] = mapped_column(GUID, nullable=False, index=True)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
