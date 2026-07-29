"""add question description, required flag, and level scores

Revision ID: 8f1c4a9d2b6e
Revises: fccf88666efb
Create Date: 2026-07-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '8f1c4a9d2b6e'
down_revision: Union[str, Sequence[str], None] = 'fccf88666efb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("questions", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "questions",
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "questions",
        sa.Column("level_scores", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("questions", "level_scores")
    op.drop_column("questions", "is_required")
    op.drop_column("questions", "description")
