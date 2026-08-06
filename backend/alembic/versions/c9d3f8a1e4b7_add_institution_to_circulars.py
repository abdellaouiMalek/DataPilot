"""add institution to regulatory_circulars (issuing authority, extracted)

Revision ID: c9d3f8a1e4b7
Revises: b7e2f9a4c1d6
Create Date: 2026-08-06 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d3f8a1e4b7'
down_revision: Union[str, Sequence[str], None] = 'b7e2f9a4c1d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "regulatory_circulars",
        sa.Column("institution", sa.String(length=300), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("regulatory_circulars", "institution")
