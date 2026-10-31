"""Read-only MySQL verification of a browser-created fictional enquiry."""
import argparse
import asyncio
import uuid
from sqlalchemy.engine import make_url
from sqlalchemy import select,func
from app.models.user import User
from app.models.membership import OrganisationMembership
from app.core.config import settings
from app.db.session import AsyncSessionLocal, engine
from app.models.demo_enquiry import DemoEnquiry


async def check(value, registration):
    url = make_url(settings.DATABASE_URL)
    assert settings.APP_ENV == "development" and url.drivername.startswith("mysql")
    assert url.host in {"127.0.0.1", "localhost"} and url.database == "azentio_dev"
    async with AsyncSessionLocal() as db:
        if registration:
            user = await db.get(User, uuid.UUID(registration))
            assert user and user.full_name == "Fictional Registration QA" and not user.is_verified
            assert user.hashed_password.startswith("$argon2")
            assert await db.scalar(select(func.count()).select_from(OrganisationMembership).where(OrganisationMembership.user_id == user.id)) == 0
            print("PASS MySQL: unverified fictional registration, hashed credential, no memberships")
            await engine.dispose()
            return
        row = await db.get(DemoEnquiry, uuid.UUID(value))
        assert row and row.organisation_name == "Harbour Bank QA Demo"
        assert row.work_email == "qa-reviewer@harbour-demo.example.com"
        assert "human approval for exceptions" in row.requirements
        assert row.status.value == "closed"
        print("PASS MySQL: fictional enquiry, exact question, offering reference and closed status persisted")
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--enquiry")
    parser.add_argument("--registration")
    args = parser.parse_args()
    assert bool(args.enquiry) != bool(args.registration)
    asyncio.run(check(args.enquiry, args.registration))
