"""merge recommendations and bank profile branches

Revision ID: d08e397b1467
Revises: 78af8b0673b4, 7c31a90de1f2
Create Date: 2026-07-27 13:42:51.369344

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd08e397b1467'
down_revision: Union[str, Sequence[str], None] = ('78af8b0673b4', '7c31a90de1f2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
