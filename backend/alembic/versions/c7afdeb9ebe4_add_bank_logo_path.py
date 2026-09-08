"""add bank logo path

Stores the filename of an uploaded logo (app/static/logos/<file>), nullable
since most banks won't have one right away. The public URL is derived from
this at read time (Bank.logo_url), not stored.

Revision ID: c7afdeb9ebe4
Revises: bcfd4aa143e3
Create Date: 2026-09-03 15:01:44.126706

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7afdeb9ebe4'
down_revision: Union[str, Sequence[str], None] = 'bcfd4aa143e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('banks', sa.Column('logo_path', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('banks', 'logo_path')
