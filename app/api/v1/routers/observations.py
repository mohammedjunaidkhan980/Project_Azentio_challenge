import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_roles
from app.models.membership import RoleEnum
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.observations import ConsentChange, ObservationCreate, ObservationOut
from app.services.observation_service import ObservationService

router = APIRouter(prefix="/observations", tags=["Observations"])
_client = require_roles(RoleEnum.CLIENT)
DbDep = Annotated[AsyncSession, Depends(get_db)]
ClientDep = Annotated[User, Depends(_client)]


@router.post("", response_model=SuccessResponse[ObservationOut], status_code=201)
async def create_observation(body: ObservationCreate, db: DbDep, user: ClientDep):
    observation = await ObservationService(db).create(user, body)
    return SuccessResponse(message="Observation created", data=observation)


@router.get("", response_model=SuccessResponse[list[ObservationOut]])
async def list_observations(
    db: DbDep,
    user: ClientDep,
    organisation_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    observations, meta = await ObservationService(db).list(
        user, organisation_id, page, page_size
    )
    return SuccessResponse(
        message="Observations retrieved", data=observations, meta=meta.model_dump()
    )


@router.get("/{observation_id}", response_model=SuccessResponse[ObservationOut])
async def get_observation(
    observation_id: uuid.UUID, db: DbDep, user: ClientDep
):
    observation = await ObservationService(db).get(user, observation_id)
    return SuccessResponse(message="Observation retrieved", data=observation)


@router.post("/{observation_id}/consent", response_model=SuccessResponse[ObservationOut])
async def grant_consent(
    observation_id: uuid.UUID,
    db: DbDep,
    user: ClientDep,
    body: ConsentChange | None = None,
):
    observation = await ObservationService(db).grant_consent(
        user, observation_id, body.reason if body else None
    )
    return SuccessResponse(message="Consent granted", data=observation)


@router.delete("/{observation_id}/consent", response_model=SuccessResponse[ObservationOut])
async def withdraw_consent(
    observation_id: uuid.UUID,
    db: DbDep,
    user: ClientDep,
    body: ConsentChange | None = None,
):
    observation = await ObservationService(db).withdraw_consent(
        user, observation_id, body.reason if body else None
    )
    return SuccessResponse(message="Consent withdrawn", data=observation)
