import uuid
from typing import Literal
from pydantic import BaseModel, ConfigDict

CataloguePermission = Literal["products.create", "products.edit", "products.publish", "products.unpublish"]


class PermissionGrantChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    membership_id: uuid.UUID
    permission: CataloguePermission
    is_active: bool = True
