import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.membership import OrganisationMembership, RoleEnum
from app.models.observation import Observation, ConsentStatusEnum
from app.models.organisation import Organisation
from app.models.product import Product
from app.models.user import User


async def _seed_user(
    db: AsyncSession, role: RoleEnum, email: str, org_name: str | None = None
) -> tuple[User, Organisation]:
    org = Organisation(
        id=uuid.uuid4(),
        name=org_name or f"Org {uuid.uuid4().hex[:6]}",
        slug=f"org-{uuid.uuid4().hex[:8]}",
    )
    db.add(org)
    user = User(
        id=uuid.uuid4(),
        email=email,
        full_name="Test User",
        hashed_password=hash_password("Pass123!"),
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.add(
        OrganisationMembership(
            id=uuid.uuid4(),
            user_id=user.id,
            organisation_id=org.id,
            role=role,
            is_active=True,
        )
    )
    await db.commit()
    await db.refresh(user, attribute_names=["memberships"])
    return user, org


def _auth(user: User) -> dict:
    token = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


VALID_PAYLOAD = {
    "title": "Incorrect invoice calculation",
    "description": "The invoice total differed from the approved tax calculation.",
    "category": "billing",
}


@pytest.mark.asyncio
async def test_observation_endpoints_require_authentication(client: AsyncClient):
    response = await client.post(
        "/api/v1/observations",
        json={**VALID_PAYLOAD, "organisation_id": str(uuid.uuid4())},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_observation_success(client: AsyncClient, db_session: AsyncSession):
    user, org = await _seed_user(db_session, RoleEnum.CLIENT, "observer@test.com")
    response = await client.post(
        "/api/v1/observations",
        json={**VALID_PAYLOAD, "organisation_id": str(org.id)},
        headers=_auth(user),
    )
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["organisation_id"] == str(org.id)
    assert data["created_by_user_id"] == str(user.id)
    assert data["status"] == "private"
    assert data["consent_status"] == "not_granted"

    result = await db_session.execute(select(Observation).where(Observation.id == uuid.UUID(data["id"])))
    assert result.scalar_one().organisation_id == org.id


@pytest.mark.asyncio
async def test_create_observation_invalid_input(client: AsyncClient, db_session: AsyncSession):
    user, org = await _seed_user(db_session, RoleEnum.CLIENT, "invalid@test.com")
    response = await client.post(
        "/api/v1/observations",
        json={"organisation_id": str(org.id), "title": "", "description": "short"},
        headers=_auth(user),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_create_with_other_organisation_forbidden(client: AsyncClient, db_session: AsyncSession):
    user, _ = await _seed_user(db_session, RoleEnum.CLIENT, "membership@test.com")
    _, other_org = await _seed_user(db_session, RoleEnum.CLIENT, "other@test.com")
    response = await client.post(
        "/api/v1/observations",
        json={**VALID_PAYLOAD, "organisation_id": str(other_org.id)},
        headers=_auth(user),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_list_and_get_only_owning_organisation(
    client: AsyncClient, db_session: AsyncSession
):
    owner, org = await _seed_user(db_session, RoleEnum.CLIENT, "owner@test.com")
    created = await client.post(
        "/api/v1/observations",
        json={**VALID_PAYLOAD, "organisation_id": str(org.id)},
        headers=_auth(owner),
    )
    observation_id = created.json()["data"]["id"]

    listed = await client.get(
        f"/api/v1/observations?organisation_id={org.id}", headers=_auth(owner)
    )
    assert listed.status_code == 200
    assert len(listed.json()["data"]) == 1

    fetched = await client.get(
        f"/api/v1/observations/{observation_id}", headers=_auth(owner)
    )
    assert fetched.status_code == 200
    assert fetched.json()["data"]["id"] == observation_id


@pytest.mark.asyncio
async def test_cross_organisation_get_rejected(client: AsyncClient, db_session: AsyncSession):
    owner, org = await _seed_user(db_session, RoleEnum.CLIENT, "private-owner@test.com")
    other, _ = await _seed_user(db_session, RoleEnum.CLIENT, "private-other@test.com")
    created = await client.post(
        "/api/v1/observations",
        json={**VALID_PAYLOAD, "organisation_id": str(org.id)},
        headers=_auth(owner),
    )
    observation_id = created.json()["data"]["id"]

    response = await client.get(
        f"/api/v1/observations/{observation_id}", headers=_auth(other)
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "OBSERVATION_NOT_FOUND"


@pytest.mark.asyncio
async def test_explicit_consent_grant_persists(client: AsyncClient, db_session: AsyncSession):
    user, org = await _seed_user(db_session, RoleEnum.CLIENT, "consent@test.com")
    created = await client.post(
        "/api/v1/observations",
        json={**VALID_PAYLOAD, "organisation_id": str(org.id)},
        headers=_auth(user),
    )
    observation_id = created.json()["data"]["id"]
    assert created.json()["data"]["consent_status"] == "not_granted"

    granted = await client.post(
        f"/api/v1/observations/{observation_id}/consent",
        json={"reason": "Approved for anonymised sharing"},
        headers=_auth(user),
    )
    assert granted.status_code == 200
    data = granted.json()["data"]
    assert data["consent_status"] == "granted"
    assert data["consent_granted_by_user_id"] == str(user.id)
    assert len(data["consent_events"]) == 1
    assert data["consent_events"][0]["action"] == "granted"

    fetched = await client.get(
        f"/api/v1/observations/{observation_id}", headers=_auth(user)
    )
    assert fetched.json()["data"]["consent_status"] == "granted"


@pytest.mark.asyncio
async def test_consent_unauthorized_role_rejected(client: AsyncClient, db_session: AsyncSession):
    owner, org = await _seed_user(db_session, RoleEnum.CLIENT, "consent-owner@test.com")
    employee, _ = await _seed_user(db_session, RoleEnum.EMPLOYEE, "consent-employee@test.com")
    created = await client.post(
        "/api/v1/observations",
        json={**VALID_PAYLOAD, "organisation_id": str(org.id)},
        headers=_auth(owner),
    )
    observation_id = created.json()["data"]["id"]
    response = await client.post(
        f"/api/v1/observations/{observation_id}/consent",
        json={"reason": "unauthorized"},
        headers=_auth(employee),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_consent_cross_organisation_rejected(client: AsyncClient, db_session: AsyncSession):
    owner, org = await _seed_user(db_session, RoleEnum.CLIENT, "cross-consent-owner@test.com")
    other, _ = await _seed_user(db_session, RoleEnum.CLIENT, "cross-consent-other@test.com")
    created = await client.post(
        "/api/v1/observations",
        json={**VALID_PAYLOAD, "organisation_id": str(org.id)},
        headers=_auth(owner),
    )
    observation_id = created.json()["data"]["id"]
    response = await client.post(
        f"/api/v1/observations/{observation_id}/consent",
        json={"reason": "not mine"},
        headers=_auth(other),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_consent_withdrawal_invalidates_status(client: AsyncClient, db_session: AsyncSession):
    user, org = await _seed_user(db_session, RoleEnum.CLIENT, "withdraw@test.com")
    created = await client.post(
        "/api/v1/observations",
        json={**VALID_PAYLOAD, "organisation_id": str(org.id)},
        headers=_auth(user),
    )
    observation_id = created.json()["data"]["id"]
    await client.post(
        f"/api/v1/observations/{observation_id}/consent",
        json={"reason": "initial consent"},
        headers=_auth(user),
    )
    withdrawn = await client.request(
        "DELETE",
        f"/api/v1/observations/{observation_id}/consent",
        json={"reason": "withdrawn by organisation"},
        headers=_auth(user),
    )
    assert withdrawn.status_code == 200
    data = withdrawn.json()["data"]
    assert data["consent_status"] == "withdrawn"
    assert data["consent_withdrawn_by_user_id"] == str(user.id)
    assert [event["action"] for event in data["consent_events"]] == ["granted", "withdrawn"]
