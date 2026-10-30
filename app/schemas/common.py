from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    details: list[Any] = []


class SuccessResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str
    data: T
    meta: dict[str, Any] = {}


class ErrorResponse(BaseModel):
    success: bool = False
    message: str
    error: ErrorDetail
    meta: dict[str, Any] = {}


class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int
