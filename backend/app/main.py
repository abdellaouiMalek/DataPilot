from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from contextlib import asynccontextmanager
from typing import List, Optional
from datetime import datetime

from app.db.database import get_db, init_db
from app.routers.UserRouter import router as user_router
from app.core.cors import setup_cors



# MATURITY_LEVELS = [
#     (0.0, 1.9, "Initial"),
#     (2.0, 2.9, "Reproductible"),
#     (3.0, 3.4, "Défini"),
#     (3.5, 4.4, "Géré"),
#     (4.5, 5.0, "Optimisé"),
# ]


# def get_maturity_label(score: float) -> str:
#     for low, high, label in MATURITY_LEVELS:
#         if low <= score <= high:
#             return label
#     return "Initial"


# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     await init_db()
#     yield


# app = FastAPI(lifespan=lifespan)

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5173"],
#     allow_methods=["*"],
#     allow_headers=["*"],
# )


# @app.post("/api/assessments", response_model=AssessmentRead, status_code=201)
# async def create_assessment(payload: AssessmentCreate, db: AsyncSession = Depends(get_db)):
#     scores = [
#         payload.score_gouvernance,
#         payload.score_qualite,
#         payload.score_architecture,
#         payload.score_usage,
#         payload.score_culture,
#         payload.score_strategie,
#     ]
#     global_score = sum(scores) / len(scores)
#     maturity_label = get_maturity_label(global_score)

#     assessment = Assessment(
#         **payload.model_dump(),
#         score_global=round(global_score, 2),
#         maturity_label=maturity_label,
#     )
#     db.add(assessment)
#     await db.commit()
#     await db.refresh(assessment)
#     return assessment


# @app.get("/api/assessments", response_model=List[AssessmentRead])
# async def list_assessments(
#     entity: Optional[str] = None,
#     department: Optional[str] = None,
#     db: AsyncSession = Depends(get_db),
# ):
#     stmt = select(Assessment).order_by(Assessment.created_at.desc())
#     if entity:
#         stmt = stmt.where(Assessment.entity == entity)
#     if department:
#         stmt = stmt.where(Assessment.department == department)
#     result = await db.execute(stmt)
#     return result.scalars().all()


# @app.get("/api/assessments/{assessment_id}", response_model=AssessmentRead)
# async def get_assessment(assessment_id: int, db: AsyncSession = Depends(get_db)):
#     result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
#     assessment = result.scalar_one_or_none()
#     if not assessment:
#         raise HTTPException(status_code=404, detail="Assessment not found")
#     return assessment


# @app.get("/api/dashboard/stats")
# async def dashboard_stats(db: AsyncSession = Depends(get_db)):
#     result = await db.execute(select(Assessment))
#     assessments = result.scalars().all()

#     if not assessments:
#         return {
#             "total_assessments": 0,
#             "avg_global_score": 0,
#             "entity_scores": [],
#             "dimension_averages": {},
#         }

#     avg_global = sum(a.score_global for a in assessments) / len(assessments)

#     entity_map: dict = {}
#     for a in assessments:
#         if a.entity not in entity_map:
#             entity_map[a.entity] = []
#         entity_map[a.entity].append(a.score_global)

#     entity_scores = [
#         {"entity": entity, "score": round(sum(scores) / len(scores), 2)}
#         for entity, scores in entity_map.items()
#     ]
#     entity_scores.sort(key=lambda x: x["score"], reverse=True)

#     dimension_averages = {
#         "gouvernance": round(sum(a.score_gouvernance for a in assessments) / len(assessments), 2),
#         "qualite": round(sum(a.score_qualite for a in assessments) / len(assessments), 2),
#         "architecture": round(sum(a.score_architecture for a in assessments) / len(assessments), 2),
#         "usage": round(sum(a.score_usage for a in assessments) / len(assessments), 2),
#         "culture": round(sum(a.score_culture for a in assessments) / len(assessments), 2),
#         "strategie": round(sum(a.score_strategie for a in assessments) / len(assessments), 2),
#     }

#     return {
#         "total_assessments": len(assessments),
#         "avg_global_score": round(avg_global, 2),
#         "entity_scores": entity_scores,
#         "dimension_averages": dimension_averages,
#     }

app = FastAPI(
    title="DataPilot API",
    description="Backend de l'application DataPilot",
    version="1.0.0"
)

setup_cors(app)

# Inclusion du router d'utilisateurs
app.include_router(user_router)

@app.get("/")
def read_root():
    return {"status": "online", "message": "Bienvenue sur l'API DataPilot"}