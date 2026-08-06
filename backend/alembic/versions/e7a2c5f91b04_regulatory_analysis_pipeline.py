"""regulatory analysis pipeline (async status, hash cache, structured impacts)

Revision ID: e7a2c5f91b04
Revises: d4f8b1a6c930
Create Date: 2026-08-02 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e7a2c5f91b04'
down_revision: Union[str, Sequence[str], None] = 'd4f8b1a6c930'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── regulatory_circulars: async analysis tracking + hash cache ──────────
    op.add_column(
        "regulatory_circulars",
        sa.Column("source_hash", sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f("ix_regulatory_circulars_source_hash"),
        "regulatory_circulars",
        ["source_hash"],
        unique=False,
    )
    op.add_column(
        "regulatory_circulars",
        sa.Column("detected_language", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "regulatory_circulars",
        sa.Column(
            "analysis_status",
            sa.String(length=20),
            nullable=False,
            server_default="en_attente",
        ),
    )
    op.add_column(
        "regulatory_circulars",
        sa.Column("analysis_error", sa.Text(), nullable=True),
    )
    # Nouveaux imports : plus de version/statut par defaut a la creation
    # (l'analyse n'a pas encore ete validee), remplace "v1"/"En vigueur".
    op.alter_column(
        "regulatory_circulars", "version", server_default="Brouillon"
    )
    op.alter_column(
        "regulatory_circulars", "status", server_default="Brouillon"
    )

    # ── regulatory_impacts: structured, catalog-grounded proposals ──────────
    op.add_column(
        "regulatory_impacts",
        sa.Column(
            "excerpt", sa.Text(), nullable=False, server_default=""
        ),
    )
    op.add_column(
        "regulatory_impacts",
        sa.Column("impact_type", sa.String(length=40), nullable=True),
    )
    op.execute(
        "UPDATE regulatory_impacts SET impact_type = 'nouvelle_recommandation' "
        "WHERE impact_type IS NULL"
    )
    op.alter_column("regulatory_impacts", "impact_type", nullable=False)
    op.add_column(
        "regulatory_impacts",
        sa.Column(
            "proposed_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.drop_column("regulatory_impacts", "target_type")
    op.drop_column("regulatory_impacts", "target_description")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "regulatory_impacts",
        sa.Column(
            "target_description",
            sa.String(length=300),
            nullable=False,
            server_default="",
        ),
    )
    op.add_column(
        "regulatory_impacts",
        sa.Column("target_type", sa.String(length=30), nullable=True),
    )
    op.execute(
        "UPDATE regulatory_impacts SET target_type = 'réglementaire' "
        "WHERE target_type IS NULL"
    )
    op.alter_column("regulatory_impacts", "target_type", nullable=False)
    op.drop_column("regulatory_impacts", "proposed_data")
    op.drop_column("regulatory_impacts", "impact_type")
    op.drop_column("regulatory_impacts", "excerpt")

    op.alter_column("regulatory_circulars", "status", server_default="En vigueur")
    op.alter_column("regulatory_circulars", "version", server_default="v1")
    op.drop_column("regulatory_circulars", "analysis_error")
    op.drop_column("regulatory_circulars", "analysis_status")
    op.drop_column("regulatory_circulars", "detected_language")
    op.drop_index(
        op.f("ix_regulatory_circulars_source_hash"),
        table_name="regulatory_circulars",
    )
    op.drop_column("regulatory_circulars", "source_hash")
