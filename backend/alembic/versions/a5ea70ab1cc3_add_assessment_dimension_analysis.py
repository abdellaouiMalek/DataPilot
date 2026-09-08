"""add assessment dimension analysis

Cached LLM-authored per-dimension analysis, {dimension_name: text}. Same
compute-once-then-persist rationale as `assessments.narrative` (see
app.services.recommendation_engine.get_dimension_analysis); nullable since
it's unset until first computed.

Revision ID: a5ea70ab1cc3
Revises: c7afdeb9ebe4
Create Date: 2026-09-03 22:30:55.237567

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a5ea70ab1cc3'
down_revision: Union[str, Sequence[str], None] = 'c7afdeb9ebe4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'assessments',
        sa.Column('dimension_analysis', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('assessments', 'dimension_analysis')
