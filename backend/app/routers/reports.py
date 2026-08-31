"""PDF report generation -- a single assessment's results, or a comparison
between two. Shares the ``/api/assessments`` prefix with assessments.py /
recommendations.py; kept in its own module since rendering (Jinja2 +
WeasyPrint) is a distinct concern from scoring/persistence.
"""

from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_bank_scope, verify_token
from app.db.database import get_db
from app.models import Assessment, MaturityLevel
from app.services.pdf import render_pdf
from app.services.questionnaire_reference import merge_dimensions, references_for
from app.services.recommendation_engine import (
    get_comparison_narrative,
    get_narrative,
    get_or_create_recommendation_plan,
)

router = APIRouter(prefix="/api/assessments", tags=["reports"])

DECLINE_THRESHOLD = 0.05

# strftime("%B") depends on the server process' locale, which isn't
# guaranteed to be French -- spell months out explicitly instead, matching
# frontend/src/lib/utils.ts's formatMonthYear (same "Mois AAAA" shape).
_FRENCH_MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]


def _format_month_year(dt) -> str:
    return f"{_FRENCH_MONTHS[dt.month - 1]} {dt.year}"


def _safe_filename_part(text: str) -> str:
    """ASCII-slugify for use in a Content-Disposition filename. Response
    headers are Latin-1-encoded, so anything outside that range (e.g. a
    bank name in Arabic script) would otherwise crash the whole request."""
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug or "rapport"


def _pdf_response(pdf_bytes: bytes, filename: str) -> Response:
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _level_for(score: float, bands: list[MaturityLevel]) -> MaturityLevel | None:
    for band in bands:
        if band.min_score <= score <= band.max_score:
            return band
    return bands[0] if bands else None


async def _load_reference_data(db: AsyncSession, *assessments: Assessment):
    """Dimensions as the given assessments knew them, plus the maturity bands.

    Dimensions come from each assessment's frozen version snapshot, not the
    live table: a report reprinted after the framework dropped a dimension must
    still name the dimension the bank was actually scored on. The bands are
    deliberately current — they are the scale the score is read against today.
    """
    references = await references_for(db, assessments)
    dimensions = merge_dimensions(references.values())
    bands = (
        (await db.execute(select(MaturityLevel).order_by(MaturityLevel.sort_order)))
        .scalars()
        .all()
    )
    return dimensions, list(bands)


