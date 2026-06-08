from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.sql import func
from database import Base


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    entity = Column(String(200), nullable=False)
    department = Column(String(200), nullable=True)
    evaluator_name = Column(String(200), nullable=True)
    evaluator_role = Column(String(200), nullable=True)

    # Dimension scores (1–5)
    score_gouvernance = Column(Float, nullable=False)
    score_qualite = Column(Float, nullable=False)
    score_architecture = Column(Float, nullable=False)
    score_usage = Column(Float, nullable=False)
    score_culture = Column(Float, nullable=False)
    score_strategie = Column(Float, nullable=False)
    score_global = Column(Float, nullable=False)

    maturity_label = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
