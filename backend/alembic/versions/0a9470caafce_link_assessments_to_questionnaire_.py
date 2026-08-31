"""link assessments to questionnaire version

Stamps every assessment with the published questionnaire it was answered on.

Backfill rule: each existing row gets the version that was live when it was
submitted -- the newest version created at or before ``assessments.created_at``,
which is exactly the rule the submit endpoint applies going forward. Rows
predating the first publication keep ``NULL``: no snapshot describes what those
respondents actually saw, and inventing one would be worse than saying so.

Revision ID: 0a9470caafce
Revises: ce409218ed41
Create Date: 2026-08-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0a9470caafce'
down_revision: Union[str, Sequence[str], None] = 'ce409218ed41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("assessments", sa.Column("version_id", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_assessments_version_id"), "assessments", ["version_id"], unique=False
    )
    op.create_foreign_key(
        "fk_assessments_version_id_questionnaire_versions",
        "assessments",
        "questionnaire_versions",
        ["version_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.execute(
        """
        UPDATE assessments AS a
        SET version_id = (
            SELECT v.id
            FROM questionnaire_versions AS v
            WHERE v.created_at <= a.created_at
            ORDER BY v.created_at DESC
            LIMIT 1
        )
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "fk_assessments_version_id_questionnaire_versions",
        "assessments",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_assessments_version_id"), table_name="assessments")
    op.drop_column("assessments", "version_id")
