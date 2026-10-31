import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.phase4 import (
    AuditEventOut,
    ImprovementStatusChange,
    ModerationDecision,
    ModerationQueueOut,
    ModerationReviewOut,
    OrganisationProductEntitlementCreate,
    ProductImprovementCreate,
    ProductImprovementOut,
    SharedLearningOut,
)
from app.services.phase4_service import Phase4Service


router = APIRouter(tags=["Phase 4"])
DbDep = Annotated[AsyncSession, Depends(get_db)]
UserDep = Annotated[User, Depends(get_current_user)]


@router.get("/moderation/observations", response_model=SuccessResponse[list[ModerationQueueOut]])
async def moderation_queue(
    db: DbDep,
    user: UserDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    items, meta = await Phase4Service(db).moderation_queue(user, page, page_size)
    return SuccessResponse(message="Moderation queue retrieved", data=items, meta=meta.model_dump())


@router.post("/moderation/observations/{observation_id}/decision", response_model=SuccessResponse[ModerationReviewOut])
async def moderation_decision(
    observation_id: uuid.UUID,
    body: ModerationDecision,
    db: DbDep,
    user: UserDep,
):
    review = await Phase4Service(db).decide_moderation(user, observation_id, body)
    return SuccessResponse(message="Moderation decision recorded", data=review)


@router.post("/moderation/observations/{observation_id}/publish", response_model=SuccessResponse[dict])
async def publish_observation(observation_id: uuid.UUID, db: DbDep, user: UserDep):
    entry = await Phase4Service(db).publish(user, observation_id)
    return SuccessResponse(message="Shared learning published", data={
        "id": entry.id,
        "observation_id": entry.observation_id,
        "status": entry.status.value,
        "published_at": entry.published_at,
    })


@router.post("/entitlements/product", response_model=SuccessResponse[dict])
async def create_product_entitlement(
    body: OrganisationProductEntitlementCreate,
    db: DbDep,
    user: UserDep,
):
    entitlement = await Phase4Service(db).create_entitlement(
        user, body.organisation_id, body.product_id, body.is_active
    )
    return SuccessResponse(message="Product entitlement updated", data={
        "id": entitlement.id,
        "organisation_id": entitlement.organisation_id,
        "product_id": entitlement.product_id,
        "is_active": entitlement.is_active,
    })


@router.get("/shared-learning", response_model=SuccessResponse[list[SharedLearningOut]])
async def list_shared_learning(
    db: DbDep,
    user: UserDep,
    product_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str = Query("", max_length=200),
):
    items, meta = await Phase4Service(db).list_shared(user, product_id, page, page_size, q)
    return SuccessResponse(message="Shared learning retrieved", data=items, meta=meta.model_dump())


@router.get("/learning-themes", response_model=SuccessResponse[list[dict]])
async def learning_themes(db: DbDep, user: UserDep, product_id: uuid.UUID | None = None):
    themes = await Phase4Service(db).list_themes(user, product_id)
    return SuccessResponse(message="Approved themes retrieved; unsafe cohorts suppressed", data=themes)


@router.get("/shared-learning/{entry_id}", response_model=SuccessResponse[SharedLearningOut])
async def get_shared_learning(entry_id: uuid.UUID, db: DbDep, user: UserDep):
    item = await Phase4Service(db).get_shared(user, entry_id)
    return SuccessResponse(message="Shared learning entry retrieved", data=item)


@router.delete("/shared-learning/{entry_id}", response_model=SuccessResponse[dict])
async def unpublish_shared_learning(
    entry_id: uuid.UUID,
    db: DbDep,
    user: UserDep,
    reason: str | None = Query(default=None, max_length=500),
):
    entry = await Phase4Service(db).unpublish(user, entry_id, reason)
    return SuccessResponse(message="Shared learning unpublished", data={
        "id": entry.id,
        "status": entry.status.value,
        "unpublished_at": entry.unpublished_at,
    })


@router.post("/product-improvements", response_model=SuccessResponse[dict], status_code=201)
async def create_improvement(
    body: ProductImprovementCreate,
    db: DbDep,
    user: UserDep,
):
    improvement = await Phase4Service(db).create_improvement(user, body)
    return SuccessResponse(message="Product improvement created", data={"id": improvement.id})


@router.get("/product-improvements", response_model=SuccessResponse[list[ProductImprovementOut]])
async def list_improvements(
    db: DbDep,
    user: UserDep,
    product_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    items, meta = await Phase4Service(db).list_improvements(user, product_id, page, page_size)
    return SuccessResponse(message="Product improvements retrieved", data=items, meta=meta.model_dump())


@router.patch("/product-improvements/{improvement_id}/status", response_model=SuccessResponse[dict])
async def change_improvement_status(
    improvement_id: uuid.UUID,
    body: ImprovementStatusChange,
    db: DbDep,
    user: UserDep,
):
    improvement = await Phase4Service(db).change_improvement_status(
        user, improvement_id, body.status, body.reason
    )
    return SuccessResponse(message="Product improvement status updated", data={
        "id": improvement.id,
        "status": improvement.status.value,
        "updated_at": improvement.updated_at,
    })


@router.get("/audit-events", response_model=SuccessResponse[list[AuditEventOut]])
async def list_audit_events(
    db: DbDep,
    user: UserDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    items, meta = await Phase4Service(db).list_audit(user, page, page_size)
    return SuccessResponse(message="Audit events retrieved", data=items, meta=meta.model_dump())
