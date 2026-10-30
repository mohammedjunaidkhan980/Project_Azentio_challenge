import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.membership import OrganisationMembership, RoleEnum
from app.models.organisation import Organisation
from app.models.phase4 import AuditEvent
from app.models.user import User


async def _seed_admin_and_org(db: AsyncSession):
    org = Organisation(id=uuid.uuid4(), name="Admin Org", slug="admin-org", is_active=True)
    db.add(org)
    admin = User(
        id=uuid.uuid4(),
        email="admin@example.com",
        full_name="System Admin",
        hashed_password=hash_password("SecurePass123!"),
        is_active=True,
        is_verified=True,
    )
    db.add(admin)
    db.add(OrganisationMembership(
        id=uuid.uuid4(),
        user_id=admin.id,
        organisation_id=org.id,
        role=RoleEnum.ADMIN,
        is_active=True,
    ))
    await db.commit()
    return admin, org


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


@pytest.mark.asyncio
async def test_admin_list_detail_membership_lifecycle_and_audit(client: AsyncClient, db_session: AsyncSession):
    admin, org = await _seed_admin_and_org(db_session)
    user = User(
        id=uuid.uuid4(),
        email="member@example.com",
        full_name="Member User",
        hashed_password=hash_password("SecurePass123!"),
        is_active=True,
        is_verified=False,
    )
    db_session.add(user)
    await db_session.commit()

    headers = _auth(admin)
    listing = await client.get("/api/v1/admin/users", headers=headers)
    assert listing.status_code == 200
    assert listing.json()["meta"]["total"] == 2

    detail = await client.get(f"/api/v1/admin/users/{user.id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["data"]["memberships"] == []

    assigned = await client.post(
        f"/api/v1/admin/users/{user.id}/memberships",
        headers=headers,
        json={"organisation_id": str(org.id), "role": "client"},
    )
    assert assigned.status_code == 201
    membership_id = assigned.json()["data"]["id"]

    duplicate = await client.post(
        f"/api/v1/admin/users/{user.id}/memberships",
        headers=headers,
        json={"organisation_id": str(org.id), "role": "client"},
    )
    assert duplicate.status_code == 409

    updated = await client.patch(
        f"/api/v1/admin/users/{user.id}/memberships/{membership_id}",
        headers=headers,
        json={"role": "moderator", "is_active": True},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["role"] == "moderator"

    revoked = await client.delete(
        f"/api/v1/admin/users/{user.id}/memberships/{membership_id}",
        headers=headers,
    )
    assert revoked.status_code == 200
    assert revoked.json()["data"]["is_active"] is False

    audit_result = await db_session.execute(
        select(AuditEvent).where(AuditEvent.resource_id.in_([
            uuid.UUID(membership_id),
            user.id,
        ]))
    )
    audit_actions = {event.action for event in audit_result.scalars().all()}
    assert {"membership.assigned", "membership.updated", "membership.revoked"}.issubset(audit_actions)


@pytest.mark.asyncio
async def test_admin_user_status_and_duplicate_update_validation(client: AsyncClient, db_session: AsyncSession):
    admin, _ = await _seed_admin_and_org(db_session)
    user = User(
        id=uuid.uuid4(),
        email="status@example.com",
        full_name="Status User",
        hashed_password=hash_password("SecurePass123!"),
        is_active=True,
        is_verified=False,
    )
    db_session.add(user)
    await db_session.commit()
    headers = _auth(admin)

    deactivated = await client.patch(
        f"/api/v1/admin/users/{user.id}/status",
        headers=headers,
        json={"is_active": False},
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["data"]["is_active"] is False

    audit_result = await db_session.execute(select(AuditEvent).where(AuditEvent.resource_id == user.id))
    assert audit_result.scalar_one_or_none().action == "user.status.updated"

    invalid_role = await client.post(
        f"/api/v1/admin/users/{user.id}/memberships",
        headers=headers,
        json={"organisation_id": str(uuid.uuid4()), "role": "superadmin"},
    )
    assert invalid_role.status_code == 422

    empty_update = await client.patch(
        f"/api/v1/admin/users/{user.id}/memberships/{uuid.uuid4()}",
        headers=headers,
        json={},
    )
    assert empty_update.status_code == 422


@pytest.mark.asyncio
async def test_unauthorized_admin_access_and_no_membership_user(client: AsyncClient, db_session: AsyncSession):
    org = Organisation(id=uuid.uuid4(), name="Client Org", slug="client-org", is_active=True)
    db_session.add(org)
    client_user = User(
        id=uuid.uuid4(),
        email="client@example.com",
        full_name="Client User",
        hashed_password=hash_password("SecurePass123!"),
        is_active=True,
        is_verified=True,
    )
    db_session.add(client_user)
    db_session.add(OrganisationMembership(
        id=uuid.uuid4(),
        user_id=client_user.id,
        organisation_id=org.id,
        role=RoleEnum.CLIENT,
        is_active=True,
    ))
    no_membership = User(
        id=uuid.uuid4(),
        email="none@example.com",
        full_name="No Membership",
        hashed_password=hash_password("SecurePass123!"),
        is_active=True,
        is_verified=False,
    )
    db_session.add(no_membership)
    await db_session.commit()

    for user in (client_user, no_membership):
        response = await client.get("/api/v1/admin/users", headers=_auth(user))
        assert response.status_code == 403

    unauthenticated = await client.get("/api/v1/admin/users")
    assert unauthenticated.status_code == 401
