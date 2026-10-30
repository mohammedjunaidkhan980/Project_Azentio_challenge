import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership import RoleEnum
from app.models.observation import ConsentStatusEnum, Observation, ObservationStatusEnum
from app.models.phase4 import (
    AuditEvent,
    ImprovementStatusEnum,
    ModerationDecisionEnum,
    ModerationReview,
    OrganisationProductEntitlement,
    ProductImprovement,
    ProductImprovementEvidence,
    SharedLearningEntry,
    SharedLearningStatusEnum,
)
from app.models.organisation import Organisation
from app.models.product import Product
from app.models.user import User
from app.schemas.common import PaginationMeta
from app.schemas.phase4 import (
    ImprovementEvidenceOut,
    ModerationDecision,
    ModerationQueueOut,
    ProductImprovementCreate,
)


VALID_IMPROVEMENT_TRANSITIONS = {
    ImprovementStatusEnum.PROPOSED: {ImprovementStatusEnum.UNDER_REVIEW, ImprovementStatusEnum.REJECTED},
    ImprovementStatusEnum.UNDER_REVIEW: {ImprovementStatusEnum.PLANNED, ImprovementStatusEnum.REJECTED},
    ImprovementStatusEnum.PLANNED: {ImprovementStatusEnum.IN_PROGRESS, ImprovementStatusEnum.REJECTED},
    ImprovementStatusEnum.IN_PROGRESS: {ImprovementStatusEnum.COMPLETED, ImprovementStatusEnum.REJECTED},
    ImprovementStatusEnum.COMPLETED: set(),
    ImprovementStatusEnum.REJECTED: set(),
}


