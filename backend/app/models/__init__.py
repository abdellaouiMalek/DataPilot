"""SQLAlchemy models.

Importing this package registers every model on ``Base.metadata``. Anything that
needs the full schema (Alembic autogenerate, ``init_db``, seeding) should
``import app.models`` first.
"""

from app.models.assessment import Answer, Assessment, DimensionScore
from app.models.dimension import Dimension
from app.models.lookups import Bank, Department, Role
from app.models.maturity_level import MaturityLevel
from app.models.question import Question

__all__ = [
    "Dimension",
    "Question",
    "Bank",
    "Department",
    "Role",
    "MaturityLevel",
    "Assessment",
    "Answer",
    "DimensionScore",
]
