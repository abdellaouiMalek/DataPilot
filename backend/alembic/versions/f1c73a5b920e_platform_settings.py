"""platform settings

Single-row table for preferences the application itself owns. Everything
Keycloak already stores (session lifetimes, password policy, required
actions) stays in the realm and is deliberately not mirrored here.

The row is seeded on upgrade so the settings endpoint never has to deal with
"no row yet"; notifications start disabled with no recipient, which is the
only safe default for something that sends mail.

Revision ID: f1c73a5b920e
Revises: c5b1e94a70d2
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f1c73a5b920e'
down_revision: Union[str, Sequence[str], None] = 'c5b1e94a70d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("notify_email", sa.String(length=255), nullable=True),
        sa.Column(
            "notify_on_publish", sa.Boolean(), server_default="false", nullable=False
        ),
        sa.Column(
            "notify_on_new_user", sa.Boolean(), server_default="false", nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_by_name", sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        # One platform, one row.
        sa.CheckConstraint("id = 1", name="ck_platform_settings_singleton"),
    )
    op.execute("INSERT INTO platform_settings (id) VALUES (1)")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("platform_settings")
