"""PDF report generation -- a single assessment's results, or a comparison
across two or more. Shares the ``/api/assessments`` prefix with
assessments.py / recommendations.py; kept in its own module since rendering
(Jinja2 + WeasyPrint) is a distinct concern from scoring/persistence.
"""

from __future__ import annotations

import asyncio
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_bank_scope, verify_token
from app.core.storage import logo_data_uri as bank_logo_data_uri
from app.db.database import get_db
from app.models import Assessment, MaturityLevel
from app.services.pdf import render_pdf
from app.services.questionnaire_reference import merge_dimensions, references_for
from app.services.report_charts import (
    TREND_DOWN,
    TREND_FLAT,
    TREND_UP,
    evolution_chart,
    print_color,
    priority_matrix,
    radar_chart,
    score_trend_chart,
)
from app.services.recommendation_engine import (
    get_comparison_narrative,
    get_dimension_analysis,
    get_narrative,
    get_or_create_recommendation_plan,
)

router = APIRouter(prefix="/api/assessments", tags=["reports"])

DECLINE_THRESHOLD = 0.05

_EFFORT_LABELS = {1: "Effort faible", 2: "Effort moyen", 3: "Effort élevé"}

# The score a dimension has to reach to be read as "under control" in the
# report -- the bottom of the "Défini" band on the EY scale, and the same
# 3.0 the Results page already treats as the line between consolidating and
# building. Reference lines and the "écart" column are both measured on it.
CONFORMITY_THRESHOLD = 3.0

# strftime("%B") depends on the server process' locale, which isn't
# guaranteed to be French -- spell months out explicitly instead.
_FRENCH_MONTHS = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]


def _format_date_fr(dt) -> str:
    """Renders e.g. 21 Juillet 2026 -- full day, not just month/year: two
    evaluations run the same month still need the day to tell their
    periods apart."""
    return f"{dt.day} {_FRENCH_MONTHS[dt.month - 1]} {dt.year}"


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


def _dimension_rows(
    assessment: Assessment, dim_by_id: dict, bands: list[MaturityLevel]
) -> list[dict]:
    """One row per scored dimension, in the framework's own order.

    Bands are re-coloured for print (see report_charts.BAND_COLORS): the
    stored colours are the web app's pastels, which read as decoration on
    paper and disappear in greyscale.
    """
    band_positions = {band.id: i for i, band in enumerate(bands)}
    rows = []
    for ds in assessment.dimension_scores:
        dim = dim_by_id.get(ds.dimension_id)
        if dim is None:
            continue
        level = _level_for(ds.score, bands)
        rows.append({
            "name": dim.name,
            "score": ds.score,
            "weight": dim.weight,
            "level_label": level.label if level else "-",
            "color": (
                print_color(band_positions.get(level.id, 0), len(bands))
                if level
                else "#6F7A88"
            ),
            "explanation": level.description if level and level.description else None,
            "gap": ds.score - CONFORMITY_THRESHOLD,
            "gap_text": f"{ds.score - CONFORMITY_THRESHOLD:+.1f}",
        })
    return rows


def _scale_legend(bands: list[MaturityLevel]) -> list[dict]:
    return [
        {
            "label": band.label,
            "range": f"{band.min_score:.1f} - {band.max_score:.1f}",
            "color": print_color(i, len(bands)),
        }
        for i, band in enumerate(bands)
    ]


def _profile_context(
    rows: list[dict], *, score_global: float, bands: list[MaturityLevel]
) -> dict:
    """The maturity-profile block shared by the evaluation and the action-plan
    reports: both open on the same figures, so a reader moving between the two
    documents reads one profile, not two renderings of it.

    The radar keeps the framework's dimension order (a profile shape should
    not reshuffle between two editions of the same report); the table is
    ranked strongest-first and numbered in that ranked order.
    """
    radar = radar_chart(rows, reference=score_global)
    ranked = sorted(rows, key=lambda d: d["score"], reverse=True)
    for position, dimension in enumerate(ranked, start=1):
        dimension["index"] = position

    return {
        "dimensions": ranked,
        "dimension_count": len(rows),
        "strong_count": sum(1 for d in rows if d["score"] >= 3.5),
        "weak_count": sum(1 for d in rows if d["score"] < CONFORMITY_THRESHOLD),
        "strengths": ranked[:3],
        "watchpoints": list(reversed(ranked[-3:])) if len(ranked) > 3 else [],
        "scale": _scale_legend(bands),
        "radar": radar,
    }


