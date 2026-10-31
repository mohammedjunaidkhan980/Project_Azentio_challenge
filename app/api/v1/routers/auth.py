from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, decode_token
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, MembershipOut, RefreshRequest, RegisterRequest, TokenResponse, UserOut
from app.schemas.common import SuccessResponse
from app.services.auth_service import AuthService
from jose import JWTError
from fastapi import HTTPException, status
import uuid
from app.repositories.user_repository import UserRepository

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=SuccessResponse[UserOut], status_code=201)
async def register(body: RegisterRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    user = await AuthService(db).register(body)
    return SuccessResponse(
        message="Registration successful",
        data=UserOut(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at,
            memberships=[],
        ),
    )


@router.post("/login", response_model=SuccessResponse[TokenResponse], status_code=200)
async def login(body: LoginRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    tokens = await AuthService(db).login(body.email, body.password)
    return SuccessResponse(message="Login successful", data=tokens)


@router.post("/refresh", response_model=SuccessResponse[TokenResponse], status_code=200)
async def refresh(body: RefreshRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    _err = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "INVALID_TOKEN", "message": "Invalid or expired refresh token"},
    )
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise _err
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, ValueError):
        raise _err

    user = await UserRepository(db).get_by_id(user_id)
    if not user or not user.is_active or not user.is_verified:
        raise _err

    tokens = TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )
    return SuccessResponse(message="Token refreshed", data=tokens)


@router.get("/me", response_model=SuccessResponse[UserOut])
async def me(current_user: Annotated[User, Depends(get_current_user)]):
    memberships = [
        MembershipOut(
            organisation_id=m.organisation_id,
            organisation_name=m.organisation.name,
            role=m.role.value,
            is_active=m.is_active,
        )
        for m in current_user.memberships
        if m.is_active and m.organisation is not None and m.organisation.is_active
    ]
    user_out = UserOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        created_at=current_user.created_at,
        memberships=memberships,
    )
    return SuccessResponse(message="Current user retrieved", data=user_out)
