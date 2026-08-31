"""recommendation draft question key

Revision ID: a551c14b4e74
Revises: c274f6680a05
Create Date: 2026-08-31 19:09:45.727567

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a551c14b4e74'
down_revision: Union[str, Sequence[str], None] = 'c274f6680a05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("recommendations", "question_id", nullable=True)
    op.add_column(
        "recommendations",
        sa.Column("draft_question_key", sa.String(length=80), nullable=True),
    )
    op.create_index(
        op.f("ix_recommendations_draft_question_key"),
        "recommendations", ["draft_question_key"],
    )
    op.create_check_constraint(
        "chk_question_or_draft",
        "recommendations",
        "(question_id IS NOT NULL) != (draft_question_key IS NOT NULL)",
    )
    op.create_index(
        "uq_draft_question_trigger",
        "recommendations",
        ["draft_question_key", "trigger_level"],
        unique=True,
        postgresql_where=sa.text("draft_question_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_draft_question_trigger", table_name="recommendations")
    op.drop_constraint("chk_question_or_draft", "recommendations", type_="check")
    op.drop_index(op.f("ix_recommendations_draft_question_key"), table_name="recommendations")
    op.drop_column("recommendations", "draft_question_key")
    op.alter_column("recommendations", "question_id", nullable=False)
