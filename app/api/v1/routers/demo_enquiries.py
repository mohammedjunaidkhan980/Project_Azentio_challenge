import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_roles
from app.models.membership import RoleEnum
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.demo_enquiries import EnquiryCreate, EnquiryOut, EnquiryStatusUpdate
from app.services.demo_enquiry_service import DemoEnquiryService

router = APIRouter(prefix="/demo-enquiries", tags=["Demo Enquiries"])

_staff = require_roles(RoleEnum.ADMIN, RoleEnum.EMPLOYEE, RoleEnum.MODERATOR)

DbDep = Annotated[AsyncSession, Depends(get_db)]
StaffDep = Annotated[User, Depends(_staff)]


@router.post("", response_model=SuccessResponse[dict], status_code=201)
async def submit_enquiry(body: EnquiryCreate, db: DbDep):
    enquiry_id = await DemoEnquiryService(db).submit(body)
    return SuccessResponse(message="Enquiry submitted successfully", data={"id": str(enquiry_id)})


@router.get("", response_model=SuccessResponse[list[EnquiryOut]])
async def list_enquiries(
    db: DbDep,
    _: StaffDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    enquiries, meta = await DemoEnquiryService(db).list_all(page, page_size)
    return SuccessResponse(message="Enquiries retrieved", data=enquiries, meta=meta.model_dump())


@router.get("/{enquiry_id}", response_model=SuccessResponse[EnquiryOut])
async def get_enquiry(enquiry_id: uuid.UUID, db: DbDep, _: StaffDep):
    enquiry = await DemoEnquiryService(db).get(enquiry_id)
    return SuccessResponse(message="Enquiry retrieved", data=enquiry)


@router.patch("/{enquiry_id}/status", response_model=SuccessResponse[EnquiryOut])
async def update_enquiry_status(
    enquiry_id: uuid.UUID, body: EnquiryStatusUpdate, db: DbDep, _: StaffDep
):
    enquiry = await DemoEnquiryService(db).update_status(enquiry_id, body.status)
    return SuccessResponse(message="Enquiry status updated", data=enquiry)
