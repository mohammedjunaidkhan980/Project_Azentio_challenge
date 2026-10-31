import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.user import User
from app.models.phase4 import AuditEvent
from app.services.product_permissions import ProductPermissions
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
        self.db = db

    def _audit(self, actor, action, product):
        if actor is not None:
            self.db.add(AuditEvent(actor_user_id=actor.id, organisation_id=None, action=action, resource_type="product", resource_id=product.id, outcome="success", metadata_json=None))

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

    async def create(self, data: ProductCreate, actor: User | None = None) -> ProductOut:
        if data.is_published:
            raise HTTPException(status_code=403, detail={"code": "PUBLICATION_ACTION_REQUIRED", "message": "Create a draft, then use the publication action"})
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
        self._audit(actor, "product.created", product)
        saved = await self._repo.create(product)
        return ProductOut.model_validate(saved)

    async def update(self, product_id: uuid.UUID, data: ProductUpdate, actor: User | None = None) -> ProductOut:
        product = await self._repo.get_by_id(product_id)
        if not product:
            raise _not_found()
        if data.is_published is not None:
            raise HTTPException(status_code=403, detail={"code": "PUBLICATION_ACTION_REQUIRED", "message": "Use the explicit publication or unpublication action"})
        if product.is_published and actor is not None:
            await ProductPermissions(self.db).require(actor, "publish")
        if data.name is not None:
            product.name = data.name
        if data.description is not None:
            product.description = data.description
        if data.category is not None:
            product.category = data.category
        self._audit(actor, "product.updated", product)
        saved = await self._repo.save(product)
        return ProductOut.model_validate(saved)

    async def deactivate(self, product_id: uuid.UUID, actor: User | None = None) -> ProductOut:
        product = await self._repo.get_by_id(product_id)
        if not product:
            raise _not_found()
        product.is_published = False
        self._audit(actor, "product.unpublished", product)
        saved = await self._repo.save(product)
        return ProductOut.model_validate(saved)

    async def publish(self, product_id: uuid.UUID, actor: User):
        product = await self._repo.get_by_id(product_id)
        if not product:
            raise _not_found()
        product.is_published = True
        self._audit(actor, "product.published", product)
        saved = await self._repo.save(product)
        return ProductOut.model_validate(saved)
