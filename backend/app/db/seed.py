"""Seed the database with the reference data that used to be hard-coded in the
frontend (dimensions, questions, banks, departments, roles, maturity levels).

Run after applying migrations:

    python -m app.db.seed            # insert only into empty tables (idempotent)
    python -m app.db.seed --reset    # wipe those reference tables, then reseed

It never touches the submission tables (assessments / answers / dimension_scores).
"""

import asyncio
import sys

from sqlalchemy import delete, func, select

from app.db.database import AsyncSessionLocal
from app.models import (
    Bank,
    Department,
    Dimension,
    MaturityLevel,
    Question,
    Role,
)

# --- Reference data (mirrors the former frontend constants) -----------------

DIMENSIONS = [
    {
        "key": "gouvernance",
        "code": "01",
        "name": "Gouvernance des données",
        "short_name": "Gouvernance",
        "description": "Cadre de responsabilités, politiques et conformité réglementaire autour de la donnée.",
        "questions": [
            "Les responsabilités data sont-elles clairement définies (CDO, data owners) ?",
            "Existe-t-il un cadre de gouvernance formalisé avec politiques et standards ?",
            "La gouvernance des données est-elle alignée avec les réglementations (BCT, BCBS 239) ?",
            "Avez-vous mis en place des KPIs pour piloter la gouvernance des données ?",
        ],
    },
    {
        "key": "qualite",
        "code": "02",
        "name": "Qualité des données",
        "short_name": "Qualité",
        "description": "Exactitude, cohérence et disponibilité des données à travers les systèmes.",
        "questions": [
            "Les données sont-elles complètes et exactes (fiables, sans erreurs) ?",
            "Les données sont-elles cohérentes et sans doublons à travers les systèmes ?",
            "Les données sont-elles à jour et disponibles quand nécessaire ?",
            "Existe-t-il un processus de contrôle et d'amélioration continue de la qualité ?",
        ],
    },
    {
        "key": "architecture",
        "code": "03",
        "name": "Architecture & Infrastructure",
        "short_name": "Architecture",
        "description": "Centralisation, intégration et sécurité des plateformes et pipelines data.",
        "questions": [
            "Avez-vous centralisé vos données (Data Lake, DWH, MDM) ?",
            "Les systèmes communiquent-ils de manière fluide via APIs et services ?",
            "Les pipelines de données (ETL/ELT) sont-ils automatisés et industrialisés ?",
            "La sécurité et le contrôle d'accès (RBAC, chiffrement) sont-ils en place ?",
        ],
    },
    {
        "key": "usage",
        "code": "04",
        "name": "Usage & Analytics",
        "short_name": "Usage",
        "description": "Exploitation analytique et impact réel de la donnée dans la prise de décision.",
        "questions": [
            "Disposez-vous de tableaux de bord et outils de visualisation (BI) ?",
            "Utilisez-vous des modèles prédictifs et de l'advanced analytics ?",
            "Les données influencent-elles réellement la prise de décision ?",
            "Avez-vous des cas d'usage métiers opérationnels (risque, marketing, finance) ?",
        ],
    },
    {
        "key": "culture",
        "code": "05",
        "name": "Culture Data & Compétences",
        "short_name": "Culture",
        "description": "Maturité humaine, adoption des outils et collaboration métiers-IT autour de la data.",
        "questions": [
            "Les collaborateurs comprennent-ils les données et leur importance (data literacy) ?",
            "Existe-t-il des programmes de formation et montée en compétences data ?",
            "Les outils data sont-ils adoptés et utilisés par les équipes ?",
            "Y a-t-il une bonne collaboration entre métiers et IT sur les sujets data ?",
        ],
    },
    {
        "key": "strategie",
        "code": "06",
        "name": "Stratégie & Vision Data",
        "short_name": "Stratégie",
        "description": "Alignement de la vision data avec les objectifs business et mesure du ROI.",
        "questions": [
            "Avez-vous une vision et roadmap data claire et partagée ?",
            "La stratégie data est-elle alignée avec les objectifs business de la banque ?",
            "Les initiatives data sont-elles priorisées de manière structurée ?",
            "Mesurez-vous le ROI et l'impact business des projets data ?",
        ],
    },
]

