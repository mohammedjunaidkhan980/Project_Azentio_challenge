import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.products import ProductCreate, ProductOut, ProductUpdate
from app.services.product_service import ProductService
from app.services.product_permissions import ProductPermissions

router = APIRouter(prefix="/products", tags=["Products"])

def permitted(action):
    async def check(db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]):
        await ProductPermissions(db).require(user, action)
        return user
    return check



@router.get("", response_model=SuccessResponse[list[ProductOut]])
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    products, meta = await ProductService(db).list_published(page, page_size)
    return SuccessResponse(message="Products retrieved", data=products, meta=meta.model_dump())


@router.get("/access", response_model=SuccessResponse[dict])
async def product_access(db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(get_current_user)]):
    return SuccessResponse(message="Catalogue permissions retrieved", data=await ProductPermissions(db).capabilities(user))


@router.get("/managed", response_model=SuccessResponse[list[ProductOut]])
async def managed_products(db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(get_current_user)], page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=100)):
    if not any((await ProductPermissions(db).capabilities(user)).values()):
        raise HTTPException(status_code=403, detail={"code": "PERMISSION_REQUIRED", "message": "Catalogue access not granted"})
    products, meta = await ProductService(db).list_all(page, page_size)
    return SuccessResponse(message="Managed offerings retrieved", data=products, meta=meta.model_dump())


@router.get("/{product_id}", response_model=SuccessResponse[ProductOut])
async def get_product(product_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    product = await ProductService(db).get_published(product_id)
    return SuccessResponse(message="Product retrieved", data=product)


@router.post("", response_model=SuccessResponse[ProductOut], status_code=201)
async def create_product(
    body: ProductCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(permitted("create"))],
):
    product = await ProductService(db).create(body, actor)
    return SuccessResponse(message="Product created", data=product)


@router.patch("/{product_id}", response_model=SuccessResponse[ProductOut])
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(permitted("edit"))],
):
    product = await ProductService(db).update(product_id, body, actor)
    return SuccessResponse(message="Product updated", data=product)


@router.delete("/{product_id}", response_model=SuccessResponse[ProductOut])
async def deactivate_product(
    product_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(permitted("unpublish"))],
):
    product = await ProductService(db).deactivate(product_id, actor)
    return SuccessResponse(message="Product deactivated", data=product)

@router.post("/{product_id}/publish", response_model=SuccessResponse[ProductOut])
async def publish_product(product_id: uuid.UUID, db: Annotated[AsyncSession, Depends(get_db)], actor: Annotated[User, Depends(permitted("publish"))]):
    return SuccessResponse(message="Offering published", data=await ProductService(db).publish(product_id, actor))
