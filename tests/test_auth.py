import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.membership import OrganisationMembership, RoleEnum
from app.models.organisation import Organisation
from app.models.user import User


async def _seed_user(db: AsyncSession) -> User:
    org = Organisation(id=uuid.uuid4(), name="Acme Corp", slug="acme-corp")
    db.add(org)
    user = User(
        id=uuid.uuid4(),
        email="alice@acme.com",
        full_name="Alice Smith",
        hashed_password=hash_password("SecurePass123!"),
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    membership = OrganisationMembership(
        id=uuid.uuid4(),
        user_id=user.id,
        organisation_id=org.id,
        role=RoleEnum.CLIENT,
        is_active=True,
    )
    db.add(membership)
    await db.commit()
    return user


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    response = await client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong"})
    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, db_session: AsyncSession):
    await _seed_user(db_session)
    response = await client.post("/api/v1/auth/login", json={"email": "alice@acme.com", "password": "SecurePass123!"})
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "access_token" in body["data"]
    assert "refresh_token" in body["data"]
    # Ensure no password data leaks
    assert "password" not in str(body)
    assert "hashed_password" not in str(body)


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient, db_session: AsyncSession):
    user = await _seed_user(db_session)
    token = create_access_token(str(user.id))
    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["email"] == "alice@acme.com"
    assert body["data"]["memberships"][0]["role"] == "client"
    assert "hashed_password" not in str(body)


@pytest.mark.asyncio
async def test_me_invalid_token(client: AsyncClient):
    response = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, db_session: AsyncSession):
    await _seed_user(db_session)
    login = await client.post("/api/v1/auth/login", json={"email": "alice@acme.com", "password": "SecurePass123!"})
    refresh_token = login.json()["data"]["refresh_token"]
    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert response.json()["data"]["access_token"]


@pytest.mark.asyncio
async def test_public_registration_success(client: AsyncClient, db_session: AsyncSession):
    response = await client.post(
        "/api/v1/auth/register",
        json={"full_name": "New User", "email": "new.user@example.com", "password": "SecurePass123!"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert body["data"]["email"] == "new.user@example.com"
    assert body["data"]["memberships"] == []
    assert "hashed_password" not in str(body)

    result = await db_session.get(User, body["data"]["id"])
    assert result is not None
    assert verify_password("SecurePass123!", result.hashed_password)
    assert result.is_active is True
    assert result.is_verified is False


@pytest.mark.asyncio
async def test_public_registration_duplicate_and_extra_fields(client: AsyncClient, db_session: AsyncSession):
    await _seed_user(db_session)
    duplicate = await client.post(
        "/api/v1/auth/register",
        json={"full_name": "Duplicate", "email": "alice@acme.com", "password": "SecurePass123!"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "EMAIL_ALREADY_EXISTS"

    rejected = await client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Admin Attempt",
            "email": "attempt@example.com",
            "password": "SecurePass123!",
            "role": "admin",
        },
    )
    assert rejected.status_code == 422


@pytest.mark.asyncio
async def test_registered_user_can_login_without_membership(client: AsyncClient):
    registration = await client.post(
        "/api/v1/auth/register",
        json={"full_name": "No Org User", "email": "noorg@example.com", "password": "SecurePass123!"},
    )
    assert registration.status_code == 201

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "noorg@example.com", "password": "SecurePass123!"},
    )
    assert login.status_code == 200
