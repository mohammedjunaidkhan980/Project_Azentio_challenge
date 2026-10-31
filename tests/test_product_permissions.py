import uuid

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.models.membership import OrganisationMembership, RoleEnum
from app.models.organisation import Organisation
from app.models.phase4 import AuditEvent
from app.models.user import User


async def seed(db, role):
    org = Organisation(id=uuid.uuid4(), name="Fictional Permission Org", slug="perm-" + uuid.uuid4().hex)
    user = User(id=uuid.uuid4(), email=uuid.uuid4().hex + "@example.com", full_name="Permission test user",
        hashed_password=hash_password("Nonfunctional-test-input"), is_active=True, is_verified=True)
    membership = OrganisationMembership(id=uuid.uuid4(), user_id=user.id, organisation_id=org.id, role=role, is_active=True)
    db.add_all([org, user, membership])
    await db.commit()
    return user, membership, org, {"Authorization": "Bearer " + create_access_token(str(user.id))}


@pytest.mark.asyncio
async def test_admin_draft_access_does_not_imply_publishing(client, db_session):
    admin, membership, org, headers = await seed(db_session, RoleEnum.ADMIN)
    caps = (await client.get("/api/v1/products/access", headers=headers)).json()["data"]
    assert caps == {"create": True, "edit": True, "publish": False, "unpublish": False}
    assert (await client.post("/api/v1/products", headers=headers, json={"name": "Forbidden direct publish", "is_published": True})).status_code == 403
    draft = await client.post("/api/v1/products", headers=headers, json={"name": "Draft offering"})
    assert draft.status_code == 201 and draft.json()["data"]["is_published"] is False
    pid = draft.json()["data"]["id"]
    assert (await client.post(f"/api/v1/products/{pid}/publish", headers=headers)).status_code == 403
    assert (await client.patch(f"/api/v1/products/{pid}", headers=headers, json={"is_published": True})).status_code == 403
    assert (await client.delete(f"/api/v1/products/{pid}", headers=headers)).status_code == 403
    assert (await client.get(f"/api/v1/products/{pid}")).status_code == 404


@pytest.mark.asyncio
async def test_explicit_actions_revocation_and_audit(client, db_session):
    admin, am, _, ah = await seed(db_session, RoleEnum.ADMIN)
    employee, em, org, eh = await seed(db_session, RoleEnum.EMPLOYEE)
    async def grant(action, active=True):
        r = await client.post(f"/api/v1/admin/users/{employee.id}/permissions", headers=ah,
            json={"membership_id": str(em.id), "permission": "products." + action, "is_active": active})
        assert r.status_code == 200
    assert (await client.get("/api/v1/products/managed", headers=eh)).status_code == 403
    await grant("create")
    r = await client.post("/api/v1/products", headers=eh, json={"name": "Permission controlled offering"})
    assert r.status_code == 201
    pid = r.json()["data"]["id"]
    assert (await client.patch(f"/api/v1/products/{pid}", headers=eh, json={"name": "No editing grant"})).status_code == 403
    assert (await client.post(f"/api/v1/products/{pid}/publish", headers=eh)).status_code == 403
    await grant("edit")
    assert (await client.patch(f"/api/v1/products/{pid}", headers=eh, json={"description": "Reviewed business description"})).status_code == 200
    await grant("publish")
    assert (await client.post(f"/api/v1/products/{pid}/publish", headers=eh)).status_code == 200
    await grant("publish", False)
    assert (await client.patch(f"/api/v1/products/{pid}", headers=eh, json={"description": "Live edit without publication grant"})).status_code == 403
    assert (await client.delete(f"/api/v1/products/{pid}", headers=eh)).status_code == 403
    await grant("unpublish")
    assert (await client.delete(f"/api/v1/products/{pid}", headers=eh)).status_code == 200
    assert (await client.get(f"/api/v1/products/{pid}")).status_code == 404
    org.is_active = False
    await db_session.commit()
    assert (await client.post("/api/v1/products", headers=eh, json={"name": "Inactive organisation"})).status_code == 403
    events = (await db_session.scalars(select(AuditEvent).where(AuditEvent.resource_id == uuid.UUID(pid)))).all()
    assert {e.action for e in events} >= {"product.created", "product.updated", "product.published", "product.unpublished"}


@pytest.mark.asyncio
async def test_grants_are_admin_only_and_membership_bound(client, db_session):
    admin, am, _, ah = await seed(db_session, RoleEnum.ADMIN)
    employee, em, _, eh = await seed(db_session, RoleEnum.EMPLOYEE)
    customer, cm, _, ch = await seed(db_session, RoleEnum.CLIENT)
    body = {"membership_id": str(em.id), "permission": "products.publish"}
    assert (await client.post(f"/api/v1/admin/users/{employee.id}/permissions", headers=eh, json=body)).status_code == 403
    assert (await client.post(f"/api/v1/admin/users/{customer.id}/permissions", headers=ah, json=body)).status_code == 404
    body["membership_id"] = str(cm.id)
    assert (await client.post(f"/api/v1/admin/users/{customer.id}/permissions", headers=ah, json=body)).status_code == 403
    body["permission"] = "invented.role"
    assert (await client.post(f"/api/v1/admin/users/{customer.id}/permissions", headers=ah, json=body)).status_code == 422
    assert (await client.get(f"/api/v1/admin/users/{employee.id}/product-access", headers=ch)).status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_remove_own_access(client, db_session):
    admin, membership, _, headers = await seed(db_session, RoleEnum.ADMIN)
    assert (await client.patch(f"/api/v1/admin/users/{admin.id}/status", headers=headers, json={"is_active": False})).status_code == 409
    assert (await client.delete(f"/api/v1/admin/users/{admin.id}/memberships/{membership.id}", headers=headers)).status_code == 409
