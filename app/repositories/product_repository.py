import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product


class ProductRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, product_id: uuid.UUID) -> Product | None:
        result = await self._db.execute(select(Product).where(Product.id == product_id))
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Product | None:
        result = await self._db.execute(select(Product).where(Product.slug == slug))
        return result.scalar_one_or_none()

    async def list_published(self, page: int, page_size: int) -> tuple[list[Product], int]:
        offset = (page - 1) * page_size
        q = select(Product).where(Product.is_published == True)
        total = (await self._db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
        rows = (await self._db.execute(q.order_by(Product.name).offset(offset).limit(page_size))).scalars().all()
        return list(rows), total

    async def list_all(self, page: int, page_size: int) -> tuple[list[Product], int]:
        offset = (page - 1) * page_size
        q = select(Product)
        total = (await self._db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
        rows = (await self._db.execute(q.order_by(Product.name).offset(offset).limit(page_size))).scalars().all()
        return list(rows), total

    async def create(self, product: Product) -> Product:
        self._db.add(product)
        await self._db.commit()
        await self._db.refresh(product)
        return product

    async def save(self, product: Product) -> Product:
        await self._db.commit()
        await self._db.refresh(product)
        return product
