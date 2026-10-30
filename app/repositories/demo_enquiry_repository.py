import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.demo_enquiry import DemoEnquiry


class DemoEnquiryRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, enquiry_id: uuid.UUID) -> DemoEnquiry | None:
        result = await self._db.execute(select(DemoEnquiry).where(DemoEnquiry.id == enquiry_id))
        return result.scalar_one_or_none()

    async def list_all(self, page: int, page_size: int) -> tuple[list[DemoEnquiry], int]:
        offset = (page - 1) * page_size
        q = select(DemoEnquiry)
        total = (await self._db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
        rows = (
            await self._db.execute(q.order_by(DemoEnquiry.created_at.desc()).offset(offset).limit(page_size))
        ).scalars().all()
        return list(rows), total

    async def create(self, enquiry: DemoEnquiry) -> DemoEnquiry:
        self._db.add(enquiry)
        await self._db.commit()
        await self._db.refresh(enquiry)
        return enquiry

    async def save(self, enquiry: DemoEnquiry) -> DemoEnquiry:
        await self._db.commit()
        await self._db.refresh(enquiry)
        return enquiry
