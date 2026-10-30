import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Enum, ForeignKey, String, Text, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import GUID


class ObservationStatusEnum(str, enum.Enum):
    PRIVATE = "private"
    IN_REVIEW = "in_review"


class ConsentStatusEnum(str, enum.Enum):
    NOT_GRANTED = "not_granted"
    GRANTED = "granted"
    WITHDRAWN = "withdrawn"


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[ObservationStatusEnum] = mapped_column(
        Enum(ObservationStatusEnum, native_enum=False, length=32),
        default=ObservationStatusEnum.PRIVATE,
        nullable=False,
        index=True,
    )
    consent_status: Mapped[ConsentStatusEnum] = mapped_column(
        Enum(ConsentStatusEnum, native_enum=False, length=32),
        default=ConsentStatusEnum.NOT_GRANTED,
        nullable=False,
        index=True,
    )
    consent_granted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP, nullable=True)
    consent_granted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    consent_withdrawn_at: Mapped[datetime | None] = mapped_column(TIMESTAMP, nullable=True)
    consent_withdrawn_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
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

    consent_events: Mapped[list["ObservationConsentEvent"]] = relationship(
        back_populates="observation", cascade="all, delete-orphan", lazy="selectin"
    )


class ObservationConsentEvent(Base):
    __tablename__ = "observation_consent_events"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    observation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("observations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[ConsentStatusEnum] = mapped_column(
        Enum(ConsentStatusEnum, native_enum=False, length=32), nullable=False, index=True
    )
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    observation: Mapped["Observation"] = relationship(back_populates="consent_events")
