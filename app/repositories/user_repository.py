import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.membership import OrganisationMembership
from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self.db = db

    def _base_query(self):
        return (
            select(User)
            .options(
                selectinload(User.memberships).selectinload(OrganisationMembership.organisation)
            )
        )

    async def get_by_email(self, email: str) -> User | None:
        result = await self._db.execute(self._base_query().where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self._db.execute(self._base_query().where(User.id == user_id))
        return result.scalar_one_or_none()