MATURITY_LEVELS = [
    {"label": "Initial", "min_score": 0.0, "max_score": 1.9, "color": "#f87171", "description": "Non-conformité BCT probable. Urgence absolue."},
    {"label": "Reproductible", "min_score": 2.0, "max_score": 2.9, "color": "#fb923c", "description": "Plan de transformation requis immédiatement."},
    {"label": "Défini", "min_score": 3.0, "max_score": 3.4, "color": "#fef08a", "description": "Industrialisation à engager."},
    {"label": "Géré", "min_score": 3.5, "max_score": 4.4, "color": "#86efac", "description": "Maturité avancée. Optimisation ciblée."},
    {"label": "Optimisé", "min_score": 4.5, "max_score": 5.0, "color": "#7dd3fc", "description": "Excellence data-driven. Référence BCT."},
]

BANKS = [
    "Banque de Tunisie (BT)",
    "Société Tunisienne de Banque (STB)",
    "Banque Nationale Agricole (BNA)",
    "Banque de l'Habitat (BH)",
    "Amen Bank",
    "Attijari Bank",
    "BIAT",
    "BTE (Banque de Tunisie et des Emirats)",
    "UIB (Union Internationale de Banques)",
    "ATB (Arab Tunisian Bank)",
    "Banque Zitouna",
    "Banque Tuniso-Koweitienne (BTK)",
    "UBCI (Union Bancaire pour le Commerce et l'Industrie)",
    "Banque Tunisienne de Solidarité (BTS)",
    "Wifak Bank",
]

DEPARTMENTS = [
    "Systèmes d'Information",
    "Gestion des Risques",
    "Conformité & Audit",
    "Opérations Bancaires",
    "Finance & Comptabilité",
    "Crédit",
    "Trésorerie",
    "Ressources Humaines",
]

ROLES = [
    "Responsable de Département",
    "Directeur",
    "Directeur Général / Adjoint",
    "Analyste",
    "Chef de Projet",
    "Consultant",
    "Cadre Supérieur",
]


async def _is_empty(session, model) -> bool:
    count = await session.scalar(select(func.count()).select_from(model))
    return count == 0


async def _reset(session) -> None:
    # Order matters: questions reference dimensions.
    for model in (Question, Dimension, Bank, Department, Role, MaturityLevel):
        await session.execute(delete(model))
    print("- cleared reference tables")


async def seed(reset: bool = False) -> None:
    async with AsyncSessionLocal() as session:
        if reset:
            await _reset(session)

        if await _is_empty(session, Dimension):
            for d_order, d in enumerate(DIMENSIONS):
                dim = Dimension(
                    key=d["key"],
                    code=d["code"],
                    name=d["name"],
                    short_name=d["short_name"],
                    description=d["description"],
                    sort_order=d_order,
                )
                dim.questions = [
                    Question(text=text, sort_order=q_order)
                    for q_order, text in enumerate(d["questions"])
                ]
                session.add(dim)
            print(f"- inserted {len(DIMENSIONS)} dimensions + their questions")
        else:
            print("- dimensions already present — skipped")

        if await _is_empty(session, MaturityLevel):
            for order, m in enumerate(MATURITY_LEVELS):
                session.add(MaturityLevel(sort_order=order, **m))
            print(f"- inserted {len(MATURITY_LEVELS)} maturity levels")
        else:
            print("- maturity levels already present — skipped")

        for model, names in ((Bank, BANKS), (Department, DEPARTMENTS), (Role, ROLES)):
            if await _is_empty(session, model):
                for order, name in enumerate(names):
                    session.add(model(name=name, sort_order=order))
                print(f"- inserted {len(names)} {model.__tablename__}")
            else:
                print(f"- {model.__tablename__} already present — skipped")

        await session.commit()
    print("[OK] seed complete")


if __name__ == "__main__":
    asyncio.run(seed(reset="--reset" in sys.argv))