def _key_findings(
    ranked: list[dict],
    *,
    score_global: float,
    weak_count: int,
    total_count: int | None = None,
    quick_win_count: int = 0,
    regulatory_count: int = 0,
) -> list[dict]:
    """The executive summary's bullets, stated from the figures themselves.

    Every sentence is derived from a number already printed elsewhere in the
    report -- nothing here is estimated, dated or costed, so the summary
    cannot drift from the exhibits it introduces. ``total_count`` is omitted
    by the evaluation report, which carries no plan of its own to summarise.
    """
    findings: list[dict] = []
    if not ranked:
        return findings

    best, worst = ranked[0], ranked[-1]
    total_dimensions = len(ranked)

    if weak_count:
        findings.append({
            "lead": (
                f"{weak_count} dimension{'s' if weak_count > 1 else ''} sur "
                f"{total_dimensions} sous le seuil de conformité de "
                f"{CONFORMITY_THRESHOLD:.1f}."
            ),
            "text": (
                f"La plus exposée est « {worst['name']} » ({worst['score']:.1f} / 5, "
                f"niveau {worst['level_label'].lower()}) : c'est là que se concentre "
                f"le risque de non-conformité."
            ),
        })
    else:
        findings.append({
            "lead": "Aucune dimension sous le seuil de conformité.",
            "text": (
                f"Le point le plus bas reste « {worst['name']} » "
                f"({worst['score']:.1f} / 5) ; l'enjeu porte sur la consolidation "
                f"des pratiques, non sur leur mise en place."
            ),
        })

    findings.append({
        "lead": f"Point d'appui : « {best['name']} » ({best['score']:.1f} / 5).",
        "text": (
            "Cette dimension tire le profil vers le haut et fournit un modèle de "
            "déploiement réutilisable sur les axes en retrait."
        ),
    })

    spread = best["score"] - worst["score"]
    findings.append({
        "lead": (
            f"Profil {'contrasté' if spread >= 1.0 else 'homogène'} : "
            f"{spread:.1f} pt d'écart entre les extrêmes."
        ),
        "text": (
            f"Pour une moyenne pondérée de {score_global:.1f} / 5, "
            + (
                "l'effort doit être concentré plutôt qu'étalé sur l'ensemble des "
                "dimensions."
                if spread >= 1.0
                else "la progression se joue sur l'ensemble des dimensions plutôt "
                "que sur un axe isolé."
            )
        ),
    })

    if total_count is None:
        return findings

    plan_text = (
        f"{quick_win_count} relève{'nt' if quick_win_count > 1 else ''} d'un effort "
        f"faible et {'sont' if quick_win_count > 1 else 'est'} mobilisable"
        f"{'s' if quick_win_count > 1 else ''} immédiatement"
        if quick_win_count
        else "aucune n'est classée en effort faible : le plan est structurant"
    )
    if regulatory_count:
        plural = regulatory_count > 1
        plan_text += (
            f". {regulatory_count} porte{'nt' if plural else ''} une obligation "
            f"réglementaire et {'sont maintenues' if plural else 'est maintenue'} "
            f"dans le plan quel que soit {'leur' if plural else 'son'} rang"
        )
    findings.append({
        "lead": (
            f"{total_count} initiative{'s' if total_count > 1 else ''} "
            f"priorisée{'s' if total_count > 1 else ''}."
        ),
        "text": plan_text + ".",
    })

    return findings


