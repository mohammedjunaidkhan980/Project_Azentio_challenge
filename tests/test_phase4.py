import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.membership import OrganisationMembership, RoleEnum
from app.models.observation import (
    ConsentStatusEnum,
    Observation,
    ObservationStatusEnum,
)
from app.models.organisation import Organisation
from app.models.phase4 import (
    AuditEvent,
    ImprovementStatusEnum,
    ModerationDecisionEnum,
    SharedLearningEntry,
    SharedLearningStatusEnum,
)
from app.models.product import Product
from app.models.user import User
from app.schemas.phase4 import (
    ImprovementStatusChange,
    ModerationDecision,
    ProductImprovementCreate,
)
from app.services.observation_service import ObservationService
from app.services.phase4_service import Phase4Service
from app.schemas.observations import ObservationCreate


async def _seed_membership(
    db: AsyncSession, role: RoleEnum, org: Organisation, email: str
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        full_name="Phase 4 User",
        hashed_password=hash_password("Pass123!"),
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.add(OrganisationMembership(
        id=uuid.uuid4(),
        user_id=user.id,
        organisation_id=org.id,
        role=role,
        is_active=True,
    ))
    await db.commit()
    await db.refresh(user, attribute_names=["memberships"])
    return user


async def _seed_org(db: AsyncSession, name: str = "Phase Four Org") -> Organisation:
    org = Organisation(
        id=uuid.uuid4(),
        name=name,
        slug=f"phase4-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(org)
    await db.commit()
    return org


async def _seed_product(db: AsyncSession) -> Product:
    product = Product(
        id=uuid.uuid4(),
        name=f"Product {uuid.uuid4().hex[:6]}",
        slug=f"product-{uuid.uuid4().hex[:8]}",
        description="Phase 4 test product",
        is_published=True,
    )
    db.add(product)
    await db.commit()
    return product


@pytest.mark.asyncio
async def test_moderation_approval_publish_and_retrieve(db_session: AsyncSession):
    org = await _seed_org(db_session)
    client = await _seed_membership(db_session, RoleEnum.CLIENT, org, "phase4-client@test.com")
    moderator = await _seed_membership(db_session, RoleEnum.MODERATOR, org, "phase4-mod@test.com")
    admin = await _seed_membership(db_session, RoleEnum.ADMIN, org, "phase4-admin@test.com")
    product = await _seed_product(db_session)

    observation = await ObservationService(db_session).create(
        client,
        ObservationCreate(
            organisation_id=org.id,
            title="Payment discrepancy",
            description="A payment was calculated incorrectly for this account.",
            product_id=product.id,
            category="billing",
        ),
    )
    consented = await ObservationService(db_session).grant_consent(
        client, observation.id, "Share anonymously"
    )
    assert consented.consent_status == "granted"

    review = await Phase4Service(db_session).decide_moderation(
        moderator,
        observation.id,
        ModerationDecision(
            decision=ModerationDecisionEnum.APPROVED,
            reason="Safe after redaction",
            redacted_title="Payment calculation issue",
            redacted_content="A payment calculation can differ from the approved amount.",
        ),
    )
    assert review.decision == ModerationDecisionEnum.APPROVED
    entry = await Phase4Service(db_session).publish(moderator, observation.id)
    assert entry.status == SharedLearningStatusEnum.PUBLISHED

    entitlement = await Phase4Service(db_session).create_entitlement(
        admin, org.id, product.id, True
    )
    assert entitlement.is_active is True
    shared, _ = await Phase4Service(db_session).list_shared(client, product.id, 1, 20)
    assert len(shared) == 1
    assert shared[0]["title"] == "Payment calculation issue"


@pytest.mark.asyncio
async def test_unauthorized_moderation_and_entitlement_rejected(db_session: AsyncSession):
    org = await _seed_org(db_session)
    client = await _seed_membership(db_session, RoleEnum.CLIENT, org, "phase4-client2@test.com")
    product = await _seed_product(db_session)
    observation = await ObservationService(db_session).create(
        client,
        ObservationCreate(
            organisation_id=org.id,
            title="Unauthorized test",
            description="This observation is used to verify authorization.",
        ),
    )

    with pytest.raises(Exception) as exc:
        await Phase4Service(db_session).decide_moderation(
            client,
            observation.id,
            ModerationDecision(
                decision=ModerationDecisionEnum.REJECTED,
                reason="Not allowed",
            ),
        )
    assert getattr(exc.value, "status_code", None) == 403

    with pytest.raises(Exception) as exc:
        await Phase4Service(db_session).create_entitlement(client, org.id, product.id, True)
    assert getattr(exc.value, "status_code", None) == 403


@pytest.mark.asyncio
async def test_withdrawal_unpublishes_shared_entry(db_session: AsyncSession):
    org = await _seed_org(db_session)
    client = await _seed_membership(db_session, RoleEnum.CLIENT, org, "phase4-withdraw@test.com")
    moderator = await _seed_membership(db_session, RoleEnum.MODERATOR, org, "phase4-withdraw-mod@test.com")

    created = await ObservationService(db_session).create(
        client,
        ObservationCreate(
            organisation_id=org.id,
            title="Withdrawal test",
            description="This observation will have consent withdrawn.",
        ),
    )
    await ObservationService(db_session).grant_consent(client, created.id, "Temporary consent")
    await Phase4Service(db_session).decide_moderation(
        moderator,
        created.id,
        ModerationDecision(
            decision=ModerationDecisionEnum.APPROVED,
            redacted_title="Safe withdrawal title",
            redacted_content="Safe redacted content for the withdrawal scenario.",
        ),
    )
    entry = await Phase4Service(db_session).publish(moderator, created.id)

    withdrawn = await ObservationService(db_session).withdraw_consent(
        client, created.id, "Withdrawal requested"
    )
    assert withdrawn.consent_status == "withdrawn"

    result = await db_session.execute(
        select(SharedLearningEntry).where(SharedLearningEntry.id == entry.id)
    )
    saved_entry = result.scalar_one()
    assert saved_entry.status == SharedLearningStatusEnum.UNPUBLISHED
    assert await db_session.scalar(
        select(AuditEvent.id).where(AuditEvent.action == "consent_withdrawn").limit(1)
    ) is not None


@pytest.mark.asyncio
async def test_improvement_evidence_and_status_change(db_session: AsyncSession):
    org = await _seed_org(db_session)
    client = await _seed_membership(db_session, RoleEnum.CLIENT, org, "phase4-evidence-client@test.com")
    moderator = await _seed_membership(db_session, RoleEnum.MODERATOR, org, "phase4-evidence-mod@test.com")
    owner = await _seed_membership(db_session, RoleEnum.PRODUCT_OWNER, org, "phase4-owner@test.com")
    product = await _seed_product(db_session)

    created = await ObservationService(db_session).create(
        client,
        ObservationCreate(
            organisation_id=org.id,
            title="Evidence source",
            description="Evidence for a product improvement.",
            product_id=product.id,
        ),
    )
    await ObservationService(db_session).grant_consent(client, created.id, None)
    await Phase4Service(db_session).decide_moderation(
        moderator,
        created.id,
        ModerationDecision(
            decision=ModerationDecisionEnum.APPROVED,
            redacted_title="Evidence title",
            redacted_content="Redacted evidence content for product improvement.",
        ),
    )
    entry = await Phase4Service(db_session).publish(moderator, created.id)
    improvement = await Phase4Service(db_session).create_improvement(
        owner,
        ProductImprovementCreate(
            title="Improve calculation",
            description="Adjust calculation behavior based on evidence.",
            product_id=product.id,
            organisation_id=org.id,
            evidence_entry_ids=[entry.id],
        ),
    )
    assert improvement.status == ImprovementStatusEnum.PROPOSED

    changed = await Phase4Service(db_session).change_improvement_status(
        owner, improvement.id, ImprovementStatusEnum.UNDER_REVIEW, "Starting review"
    )
    assert changed.status == ImprovementStatusEnum.UNDER_REVIEW


@pytest.mark.asyncio
async def test_shared_learning_requires_product_entitlement(db_session: AsyncSession):
    entitled_org = await _seed_org(db_session, "Entitled Phase 4 Org")
    other_org = await _seed_org(db_session, "Non-entitled Phase 4 Org")
    entitled_client = await _seed_membership(
        db_session, RoleEnum.CLIENT, entitled_org, "phase4-entitled@test.com"
    )
    other_client = await _seed_membership(
        db_session, RoleEnum.CLIENT, other_org, "phase4-other@test.com"
    )
    moderator = await _seed_membership(
        db_session, RoleEnum.MODERATOR, entitled_org, "phase4-entitle-mod@test.com"
    )
    admin = await _seed_membership(
        db_session, RoleEnum.ADMIN, entitled_org, "phase4-entitle-admin@test.com"
    )
    product = await _seed_product(db_session)

    created = await ObservationService(db_session).create(
        entitled_client,
        ObservationCreate(
            organisation_id=entitled_org.id,
            title="Entitlement source",
            description="This shared entry tests product entitlement access.",
            product_id=product.id,
        ),
    )
    await ObservationService(db_session).grant_consent(entitled_client, created.id, None)
    await Phase4Service(db_session).decide_moderation(
        moderator,
        created.id,
        ModerationDecision(
            decision=ModerationDecisionEnum.APPROVED,
            redacted_title="Entitlement-safe title",
            redacted_content="Entitlement-safe redacted content for this learning entry.",
        ),
    )
    entry = await Phase4Service(db_session).publish(moderator, created.id)
    await Phase4Service(db_session).create_entitlement(
        admin, entitled_org.id, product.id, True
    )

    entitled_shared, entitled_meta = await Phase4Service(db_session).list_shared(
        entitled_client, product.id, 1, 20
    )
    assert [item["id"] for item in entitled_shared] == [entry.id]
    assert entitled_meta.total == 1

    other_shared, other_meta = await Phase4Service(db_session).list_shared(
        other_client, product.id, 1, 20
    )
    assert other_shared == []
    assert other_meta.total == 0
    with pytest.raises(Exception) as exc:
        await Phase4Service(db_session).get_shared(other_client, entry.id)
    assert getattr(exc.value, "status_code", None) == 404
