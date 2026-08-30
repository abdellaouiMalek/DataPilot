"""add published_by to regulatory_circulars (display name of the
super-admin who published, for the versions history view)

Revision ID: f3d9a6c2e8b1
Revises: e8c1b4a7f2d5
Create Date: 2026-08-07 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3d9a6c2e8b1'
down_revision: Union[str, Sequence[str], None] = 'e8c1b4a7f2d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "regulatory_circulars",
        sa.Column("published_by", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("regulatory_circulars", "published_by")
