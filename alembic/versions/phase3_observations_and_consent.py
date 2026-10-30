"""phase3 observations and explicit consent

Revision ID: phase3_obs_consent
Revises: 72cef9ac2083
Create Date: 2026-10-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db.types import GUID


revision: str = "phase3_obs_consent"
down_revision: Union[str, None] = "72cef9ac2083"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "observations",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("product_id", GUID(), nullable=True),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("created_by_user_id", GUID(), nullable=False),
        sa.Column("organisation_id", GUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PRIVATE", "IN_REVIEW", name="observationstatusenum",
                    native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column(
            "consent_status",
            sa.Enum("NOT_GRANTED", "GRANTED", "WITHDRAWN", name="consentstatusenum",
                    native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("consent_granted_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("consent_granted_by_user_id", GUID(), nullable=True),
        sa.Column("consent_withdrawn_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("consent_withdrawn_by_user_id", GUID(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(["consent_granted_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["consent_withdrawn_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_observations_title", "observations", ["title"], unique=False)
    op.create_index("ix_observations_product_id", "observations", ["product_id"], unique=False)
    op.create_index("ix_observations_category", "observations", ["category"], unique=False)
    op.create_index("ix_observations_created_by_user_id", "observations", ["created_by_user_id"], unique=False)
    op.create_index("ix_observations_organisation_id", "observations", ["organisation_id"], unique=False)
    op.create_index("ix_observations_status", "observations", ["status"], unique=False)
    op.create_index("ix_observations_consent_status", "observations", ["consent_status"], unique=False)

    op.create_table(
        "observation_consent_events",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("observation_id", GUID(), nullable=False),
        sa.Column(
            "action",
            sa.Enum("NOT_GRANTED", "GRANTED", "WITHDRAWN", name="consentstatusenum",
                    native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("actor_user_id", GUID(), nullable=False),
        sa.Column("organisation_id", GUID(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(["observation_id"], ["observations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_observation_consent_events_observation_id", "observation_consent_events", ["observation_id"], unique=False)
    op.create_index("ix_observation_consent_events_action", "observation_consent_events", ["action"], unique=False)
    op.create_index("ix_observation_consent_events_actor_user_id", "observation_consent_events", ["actor_user_id"], unique=False)
    op.create_index("ix_observation_consent_events_organisation_id", "observation_consent_events", ["organisation_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_observation_consent_events_organisation_id", table_name="observation_consent_events")
    op.drop_index("ix_observation_consent_events_actor_user_id", table_name="observation_consent_events")
    op.drop_index("ix_observation_consent_events_action", table_name="observation_consent_events")
    op.drop_index("ix_observation_consent_events_observation_id", table_name="observation_consent_events")
    op.drop_table("observation_consent_events")

    op.drop_index("ix_observations_consent_status", table_name="observations")
    op.drop_index("ix_observations_status", table_name="observations")
    op.drop_index("ix_observations_organisation_id", table_name="observations")
    op.drop_index("ix_observations_created_by_user_id", table_name="observations")
    op.drop_index("ix_observations_category", table_name="observations")
    op.drop_index("ix_observations_product_id", table_name="observations")
    op.drop_index("ix_observations_title", table_name="observations")
    op.drop_table("observations")