def _evolution_findings(
    by_delta: list[dict],
    *,
    delta: float,
    improved_count: int,
    declined_count: int,
    level_init: str,
    level_curr: str,
) -> list[dict]:
    """Executive bullets for the comparison report, all read off the same
    figures the exhibits plot."""
    findings: list[dict] = []
    if not by_delta:
        return findings

    total = len(by_delta)
    direction = (
        "progresse" if delta > 0 else ("recule" if delta < 0 else "reste stable")
    )
    if level_init != level_curr:
        findings.append({
            "lead": f"Changement de palier : {level_init} → {level_curr}.",
            "text": (
                f"Le score global {direction} de {abs(delta):.1f} pt sur la période, "
                f"ce qui fait franchir à l'établissement la borne du niveau "
                f"{level_curr.lower()}."
            ),
        })
    else:
        findings.append({
            "lead": f"Palier inchangé : niveau {level_curr}.",
            "text": (
                f"Le score global {direction}"
                + (f" de {abs(delta):.1f} pt" if delta else "")
                + ", sans franchir la borne du palier suivant."
            ),
        })

    findings.append({
        "lead": (
            f"{improved_count} dimension{'s' if improved_count > 1 else ''} sur "
            f"{total} en progression, {declined_count} en recul."
        ),
        "text": (
            "Le reste des dimensions est stable à ±0.05 point près, seuil en deçà "
            "duquel une variation n'est pas considérée comme significative."
        ),
    })

    best = by_delta[0]
    if best["delta"] > DECLINE_THRESHOLD:
        findings.append({
            "lead": (
                f"Plus forte progression : « {best['name']} » "
                f"({best['delta']:+.1f} pt)."
            ),
            "text": (
                f"La dimension passe de {best['initial']:.1f} à "
                f"{best['current']:.1f} sur 5."
            ),
        })

    worst = by_delta[-1]
    if worst["delta"] < -DECLINE_THRESHOLD:
        findings.append({
            "lead": f"Recul à instruire : « {worst['name']} » ({worst['delta']:+.1f} pt).",
            "text": (
                f"La dimension passe de {worst['initial']:.1f} à "
                f"{worst['current']:.1f} sur 5 : à rapprocher des actions engagées "
                f"sur la période."
            ),
        })

    return findings


def _reco_dim_name(reco: dict, dim_by_id: dict) -> str:
    return dim_by_id[reco["dimension_id"]].name if reco["dimension_id"] in dim_by_id else "-"


async def _recommendation_evolution(
    db: AsyncSession, initial: Assessment, current: Assessment, dim_by_id: dict
) -> dict:
    """Diffs the two assessments' recommendation plans by code: resolved
    (was recommended, no longer is -- the underlying gap closed), persistent
    (recommended both times -- still open) and new (recommended now, wasn't
    before -- surfaced since, e.g. because the questionnaire or the scores
    changed enough to trigger it).

    Both plans are the same cached, LLM-reformulated ones the Recommendations
    page and the dedicated action-plan report already use -- this reads them,
    it doesn't recompute or re-reformulate anything.
    """
    initial_plan = await get_or_create_recommendation_plan(db, initial)
    current_plan = await get_or_create_recommendation_plan(db, current)
    initial_by_code = {r["code"]: r for r in initial_plan.get("plan_prioritaire", [])}
    current_by_code = {r["code"]: r for r in current_plan.get("plan_prioritaire", [])}

    def _entry(reco: dict) -> dict:
        return {
            "rank": reco["rank"],
            "title": reco["title"],
            "dimension_name": _reco_dim_name(reco, dim_by_id),
            "regulatory_flag": reco["regulatory_flag"],
        }

    resolved = sorted(
        (_entry(initial_by_code[c]) for c in initial_by_code.keys() - current_by_code.keys()),
        key=lambda r: r["rank"],
    )
    persistent = sorted(
        (_entry(current_by_code[c]) for c in initial_by_code.keys() & current_by_code.keys()),
        key=lambda r: r["rank"],
    )
    new = sorted(
        (_entry(current_by_code[c]) for c in current_by_code.keys() - initial_by_code.keys()),
        key=lambda r: r["rank"],
    )
    return {
        "reco_resolved": resolved,
        "reco_persistent": persistent,
        "reco_new": new,
        "reco_resolved_count": len(resolved),
        "reco_persistent_count": len(persistent),
        "reco_new_count": len(new),
    }


