import uuid
import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership import RoleEnum
from app.models.observation import (
    ConsentStatusEnum,
    Observation,
    ObservationConsentEvent,
    ObservationStatusEnum,
)
from app.models.product import Product
from app.models.user import User
from app.models.phase4 import AuditEvent, SharedLearningEntry, SharedLearningStatusEnum
from app.repositories.observation_repository import ObservationRepository
from app.schemas.common import PaginationMeta
from app.schemas.observations import ObservationCreate, ObservationOut


def _forbidden() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "FORBIDDEN", "message": "Insufficient permissions"},
    )


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "OBSERVATION_NOT_FOUND", "message": "Observation not found"},
    )


class ObservationService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._repo = ObservationRepository(db)

    @staticmethod
    def _client_org_ids(user: User) -> list[uuid.UUID]:
        return [
            membership.organisation_id
            for membership in user.memberships
            if membership.is_active
            and membership.role == RoleEnum.CLIENT
            and membership.organisation is not None
            and membership.organisation.is_active
        ]

    def _require_client_org(self, user: User, organisation_id: uuid.UUID) -> None:
        if organisation_id not in self._client_org_ids(user):
            raise _forbidden()

    async def create(self, user: User, data: ObservationCreate) -> ObservationOut:
        self._require_client_org(user, data.organisation_id)
        if data.product_id is not None:
            result = await self._db.execute(select(Product.id).where(Product.id == data.product_id))
            if result.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "PRODUCT_NOT_FOUND", "message": "Product not found"},
                )
        observation = Observation(
            id=uuid.uuid4(),
            title=data.title,
            description=data.description,
            product_id=data.product_id,
            category=data.category,
            created_by_user_id=user.id,
            organisation_id=data.organisation_id,
            status=ObservationStatusEnum.PRIVATE,
            consent_status=ConsentStatusEnum.NOT_GRANTED,
        )
        self._db.add(AuditEvent(
            id=uuid.uuid4(),
            actor_user_id=user.id,
            organisation_id=data.organisation_id,
            action="observation_created",
            resource_type="observation",
            resource_id=observation.id,
            outcome="success",
            metadata_json=None,
            created_at=datetime.now(timezone.utc),
        ))
        saved = await self._repo.create(observation)
        return ObservationOut.model_validate(saved)

    async def list(
        self, user: User, organisation_id: uuid.UUID | None, page: int, page_size: int
    ) -> tuple[list[ObservationOut], PaginationMeta]:
        org_ids = self._client_org_ids(user)
        if organisation_id is not None:
            self._require_client_org(user, organisation_id)
            org_ids = [organisation_id]
        observations, total = await self._repo.list_for_organisations(org_ids, page, page_size)
        meta = PaginationMeta(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=max(1, -(-total // page_size)),
        )
        return [ObservationOut.model_validate(item) for item in observations], meta

    async def get(self, user: User, observation_id: uuid.UUID) -> ObservationOut:
        observation = await self._repo.get_by_id(observation_id)
        if not observation or observation.organisation_id not in self._client_org_ids(user):
            raise _not_found()
        return ObservationOut.model_validate(observation)

    async def grant_consent(
        self, user: User, observation_id: uuid.UUID, reason: str | None
    ) -> ObservationOut:
        observation = await self._repo.get_by_id(observation_id)
        if not observation or observation.organisation_id not in self._client_org_ids(user):
            raise _not_found()
        if observation.consent_status == ConsentStatusEnum.GRANTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "CONSENT_ALREADY_GRANTED",
                    "message": "Consent is already granted",
                },
            )
        now = datetime.now(timezone.utc)
        observation.consent_status = ConsentStatusEnum.GRANTED
        observation.consent_granted_at = now
        observation.consent_granted_by_user_id = user.id
        observation.consent_withdrawn_at = None
        observation.consent_withdrawn_by_user_id = None
        observation.consent_events.append(
            ObservationConsentEvent(
                id=uuid.uuid4(),
                action=ConsentStatusEnum.GRANTED,
                actor_user_id=user.id,
                organisation_id=observation.organisation_id,
                reason=reason,
                created_at=now,
            )
        )
        self._db.add(AuditEvent(
            id=uuid.uuid4(),
            actor_user_id=user.id,
            organisation_id=observation.organisation_id,
            action="consent_granted",
            resource_type="observation",
            resource_id=observation.id,
            outcome="success",
            metadata_json=json.dumps({"reason": reason}, separators=(",", ":")) if reason else None,
            created_at=now,
        ))
        saved = await self._repo.save(observation)
        return ObservationOut.model_validate(saved)

    async def withdraw_consent(
        self, user: User, observation_id: uuid.UUID, reason: str | None
    ) -> ObservationOut:
        observation = await self._repo.get_by_id(observation_id)
        if not observation or observation.organisation_id not in self._client_org_ids(user):
            raise _not_found()
        if observation.consent_status != ConsentStatusEnum.GRANTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "CONSENT_NOT_ACTIVE",
                    "message": "Consent is not currently granted",
                },
            )
        now = datetime.now(timezone.utc)
        observation.consent_status = ConsentStatusEnum.WITHDRAWN
        observation.consent_withdrawn_at = now
        observation.consent_withdrawn_by_user_id = user.id
        observation.consent_events.append(
            ObservationConsentEvent(
                id=uuid.uuid4(),
                action=ConsentStatusEnum.WITHDRAWN,
                actor_user_id=user.id,
                organisation_id=observation.organisation_id,
                reason=reason,
                created_at=now,
            )
        )
        entry_result = await self._db.execute(
            select(SharedLearningEntry).where(
                SharedLearningEntry.observation_id == observation.id,
                SharedLearningEntry.status == SharedLearningStatusEnum.PUBLISHED,
            )
        )
        entry = entry_result.scalar_one_or_none()
        if entry:
            entry.status = SharedLearningStatusEnum.UNPUBLISHED
            entry.unpublished_at = now
            entry.updated_at = now
        self._db.add(AuditEvent(
            id=uuid.uuid4(),
            actor_user_id=user.id,
            organisation_id=observation.organisation_id,
            action="consent_withdrawn",
            resource_type="observation",
            resource_id=observation.id,
            outcome="success",
            metadata_json=json.dumps({"reason": reason, "shared_learning_unpublished": entry is not None}, separators=(",", ":")) if (reason or entry) else None,
            created_at=now,
        ))
        if entry:
            self._db.add(AuditEvent(
                id=uuid.uuid4(),
                actor_user_id=user.id,
                organisation_id=observation.organisation_id,
                action="shared_learning_unpublished",
                resource_type="shared_learning_entry",
                resource_id=entry.id,
                outcome="success",
                metadata_json=json.dumps({"reason": reason}, separators=(",", ":")) if reason else None,
                created_at=now,
            ))
        saved = await self._repo.save(observation)
        return ObservationOut.model_validate(saved)
