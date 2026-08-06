"""add raw_text_original to regulatory_circulars (original-language full text)

Revision ID: b7e2f9a4c1d6
Revises: a1c4e6f2b8d3
Create Date: 2026-08-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e2f9a4c1d6'
down_revision: Union[str, Sequence[str], None] = 'a1c4e6f2b8d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "regulatory_circulars",
        sa.Column("raw_text_original", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("regulatory_circulars", "raw_text_original")
