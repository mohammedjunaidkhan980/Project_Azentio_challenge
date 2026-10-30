import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.membership import RoleEnum
from app.models.user import User
from app.repositories.user_repository import UserRepository

_bearer = HTTPBearer(auto_error=False)

_AUTH_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail={"code": "AUTHENTICATION_REQUIRED", "message": "Authentication required"},
    headers={"WWW-Authenticate": "Bearer"},
)

_FORBIDDEN = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail={"code": "FORBIDDEN", "message": "Insufficient permissions"},
)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not credentials:
        raise _AUTH_ERROR
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise _AUTH_ERROR
        user_id = uuid.UUID(payload["sub"])
    except (JWTError, ValueError, KeyError):
        raise _AUTH_ERROR

    user = await UserRepository(db).get_by_id(user_id)
    if not user or not user.is_active:
        raise _AUTH_ERROR
    return user


def require_roles(*roles: RoleEnum):
    """Returns a dependency that checks the user holds at least one of the given roles in any active membership."""

    async def _check(user: Annotated[User, Depends(get_current_user)]) -> User:
        user_roles = {m.role for m in user.memberships if m.is_active}
        if not user_roles.intersection(roles):
            raise _FORBIDDEN
        return user

    return _check
