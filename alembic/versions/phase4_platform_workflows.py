"""phase4 moderation sharing improvements audit

Revision ID: phase4_platform_workflows
Revises: phase3_obs_consent
Create Date: 2026-10-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.types import GUID


revision: str = "phase4_platform_workflows"
down_revision: Union[str, None] = "phase3_obs_consent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "moderation_reviews",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("observation_id", GUID(), nullable=False),
        sa.Column("reviewer_user_id", GUID(), nullable=False),
        sa.Column("decision", sa.Enum("APPROVED", "REJECTED", name="moderationdecisionenum", native_enum=False, length=32), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("redacted_title", sa.String(length=255), nullable=True),
        sa.Column("redacted_content", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(["observation_id"], ["observations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("observation_id", name="uq_moderation_observation"),
    )
    op.create_index("ix_moderation_reviews_observation_id", "moderation_reviews", ["observation_id"], unique=False)
    op.create_index("ix_moderation_reviews_reviewer_user_id", "moderation_reviews", ["reviewer_user_id"], unique=False)
    op.create_index("ix_moderation_reviews_decision", "moderation_reviews", ["decision"], unique=False)

    op.create_table(
        "shared_learning_entries",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("observation_id", GUID(), nullable=False),
        sa.Column("source_organisation_id", GUID(), nullable=False),
        sa.Column("product_id", GUID(), nullable=True),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("redacted_title", sa.String(length=255), nullable=False),
        sa.Column("redacted_content", sa.Text(), nullable=False),
        sa.Column("status", sa.Enum("PUBLISHED", "UNPUBLISHED", name="sharedlearningstatusenum", native_enum=False, length=32), nullable=False),
        sa.Column("published_by_user_id", GUID(), nullable=False),
        sa.Column("published_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("unpublished_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(["observation_id"], ["observations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_organisation_id"], ["organisations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["published_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("observation_id", name="uq_shared_learning_observation"),
    )
    op.create_index("ix_shared_learning_entries_observation_id", "shared_learning_entries", ["observation_id"], unique=False)
    op.create_index("ix_shared_learning_entries_source_organisation_id", "shared_learning_entries", ["source_organisation_id"], unique=False)
    op.create_index("ix_shared_learning_entries_product_id", "shared_learning_entries", ["product_id"], unique=False)
    op.create_index("ix_shared_learning_entries_category", "shared_learning_entries", ["category"], unique=False)
    op.create_index("ix_shared_learning_entries_status", "shared_learning_entries", ["status"], unique=False)

    op.create_table(
        "organisation_product_entitlements",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("organisation_id", GUID(), nullable=False),
        sa.Column("product_id", GUID(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organisation_id", "product_id", name="uq_org_product_entitlement"),
    )
    op.create_index("ix_organisation_product_entitlements_organisation_id", "organisation_product_entitlements", ["organisation_id"], unique=False)
    op.create_index("ix_organisation_product_entitlements_product_id", "organisation_product_entitlements", ["product_id"], unique=False)

    op.create_table(
        "product_improvements",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("product_id", GUID(), nullable=False),
        sa.Column("organisation_id", GUID(), nullable=True),
        sa.Column("status", sa.Enum("PROPOSED", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "REJECTED", name="improvementstatusenum", native_enum=False, length=32), nullable=False),
        sa.Column("created_by_user_id", GUID(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_improvements_product_id", "product_improvements", ["product_id"], unique=False)
    op.create_index("ix_product_improvements_organisation_id", "product_improvements", ["organisation_id"], unique=False)
    op.create_index("ix_product_improvements_status", "product_improvements", ["status"], unique=False)
    op.create_index("ix_product_improvements_created_by_user_id", "product_improvements", ["created_by_user_id"], unique=False)

    op.create_table(
        "product_improvement_evidence",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("improvement_id", GUID(), nullable=False),
        sa.Column("shared_learning_entry_id", GUID(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(["improvement_id"], ["product_improvements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shared_learning_entry_id"], ["shared_learning_entries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("improvement_id", "shared_learning_entry_id", name="uq_improvement_evidence"),
    )
    op.create_index("ix_product_improvement_evidence_improvement_id", "product_improvement_evidence", ["improvement_id"], unique=False)
    op.create_index("ix_product_improvement_evidence_shared_learning_entry_id", "product_improvement_evidence", ["shared_learning_entry_id"], unique=False)

    op.create_table(
        "audit_events",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("actor_user_id", GUID(), nullable=True),
        sa.Column("organisation_id", GUID(), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("resource_type", sa.String(length=100), nullable=False),
        sa.Column("resource_id", GUID(), nullable=False),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_actor_user_id", "audit_events", ["actor_user_id"], unique=False)
    op.create_index("ix_audit_events_organisation_id", "audit_events", ["organisation_id"], unique=False)
    op.create_index("ix_audit_events_action", "audit_events", ["action"], unique=False)
    op.create_index("ix_audit_events_resource_type", "audit_events", ["resource_type"], unique=False)
    op.create_index("ix_audit_events_resource_id", "audit_events", ["resource_id"], unique=False)
    op.create_index("ix_audit_events_outcome", "audit_events", ["outcome"], unique=False)
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_index("ix_audit_events_outcome", table_name="audit_events")
    op.drop_index("ix_audit_events_resource_id", table_name="audit_events")
    op.drop_index("ix_audit_events_resource_type", table_name="audit_events")
    op.drop_index("ix_audit_events_action", table_name="audit_events")
    op.drop_index("ix_audit_events_organisation_id", table_name="audit_events")
    op.drop_index("ix_audit_events_actor_user_id", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_product_improvement_evidence_shared_learning_entry_id", table_name="product_improvement_evidence")
    op.drop_index("ix_product_improvement_evidence_improvement_id", table_name="product_improvement_evidence")
    op.drop_table("product_improvement_evidence")
    op.drop_index("ix_product_improvements_created_by_user_id", table_name="product_improvements")
    op.drop_index("ix_product_improvements_status", table_name="product_improvements")
    op.drop_index("ix_product_improvements_organisation_id", table_name="product_improvements")
    op.drop_index("ix_product_improvements_product_id", table_name="product_improvements")
    op.drop_table("product_improvements")
    op.drop_index("ix_organisation_product_entitlements_product_id", table_name="organisation_product_entitlements")
    op.drop_index("ix_organisation_product_entitlements_organisation_id", table_name="organisation_product_entitlements")
    op.drop_table("organisation_product_entitlements")
    op.drop_index("ix_shared_learning_entries_status", table_name="shared_learning_entries")
    op.drop_index("ix_shared_learning_entries_category", table_name="shared_learning_entries")
    op.drop_index("ix_shared_learning_entries_product_id", table_name="shared_learning_entries")
    op.drop_index("ix_shared_learning_entries_source_organisation_id", table_name="shared_learning_entries")
    op.drop_index("ix_shared_learning_entries_observation_id", table_name="shared_learning_entries")
    op.drop_table("shared_learning_entries")
    op.drop_index("ix_moderation_reviews_decision", table_name="moderation_reviews")
    op.drop_index("ix_moderation_reviews_reviewer_user_id", table_name="moderation_reviews")
    op.drop_index("ix_moderation_reviews_observation_id", table_name="moderation_reviews")
    op.drop_table("moderation_reviews")
