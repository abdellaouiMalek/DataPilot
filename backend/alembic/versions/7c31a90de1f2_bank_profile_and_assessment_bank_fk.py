"""Bank profile columns + assessments.bank string -> bank_id FK.

- banks: add country, sector, contact, description, archived, created_at
- assessments: replace the free-text ``bank`` column with a ``bank_id`` FK.
  Existing rows are backfilled by exact name match; unmatched names get a new
  (inactive) bank row so no historical assessment is ever orphaned.

Revision ID: 7c31a90de1f2
Revises: 0eb7ddc9770a
Create Date: 2026-07-13
"""

from alembic import op
import sqlalchemy as sa

revision = "7c31a90de1f2"
down_revision = "0eb7ddc9770a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── banks: profile columns ────────────────────────────────────────────────
    op.add_column("banks", sa.Column("country", sa.String(100), nullable=False, server_default=""))
    op.add_column("banks", sa.Column("sector", sa.String(200), nullable=False, server_default=""))
    op.add_column("banks", sa.Column("contact", sa.String(200), nullable=True))
    op.add_column("banks", sa.Column("description", sa.Text(), nullable=False, server_default=""))
    op.add_column("banks", sa.Column("archived", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column(
        "banks",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
    )

    # ── assessments: bank (name) -> bank_id (FK) ─────────────────────────────
    op.add_column("assessments", sa.Column("bank_id", sa.Integer(), nullable=True))

    # Backfill 1: exact name match.
    op.execute(
        """
        UPDATE assessments a
        SET bank_id = b.id
        FROM banks b
        WHERE a.bank = b.name
        """
    )
    # Backfill 2: names not in the banks table become new inactive banks,
    # preserving history without polluting the public selector.
    op.execute(
        """
        INSERT INTO banks (name, sort_order, is_active, country, sector, description, archived)
        SELECT DISTINCT a.bank, 999, false, '', '', '', false
        FROM assessments a
        WHERE a.bank_id IS NULL AND a.bank IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE assessments a
        SET bank_id = b.id
        FROM banks b
        WHERE a.bank_id IS NULL AND a.bank = b.name
        """
    )

    op.alter_column("assessments", "bank_id", nullable=False)
    op.create_index(op.f("ix_assessments_bank_id"), "assessments", ["bank_id"])
    op.create_foreign_key(
        "fk_assessments_bank_id_banks",
        "assessments",
        "banks",
        ["bank_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_column("assessments", "bank")


def downgrade() -> None:
    op.add_column("assessments", sa.Column("bank", sa.String(200), nullable=True))
    op.execute(
        """
        UPDATE assessments a
        SET bank = b.name
        FROM banks b
        WHERE a.bank_id = b.id
        """
    )
    op.alter_column("assessments", "bank", nullable=False)
    op.drop_constraint("fk_assessments_bank_id_banks", "assessments", type_="foreignkey")
    op.drop_index(op.f("ix_assessments_bank_id"), table_name="assessments")
    op.drop_column("assessments", "bank_id")

    op.drop_column("banks", "created_at")
    op.drop_column("banks", "archived")
    op.drop_column("banks", "description")
    op.drop_column("banks", "contact")
    op.drop_column("banks", "sector")
    op.drop_column("banks", "country")
