"""switch regulatory_embeddings.embedding from bytea to pgvector

Requires the `pgvector` extension (see docker-compose.yml -- Postgres now
runs pgvector/pgvector:pg18, not plain postgres:18). Old bytea values are
NOT converted: the index is always fully rebuilt from the live catalog
(see app/services/regulatory_index.py::reindex_catalog), so the column is
dropped and re-added empty rather than migrating packed float32 bytes in
place -- run a reindex after upgrading.

Revision ID: a2c7f9e1b4d6
Revises: f3d9a6c2e8b1
Create Date: 2026-08-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2c7f9e1b4d6'
down_revision: Union[str, Sequence[str], None] = 'f3d9a6c2e8b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIM = 1024


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.drop_column("regulatory_embeddings", "embedding")
    op.add_column(
        "regulatory_embeddings",
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("regulatory_embeddings", "embedding")
    op.add_column(
        "regulatory_embeddings",
        sa.Column("embedding", sa.LargeBinary(), nullable=True),
    )
