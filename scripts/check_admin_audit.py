"""Read-only MySQL evidence check after e2e-live/admin-management.spec.ts.

Requires AZENTIO_DEMO_CREDENTIALS pointing outside Git to the private synthetic
development fixture. Prints action counts only, never credentials or metadata.
"""
import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.db.session import AsyncSessionLocal, engine
from app.models.membership import OrganisationMembership
from app.models.permission import PermissionGrant
from app.models.phase4 import AuditEvent
from app.models.product import Product
from app.models.user import User


async def check():
    url = make_url(settings.DATABASE_URL)
    if url.host not in {"localhost", "127.0.0.1"} or url.database != "azentio_dev" or not url.drivername.startswith("mysql"):
        raise RuntimeError("This evidence check requires the loopback azentio_dev MySQL database")
    fixture = json.loads(Path(os.environ["AZENTIO_DEMO_CREDENTIALS"]).read_text())
    admin = uuid.UUID(fixture["users"]["admin"]["id"])
    employee = uuid.UUID(fixture["users"]["employee"]["id"])
    peer = uuid.UUID(fixture["users"]["peer_a"]["id"])
    async with AsyncSessionLocal() as db:
        assert await db.scalar(text("SELECT version_num FROM alembic_version")) == "catalogue_permission_grants"
        product = await db.scalar(select(Product).join(AuditEvent, AuditEvent.resource_id == Product.id)
            .where(Product.name.like("Portfolio Review Intelligence Demo %"), AuditEvent.action == "product.created",
                   AuditEvent.actor_user_id == employee).order_by(Product.created_at.desc()).limit(1))
        assert product is not None and not product.is_published
        actions = set((await db.scalars(select(AuditEvent.action).where(AuditEvent.resource_id == product.id,
            AuditEvent.actor_user_id == employee))).all())
        assert {"product.created", "product.updated", "product.published", "product.unpublished"} <= actions
        print("PASS MySQL persisted employee-attributed create/edit/publish/unpublish audit chain; test offering is unpublished")
        recent = datetime.now(timezone.utc) - timedelta(hours=1)
        for action in ("permission.granted", "permission.revoked", "membership.assigned", "membership.updated",
                       "membership.revoked", "user.status.updated", "organisation_product_entitlement_changed"):
            count = await db.scalar(select(func.count()).select_from(AuditEvent).where(
                AuditEvent.actor_user_id == admin, AuditEvent.action == action, AuditEvent.created_at >= recent))
            assert count > 0, action
            print("PASS MySQL recent administrator audit:", action, count)
        grants = (await db.scalars(select(PermissionGrant).join(OrganisationMembership)
            .where(OrganisationMembership.user_id == employee))).all()
        assert grants and all(not g.is_active for g in grants)
        user = await db.get(User, peer)
        assert user.is_active and user.is_verified
        active = (await db.scalars(select(OrganisationMembership).where(
            OrganisationMembership.user_id == peer, OrganisationMembership.is_active.is_(True)))).all()
        assert len(active) == 1 and str(active[0].organisation_id) == fixture["organisations"]["a"]
        assert await db.scalar(select(func.count()).select_from(Product).where(Product.is_published.is_(True))) == 3
        print("PASS test accounts restored; temporary employee grants revoked; three curated public offerings retained")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(check())
