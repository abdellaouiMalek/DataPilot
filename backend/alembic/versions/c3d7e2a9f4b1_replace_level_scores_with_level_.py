"""replace level_scores with level_responses, add choice_options

Revision ID: c3d7e2a9f4b1
Revises: 8f1c4a9d2b6e
Create Date: 2026-07-29 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c3d7e2a9f4b1'
down_revision: Union[str, Sequence[str], None] = '8f1c4a9d2b6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("questions", "level_scores")
    op.add_column(
        "questions",
        sa.Column(
            "level_responses",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "questions",
        sa.Column(
            "choice_options",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("questions", "choice_options")
    op.drop_column("questions", "level_responses")
    op.add_column(
        "questions",
        sa.Column(
            "level_scores",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
