"""merge regulatory and framework/questionnaire branches

Revision ID: c274f6680a05
Revises: a2c7f9e1b4d6, a3d5f2b81c40
Create Date: 2026-08-31 14:29:19.904692

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c274f6680a05'
down_revision: Union[str, Sequence[str], None] = ('a2c7f9e1b4d6', 'a3d5f2b81c40')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
