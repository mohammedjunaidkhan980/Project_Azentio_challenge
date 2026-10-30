from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1 import router as v1_router
from app.core.config import settings
from app.schemas.common import ErrorDetail, ErrorResponse

app = FastAPI(
    title="Azentio.ai API",
    version="1.0.0",
    description="Intelligent Collaboration Portal — Backend API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.include_router(v1_router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(l) for l in e["loc"]), "msg": e["msg"]} for e in exc.errors()]
    body = ErrorResponse(
        message="Request validation failed",
        error=ErrorDetail(code="VALIDATION_ERROR", details=errors),
    )
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=body.model_dump())


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        body = ErrorResponse(
            message=detail.get("message", "An error occurred"),
            error=ErrorDetail(code=detail.get("code", "ERROR")),
        )
    else:
        body = ErrorResponse(message=str(detail), error=ErrorDetail(code="ERROR"))
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    body = ErrorResponse(
        message="An unexpected error occurred",
        error=ErrorDetail(code="INTERNAL_SERVER_ERROR"),
    )
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=body.model_dump())
