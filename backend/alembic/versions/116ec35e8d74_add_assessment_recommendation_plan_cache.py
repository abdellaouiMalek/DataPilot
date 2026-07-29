"""add assessment recommendation plan cache

Revision ID: 116ec35e8d74
Revises: dd51279e948c
Create Date: 2026-07-27 21:39:02.972249

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '116ec35e8d74'
down_revision: Union[str, Sequence[str], None] = 'dd51279e948c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "assessment_recommendation_plans",
        sa.Column("assessment_id", sa.Integer(), nullable=False),
        sa.Column("plan", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["assessment_id"],
            ["assessments.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("assessment_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("assessment_recommendation_plans")
