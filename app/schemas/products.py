import re
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=100)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    is_published: bool = False

    @model_validator(mode="after")
    def set_slug(self) -> "ProductCreate":
        if not self.slug:
            self.slug = _slugify(self.name)
        elif not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", self.slug):
            raise ValueError("slug must be lowercase alphanumeric with hyphens only")
        return self


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    is_published: bool | None = None


class ProductOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    category: str | None
    is_published: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
