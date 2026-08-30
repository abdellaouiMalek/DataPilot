"""add subdimension to regulatory_embeddings (shown to the LLM as a
candidate, so a new question can be attached to an existing sub-dimension)

Revision ID: e8c1b4a7f2d5
Revises: d4f7a2b9c3e1
Create Date: 2026-08-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8c1b4a7f2d5'
down_revision: Union[str, Sequence[str], None] = 'd4f7a2b9c3e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "regulatory_embeddings",
        sa.Column("subdimension", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("regulatory_embeddings", "subdimension")
