import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.observation import Observation


class ObservationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def _base_query(self):
        return select(Observation).options(selectinload(Observation.consent_events))

    async def create(self, observation: Observation) -> Observation:
        self._db.add(observation)
        await self._db.commit()
        await self._db.refresh(observation)
        return observation

    async def get_by_id(self, observation_id: uuid.UUID) -> Observation | None:
        result = await self._db.execute(
            self._base_query().where(Observation.id == observation_id)
        )
        return result.scalar_one_or_none()

    async def list_for_organisations(
        self, organisation_ids: list[uuid.UUID], page: int, page_size: int
    ) -> tuple[list[Observation], int]:
        if not organisation_ids:
            return [], 0
        count_result = await self._db.execute(
            select(func.count())
            .select_from(Observation)
            .where(Observation.organisation_id.in_(organisation_ids))
        )
        total = count_result.scalar_one()
        result = await self._db.execute(
            self._base_query()
            .where(Observation.organisation_id.in_(organisation_ids))
            .order_by(Observation.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def save(self, observation: Observation) -> Observation:
        self._db.add(observation)
        await self._db.commit()
        await self._db.refresh(observation, attribute_names=["consent_events"])
        return observation