async def _load_reference_data(db: AsyncSession, *assessments: Assessment):
    """Dimensions as the given assessments knew them, plus the maturity bands.

    Dimensions come from each assessment's frozen version snapshot, not the
    live table: a report reprinted after the framework dropped a dimension must
    still name the dimension the bank was actually scored on. The bands are
    deliberately current, they are the scale the score is read against today.
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
        .options(
            selectinload(Assessment.dimension_scores),
            selectinload(Assessment.bank),
            # get_or_create_recommendation_plan (recommendations report) only
            # touches this when no plan is persisted yet for the assessment
            # -- normally already true by the time a report is requested --
            # but without it that fallback path hits a lazy-load on a
            # detached async session instead of a clean query.
            selectinload(Assessment.answers),
        )
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
    ids: str = Query(..., description="Comma-separated assessment ids, e.g. '12,15,19'."),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(verify_token),
    bank_scope: int | None = Depends(get_bank_scope),
):
    id_list: list[int] = []
    for raw in ids.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            parsed = int(raw)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Identifiants d'évaluation invalides.",
            )
        if parsed not in id_list:
            id_list.append(parsed)
    if len(id_list) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Au moins deux évaluations sont nécessaires pour un rapport d'évolution.",
        )

    # Sequential, not gathered -- same AsyncSession-concurrency rationale as
    # the recommendation-plan calls further down.
    assessments = [await _get_assessment_or_404(db, aid, bank_scope) for aid in id_list]
    assessments.sort(key=lambda a: a.created_at)
    # The rest of this report reduces N evaluations to a single comparison
    # the same charts as a two-point report already know how to draw: the
    # earliest and the latest of the selection are its bookends, everything
    # in between only feeds the score-trend figure and the per-dimension
    # table's extra columns.
    initial, current = assessments[0], assessments[-1]

    dim_by_id, bands = await _load_reference_data(db, *assessments)

    score_init = initial.score_global or 0.0
    score_curr = current.score_global or 0.0
    delta = score_curr - score_init
    level_init = _level_for(score_init, bands)
    level_curr = _level_for(score_curr, bands)

    scores_by_assessment = [
        {ds.dimension_id: ds.score for ds in a.dimension_scores} for a in assessments
    ]
    init_scores, curr_scores = scores_by_assessment[0], scores_by_assessment[-1]
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
            color, trend = TREND_UP, "En progression"
        elif d_delta < -DECLINE_THRESHOLD:
            declined += 1
            color, trend = TREND_DOWN, "En recul"
        else:
            stable += 1
            color, trend = TREND_FLAT, "Stable"
        dimensions.append({
            "name": dim_by_id[dim_id].name,
            "initial": d_init,
            "current": d_curr,
            "delta": d_delta,
            "color": color,
            "trend_label": trend,
            # One value per compared evaluation, oldest to newest, for the
            # detail table -- None where that assessment's questionnaire
            # version didn't score this dimension.
            "scores": [s.get(dim_id) for s in scores_by_assessment],
        })

    periods = [_format_date_fr(a.created_at) for a in assessments]
    period_init, period_curr = periods[0], periods[-1]
    evaluation_count = len(assessments)

    trend_points = [
        {"label": p, "score": a.score_global or 0.0} for p, a in zip(periods, assessments)
    ]
    score_trend = score_trend_chart(trend_points, threshold=CONFORMITY_THRESHOLD)

    # The dumbbell chart and the table are both ordered by movement, which
    # is what this report is about -- no radar (profile shape duplicates
    # what the table already states exactly) and no separate gainers/losers
    # shortlist (the dumbbell already ranks every dimension by the same
    # delta, so a top-3 of it would only repeat part of it a second time).
    by_delta = sorted(dimensions, key=lambda d: d["delta"], reverse=True)
    evolution = evolution_chart(
        by_delta,
        period_init=period_init,
        period_curr=period_curr,
        threshold=CONFORMITY_THRESHOLD,
    )

    try:
        narrative = await get_comparison_narrative(db, initial, current)
    except Exception:
        narrative = None

    recommendation_evolution = await _recommendation_evolution(db, initial, current, dim_by_id)

    bank_name = current.bank.name if current.bank else "-"
    bank_logo = bank_logo_data_uri(current.bank.logo_path if current.bank else None)

    context = {
        "report_title": "Rapport d'évolution de maturité data",
        "report_subtitle": (
            f"{bank_name} · {evaluation_count} évaluations · {period_init} → {period_curr}"
            if evaluation_count > 2
            else f"{bank_name} · {period_init} → {period_curr}"
        ),
        "bank_logo_data_uri": bank_logo,
        "cover_meta": [
            {"label": "Établissement", "value": bank_name},
            {"label": "Évaluations comparées", "value": str(evaluation_count)},
            {"label": "Période initiale", "value": period_init},
            {"label": "Période actuelle", "value": period_curr},
            {"label": "Score initial", "value": f"{score_init:.1f} / 5"},
            {"label": "Score actuel", "value": f"{score_curr:.1f} / 5"},
            {"label": "Progression", "value": f"{delta:+.1f} pt"},
        ],
        "bank": bank_name,
        "period_init": period_init,
        "period_curr": period_curr,
        "periods": periods,
        "evaluation_count": evaluation_count,
        "score_init": score_init,
        "score_curr": score_curr,
        "delta": delta,
        "level_init": {
            "label": level_init.label if level_init else "-",
            "color": level_init.color if level_init else "#6B6B6B",
        },
        "level_curr": {
            "label": level_curr.label if level_curr else "-",
            "color": level_curr.color if level_curr else "#6B6B6B",
        },
        "dimensions": by_delta,
        "dimension_count": len(dimensions),
        "improved_count": improved,
        "stable_count": stable,
        "declined_count": declined,
        "evolution": evolution,
        "score_trend": score_trend,
        "findings": _evolution_findings(
            by_delta,
            delta=delta,
            improved_count=improved,
            declined_count=declined,
            level_init=level_init.label if level_init else "-",
            level_curr=level_curr.label if level_curr else "-",
        ),
        "narrative": narrative,
        **recommendation_evolution,
    }

    pdf_bytes = await render_pdf("comparison_report.html", context)
    # Underscores between the four fields, dashes only within each one (the
    # bank's slug, each date) -- "evolution-bank-name-2026-07-14-2026-07-29"
    # ran every field into the next with no way to tell where one ended and
    # the other began.
    filename = (
        f"evolution-maturite-data_{_safe_filename_part(bank_name)}_"
        f"{initial.created_at:%Y-%m-%d}_a_{current.created_at:%Y-%m-%d}.pdf"
    )
    return _pdf_response(pdf_bytes, filename)


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
        global_level.label if global_level else "-"
    )

    rows = _dimension_rows(assessment, dim_by_id, bands)
    profile = _profile_context(rows, score_global=score_global, bands=bands)

    # Both are independent LLM calls (each already off-loaded to a worker
    # thread internally), run together so a first-time report download pays
    # for the slower of the two, not both back-to-back -- get_dimension_analysis
    # writes through its own session precisely so this is safe to overlap
    # with get_narrative's use of `db`.
    narrative_result, analyses_result = await asyncio.gather(
        get_narrative(db, assessment),
        get_dimension_analysis(db, assessment, profile["dimensions"]),
        return_exceptions=True,
    )
    narrative = None if isinstance(narrative_result, Exception) else narrative_result
    analyses = {} if isinstance(analyses_result, Exception) else analyses_result
    # Merged onto the same dicts `profile["dimensions"]` (spread into the
    # context below) already carries, so the template reads one list, not a
    # score row plus a separate lookup by name.
    for d in profile["dimensions"]:
        d["analysis"] = analyses.get(d["name"], "")

    bank_name = assessment.bank.name if assessment.bank else "-"
    bank_logo = bank_logo_data_uri(assessment.bank.logo_path if assessment.bank else None)
    date_str = assessment.created_at.strftime("%d/%m/%Y")
    # Filename-safe (no "/"), unlike date_str above which is only ever shown
    # in the report body.
    date_slug = assessment.created_at.strftime("%Y-%m-%d")

    context = {
        "report_title": "Rapport d'évaluation de maturité data",
        "report_subtitle": (
            f"{bank_name} : évaluation du {date_str}, niveau {maturity_label}"
        ),
        "bank_logo_data_uri": bank_logo,
        "cover_meta": [
            {"label": "Établissement", "value": bank_name},
            {"label": "Réf. dossier", "value": f"#{assessment_id}"},
            {"label": "Département", "value": assessment.department or "-"},
            {"label": "Évaluateur", "value": assessment.evaluator_role or "-"},
            {"label": "Date d'évaluation", "value": date_str},
            {
                "label": "Score global",
                "value": f"{score_global:.1f}",
                "unit": "/ 5",
            },
        ],
        "assessment_date": date_str,
        "score_global": score_global,
        "maturity_label": maturity_label,
        **profile,
        "findings": _key_findings(
            profile["dimensions"],
            score_global=score_global,
            weak_count=profile["weak_count"],
        ),
        "narrative": narrative,
    }

    pdf_bytes = await render_pdf("evaluation_report.html", context)
    return _pdf_response(pdf_bytes, f"evaluation-{date_slug}.pdf")


# ── Recommendations report ────────────────────────────────────────────────
# Mirrors the "Exporter PDF" button on the Recommendations page: same
# plan_prioritaire the page renders, so the download matches what was on
# screen rather than a separately-computed variant.

@router.get("/{assessment_id}/recommendations-report.pdf")
async def download_recommendations_report(
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
        global_level.label if global_level else "-"
    )

    rows = _dimension_rows(assessment, dim_by_id, bands)
    profile = _profile_context(rows, score_global=score_global, bands=bands)

    try:
        narrative = await get_narrative(db, assessment)
    except Exception:
        narrative = None

    plan = await get_or_create_recommendation_plan(db, assessment)
    recommendations = [
        {
            "rank": r["rank"],
            "title": r["title"],
            "text": r.get("texte_reformule") or r["recommendation_text"],
            "justification": r.get("justification"),
            "dimension_name": (
                dim_by_id[r["dimension_id"]].name
                if r["dimension_id"] in dim_by_id
                else "-"
            ),
            "effort": r["effort"],
            "effort_label": _EFFORT_LABELS.get(r["effort"], f"Effort {r['effort']}"),
            "is_quick_win": r["effort"] == 1,
            "regulatory_flag": r["regulatory_flag"],
            "trigger_level": r["trigger_level"],
            "target_level": r["target_level"],
            # Figure 2 (the impact/effort matrix) plots the model's own
            # relevance score as impact.
            "impact": r.get("score"),
        }
        for r in plan.get("plan_prioritaire", [])
    ]

    total_count = len(recommendations)
    quick_win_count = sum(1 for r in recommendations if r["is_quick_win"])
    regulatory_count = sum(1 for r in recommendations if r["regulatory_flag"])

    bank_name = assessment.bank.name if assessment.bank else "-"
    bank_logo = bank_logo_data_uri(assessment.bank.logo_path if assessment.bank else None)
    date_str = assessment.created_at.strftime("%d/%m/%Y")
    # Filename-safe (no "/"), unlike date_str above which is only ever shown
    # in the report body -- same convention as the evaluation report's own
    # date-only name.
    date_slug = assessment.created_at.strftime("%Y-%m-%d")

    context = {
        "report_title": "Plan d'action : Recommandations priorisées",
        "report_subtitle": (
            f"{bank_name} : évaluation du {date_str}, niveau {maturity_label}"
        ),
        "bank_logo_data_uri": bank_logo,
        "cover_meta": [
            {"label": "Établissement", "value": bank_name},
            {"label": "Réf. dossier", "value": f"#{assessment_id}"},
            {"label": "Date d'évaluation", "value": date_str},
            {"label": "Niveau de maturité", "value": maturity_label},
            {
                "label": "Score global",
                "value": f"{score_global:.1f}",
                "unit": "/ 5",
            },
            {"label": "Initiatives priorisées", "value": str(total_count)},
        ],
        "assessment_date": date_str,
        "score_global": score_global,
        "maturity_label": maturity_label,
        **profile,
        "matrix": priority_matrix(recommendations),
        "findings": _key_findings(
            profile["dimensions"],
            score_global=score_global,
            weak_count=profile["weak_count"],
            total_count=total_count,
            quick_win_count=quick_win_count,
            regulatory_count=regulatory_count,
        ),
        "narrative": narrative,
        "total_count": total_count,
        "quick_win_count": quick_win_count,
        "regulatory_count": regulatory_count,
        "recommendations": recommendations,
    }

    pdf_bytes = await render_pdf("recommendations_report.html", context)
    return _pdf_response(pdf_bytes, f"recommandations-evaluation-{date_slug}.pdf")
