import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.repositories.product_repository import ProductRepository
from app.schemas.common import PaginationMeta
from app.schemas.products import ProductCreate, ProductOut, ProductUpdate


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "PRODUCT_NOT_FOUND", "message": "Product not found"},
    )


class ProductService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = ProductRepository(db)

    async def list_published(self, page: int, page_size: int) -> tuple[list[ProductOut], PaginationMeta]:
        products, total = await self._repo.list_published(page, page_size)
        meta = PaginationMeta(page=page, page_size=page_size, total=total,
                              total_pages=max(1, -(-total // page_size)))
        return [ProductOut.model_validate(p) for p in products], meta

    async def list_all(self, page: int, page_size: int) -> tuple[list[ProductOut], PaginationMeta]:
        products, total = await self._repo.list_all(page, page_size)
        meta = PaginationMeta(page=page, page_size=page_size, total=total,
                              total_pages=max(1, -(-total // page_size)))
        return [ProductOut.model_validate(p) for p in products], meta

    async def get_published(self, product_id: uuid.UUID) -> ProductOut:
        product = await self._repo.get_by_id(product_id)
        if not product or not product.is_published:
            raise _not_found()
        return ProductOut.model_validate(product)

    async def get_any(self, product_id: uuid.UUID) -> ProductOut:
        product = await self._repo.get_by_id(product_id)
        if not product:
            raise _not_found()
        return ProductOut.model_validate(product)

    async def create(self, data: ProductCreate) -> ProductOut:
        if await self._repo.get_by_slug(data.slug):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "SLUG_CONFLICT", "message": "A product with this slug already exists"},
            )
        product = Product(
            id=uuid.uuid4(),
            name=data.name,
            slug=data.slug,
            description=data.description,
            category=data.category,
            is_published=data.is_published,
        )
        saved = await self._repo.create(product)
        return ProductOut.model_validate(saved)

    async def update(self, product_id: uuid.UUID, data: ProductUpdate) -> ProductOut:
        product = await self._repo.get_by_id(product_id)
        if not product:
            raise _not_found()
        if data.name is not None:
            product.name = data.name
        if data.description is not None:
            product.description = data.description
        if data.category is not None:
            product.category = data.category
        if data.is_published is not None:
            product.is_published = data.is_published
        saved = await self._repo.save(product)
        return ProductOut.model_validate(saved)

    async def deactivate(self, product_id: uuid.UUID) -> ProductOut:
        product = await self._repo.get_by_id(product_id)
        if not product:
            raise _not_found()
        product.is_published = False
        saved = await self._repo.save(product)
        return ProductOut.model_validate(saved)
