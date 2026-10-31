import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.membership import OrganisationMembership, RoleEnum
from app.models.organisation import Organisation
from app.models.product import Product
from app.models.permission import PermissionGrant
from app.models.user import User


async def _seed_user_with_role(db: AsyncSession, role: RoleEnum, email: str = "user@test.com") -> User:
    org = Organisation(id=uuid.uuid4(), name="Test Org", slug=f"test-org-{uuid.uuid4().hex[:6]}")
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
    db.add(OrganisationMembership(
        id=uuid.uuid4(), user_id=user.id, organisation_id=org.id,
        role=role, is_active=True,
    ))
    if role == RoleEnum.ADMIN:
        # Existing publication tests use an explicitly granted fixture admin.
        membership = next(m for m in db.new if isinstance(m, OrganisationMembership))
        for action in ["publish", "unpublish"]:
            db.add(PermissionGrant(membership_id=membership.id, permission="products." + action,
                is_active=True, created_by_user_id=user.id))
    await db.commit()
    return user


async def _seed_product(db: AsyncSession, published: bool = True) -> Product:
    p = Product(
        id=uuid.uuid4(),
        name="AzentioCore",
        slug=f"azentio-core-{uuid.uuid4().hex[:6]}",
        description="Core platform",
        category="platform",
        is_published=published,
    )
    db.add(p)
    await db.commit()
    return p


def _auth(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


@pytest.mark.asyncio
async def test_employee_has_no_implicit_publishing_permission(client: AsyncClient, db_session: AsyncSession):
    user = await _seed_user_with_role(db_session, RoleEnum.EMPLOYEE)
    response = await client.post("/api/v1/products", headers=_auth(user), json={"name": "Forbidden product"})
    assert response.status_code == 403


# ── Public listing ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_products_empty(client: AsyncClient):
    r = await client.get("/api/v1/products")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"] == []


@pytest.mark.asyncio
async def test_list_products_returns_published_only(client: AsyncClient, db_session: AsyncSession):
    await _seed_product(db_session, published=True)
    await _seed_product(db_session, published=False)
    r = await client.get("/api/v1/products")
    assert r.status_code == 200
    assert len(r.json()["data"]) == 1


@pytest.mark.asyncio
async def test_get_product_found(client: AsyncClient, db_session: AsyncSession):
    p = await _seed_product(db_session, published=True)
    r = await client.get(f"/api/v1/products/{p.id}")
    assert r.status_code == 200
    assert r.json()["data"]["id"] == str(p.id)


@pytest.mark.asyncio
async def test_get_product_not_found(client: AsyncClient):
    r = await client.get(f"/api/v1/products/{uuid.uuid4()}")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "PRODUCT_NOT_FOUND"


@pytest.mark.asyncio
async def test_get_unpublished_product_returns_404(client: AsyncClient, db_session: AsyncSession):
    p = await _seed_product(db_session, published=False)
    r = await client.get(f"/api/v1/products/{p.id}")
    assert r.status_code == 404


# ── Admin create ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_product_as_admin(client: AsyncClient, db_session: AsyncSession):
    admin = await _seed_user_with_role(db_session, RoleEnum.ADMIN, "admin@test.com")
    r = await client.post(
        "/api/v1/products",
        json={"name": "New Product", "description": "desc", "is_published": False},
        headers=_auth(admin),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["success"] is True
    assert body["data"]["name"] == "New Product"
    assert body["data"]["slug"] == "new-product"
    assert body["data"]["is_published"] is False


@pytest.mark.asyncio
async def test_create_product_as_client_forbidden(client: AsyncClient, db_session: AsyncSession):
    client_user = await _seed_user_with_role(db_session, RoleEnum.CLIENT, "client@test.com")
    r = await client.post(
        "/api/v1/products",
        json={"name": "Hack", "is_published": True},
        headers=_auth(client_user),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_product_unauthenticated(client: AsyncClient):
    r = await client.post("/api/v1/products", json={"name": "Hack"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_create_product_slug_conflict(client: AsyncClient, db_session: AsyncSession):
    admin = await _seed_user_with_role(db_session, RoleEnum.ADMIN, "admin2@test.com")
    payload = {"name": "Conflict Product", "slug": "conflict-slug"}
    await client.post("/api/v1/products", json=payload, headers=_auth(admin))
    r = await client.post("/api/v1/products", json=payload, headers=_auth(admin))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "SLUG_CONFLICT"


# ── Admin update ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_product_as_admin(client: AsyncClient, db_session: AsyncSession):
    admin = await _seed_user_with_role(db_session, RoleEnum.ADMIN, "admin3@test.com")
    p = await _seed_product(db_session, published=True)
    r = await client.patch(
        f"/api/v1/products/{p.id}",
        json={"name": "Updated Name"},
        headers=_auth(admin),
    )
    assert r.status_code == 200
    assert r.json()["data"]["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_update_product_as_client_forbidden(client: AsyncClient, db_session: AsyncSession):
    client_user = await _seed_user_with_role(db_session, RoleEnum.CLIENT, "client2@test.com")
    p = await _seed_product(db_session)
    r = await client.patch(
        f"/api/v1/products/{p.id}",
        json={"name": "Hacked"},
        headers=_auth(client_user),
    )
    assert r.status_code == 403


# ── Deactivate ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deactivate_product(client: AsyncClient, db_session: AsyncSession):
    admin = await _seed_user_with_role(db_session, RoleEnum.ADMIN, "admin4@test.com")
    p = await _seed_product(db_session, published=True)
    r = await client.delete(f"/api/v1/products/{p.id}", headers=_auth(admin))
    assert r.status_code == 200
    assert r.json()["data"]["is_published"] is False
    # Confirm it no longer appears in public listing
    r2 = await client.get(f"/api/v1/products/{p.id}")
    assert r2.status_code == 404


@pytest.mark.asyncio
async def test_deactivate_nonexistent_product(client: AsyncClient, db_session: AsyncSession):
    admin = await _seed_user_with_role(db_session, RoleEnum.ADMIN, "admin5@test.com")
    r = await client.delete(f"/api/v1/products/{uuid.uuid4()}", headers=_auth(admin))
    assert r.status_code == 404
