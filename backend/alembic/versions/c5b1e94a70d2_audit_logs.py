"""audit logs

Append-only trail of back-office actions, read by the "Historique & logs"
page. Actor identity and entity labels are denormalized into the row on
purpose: users live in Keycloak and the entities themselves can be deleted,
so a join at read time would blank out history.

Indexes follow how the page queries: newest-first listing, plus filtering by
module and by status.

Revision ID: c5b1e94a70d2
Revises: 7d2ca4b90e18
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c5b1e94a70d2'
down_revision: Union[str, Sequence[str], None] = '7d2ca4b90e18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("actor_sub", sa.String(length=255), nullable=True),
        sa.Column("actor_name", sa.String(length=200), server_default="", nullable=False),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("module", sa.String(length=50), nullable=False),
        sa.Column("action", sa.String(length=300), nullable=False),
        sa.Column(
            "status", sa.String(length=20), server_default="Succès", nullable=False
        ),
        sa.Column("entity_type", sa.String(length=50), nullable=True),
        sa.Column("entity_id", sa.String(length=255), nullable=True),
        sa.Column("entity_label", sa.String(length=300), server_default="", nullable=False),
        sa.Column("before", sa.String(length=500), server_default="", nullable=False),
        sa.Column("after", sa.String(length=500), server_default="", nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=400), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_id"), "audit_logs", ["id"], unique=False)
    op.create_index(
        op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"], unique=False
    )
    op.create_index(op.f("ix_audit_logs_module"), "audit_logs", ["module"], unique=False)
    op.create_index(op.f("ix_audit_logs_status"), "audit_logs", ["status"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_audit_logs_status"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_module"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_created_at"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_id"), table_name="audit_logs")
    op.drop_table("audit_logs")
