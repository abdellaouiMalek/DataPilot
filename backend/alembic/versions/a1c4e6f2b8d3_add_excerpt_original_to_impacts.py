"""add excerpt_original to regulatory_impacts (original-language traceability)

Revision ID: a1c4e6f2b8d3
Revises: f3a8d21c6e57
Create Date: 2026-08-05 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c4e6f2b8d3'
down_revision: Union[str, Sequence[str], None] = 'f3a8d21c6e57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "regulatory_impacts",
        sa.Column("excerpt_original", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("regulatory_impacts", "excerpt_original")
