"""add assessment keycloak_sub

Revision ID: dd51279e948c
Revises: d08e397b1467
Create Date: 2026-07-27 17:33:02.712127

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dd51279e948c'
down_revision: Union[str, Sequence[str], None] = 'd08e397b1467'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "assessments", sa.Column("keycloak_sub", sa.String(255), nullable=True)
    )
    op.create_index(
        op.f("ix_assessments_keycloak_sub"), "assessments", ["keycloak_sub"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_assessments_keycloak_sub"), table_name="assessments")
    op.drop_column("assessments", "keycloak_sub")