async def _get_assessment_or_404(
    db: AsyncSession, assessment_id: int, bank_scope: int | None
) -> Assessment:
    stmt = (
        select(Assessment)
        .where(Assessment.id == assessment_id)
        .options(selectinload(Assessment.dimension_scores), selectinload(Assessment.bank))
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None or (
        bank_scope is not None and assessment.bank_id != bank_scope
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment {assessment_id} introuvable.",
        )
    return assessment


# ── Comparison report ─────────────────────────────────────────────────────
# Registered before "/{assessment_id}/report.pdf": both are 2-segment paths
# and "comparison" would otherwise bind to {assessment_id} first (see the
# identical note on /comparison/narrative in recommendations.py).

@router.get("/comparison/report.pdf")
async def download_comparison_report(
    initial_id: int = Query(...),
    current_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(verify_token),
    bank_scope: int | None = Depends(get_bank_scope),
):
    initial = await _get_assessment_or_404(db, initial_id, bank_scope)
    current = await _get_assessment_or_404(db, current_id, bank_scope)
    dim_by_id, bands = await _load_reference_data(db, initial, current)

    score_init = initial.score_global or 0.0
    score_curr = current.score_global or 0.0
    delta = score_curr - score_init
    level_init = _level_for(score_init, bands)
    level_curr = _level_for(score_curr, bands)

    init_scores = {ds.dimension_id: ds.score for ds in initial.dimension_scores}
    curr_scores = {ds.dimension_id: ds.score for ds in current.dimension_scores}
    shared_dim_ids = [
        dim_id for dim_id in init_scores if dim_id in curr_scores and dim_id in dim_by_id
    ]

    dimensions = []
    improved = stable = declined = 0
    for dim_id in shared_dim_ids:
        d_init, d_curr = init_scores[dim_id], curr_scores[dim_id]
        d_delta = d_curr - d_init
        if d_delta > DECLINE_THRESHOLD:
            improved += 1
            color = "#2E7D32"
        elif d_delta < -DECLINE_THRESHOLD:
            declined += 1
            color = "#CC0000"
        else:
            stable += 1
            color = "#9B9B9B"
        dimensions.append({
            "name": dim_by_id[dim_id].name,
            "initial": d_init,
            "current": d_curr,
            "delta": d_delta,
            "color": color,
        })
    dimensions.sort(key=lambda d: d["current"], reverse=True)

    try:
        narrative = await get_comparison_narrative(db, initial, current)
    except Exception:
        narrative = None

    period_init = _format_month_year(initial.created_at)
    period_curr = _format_month_year(current.created_at)
    bank_name = current.bank.name if current.bank else "—"

    context = {
        "report_title": "Rapport d'évolution de maturité data",
        "report_subtitle": f"{bank_name} — {period_init} → {period_curr}",
        "cover_meta": [
            {"label": "Établissement", "value": bank_name},
            {"label": "Période initiale", "value": period_init},
            {"label": "Période actuelle", "value": period_curr},
            {"label": "Score initial", "value": f"{score_init:.1f} / 5"},
            {"label": "Score actuel", "value": f"{score_curr:.1f} / 5"},
            {"label": "Progression", "value": f"{delta:+.1f} pt"},
        ],
        "bank": bank_name,
        "period_init": period_init,
        "period_curr": period_curr,
        "score_init": score_init,
        "score_curr": score_curr,
        "delta": delta,
        "level_init": {
            "label": level_init.label if level_init else "—",
            "color": level_init.color if level_init else "#6B6B6B",
        },
        "level_curr": {
            "label": level_curr.label if level_curr else "—",
            "color": level_curr.color if level_curr else "#6B6B6B",
        },
        "dimensions": dimensions,
        "improved_count": improved,
        "stable_count": stable,
        "declined_count": declined,
        "narrative": narrative,
    }

    pdf_bytes = await render_pdf("comparison_report.html", context)
    return _pdf_response(
        pdf_bytes, f"evolution-{_safe_filename_part(bank_name)}-{current_id}.pdf"
    )


# ── Single evaluation report ──────────────────────────────────────────────

@router.get("/{assessment_id}/report.pdf")
async def download_evaluation_report(
    assessment_id: int,
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(verify_token),
    bank_scope: int | None = Depends(get_bank_scope),
):
    assessment = await _get_assessment_or_404(db, assessment_id, bank_scope)
    dim_by_id, bands = await _load_reference_data(db, assessment)

    score_global = assessment.score_global or 0.0
    global_level = _level_for(score_global, bands)
    maturity_label = assessment.maturity_label or (
        global_level.label if global_level else "—"
    )
    maturity_color = global_level.color if global_level else "#6B6B6B"

    dimensions = []
    for ds in assessment.dimension_scores:
        dim = dim_by_id.get(ds.dimension_id)
        if dim is None:
            continue
        level = _level_for(ds.score, bands)
        dimensions.append({
            "name": dim.name,
            "score": ds.score,
            "weight": dim.weight,
            "color": dim.color,
            "level_label": level.label if level else "—",
            "level_color": level.color if level else "#6B6B6B",
        })
    dimensions.sort(key=lambda d: d["score"], reverse=True)
    strengths = [d for d in dimensions if d["score"] >= 3.5]
    weaknesses = [d for d in dimensions if d["score"] < 3.0]

    try:
        narrative = await get_narrative(db, assessment)
    except Exception:
        narrative = None

    try:
        plan = await get_or_create_recommendation_plan(db, assessment)
        recommendations = [
            {
                "rank": r["rank"],
                "title": r["title"],
                "text": r.get("texte_reformule") or r["recommendation_text"],
                "category": r["category"],
                "effort": r["effort"],
                "regulatory_flag": r["regulatory_flag"],
                "dimension_name": (
                    dim_by_id[r["dimension_id"]].name
                    if r["dimension_id"] in dim_by_id
                    else "—"
                ),
            }
            for r in plan.get("plan_prioritaire", [])[:5]
        ]
    except Exception:
        recommendations = []

    bank_name = assessment.bank.name if assessment.bank else "—"
    date_str = assessment.created_at.strftime("%d/%m/%Y")

    context = {
        "report_title": "Rapport d'évaluation de maturité data",
        "report_subtitle": f"{bank_name} — {maturity_label}",
        "cover_meta": [
            {"label": "Établissement", "value": bank_name},
            {"label": "Département", "value": assessment.department or "—"},
            {"label": "Évaluateur", "value": assessment.evaluator_role or "—"},
            {"label": "Date d'évaluation", "value": date_str},
            {"label": "Score global", "value": f"{score_global:.1f} / 5"},
            {"label": "Niveau de maturité", "value": maturity_label},
        ],
        "score_global": score_global,
        "maturity_label": maturity_label,
        "maturity_color": maturity_color,
        "dimensions": dimensions,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "narrative": narrative,
        "recommendations": recommendations,
    }

    pdf_bytes = await render_pdf("evaluation_report.html", context)
    return _pdf_response(
        pdf_bytes, f"evaluation-{_safe_filename_part(bank_name)}-{assessment_id}.pdf"
    )
