import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.membership import OrganisationMembership, RoleEnum
from app.models.organisation import Organisation
from app.models.phase4 import AuditEvent
from app.models.user import User


def _error(code: str, message: str, status_code: int) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


class AdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _audit(
        self,
        actor: User,
        organisation_id: uuid.UUID | None,
        action: str,
        resource_type: str,
        resource_id: uuid.UUID,
        metadata: dict,
    ) -> AuditEvent:
        return AuditEvent(
            id=uuid.uuid4(),
            actor_user_id=actor.id,
            organisation_id=organisation_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome="success",
            metadata_json=json.dumps(metadata, separators=(",", ":")),
            created_at=datetime.now(timezone.utc),
        )

    async def list_users(self, page: int, page_size: int) -> tuple[list[User], dict]:
        count_result = await self.db.execute(select(func.count()).select_from(User))
        total = count_result.scalar_one()
        result = await self.db.execute(
            select(User)
            .options(
                selectinload(User.memberships).selectinload(OrganisationMembership.organisation)
            )
            .order_by(User.created_at.desc(), User.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        items = list(result.scalars().all())
        total_pages = max(1, (total + page_size - 1) // page_size)
        return items, {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        }

    async def get_user(self, user_id: uuid.UUID) -> User:
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.memberships).selectinload(OrganisationMembership.organisation))
            .where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise _error("USER_NOT_FOUND", "User not found", 404)
        return user

    async def assign_membership(
        self, actor: User, user_id: uuid.UUID, organisation_id: uuid.UUID, role: RoleEnum
    ) -> OrganisationMembership:
        user = await self.get_user(user_id)
        org_result = await self.db.execute(
            select(Organisation).where(Organisation.id == organisation_id)
        )
        organisation = org_result.scalar_one_or_none()
        if not organisation or not organisation.is_active:
            raise _error("ORGANISATION_NOT_FOUND", "Organisation not found", 404)

        duplicate_result = await self.db.execute(
            select(OrganisationMembership).where(
                OrganisationMembership.user_id == user_id,
                OrganisationMembership.organisation_id == organisation_id,
            )
        )
        if duplicate_result.scalar_one_or_none():
            raise _error("MEMBERSHIP_EXISTS", "Membership already exists for this user and organisation", 409)

        membership = OrganisationMembership(
            id=uuid.uuid4(),
            user_id=user.id,
            organisation_id=organisation.id,
            role=role,
            is_active=True,
        )
        self.db.add(membership)
        self.db.add(
            self._audit(
                actor=actor,
                organisation_id=organisation.id,
                action="membership.assigned",
                resource_type="organisation_membership",
                resource_id=membership.id,
                metadata={"user_id": str(user.id), "organisation_id": str(organisation.id), "role": role.value},
            )
        )
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            raise _error("MEMBERSHIP_EXISTS", "Membership already exists for this user and organisation", 409)
        await self.db.refresh(membership)
        membership.organisation = organisation
        return membership

    async def update_membership(
        self,
        actor: User,
        user_id: uuid.UUID,
        membership_id: uuid.UUID,
        role: RoleEnum | None,
        is_active: bool | None,
    ) -> OrganisationMembership:
        await self.get_user(user_id)
        result = await self.db.execute(
            select(OrganisationMembership)
            .options(selectinload(OrganisationMembership.organisation))
            .where(
                OrganisationMembership.id == membership_id,
                OrganisationMembership.user_id == user_id,
            )
        )
        membership = result.scalar_one_or_none()
        if not membership:
            raise _error("MEMBERSHIP_NOT_FOUND", "Membership not found", 404)

        if actor.id == user_id and membership.role == RoleEnum.ADMIN and (is_active is False or (role is not None and role != RoleEnum.ADMIN)):
            raise _error("CURRENT_ADMIN_REQUIRED", "Your current administrator membership cannot be removed here", 409)
        previous_role = membership.role.value
        previous_status = membership.is_active
        if role is not None:
            membership.role = role
        if is_active is not None:
            membership.is_active = is_active

        self.db.add(
            self._audit(
                actor=actor,
                organisation_id=membership.organisation_id,
                action="membership.updated",
                resource_type="organisation_membership",
                resource_id=membership.id,
                metadata={
                    "user_id": str(user_id),
                    "organisation_id": str(membership.organisation_id),
                    "previous_role": previous_role,
                    "role": membership.role.value,
                    "previous_is_active": previous_status,
                    "is_active": membership.is_active,
                },
            )
        )
        await self.db.commit()
        await self.db.refresh(membership)
        return membership

    async def revoke_membership(
        self, actor: User, user_id: uuid.UUID, membership_id: uuid.UUID
    ) -> OrganisationMembership:
        await self.get_user(user_id)
        result = await self.db.execute(
            select(OrganisationMembership)
            .options(selectinload(OrganisationMembership.organisation))
            .where(
                OrganisationMembership.id == membership_id,
                OrganisationMembership.user_id == user_id,
            )
        )
        membership = result.scalar_one_or_none()
        if not membership:
            raise _error("MEMBERSHIP_NOT_FOUND", "Membership not found", 404)

        if actor.id == user_id and membership.role == RoleEnum.ADMIN:
            raise _error("CURRENT_ADMIN_REQUIRED", "Your current administrator membership cannot be removed here", 409)
        membership.is_active = False
        self.db.add(
            self._audit(
                actor=actor,
                organisation_id=membership.organisation_id,
                action="membership.revoked",
                resource_type="organisation_membership",
                resource_id=membership.id,
                metadata={"user_id": str(user_id), "organisation_id": str(membership.organisation_id)},
            )
        )
        await self.db.commit()
        await self.db.refresh(membership)
        return membership

    async def update_user_status(self, actor: User, user_id: uuid.UUID, is_active: bool) -> User:
        user = await self.get_user(user_id)
        if actor.id == user_id and not is_active:
            raise _error("CURRENT_ADMIN_REQUIRED", "You cannot deactivate your own administrator account", 409)
        previous_status = user.is_active
        user.is_active = is_active
        self.db.add(
            self._audit(
                actor=actor,
                organisation_id=None,
                action="user.status.updated",
                resource_type="user",
                resource_id=user.id,
                metadata={
                    "previous_is_active": previous_status,
                    "is_active": is_active,
                },
            )
        )
        await self.db.commit()
        await self.db.refresh(user)
        return user
