"""Admin "Veille réglementaire" endpoints: import a circular (file or URL),
poll its AI analysis (runs in the background, see ``services.regulatory``),
review the proposed impacts, and publish once every impact has been
triaged. Admin-only, like admin.py.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_super_admin
from app.db.database import get_db
from app.models import RegulatoryCircular, RegulatoryImpact
from app.schemas.regulatory import CircularDetailRead, CircularRead, ImpactRead, ImpactUpdate
from app.services.regulatory import (
    compute_source_hash,
    create_pending_circular,
    fetch_source,
    find_circular_by_hash,
    run_circular_analysis,
)
from app.services.regulatory_index import reindex_catalog

router = APIRouter(
    prefix="/api/super-admin/regulatory",
    tags=["regulatory"],
    dependencies=[Depends(require_super_admin)],
)

_VALID_ACTIONS = {"accepté", "modifié", "rejeté"}


def _circular_query():
    return select(RegulatoryCircular).options(
        selectinload(RegulatoryCircular.impacts)
    )


async def _get_circular_or_404(db: AsyncSession, circular_id: int) -> RegulatoryCircular:
    circular = await db.scalar(
        _circular_query().where(RegulatoryCircular.id == circular_id)
    )
    if circular is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Circulaire introuvable.")
    return circular


async def _get_impact_or_404(db: AsyncSession, impact_id: int) -> RegulatoryImpact:
    impact = await db.get(RegulatoryImpact, impact_id)
    if impact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Impact introuvable.")
    return impact


def _placeholder_reference(filename: str | None, url: str | None) -> str:
    """Référence provisoire affichée pendant que l'analyse tourne en
    arrière-plan -- remplacée par la référence extraite automatiquement du
    contenu de la circulaire dès que l'analyse aboutit (voir
    ``llm.regulatory_analysis.extract_reference_theme``), sauf si
    l'extraction échoue et que ce provisoire reste donc le seul repli."""
    import re

    name = filename or (url or "").rsplit("/", 1)[-1] or "Circulaire"
    name = re.sub(r"\.[a-zA-Z0-9]+$", "", name).strip()
    return name[:200] or "Circulaire"


@router.post("/reindex")
async def reindex(db: AsyncSession = Depends(get_db)):
    """Ré-encode tout le référentiel actif (questions + recommandations)
    dans l'index vectoriel utilisé par la recherche RAG (voir
    ``app.services.regulatory_index``). À relancer manuellement après un
    changement notable du référentiel (nouvelle question/recommandation,
    texte modifié) -- pas déclenché automatiquement à chaque écriture
    admin. Synchrone (dure quelques secondes à cette échelle, pas besoin
    d'un traitement en arrière-plan)."""
    return await reindex_catalog(db)


@router.get("/circulars", response_model=list[CircularRead])
async def list_circulars(db: AsyncSession = Depends(get_db)):
    stmt = _circular_query().order_by(RegulatoryCircular.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.get("/circulars/{circular_id}", response_model=CircularDetailRead)
async def get_circular(circular_id: int, db: AsyncSession = Depends(get_db)):
    """Also the polling endpoint: the frontend re-calls this after
    ``POST .../import`` until ``analysis_status`` is no longer "en_cours"."""
    return await _get_circular_or_404(db, circular_id)


@router.delete("/circulars/{circular_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_circular(circular_id: int, db: AsyncSession = Depends(get_db)):
    """Supprime une circulaire importée (et ses impacts proposés, en
    cascade) -- ex. un import de test ou par erreur. Refuse de supprimer
    une circulaire déjà PUBLIÉE : une fois publiée, elle fait partie du
    référentiel réglementaire tracé, sa suppression casserait la
    traçabilité attendue en contexte bancaire -- l'admin peut toujours la
    laisser en place (elle reste consultable) plutôt que de perdre cet
    historique."""
    circular = await _get_circular_or_404(db, circular_id)
    if circular.is_published:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cette circulaire est publiée et ne peut pas être supprimée (traçabilité réglementaire).",
        )
    await db.delete(circular)
    await db.commit()


@router.post(
    "/circulars/import",
    response_model=CircularDetailRead,
)
async def import_circular(
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(default=None),
    url: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Dépose une circulaire (fichier ou URL) : renvoie IMMÉDIATEMENT la
    ligne créée avec ``analysis_status="en_cours"`` (ou une ligne déjà
    analysée si ce même document -- même empreinte -- a déjà été importé),
    pendant que l'extraction + l'analyse LLM tournent en arrière-plan. Le
    front doit re-consulter ``GET .../circulars/{id}`` jusqu'à ce que
    ``analysis_status`` change.

    Référence et thème ne sont PAS demandés à l'admin : ils sont extraits
    automatiquement du contenu de la circulaire pendant l'analyse (voir
    ``llm.regulatory_analysis.extract_reference_theme``) -- la référence
    provisoire ci-dessous (nom de fichier) n'est visible que le temps de
    l'analyse. La date de publication est simplement la date d'import
    (aujourd'hui), pas une date extraite ni saisie."""
    if not file and not url:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Fournissez un fichier ou une URL."
        )

    file_bytes = await file.read() if file else None
    raw_bytes, source_filename = await fetch_source(
        file_bytes=file_bytes, filename=file.filename if file else None, url=url or None
    )
    source_hash = compute_source_hash(raw_bytes)

    cached = await find_circular_by_hash(db, source_hash)
    if cached is not None:
        # Re-fetch through the eager-loaded query: `find_circular_by_hash`
        # doesn't selectinload `impacts`, and CircularDetailRead needs it
        # (impact_count/pending_count/impacts) -- a lazy-load here would
        # fail outside the request's async session context.
        return await _get_circular_or_404(db, cached.id)

    circular = await create_pending_circular(
        db,
        reference=_placeholder_reference(file.filename if file else None, url),
        publication_date=date.today(),
        theme="",
        source_filename=file.filename if file else None,
        source_url=url or None,
        source_hash=source_hash,
    )
    background_tasks.add_task(run_circular_analysis, circular.id, raw_bytes)
    return await _get_circular_or_404(db, circular.id)


@router.patch("/impacts/{impact_id}", response_model=ImpactRead)
async def update_impact(
    impact_id: int, payload: ImpactUpdate, db: AsyncSession = Depends(get_db)
):
    impact = await _get_impact_or_404(db, impact_id)
    if payload.action is not None and payload.action not in _VALID_ACTIONS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"action doit être l'une de {sorted(_VALID_ACTIONS)} ou null.",
        )
    impact.action = payload.action
    impact.edited_text = payload.edited_text if payload.action == "modifié" else None
    await db.commit()
    await db.refresh(impact)
    return impact


@router.post("/circulars/{circular_id}/publish", response_model=CircularRead)
async def publish_circular(circular_id: int, db: AsyncSession = Depends(get_db)):
    circular = await _get_circular_or_404(db, circular_id)
    if circular.analysis_status != "terminee":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "L'analyse de cette circulaire n'est pas terminée.",
        )
    if circular.is_published:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cette circulaire est déjà publiée."
        )
    if not circular.impacts:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Aucun impact à publier pour cette circulaire.",
        )
    pending = [i for i in circular.impacts if i.action is None]
    if pending:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{len(pending)} exigence(s) en attente de validation.",
        )

    published_count = await db.scalar(
        select(func.count())
        .select_from(RegulatoryCircular)
        .where(RegulatoryCircular.is_published.is_(True))
    ) or 0

    circular.is_published = True
    circular.status = "En vigueur"
    circular.version = f"v{published_count + 1}"
    circular.published_at = func.now()
    await db.commit()
    await db.refresh(circular)
    return circular
