"""Idempotent synthetic fixtures for the explicitly isolated local MySQL demo.

Run from the repository root with --credentials-file pointing into a private,
ignored directory. Never prints credentials or resets an existing account.
"""
import argparse
import asyncio
import json
import secrets
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine
from app.models.membership import OrganisationMembership, RoleEnum
from app.models.organisation import Organisation
from app.models.product import Product
from app.models.user import User


async def seed(path: Path):
    url = make_url(settings.DATABASE_URL)
    if (settings.APP_ENV != "development" or url.host not in {"localhost", "127.0.0.1"}
            or url.database != "azentio_dev" or not url.drivername.startswith("mysql")):
        raise RuntimeError("Refusing fixtures outside loopback MySQL azentio_dev development DB")
    if path.suffix != ".json" or not path.parent.is_dir():
        raise RuntimeError("Provide an existing private directory and a JSON credentials path")
    saved = json.loads(path.read_text()) if path.exists() else {"users": {}, "organisations": {}}
    async with AsyncSessionLocal.begin() as db:
        for key, name in [("a", "Fictional Aurora Bank"), ("b", "Fictional Birch Finance"), ("c", "Fictional Cedar Credit")]:
            slug = "synthetic-demo-" + key
            org = await db.scalar(select(Organisation).where(Organisation.slug == slug))
            if org is None:
                org = Organisation(name=name + " (SYNTHETIC)", slug=slug, is_active=True)
                db.add(org)
                await db.flush()
            saved["organisations"][key] = str(org.id)
        admin = await db.scalar(select(User).join(OrganisationMembership).where(
            OrganisationMembership.role == RoleEnum.ADMIN).limit(1))
        for key, role, org_key in [("admin", RoleEnum.ADMIN, "a"), ("moderator", RoleEnum.MODERATOR, "a"),
                ("owner", RoleEnum.PRODUCT_OWNER, "a"), ("client_a", RoleEnum.CLIENT, "a"),
                ("peer_a", RoleEnum.CLIENT, "a"), ("client_b", RoleEnum.CLIENT, "b"),
                ("client_c", RoleEnum.CLIENT, "c")]:
            email = key.replace("_", "-") + "@azentio-demo.example.com"
            user = await db.scalar(select(User).where(User.email == email))
            if key == "admin" and admin is not None and user is None:
                print("Existing administrator preserved; no duplicate admin created")
                continue
            if user is None:
                password = secrets.token_urlsafe(24)
                user = User(email=email, full_name="SYNTHETIC " + key, hashed_password=hash_password(password),
                            is_active=True, is_verified=True)
                db.add(user)
                await db.flush()
                import uuid
                db.add(OrganisationMembership(user_id=user.id,
                    organisation_id=uuid.UUID(saved["organisations"][org_key]), role=role, is_active=True))
                saved["users"][key] = {"email": email, "password": password, "id": str(user.id),
                    "organisation_id": saved["organisations"][org_key]}
            elif key not in saved["users"]:
                raise RuntimeError("Existing synthetic account has no local credentials; refusing to reset it")
        product = await db.scalar(select(Product).where(Product.slug == "synthetic-demo-analysis"))
        if product is None:
            product = Product(name="SYNTHETIC Analysis", slug="synthetic-demo-analysis",
                description="Fictional local integration product. No customer data.", is_published=True)
            db.add(product)
            await db.flush()
        saved["product_id"] = str(product.id)
    path.write_text(json.dumps(saved, indent=2), encoding="utf-8")
    await engine.dispose()
    print("Synthetic demo provisioned; existing accounts preserved; credentials written only to private file")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials-file", type=Path, required=True)
    try:
        asyncio.run(seed(parser.parse_args().credentials_file))
    except SQLAlchemyError as error:
        # SQLAlchemy exception parameters may contain a password hash.
        print(f"Seed database operation failed ({type(error).__name__}); sensitive parameters suppressed")
        raise SystemExit(1) from None
