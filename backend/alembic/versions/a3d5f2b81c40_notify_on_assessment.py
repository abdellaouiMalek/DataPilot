"""notify on assessment instead of on publish

Publishing a questionnaire requires the super_admin role, so a "published"
notification could only ever tell the recipient about their own action.
Submitting an assessment is the opposite: it is done by respondents and is
invisible to the back-office until someone goes looking.

Dropped and re-added rather than renamed: the flag means something different
now, so carrying the old value across would be wrong.

Revision ID: a3d5f2b81c40
Revises: f1c73a5b920e
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a3d5f2b81c40'
down_revision: Union[str, Sequence[str], None] = 'f1c73a5b920e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("platform_settings", "notify_on_publish")
    op.add_column(
        "platform_settings",
        sa.Column(
            "notify_on_assessment",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("platform_settings", "notify_on_assessment")
    op.add_column(
        "platform_settings",
        sa.Column(
            "notify_on_publish", sa.Boolean(), server_default="false", nullable=False
        ),
    )
