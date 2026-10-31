import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_roles
from app.models.membership import RoleEnum
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.products import ProductCreate, ProductOut, ProductUpdate
from app.services.product_service import ProductService

router = APIRouter(prefix="/products", tags=["Products"])

_catalogue_admin = require_roles(RoleEnum.ADMIN)


@router.get("", response_model=SuccessResponse[list[ProductOut]])
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    products, meta = await ProductService(db).list_published(page, page_size)
    return SuccessResponse(message="Products retrieved", data=products, meta=meta.model_dump())


@router.get("/{product_id}", response_model=SuccessResponse[ProductOut])
async def get_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    product = await ProductService(db).get_published(product_id)
    return SuccessResponse(message="Product retrieved", data=product)


@router.post("", response_model=SuccessResponse[ProductOut], status_code=201)
async def create_product(
    body: ProductCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(_catalogue_admin)],
):
    product = await ProductService(db).create(body)
    return SuccessResponse(message="Product created", data=product)


@router.patch("/{product_id}", response_model=SuccessResponse[ProductOut])
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(_catalogue_admin)],
):
    product = await ProductService(db).update(product_id, body)
    return SuccessResponse(message="Product updated", data=product)


@router.delete("/{product_id}", response_model=SuccessResponse[ProductOut])
async def deactivate_product(
    product_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(_catalogue_admin)],
):
    product = await ProductService(db).deactivate(product_id)
    return SuccessResponse(message="Product deactivated", data=product)
