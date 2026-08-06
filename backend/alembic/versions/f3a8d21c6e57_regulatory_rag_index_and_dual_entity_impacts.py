"""regulatory RAG index + dual-entity impacts (question/recommandation)

Revision ID: f3a8d21c6e57
Revises: e7a2c5f91b04
Create Date: 2026-08-03 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a8d21c6e57'
down_revision: Union[str, Sequence[str], None] = 'e7a2c5f91b04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── regulatory_embeddings: RAG index over questions + recommandations ──
    op.create_table(
        "regulatory_embeddings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_code", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("question_code", sa.String(length=20), nullable=True),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("regulatory_flag", sa.Boolean(), nullable=True),
        sa.Column("dimension", sa.String(length=200), nullable=True),
        sa.Column("embedding", sa.LargeBinary(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("entity_type", "entity_code", name="uq_regulatory_embedding_entity"),
    )
    op.create_index(
        op.f("ix_regulatory_embeddings_id"), "regulatory_embeddings", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_regulatory_embeddings_entity_type"),
        "regulatory_embeddings",
        ["entity_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_regulatory_embeddings_entity_code"),
        "regulatory_embeddings",
        ["entity_code"],
        unique=False,
    )

    # ── regulatory_impacts: split impact_type into entity_type + proposed_action ──
    op.add_column(
        "regulatory_impacts", sa.Column("entity_type", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "regulatory_impacts", sa.Column("proposed_action", sa.String(length=20), nullable=True)
    )
    op.execute(
        "UPDATE regulatory_impacts SET entity_type = 'recommandation', "
        "proposed_action = CASE impact_type "
        "  WHEN 'nouvelle_recommandation' THEN 'ajouter' "
        "  WHEN 'maj_recommandation_existante' THEN 'modifier' "
        "  WHEN 'activer_flag' THEN 'activer_flag' "
        "  ELSE 'ajouter' END"
    )
    op.alter_column("regulatory_impacts", "entity_type", nullable=False)
    op.alter_column("regulatory_impacts", "proposed_action", nullable=False)
    op.drop_column("regulatory_impacts", "impact_type")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "regulatory_impacts", sa.Column("impact_type", sa.String(length=40), nullable=True)
    )
    op.execute(
        "UPDATE regulatory_impacts SET impact_type = CASE "
        "  WHEN entity_type = 'recommandation' AND proposed_action = 'ajouter' THEN 'nouvelle_recommandation' "
        "  WHEN entity_type = 'recommandation' AND proposed_action = 'modifier' THEN 'maj_recommandation_existante' "
        "  WHEN entity_type = 'recommandation' AND proposed_action = 'activer_flag' THEN 'activer_flag' "
        "  ELSE 'nouvelle_recommandation' END"
    )
    op.alter_column("regulatory_impacts", "impact_type", nullable=False)
    op.drop_column("regulatory_impacts", "proposed_action")
    op.drop_column("regulatory_impacts", "entity_type")

    op.drop_index(op.f("ix_regulatory_embeddings_entity_code"), table_name="regulatory_embeddings")
    op.drop_index(op.f("ix_regulatory_embeddings_entity_type"), table_name="regulatory_embeddings")
    op.drop_index(op.f("ix_regulatory_embeddings_id"), table_name="regulatory_embeddings")
    op.drop_table("regulatory_embeddings")
