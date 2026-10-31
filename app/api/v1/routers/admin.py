import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_roles
from app.models.membership import RoleEnum
from app.models.user import User
from app.models.organisation import Organisation
from app.schemas.permissions import PermissionGrantChange
from app.services.product_permissions import ProductPermissions
from app.schemas.admin import (
    AdminUserOut,
    MembershipAdminOut,
    MembershipCreate,
    MembershipUpdate,
    UserStatusUpdate,
)
from app.schemas.common import PaginationMeta, SuccessResponse
from app.services.admin_service import AdminService


router = APIRouter(prefix="/admin", tags=["Administration"])
DbDep = Annotated[AsyncSession, Depends(get_db)]
AdminDep = Annotated[User, Depends(require_roles(RoleEnum.ADMIN))]


def _membership_out(membership) -> MembershipAdminOut:
    return MembershipAdminOut(
        id=membership.id,
        organisation_id=membership.organisation_id,
        organisation_name=membership.organisation.name,
        role=membership.role,
        is_active=membership.is_active,
        joined_at=membership.joined_at,
    )


def _user_out(user: User) -> AdminUserOut:
    memberships = [_membership_out(m) for m in user.memberships]
    return AdminUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_verified=user.is_verified,
        created_at=user.created_at,
        updated_at=user.updated_at,
        memberships=memberships,
    )


@router.get("/users", response_model=SuccessResponse[list[AdminUserOut]])
async def list_users(
    db: DbDep,
    admin: AdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    users, meta = await AdminService(db).list_users(page, page_size)
    return SuccessResponse(
        message="Users retrieved",
        data=[_user_out(user) for user in users],
        meta=meta,
    )


@router.get("/users/{user_id}", response_model=SuccessResponse[AdminUserOut])
async def get_user(db: DbDep, admin: AdminDep, user_id: uuid.UUID = Path(...)):
    user = await AdminService(db).get_user(user_id)
    return SuccessResponse(message="User retrieved", data=_user_out(user))


@router.post("/users/{user_id}/memberships", response_model=SuccessResponse[MembershipAdminOut], status_code=201)
async def assign_membership(
    db: DbDep,
    admin: AdminDep,
    body: MembershipCreate,
    user_id: uuid.UUID = Path(...),
):
    membership = await AdminService(db).assign_membership(admin, user_id, body.organisation_id, body.role)
    return SuccessResponse(message="Membership assigned", data=_membership_out(membership))


@router.patch("/users/{user_id}/memberships/{membership_id}", response_model=SuccessResponse[MembershipAdminOut])
async def update_membership(
    db: DbDep,
    admin: AdminDep,
    body: MembershipUpdate,
    user_id: uuid.UUID = Path(...),
    membership_id: uuid.UUID = Path(...),
):
    membership = await AdminService(db).update_membership(
        admin, user_id, membership_id, body.role, body.is_active
    )
    return SuccessResponse(message="Membership updated", data=_membership_out(membership))


@router.delete("/users/{user_id}/memberships/{membership_id}", response_model=SuccessResponse[MembershipAdminOut])
async def revoke_membership(
    db: DbDep,
    admin: AdminDep,
    user_id: uuid.UUID = Path(...),
    membership_id: uuid.UUID = Path(...),
):
    membership = await AdminService(db).revoke_membership(admin, user_id, membership_id)
    return SuccessResponse(message="Membership revoked", data=_membership_out(membership))


@router.patch("/users/{user_id}/status", response_model=SuccessResponse[AdminUserOut])
async def update_user_status(
    db: DbDep,
    admin: AdminDep,
    body: UserStatusUpdate,
    user_id: uuid.UUID = Path(...),
):
    user = await AdminService(db).update_user_status(admin, user_id, body.is_active)
    return SuccessResponse(message="User status updated", data=_user_out(user))


@router.get("/users/{user_id}/product-access", response_model=SuccessResponse[dict])
async def user_product_access(user_id: uuid.UUID, db: DbDep, admin: AdminDep):
    return SuccessResponse(message="User product access retrieved", data=await ProductPermissions(db).user_access(await AdminService(db).get_user(user_id)))


@router.post("/users/{user_id}/permissions", response_model=SuccessResponse[dict])
async def change_permission(user_id: uuid.UUID, body: PermissionGrantChange, db: DbDep, admin: AdminDep):
    return SuccessResponse(message="Catalogue permission updated", data=await ProductPermissions(db).change_grant(admin, user_id, body.membership_id, body.permission, body.is_active))


@router.get("/organisations", response_model=SuccessResponse[list[dict]])
async def list_organisations(db: DbDep, admin: AdminDep):
    rows = (await db.scalars(select(Organisation).where(Organisation.is_active.is_(True)).order_by(Organisation.name))).all()
    return SuccessResponse(message="Organisations retrieved", data=[{"id": o.id, "name": o.name} for o in rows])
