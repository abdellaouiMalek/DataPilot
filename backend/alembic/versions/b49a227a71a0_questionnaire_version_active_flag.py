"""questionnaire version active flag

Marks which published version is currently applied to the live framework
tables. Until now that was implicitly "the newest one"; restoring an older
version has to be able to move the flag backwards without rewriting the log,
so it becomes explicit state.

Backfill: the highest-numbered version is the one currently live. The partial
unique index makes "at most one active version" a database guarantee rather
than an application convention.

Revision ID: b49a227a71a0
Revises: 0a9470caafce
Create Date: 2026-08-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b49a227a71a0'
down_revision: Union[str, Sequence[str], None] = '0a9470caafce'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "questionnaire_versions",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index(
        op.f("ix_questionnaire_versions_is_active"),
        "questionnaire_versions",
        ["is_active"],
        unique=False,
    )

    op.execute(
        """
        UPDATE questionnaire_versions
        SET is_active = true
        WHERE number = (SELECT MAX(number) FROM questionnaire_versions)
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX uq_questionnaire_versions_single_active
        ON questionnaire_versions (is_active)
        WHERE is_active
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS uq_questionnaire_versions_single_active")
    op.drop_index(
        op.f("ix_questionnaire_versions_is_active"), table_name="questionnaire_versions"
    )
    op.drop_column("questionnaire_versions", "is_active")
