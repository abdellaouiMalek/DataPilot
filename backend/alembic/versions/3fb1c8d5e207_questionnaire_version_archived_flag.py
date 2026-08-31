"""questionnaire version archived flag

Retires a published version from the log's default view without deleting it.

Until now a version was either the live one or not, so an obsolete or
mistakenly published snapshot stayed in the list for ever with equal weight.
``archived`` is the same end-of-life marker banks already use: the row and its
snapshot are kept intact (assessments may point at them), it is just hidden
from the default listing and cannot be the live version.

Revision ID: 3fb1c8d5e207
Revises: b49a227a71a0
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '3fb1c8d5e207'
down_revision: Union[str, Sequence[str], None] = 'b49a227a71a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "questionnaire_versions",
        sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"),
    )
    # "At most one live version" is already a database guarantee; make
    # "the live version is never archived" one too, so the two flags can
    # never disagree about what respondents are answering.
    op.create_check_constraint(
        "ck_questionnaire_versions_active_not_archived",
        "questionnaire_versions",
        "NOT (is_active AND archived)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_questionnaire_versions_active_not_archived",
        "questionnaire_versions",
        type_="check",
    )
    op.drop_column("questionnaire_versions", "archived")
