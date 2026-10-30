from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.repositories.user_repository import UserRepository
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenResponse
from sqlalchemy.exc import IntegrityError
import uuid

_INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"},
)


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = UserRepository(db)

    async def login(self, email: str, password: str) -> TokenResponse:
        user = await self._repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise _INVALID_CREDENTIALS
        if not user.is_active:
            raise _INVALID_CREDENTIALS
        user_id = str(user.id)
        return TokenResponse(
            access_token=create_access_token(user_id),
            refresh_token=create_refresh_token(user_id),
        )

    async def register(self, body: RegisterRequest) -> User:
        existing = await self._repo.get_by_email(str(body.email).lower())
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_ALREADY_EXISTS", "message": "An account with this email already exists"},
            )

        user = User(
            id=uuid.uuid4(),
            email=str(body.email).lower(),
            full_name=body.full_name,
            hashed_password=hash_password(body.password),
            is_active=True,
            is_verified=False,
        )
        self._repo.db.add(user)
        try:
            await self._repo.db.commit()
        except IntegrityError:
            await self._repo.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_ALREADY_EXISTS", "message": "An account with this email already exists"},
            )
        await self._repo.db.refresh(user)
        return user
