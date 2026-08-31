"""widen recommendation code column

Revision ID: bcfd4aa143e3
Revises: a551c14b4e74
Create Date: 2026-08-31 20:03:17.817490

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bcfd4aa143e3'
down_revision: Union[str, Sequence[str], None] = 'a551c14b4e74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "recommendations", "code",
        existing_type=sa.String(length=20),
        type_=sa.String(length=100),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "recommendations", "code",
        existing_type=sa.String(length=100),
        type_=sa.String(length=20),
        existing_nullable=False,
    )
