"""Add explicit catalogue action grants; no existing role/data is changed.

Revision ID: catalogue_permission_grants
Revises: phase4_platform_workflows
"""
from alembic import op
import sqlalchemy as sa
from app.db.types import GUID

revision = "catalogue_permission_grants"
down_revision = "phase4_platform_workflows"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("permission_grants",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("membership_id", GUID(), nullable=False),
        sa.Column("permission", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by_user_id", GUID(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(["membership_id"], ["organisation_memberships.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("membership_id", "permission", name="uq_membership_permission"))
    op.create_index("ix_permission_grants_membership_id", "permission_grants", ["membership_id"])


def downgrade():
    op.drop_index("ix_permission_grants_membership_id", table_name="permission_grants")
    op.drop_table("permission_grants")
