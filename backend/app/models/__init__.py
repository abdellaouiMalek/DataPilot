"""SQLAlchemy models.

Importing this package registers every model on ``Base.metadata``. Anything that
needs the full schema (Alembic autogenerate, ``init_db``, seeding) should
``import app.models`` first.
"""

from app.models.assessment import (
    Answer,
    Assessment,
    AssessmentRecommendationPlan,
    DimensionScore,
)
from app.models.audit_log import AuditLog
from app.models.dimension import Dimension
from app.models.embedding import RegulatoryEmbedding
from app.models.framework_version import FrameworkDraft, QuestionnaireVersion
from app.models.lookups import Bank, Department, Role
from app.models.maturity_level import MaturityLevel
from app.models.notification import Notification
from app.models.platform_settings import PlatformSettings
from app.models.question import Question
from app.models.recommendation import Recommendation
from app.models.regulatory import RegulatoryCircular, RegulatoryImpact
from app.models.subdimension import SubDimension

__all__ = [
    "AuditLog",
    "Dimension",
    "SubDimension",
    "Question",
    "Recommendation",
    "Bank",
    "Department",
    "Role",
    "MaturityLevel",
    "Notification",
    "PlatformSettings",
    "Assessment",
    "Answer",
    "DimensionScore",
    "AssessmentRecommendationPlan",
    "RegulatoryCircular",
    "RegulatoryImpact",
    "RegulatoryEmbedding",
    "FrameworkDraft",
    "QuestionnaireVersion",
]
