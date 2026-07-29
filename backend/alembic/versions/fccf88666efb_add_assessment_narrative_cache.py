"""add assessment narrative cache

Revision ID: fccf88666efb
Revises: 116ec35e8d74
Create Date: 2026-07-27 23:00:43.787209

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fccf88666efb'
down_revision: Union[str, Sequence[str], None] = '116ec35e8d74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "assessments", sa.Column("narrative", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("assessments", "narrative")
