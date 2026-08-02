"""add regulatory circulars and impacts

Revision ID: d4f8b1a6c930
Revises: c3d7e2a9f4b1
Create Date: 2026-07-29 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4f8b1a6c930'
down_revision: Union[str, Sequence[str], None] = 'c3d7e2a9f4b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "regulatory_circulars",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(length=200), nullable=False),
        sa.Column("publication_date", sa.Date(), nullable=True),
        sa.Column(
            "theme", sa.String(length=300), nullable=False, server_default=""
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="En vigueur",
        ),
        sa.Column(
            "version", sa.String(length=20), nullable=False, server_default="v1"
        ),
        sa.Column("source_filename", sa.String(length=300), nullable=True),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column(
            "is_published", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_regulatory_circulars_id"),
        "regulatory_circulars",
        ["id"],
        unique=False,
    )

    op.create_table(
        "regulatory_impacts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("circular_id", sa.Integer(), nullable=False),
        sa.Column("requirement_text", sa.Text(), nullable=False),
        sa.Column("target_type", sa.String(length=30), nullable=False),
        sa.Column(
            "target_description",
            sa.String(length=300),
            nullable=False,
            server_default="",
        ),
        sa.Column("action", sa.String(length=20), nullable=True),
        sa.Column("edited_text", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["circular_id"], ["regulatory_circulars.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_regulatory_impacts_id"), "regulatory_impacts", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_regulatory_impacts_circular_id"),
        "regulatory_impacts",
        ["circular_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_regulatory_impacts_circular_id"), table_name="regulatory_impacts"
    )
    op.drop_index(op.f("ix_regulatory_impacts_id"), table_name="regulatory_impacts")
    op.drop_table("regulatory_impacts")
    op.drop_index(
        op.f("ix_regulatory_circulars_id"), table_name="regulatory_circulars"
    )
    op.drop_table("regulatory_circulars")