def _http(code: str, message: str, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _active_memberships(user: User, role: RoleEnum) -> list:
    return [
        membership for membership in user.memberships
        if membership.is_active and membership.role == role
    ]


class Phase4Service:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _require_moderator(self, user: User) -> None:
        if not _active_memberships(user, RoleEnum.MODERATOR) and not _active_memberships(user, RoleEnum.ADMIN):
            raise _http("FORBIDDEN", "Insufficient permissions", 403)

    def _require_product_owner(self, user: User, organisation_id: uuid.UUID | None = None) -> None:
        if _active_memberships(user, RoleEnum.ADMIN):
            return
        owners = _active_memberships(user, RoleEnum.PRODUCT_OWNER)
        if not owners or (organisation_id is not None and organisation_id not in {m.organisation_id for m in owners}):
            raise _http("FORBIDDEN", "Insufficient permissions", 403)

    def _audit(
        self,
        *,
        actor: User | None,
        organisation_id: uuid.UUID | None,
        action: str,
        resource_type: str,
        resource_id: uuid.UUID,
        outcome: str,
        metadata: dict | None = None,
    ) -> AuditEvent:
        return AuditEvent(
            id=uuid.uuid4(),
            actor_user_id=actor.id if actor else None,
            organisation_id=organisation_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            metadata_json=json.dumps(metadata, separators=(",", ":")) if metadata else None,
            created_at=datetime.now(timezone.utc),
        )

    async def moderation_queue(
        self, user: User, page: int, page_size: int
    ) -> tuple[list[ModerationQueueOut], PaginationMeta]:
        self._require_moderator(user)
        reviewed = select(ModerationReview.observation_id)
        count_result = await self.db.execute(
            select(func.count())
            .select_from(Observation)
            .where(
                Observation.consent_status == ConsentStatusEnum.GRANTED,
                ~Observation.id.in_(reviewed),
            )
        )
        total = count_result.scalar_one()
        result = await self.db.execute(
            select(Observation)
            .where(
                Observation.consent_status == ConsentStatusEnum.GRANTED,
                ~Observation.id.in_(reviewed),
            )
            .order_by(Observation.consent_granted_at.desc(), Observation.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        observations = result.scalars().all()
        output = [
            ModerationQueueOut(
                id=o.id,
                title=o.title,
                description=o.description,
                product_id=o.product_id,
                category=o.category,
                organisation_id=o.organisation_id,
                consent_status=o.consent_status.value,
                consent_granted_at=o.consent_granted_at,
                created_at=o.created_at,
                updated_at=o.updated_at,
            )
            for o in observations
        ]
        meta = PaginationMeta(
            page=page, page_size=page_size, total=total,
            total_pages=max(1, -(-total // page_size)),
        )
        return output, meta

    async def decide_moderation(
        self, user: User, observation_id: uuid.UUID, body: ModerationDecision
    ) -> ModerationReview:
        self._require_moderator(user)
        result = await self.db.execute(select(Observation).where(Observation.id == observation_id))
        observation = result.scalar_one_or_none()
        if not observation:
            raise _http("OBSERVATION_NOT_FOUND", "Observation not found", 404)
        existing_result = await self.db.execute(
            select(ModerationReview).where(ModerationReview.observation_id == observation_id)
        )
        if existing_result.scalar_one_or_none():
            raise _http("MODERATION_DECISION_EXISTS", "This observation already has a decision", 409)
        if observation.consent_status != ConsentStatusEnum.GRANTED:
            raise _http("OBSERVATION_NOT_ELIGIBLE", "Explicit consent is required before moderation", 409)
        if body.decision == ModerationDecisionEnum.APPROVED:
            if not body.redacted_title or not body.redacted_content:
                raise _http("REDACTION_REQUIRED", "Approved observations require redacted title and content", 422)
        review = ModerationReview(
            id=uuid.uuid4(),
            observation_id=observation.id,
            reviewer_user_id=user.id,
            decision=body.decision,
            reason=body.reason,
            redacted_title=body.redacted_title if body.decision == ModerationDecisionEnum.APPROVED else None,
            redacted_content=body.redacted_content if body.decision == ModerationDecisionEnum.APPROVED else None,
            reviewed_at=datetime.now(timezone.utc),
        )
        observation.status = ObservationStatusEnum.PRIVATE
        self.db.add(review)
        self.db.add(self._audit(
            actor=user,
            organisation_id=observation.organisation_id,
            action="moderation_decision",
            resource_type="observation",
            resource_id=observation.id,
            outcome="success",
            metadata={"decision": body.decision.value},
        ))
        await self.db.commit()
        await self.db.refresh(review)
        return review

    async def publish(self, user: User, observation_id: uuid.UUID) -> SharedLearningEntry:
        self._require_moderator(user)
        observation_result = await self.db.execute(
            select(Observation).where(Observation.id == observation_id)
        )
        observation = observation_result.scalar_one_or_none()
        if not observation:
            raise _http("OBSERVATION_NOT_FOUND", "Observation not found", 404)
        review_result = await self.db.execute(
            select(ModerationReview).where(ModerationReview.observation_id == observation_id)
        )
        review = review_result.scalar_one_or_none()
        if (
            observation.consent_status != ConsentStatusEnum.GRANTED
            or not review
            or review.decision != ModerationDecisionEnum.APPROVED
            or not review.redacted_title
            or not review.redacted_content
        ):
            raise _http("PUBLICATION_NOT_ELIGIBLE", "Observation is not approved, consented, and redacted", 409)
        entry_result = await self.db.execute(
            select(SharedLearningEntry).where(SharedLearningEntry.observation_id == observation_id)
        )
        existing = entry_result.scalar_one_or_none()
        if existing:
            raise _http("PUBLICATION_ALREADY_EXISTS", "This observation is already published or recorded", 409)
        entry = SharedLearningEntry(
            id=uuid.uuid4(),
            observation_id=observation.id,
            source_organisation_id=observation.organisation_id,
            product_id=observation.product_id,
            category=observation.category,
            redacted_title=review.redacted_title,
            redacted_content=review.redacted_content,
            status=SharedLearningStatusEnum.PUBLISHED,
            published_by_user_id=user.id,
            published_at=datetime.now(timezone.utc),
        )
        self.db.add(entry)
        self.db.add(self._audit(
            actor=user, organisation_id=observation.organisation_id,
            action="shared_learning_published", resource_type="observation",
            resource_id=observation.id, outcome="success",
        ))
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def create_entitlement(self, user: User, organisation_id: uuid.UUID, product_id: uuid.UUID, is_active: bool):
        self._require_moderator(user)
        if not _active_memberships(user, RoleEnum.ADMIN):
            raise _http("FORBIDDEN", "Only administrators can manage product entitlements", 403)
        product_result = await self.db.execute(select(Product.id).where(Product.id == product_id))
        if not product_result.scalar_one_or_none():
            raise _http("PRODUCT_NOT_FOUND", "Product not found", 404)
        organisation_result = await self.db.execute(
            select(Organisation.id).where(
                Organisation.id == organisation_id,
                Organisation.is_active.is_(True),
            )
        )
        if not organisation_result.scalar_one_or_none():
            raise _http("ORGANISATION_NOT_FOUND", "Organisation not found", 404)
        existing_result = await self.db.execute(
            select(OrganisationProductEntitlement).where(
                OrganisationProductEntitlement.organisation_id == organisation_id,
                OrganisationProductEntitlement.product_id == product_id,
            )
        )
        entitlement = existing_result.scalar_one_or_none()
        if entitlement:
            entitlement.is_active = is_active
        else:
            entitlement = OrganisationProductEntitlement(
                id=uuid.uuid4(),
                organisation_id=organisation_id,
                product_id=product_id,
                is_active=is_active,
            )
            self.db.add(entitlement)
        await self.db.flush()
        self.db.add(self._audit(
            actor=user, organisation_id=organisation_id,
            action="organisation_product_entitlement_changed",
            resource_type="organisation_product_entitlement",
            resource_id=entitlement.id, outcome="success",
            metadata={"product_id": str(product_id), "is_active": is_active},
        ))
        await self.db.commit()
        await self.db.refresh(entitlement)
        return entitlement

    async def _client_org_ids(self, user: User) -> list[uuid.UUID]:
        return [
            m.organisation_id for m in user.memberships
            if m.is_active
            and m.role == RoleEnum.CLIENT
            and m.organisation is not None
            and m.organisation.is_active
        ]

    async def _shared_entry_is_entitled(self, user: User, entry: SharedLearningEntry) -> bool:
        org_ids = await self._client_org_ids(user)
        if not org_ids:
            return False
        if entry.product_id is None:
            return True
        result = await self.db.execute(
            select(OrganisationProductEntitlement)
            .where(
                OrganisationProductEntitlement.organisation_id.in_(org_ids),
                OrganisationProductEntitlement.product_id == entry.product_id,
                OrganisationProductEntitlement.is_active.is_(True),
            )
        )
        return result.scalar_one_or_none() is not None

    def _entry_out(self, entry: SharedLearningEntry) -> dict:
        return {
            "id": entry.id,
            "product_id": entry.product_id,
            "category": entry.category,
            "title": entry.redacted_title,
            "content": entry.redacted_content,
            "status": entry.status,
            "published_at": entry.published_at,
            "updated_at": entry.updated_at,
        }

    async def list_shared(
        self, user: User, product_id: uuid.UUID | None, page: int, page_size: int
    ) -> tuple[list[dict], PaginationMeta]:
        org_ids = await self._client_org_ids(user)
        if not org_ids:
            raise _http("FORBIDDEN", "Insufficient permissions", 403)
        query = select(SharedLearningEntry).where(
            SharedLearningEntry.status == SharedLearningStatusEnum.PUBLISHED
        )
        entitled_product_ids = select(OrganisationProductEntitlement.product_id).where(
            OrganisationProductEntitlement.organisation_id.in_(org_ids),
            OrganisationProductEntitlement.is_active.is_(True),
        )
        query = query.where(
            SharedLearningEntry.product_id.is_(None)
            | SharedLearningEntry.product_id.in_(entitled_product_ids)
        )
        if product_id is not None:
            query = query.where(SharedLearningEntry.product_id == product_id)
        count_result = await self.db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar_one()
        result = await self.db.execute(
            query.order_by(SharedLearningEntry.published_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        output = []
        for entry in result.scalars().all():
            if await self._shared_entry_is_entitled(user, entry):
                output.append(self._entry_out(entry))
        meta = PaginationMeta(
            page=page, page_size=page_size, total=total,
            total_pages=max(1, -(-total // page_size)),
        )
        return output, meta

    async def get_shared(self, user: User, entry_id: uuid.UUID) -> dict:
        result = await self.db.execute(
            select(SharedLearningEntry).where(
                SharedLearningEntry.id == entry_id,
                SharedLearningEntry.status == SharedLearningStatusEnum.PUBLISHED,
            )
        )
        entry = result.scalar_one_or_none()
        if not entry or not await self._shared_entry_is_entitled(user, entry):
            raise _http("SHARED_LEARNING_NOT_FOUND", "Shared learning entry not found", 404)
        observation_result = await self.db.execute(
            select(Observation).where(
                Observation.id == entry.observation_id,
                Observation.consent_status == ConsentStatusEnum.GRANTED,
            )
        )
        if not observation_result.scalar_one_or_none():
            raise _http("SHARED_LEARNING_NOT_FOUND", "Shared learning entry not found", 404)
        return self._entry_out(entry)

    async def unpublish(self, user: User, entry_id: uuid.UUID, reason: str | None) -> SharedLearningEntry:
        self._require_moderator(user)
        result = await self.db.execute(
            select(SharedLearningEntry).where(SharedLearningEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()
        if not entry:
            raise _http("SHARED_LEARNING_NOT_FOUND", "Shared learning entry not found", 404)
        if entry.status == SharedLearningStatusEnum.UNPUBLISHED:
            raise _http("SHARED_LEARNING_ALREADY_UNPUBLISHED", "Entry is already unpublished", 409)
        entry.status = SharedLearningStatusEnum.UNPUBLISHED
        entry.unpublished_at = datetime.now(timezone.utc)
        self.db.add(self._audit(
            actor=user, organisation_id=entry.source_organisation_id,
            action="shared_learning_unpublished", resource_type="shared_learning_entry",
            resource_id=entry.id, outcome="success", metadata={"reason": reason} if reason else None,
        ))
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def create_improvement(
        self, user: User, body: ProductImprovementCreate
    ) -> ProductImprovement:
        self._require_product_owner(user, body.organisation_id)
        product_result = await self.db.execute(select(Product.id).where(Product.id == body.product_id))
        if not product_result.scalar_one_or_none():
            raise _http("PRODUCT_NOT_FOUND", "Product not found", 404)
        evidence_entries = []
        for entry_id in body.evidence_entry_ids:
            result = await self.db.execute(
                select(SharedLearningEntry).where(
                    SharedLearningEntry.id == entry_id,
                    SharedLearningEntry.status == SharedLearningStatusEnum.PUBLISHED,
                    SharedLearningEntry.product_id == body.product_id,
                )
            )
            entry = result.scalar_one_or_none()
            if not entry:
                raise _http("INELIGIBLE_EVIDENCE", "Evidence must be published and associated with the product", 409)
            observation_result = await self.db.execute(
                select(Observation.consent_status).where(Observation.id == entry.observation_id)
            )
            consent_status = observation_result.scalar_one_or_none()
            if consent_status != ConsentStatusEnum.GRANTED:
                raise _http("INELIGIBLE_EVIDENCE", "Evidence consent is not active", 409)
            evidence_entries.append(entry)
        improvement = ProductImprovement(
            id=uuid.uuid4(),
            title=body.title,
            description=body.description,
            product_id=body.product_id,
            organisation_id=body.organisation_id,
            status=ImprovementStatusEnum.PROPOSED,
            created_by_user_id=user.id,
        )
        self.db.add(improvement)
        await self.db.flush()
        for entry in evidence_entries:
            self.db.add(ProductImprovementEvidence(
                id=uuid.uuid4(),
                improvement_id=improvement.id,
                shared_learning_entry_id=entry.id,
            ))
        self.db.add(self._audit(
            actor=user,
            organisation_id=body.organisation_id,
            action="product_improvement_created",
            resource_type="product_improvement",
            resource_id=improvement.id,
            outcome="success",
            metadata={"evidence_count": len(evidence_entries), "product_id": str(body.product_id)},
        ))
        await self.db.commit()
        await self.db.refresh(improvement)
        return improvement

    async def list_improvements(
        self, user: User, product_id: uuid.UUID | None, page: int, page_size: int
    ):
        query = select(ProductImprovement)
        if product_id is not None:
            query = query.where(ProductImprovement.product_id == product_id)
        restricted_roles = {RoleEnum.ADMIN, RoleEnum.MODERATOR, RoleEnum.PRODUCT_OWNER, RoleEnum.EMPLOYEE}
        user_roles = {m.role for m in user.memberships if m.is_active}
        if not user_roles.intersection(restricted_roles):
            org_ids = {m.organisation_id for m in user.memberships if m.is_active and m.role == RoleEnum.CLIENT}
            if org_ids:
                query = query.where(
                    (ProductImprovement.organisation_id.is_(None))
                    | (ProductImprovement.organisation_id.in_(org_ids))
                )
            else:
                query = query.where(ProductImprovement.id == uuid.UUID(int=0))
        count_result = await self.db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar_one()
        result = await self.db.execute(
            query.order_by(ProductImprovement.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        improvements = result.scalars().all()
        output = []
        for improvement in improvements:
            evidence_result = await self.db.execute(
                select(ProductImprovementEvidence)
                .where(ProductImprovementEvidence.improvement_id == improvement.id)
            )
            evidence_output = []
            for link in evidence_result.scalars().all():
                entry_result = await self.db.execute(
                    select(SharedLearningEntry)
                    .where(SharedLearningEntry.id == link.shared_learning_entry_id)
                )
                entry = entry_result.scalar_one_or_none()
                active = bool(
                    entry and entry.status == SharedLearningStatusEnum.PUBLISHED
                )
                if active:
                    observation_result = await self.db.execute(
                        select(Observation.consent_status)
                        .where(Observation.id == entry.observation_id)
                    )
                    active = observation_result.scalar_one_or_none() == ConsentStatusEnum.GRANTED
                evidence_output.append(ImprovementEvidenceOut(
                    id=link.id,
                    shared_learning_entry_id=link.shared_learning_entry_id,
                    active=active,
                    title=entry.redacted_title if active and entry else None,
                    created_at=link.created_at,
                ))
            item = {
                "id": improvement.id,
                "title": improvement.title,
                "description": improvement.description,
                "product_id": improvement.product_id,
                "organisation_id": improvement.organisation_id,
                "status": improvement.status,
                "created_by_user_id": improvement.created_by_user_id,
                "created_at": improvement.created_at,
                "updated_at": improvement.updated_at,
                "evidence": evidence_output,
            }
            output.append(item)
        meta = PaginationMeta(
            page=page, page_size=page_size, total=total,
            total_pages=max(1, -(-total // page_size)),
        )
        return output, meta

    async def change_improvement_status(
        self, user: User, improvement_id: uuid.UUID, new_status: ImprovementStatusEnum, reason: str | None
    ):
        result = await self.db.execute(
            select(ProductImprovement).where(ProductImprovement.id == improvement_id)
        )
        improvement = result.scalar_one_or_none()
        if not improvement:
            raise _http("IMPROVEMENT_NOT_FOUND", "Product improvement not found", 404)
        self._require_product_owner(user, improvement.organisation_id)
        allowed = VALID_IMPROVEMENT_TRANSITIONS.get(improvement.status, set())
        if new_status not in allowed:
            raise _http(
                "INVALID_IMPROVEMENT_TRANSITION",
                f"Cannot transition from '{improvement.status.value}' to '{new_status.value}'",
                409,
            )
        improvement.status = new_status
        improvement.updated_at = datetime.now(timezone.utc)
        self.db.add(self._audit(
            actor=user, organisation_id=improvement.organisation_id,
            action="product_improvement_status_changed",
            resource_type="product_improvement", resource_id=improvement.id,
            outcome="success", metadata={"status": new_status.value, "reason": reason} if reason else {"status": new_status.value},
        ))
        await self.db.commit()
        await self.db.refresh(improvement)
        return improvement

    async def list_audit(self, user: User, page: int, page_size: int):
        self._require_moderator(user)
        count_result = await self.db.execute(select(func.count()).select_from(AuditEvent))
        total = count_result.scalar_one()
        result = await self.db.execute(
            select(AuditEvent).order_by(AuditEvent.created_at.desc())
            .offset((page - 1) * page_size).limit(page_size)
        )
        meta = PaginationMeta(
            page=page, page_size=page_size, total=total,
            total_pages=max(1, -(-total // page_size)),
        )
        return list(result.scalars().all()), meta
