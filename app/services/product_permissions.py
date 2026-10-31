import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.membership import OrganisationMembership, RoleEnum
from app.models.permission import PermissionGrant
from app.models.phase4 import AuditEvent, OrganisationProductEntitlement
from app.models.product import Product
from app.models.user import User

ACTIONS = ("create", "edit", "publish", "unpublish")


def denied():
    return HTTPException(status_code=403, detail={"code": "PERMISSION_REQUIRED", "message": "The required catalogue permission has not been granted"})


class ProductPermissions:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def capabilities(self, user: User) -> dict[str, bool]:
        memberships = [m for m in user.memberships if m.is_active and m.organisation is not None
                       and m.organisation.is_active and m.role in {RoleEnum.ADMIN, RoleEnum.EMPLOYEE}]
        explicit = set((await self.db.scalars(select(PermissionGrant.permission).where(
            PermissionGrant.membership_id.in_([m.id for m in memberships]), PermissionGrant.is_active.is_(True)))).all())
        admin = any(m.role == RoleEnum.ADMIN for m in memberships)
        return {a: (admin and a in {"create", "edit"}) or "products." + a in explicit for a in ACTIONS}

    async def require(self, user: User, action: str):
        if not (await self.capabilities(user)).get(action, False):
            raise denied()

    async def change_grant(self, actor: User, user_id: uuid.UUID, membership_id: uuid.UUID, permission: str, active: bool):
        membership = await self.db.scalar(select(OrganisationMembership).options(selectinload(OrganisationMembership.organisation))
            .where(OrganisationMembership.id == membership_id, OrganisationMembership.user_id == user_id))
        if membership is None:
            raise HTTPException(status_code=404, detail={"code": "MEMBERSHIP_NOT_FOUND", "message": "Membership not found"})
        target = await self.db.get(User, user_id)
        if active and (not target.is_active or not target.is_verified or not membership.is_active
                or not membership.organisation.is_active or membership.role not in {RoleEnum.ADMIN, RoleEnum.EMPLOYEE}):
            raise denied()
        grant = await self.db.scalar(select(PermissionGrant).where(PermissionGrant.membership_id == membership_id, PermissionGrant.permission == permission))
        if grant is None:
            grant = PermissionGrant(id=uuid.uuid4(), membership_id=membership_id, permission=permission,
                is_active=active, created_by_user_id=actor.id)
            self.db.add(grant)
        else:
            grant.is_active = active
        self.db.add(AuditEvent(actor_user_id=actor.id, organisation_id=membership.organisation_id,
            action="permission.granted" if active else "permission.revoked", resource_type="permission_grant",
            resource_id=grant.id, outcome="success", metadata_json=None))
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(status_code=409, detail={"code": "GRANT_CONFLICT", "message": "Permission changed concurrently; refresh and retry"}) from None
        return {"id": grant.id, "membership_id": membership_id, "permission": permission, "is_active": active}

    async def user_access(self, user: User):
        ids = [m.id for m in user.memberships]
        grants = (await self.db.scalars(select(PermissionGrant).where(PermissionGrant.membership_id.in_(ids)))).all()
        entitlements = (await self.db.execute(select(OrganisationProductEntitlement, Product.name).join(Product)
            .where(OrganisationProductEntitlement.organisation_id.in_([m.organisation_id for m in user.memberships])))).all()
        return {"grants": [{"id": g.id, "membership_id": g.membership_id, "permission": g.permission, "is_active": g.is_active} for g in grants],
            "entitlements": [{"organisation_id": e.organisation_id, "product_id": e.product_id,
                "product_name": name, "is_active": e.is_active} for e, name in entitlements]}
