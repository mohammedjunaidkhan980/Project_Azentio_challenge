import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.demo_enquiry import DemoEnquiry, EnquiryStatusEnum
from app.models.membership import OrganisationMembership, RoleEnum
from app.models.organisation import Organisation
from app.models.user import User


async def _seed_user_with_role(db: AsyncSession, role: RoleEnum, email: str) -> User:
    org = Organisation(id=uuid.uuid4(), name="Org", slug=f"org-{uuid.uuid4().hex[:6]}")
    db.add(org)
    user = User(
        id=uuid.uuid4(), email=email, full_name="Staff",
        hashed_password=hash_password("Pass123!"), is_active=True, is_verified=True,
    )
    db.add(user)
    db.add(OrganisationMembership(
        id=uuid.uuid4(), user_id=user.id, organisation_id=org.id,
        role=role, is_active=True,
    ))
    await db.commit()
    return user


async def _seed_enquiry(db: AsyncSession, status: EnquiryStatusEnum = EnquiryStatusEnum.NEW) -> DemoEnquiry:
    e = DemoEnquiry(
        id=uuid.uuid4(),
        name="Bob Jones",
        work_email="bob@example.com",
        organisation_name="Example Ltd",
        product_interest="AzentioCore",
        requirements="We need a demo of the core platform for our team.",
        status=status,
    )
    db.add(e)
    await db.commit()
    return e


def _auth(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


VALID_PAYLOAD = {
    "name": "Jane Doe",
    "work_email": "jane.doe@company.com",
    "organisation_name": "Company Ltd",
    "product_interest": "AzentioCore",
    "requirements": "We would like a full demo of the platform.",
}


# ── Public submit ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_enquiry_success(client: AsyncClient):
    r = await client.post("/api/v1/demo-enquiries", json=VALID_PAYLOAD)
    assert r.status_code == 201
    body = r.json()
    assert body["success"] is True
    assert "id" in body["data"]


@pytest.mark.asyncio
async def test_submit_enquiry_missing_field(client: AsyncClient):
    payload = {**VALID_PAYLOAD}
    del payload["work_email"]
    r = await client.post("/api/v1/demo-enquiries", json=payload)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_submit_enquiry_invalid_email(client: AsyncClient):
    r = await client.post("/api/v1/demo-enquiries", json={**VALID_PAYLOAD, "work_email": "not-an-email"})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_submit_enquiry_requirements_too_short(client: AsyncClient):
    r = await client.post("/api/v1/demo-enquiries", json={**VALID_PAYLOAD, "requirements": "short"})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_submit_enquiry_with_product_id(client: AsyncClient):
    r = await client.post("/api/v1/demo-enquiries", json={**VALID_PAYLOAD, "product_id": str(uuid.uuid4())})
    assert r.status_code == 201


# ── Staff list ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_enquiries_as_employee(client: AsyncClient, db_session: AsyncSession):
    staff = await _seed_user_with_role(db_session, RoleEnum.EMPLOYEE, "emp@test.com")
    await _seed_enquiry(db_session)
    r = await client.get("/api/v1/demo-enquiries", headers=_auth(staff))
    assert r.status_code == 200
    assert len(r.json()["data"]) >= 1


@pytest.mark.asyncio
async def test_list_enquiries_unauthenticated(client: AsyncClient):
    r = await client.get("/api/v1/demo-enquiries")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_enquiries_as_client_forbidden(client: AsyncClient, db_session: AsyncSession):
    client_user = await _seed_user_with_role(db_session, RoleEnum.CLIENT, "client@test.com")
    r = await client.get("/api/v1/demo-enquiries", headers=_auth(client_user))
    assert r.status_code == 403


# ── Staff get single ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_enquiry_as_staff(client: AsyncClient, db_session: AsyncSession):
    staff = await _seed_user_with_role(db_session, RoleEnum.ADMIN, "admin@test.com")
    e = await _seed_enquiry(db_session)
    r = await client.get(f"/api/v1/demo-enquiries/{e.id}", headers=_auth(staff))
    assert r.status_code == 200
    body = r.json()
    assert body["data"]["id"] == str(e.id)
    assert body["data"]["work_email"] == "bob@example.com"


@pytest.mark.asyncio
async def test_get_enquiry_not_found(client: AsyncClient, db_session: AsyncSession):
    staff = await _seed_user_with_role(db_session, RoleEnum.ADMIN, "admin2@test.com")
    r = await client.get(f"/api/v1/demo-enquiries/{uuid.uuid4()}", headers=_auth(staff))
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "ENQUIRY_NOT_FOUND"


# ── Status transitions ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_status_valid_transition(client: AsyncClient, db_session: AsyncSession):
    staff = await _seed_user_with_role(db_session, RoleEnum.EMPLOYEE, "emp2@test.com")
    e = await _seed_enquiry(db_session, EnquiryStatusEnum.NEW)
    r = await client.patch(
        f"/api/v1/demo-enquiries/{e.id}/status",
        json={"status": "in_review"},
        headers=_auth(staff),
    )
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "in_review"


@pytest.mark.asyncio
async def test_update_status_invalid_transition(client: AsyncClient, db_session: AsyncSession):
    staff = await _seed_user_with_role(db_session, RoleEnum.EMPLOYEE, "emp3@test.com")
    e = await _seed_enquiry(db_session, EnquiryStatusEnum.NEW)
    r = await client.patch(
        f"/api/v1/demo-enquiries/{e.id}/status",
        json={"status": "responded"},
        headers=_auth(staff),
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"


@pytest.mark.asyncio
async def test_update_status_unauthenticated(client: AsyncClient, db_session: AsyncSession):
    e = await _seed_enquiry(db_session)
    r = await client.patch(f"/api/v1/demo-enquiries/{e.id}/status", json={"status": "in_review"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_update_status_as_client_forbidden(client: AsyncClient, db_session: AsyncSession):
    client_user = await _seed_user_with_role(db_session, RoleEnum.CLIENT, "client2@test.com")
    e = await _seed_enquiry(db_session)
    r = await client.patch(
        f"/api/v1/demo-enquiries/{e.id}/status",
        json={"status": "in_review"},
        headers=_auth(client_user),
    )
    assert r.status_code == 403
