"""Read-only MySQL assertions for the opt-in presentation browser rehearsal."""
import argparse
import asyncio
import os
import uuid

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.db.session import AsyncSessionLocal, engine
from app.models.observation import Observation, ObservationConsentEvent
from app.models.phase4 import ModerationReview, ProductImprovement, ProductImprovementEvidence, SharedLearningEntry


async def verify(args):
    url = make_url(settings.DATABASE_URL)
    assert settings.APP_ENV == "development" and url.drivername.startswith("mysql")
    assert url.host in {"127.0.0.1", "localhost"} and url.database == "azentio_dev"
    async with AsyncSessionLocal() as db:
        original = await db.get(Observation, uuid.UUID(args.observation))
        assert original and original.description.startswith("FICTIONAL PRIVATE:")
        business = os.environ.get("AZENTIO_QA_BUSINESS_CASE") == "document-verification"
        if business:
            assert original.title == "Manual Loan Verification Delays"
            assert all(t in original.description for t in ("Business impact:", "Suggested improvement:", "Can Azentio introduce a document verification workflow", "human approval for exceptions"))
        expected = "not_granted" if args.phase == "created" else "withdrawn" if args.phase == "withdrawn" else "granted"
        assert original.consent_status.value == expected
        if args.phase != "created":
            events = (await db.scalars(select(ObservationConsentEvent).where(ObservationConsentEvent.observation_id == original.id))).all()
            assert any(e.action.value == "granted" and e.actor_user_id == original.created_by_user_id for e in events)
        if args.phase in {"published", "improved", "withdrawn"}:
            review = await db.scalar(select(ModerationReview).where(ModerationReview.observation_id == original.id))
            shared = await db.scalar(select(SharedLearningEntry).where(SharedLearningEntry.observation_id == original.id))
            assert review and review.decision.value == "approved" and shared
            assert shared.status.value == ("unpublished" if args.phase == "withdrawn" else "published")
            assert shared.redacted_content == review.redacted_content
            assert all(s not in shared.redacted_content for s in ("FICTIONAL PRIVATE", "H-17", "Morgan Lee"))
            assert original.description.startswith("FICTIONAL PRIVATE:")  # Original retained separately.
            if business:
                assert shared.redacted_title == "Reducing Manual Document Verification Delays"
                assert shared.redacted_content == "Financial institutions can experience operational delays when document verification involves repetitive manual checks. Automated document validation with human review for exceptions may help improve processing efficiency."
        if args.improvement:
            idea = await db.get(ProductImprovement, uuid.UUID(args.improvement))
            assert idea and idea.status.value == "under_review"
            evidence = await db.scalar(select(ProductImprovementEvidence).where(
                ProductImprovementEvidence.improvement_id == idea.id,
                ProductImprovementEvidence.shared_learning_entry_id == shared.id))
            assert evidence and idea.product_id == original.product_id
            if business:
                assert idea.title == "Automated Document Verification Workflow"
                assert "Business objective: Improve the efficiency of the loan application review process." in idea.description
        if args.phase == "withdrawn":
            assert any(e.action.value == "withdrawn" and e.actor_user_id == original.created_by_user_id for e in events)
            assert original.consent_withdrawn_at is not None and shared.unpublished_at is not None
        print("PASS MySQL persisted browser record:", args.phase)
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--observation", required=True)
    parser.add_argument("--phase", choices=["created", "granted", "published", "improved", "withdrawn"], required=True)
    parser.add_argument("--improvement")
    asyncio.run(verify(parser.parse_args()))
