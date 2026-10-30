import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.demo_enquiry import DemoEnquiry, EnquiryStatusEnum
from app.repositories.demo_enquiry_repository import DemoEnquiryRepository
from app.schemas.common import PaginationMeta
from app.schemas.demo_enquiries import EnquiryCreate, EnquiryOut, VALID_TRANSITIONS


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "ENQUIRY_NOT_FOUND", "message": "Enquiry not found"},
    )


class DemoEnquiryService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = DemoEnquiryRepository(db)

    async def submit(self, data: EnquiryCreate) -> uuid.UUID:
        enquiry = DemoEnquiry(
            id=uuid.uuid4(),
            name=data.name,
            work_email=str(data.work_email),
            organisation_name=data.organisation_name,
            product_id=data.product_id,
            product_interest=data.product_interest,
            requirements=data.requirements,
            status=EnquiryStatusEnum.NEW,
        )
        saved = await self._repo.create(enquiry)
        return saved.id

    async def list_all(self, page: int, page_size: int) -> tuple[list[EnquiryOut], PaginationMeta]:
        enquiries, total = await self._repo.list_all(page, page_size)
        meta = PaginationMeta(page=page, page_size=page_size, total=total,
                              total_pages=max(1, -(-total // page_size)))
        return [EnquiryOut.model_validate(e) for e in enquiries], meta

    async def get(self, enquiry_id: uuid.UUID) -> EnquiryOut:
        enquiry = await self._repo.get_by_id(enquiry_id)
        if not enquiry:
            raise _not_found()
        return EnquiryOut.model_validate(enquiry)

    async def update_status(self, enquiry_id: uuid.UUID, new_status: EnquiryStatusEnum) -> EnquiryOut:
        enquiry = await self._repo.get_by_id(enquiry_id)
        if not enquiry:
            raise _not_found()
        allowed = VALID_TRANSITIONS.get(enquiry.status, set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "INVALID_STATUS_TRANSITION",
                    "message": f"Cannot transition from '{enquiry.status}' to '{new_status}'",
                },
            )
        enquiry.status = new_status
        saved = await self._repo.save(enquiry)
        return EnquiryOut.model_validate(saved)
