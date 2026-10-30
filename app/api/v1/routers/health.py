from fastapi import APIRouter
from app.schemas.common import SuccessResponse

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=SuccessResponse[dict])
async def health():
    return SuccessResponse(message="Service is healthy", data={"status": "ok"})
