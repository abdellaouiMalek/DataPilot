"""Staged framework editing and questionnaire versions.

Editing the framework no longer writes through: the admin page stages the whole
tree here (``PUT /draft``, autosaved) and only ``POST /publish`` touches the
live ``dimensions`` / ``sub_dimensions`` / ``questions`` tables. Publishing
happens in a single transaction and writes an immutable
:class:`QuestionnaireVersion` snapshot with a computed changelog.

The per-entity CRUD in ``app.routers.admin`` is left in place, it's what the
draft's tree is built from, and nothing else has to change for the editor to
work.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_back_office, require_super_admin
from app.db.database import get_db
from app.models import Assessment, FrameworkDraft, QuestionnaireVersion
from app.models.audit_log import MODULE_FRAMEWORK, MODULE_VERSIONS
from app.schemas.framework import (
    DraftRead,
    DraftSave,
    FrameworkState,
    PublishRequest,
    VersionArchivedUpdate,
    VersionDetail,
    VersionEdit,
    VersionSummary,
)
from app.services.audit import (
    STATUS_WARNING,
    Audit,
    audit_context,
    summarize_changes,
)
from app.services.framework_publish import (
    apply_tree,
    build_changelog,
    build_snapshot,
    collect_question_ids,
    delete_orphaned_draft_recommendations,
    next_version_number,
    promote_draft_recommendations,
)
from app.services.notifications import notify_admins_of_new_questionnaire_version

router = APIRouter(
    prefix="/api/super-admin/framework",
    tags=["super-admin-framework"],
    # No blanket dependency here (unlike before) -- reads (state/versions) are
    # open to the reduced "admin" role too (require_back_office), writes stay
    # require_super_admin, declared explicitly per endpoint below. The
    # blanket gate used to 403 AdminVersions.tsx's load for an admin caller
    # even though that page is already reused at /admin/versions.
)

# The framework has one pending state, shared by whoever is editing it.
DRAFT_ID = 1


def _claim_name(claims: dict) -> str:
    return (
        claims.get("name")
        or claims.get("preferred_username")
        or claims.get("email")
        or "Admin"
    )


async def _get_draft(db: AsyncSession) -> FrameworkDraft | None:
    return await db.get(FrameworkDraft, DRAFT_ID)


async def _assessment_counts(db: AsyncSession) -> dict[int, int]:
    """How many assessments were answered on each version.

    This is what makes a restore a decision rather than a guess, and what
    makes a version undeletable -- the FK is ``RESTRICT``, so a version people
    have answered on must stay readable for ever.
    """
    stmt = (
        select(Assessment.version_id, func.count(Assessment.id))
        .where(Assessment.version_id.is_not(None))
        .group_by(Assessment.version_id)
    )
    return {version_id: count for version_id, count in (await db.execute(stmt)).all()}


def _summary(version: QuestionnaireVersion, counts: dict[int, int]) -> VersionSummary:
    return VersionSummary.model_validate(version).model_copy(
        update={"assessment_count": counts.get(version.id, 0)}
    )


def _detail(version: QuestionnaireVersion, counts: dict[int, int]) -> VersionDetail:
    return VersionDetail.model_validate(version).model_copy(
        update={"assessment_count": counts.get(version.id, 0)}
    )


async def _active_version(db: AsyncSession) -> QuestionnaireVersion | None:
    """The version currently applied to the live tables.

    Normally the newest, but a restore moves the flag back to an older one, so
    this is what the editor bases its edits on -- never `max(number)`.
    """
    stmt = select(QuestionnaireVersion).where(QuestionnaireVersion.is_active.is_(True))
    active = (await db.execute(stmt)).scalars().first()
    if active is not None:
        return active
    # No flag yet (nothing published): fall back to the newest, if any.
    stmt = select(QuestionnaireVersion).order_by(QuestionnaireVersion.number.desc()).limit(1)
    return (await db.execute(stmt)).scalars().first()


async def _set_active(db: AsyncSession, version: QuestionnaireVersion) -> None:
    """Move the active flag, clearing the previous holder first so the partial
    unique index never sees two live rows mid-transaction."""
    await db.execute(
        update(QuestionnaireVersion)
        .where(QuestionnaireVersion.is_active.is_(True))
        .values(is_active=False)
    )
    await db.flush()
    version.is_active = True
    # Restoring an archived version puts it back in service, so it can no
    # longer be presented as retired -- and a check constraint forbids it.
    version.archived = False
    await db.flush()


@router.get("/state", response_model=FrameworkState, dependencies=[Depends(require_back_office)])
async def get_state(db: AsyncSession = Depends(get_db)):
    """Live tree + any staged draft + the version the editor is based on."""
    snapshot = await build_snapshot(db)
    draft = await _get_draft(db)
    active = await _active_version(db)
    counts = await _assessment_counts(db) if active else {}
    return FrameworkState(
        tree=snapshot["dimensions"],
        draft=DraftRead.model_validate(draft) if draft else None,
        active_version=_summary(active, counts) if active else None,
    )


@router.put("/draft", response_model=DraftRead)
async def save_draft(
    payload: DraftSave,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_super_admin),
):
    """Autosave target. Never touches the live framework."""
    draft = await _get_draft(db)
    if draft is None:
        draft = FrameworkDraft(id=DRAFT_ID, tree=[])
        db.add(draft)

    draft.tree = payload.tree
    draft.base_version_id = payload.base_version_id
    draft.updated_by_sub = claims.get("sub")
    draft.updated_by_name = _claim_name(claims)

    # A draft recommendation whose question is no longer in the saved tree
    # (the admin deleted that question) is now orphaned -- remove it here so
    # it never lingers past the edit that removed its question.
    await delete_orphaned_draft_recommendations(db, keep_keys=collect_question_ids(payload.tree))

    await db.commit()
    await db.refresh(draft)
    return DraftRead.model_validate(draft)


@router.delete("/draft", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_super_admin)])
async def discard_draft(
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    """Autosaves (``PUT /draft``) are intentionally not audited, they fire on
    every edit and would bury the actions that matter. Throwing the draft away
    is a decision, so that one is recorded."""
    draft = await _get_draft(db)
    if draft is not None:
        await db.delete(draft)
    # Runs even when there was no draft row to delete -- a draft
    # recommendation could otherwise survive with no route left to remove it
    # (its draft key no longer backed by anything).
    await delete_orphaned_draft_recommendations(db)
    await db.commit()
    if draft is not None:
        await audit.record(
            module=MODULE_FRAMEWORK,
            action="Abandon des modifications en cours",
            entity_type="framework_draft",
            entity_id=DRAFT_ID,
            before="Brouillon en cours",
            after="Abandonné",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/publish", response_model=VersionDetail, status_code=201)
async def publish(
    payload: PublishRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_super_admin),
    audit: Audit = Depends(audit_context),
):
    """Apply the staged tree and freeze it as a new version.

    Everything below happens in one transaction: either the framework moves to
    the published state and the version row exists, or nothing changed.
    """
    if not payload.tree:
        raise HTTPException(
            status_code=400,
            detail="Le questionnaire doit contenir au moins une dimension.",
        )

    # Same 100% ceiling as the direct dimension-CRUD endpoints (admin.py),
    # applied here too since the staged framework editor never goes through
    # those -- it only ever writes via this one bulk publish. A dimension's
    # weight is read everywhere else as "worth weight% of the global score",
    # only true if active dimensions add up to 100.
    active_weight_total = sum(
        float(node.get("weight", 0) or 0)
        for node in payload.tree
        if bool(node.get("is_active", True))
    )
    if active_weight_total > 100.01:
        raise HTTPException(
            status_code=400,
            detail=(
                "Le poids total des dimensions actives dépasse 100% "
                f"({active_weight_total:.1f}%). Ajustez les poids avant de publier."
            ),
        )

    active = await _active_version(db)
    active_id = active.id if active else None
    # Read eagerly: _set_active() below issues a bulk UPDATE over the very row
    # `active` maps to, which leaves its attributes expired -- touching them
    # afterwards would fire a lazy refresh from async code (MissingGreenlet).
    previous_label = f"v{active.number}" if active else "Brouillon"
    # Optimistic concurrency: refuse rather than silently overwrite a colleague.
    if payload.base_version_id != active_id:
        raise HTTPException(
            status_code=409,
            detail=(
                "Le référentiel a été publié par quelqu'un d'autre entre-temps. "
                "Rechargez la page pour repartir de la version la plus récente."
            ),
        )

    before = (await build_snapshot(db))["dimensions"]

    try:
        promoted = await apply_tree(db, payload.tree)
        if promoted:
            await promote_draft_recommendations(db, promoted)
        # Anything still draft-flagged here belongs to a draft question that
        # isn't in the tree just published (deleted before publish, or the
        # reconciliation in save_draft hasn't caught up yet) -- orphaned.
        await delete_orphaned_draft_recommendations(db)
        after = await build_snapshot(db)
        version = QuestionnaireVersion(
            number=await next_version_number(db),
            label=payload.label.strip(),
            note=payload.note.strip(),
            changelog=build_changelog(before, after["dimensions"]),
            snapshot=after,
            dimension_count=after["dimension_count"],
            question_count=after["question_count"],
            created_by_sub=claims.get("sub"),
            created_by_name=_claim_name(claims),
        )
        db.add(version)
        await db.flush()
        await _set_active(db, version)
        # Same transaction as the publish itself (see the function's own
        # docstring) -- a version can never go live without the admins
        # hearing about it.
        await notify_admins_of_new_questionnaire_version(db, version)

        draft = await _get_draft(db)
        if draft is not None:
            await db.delete(draft)

        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:  # noqa: BLE001, reported verbatim to the admin
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Publication impossible : {exc}",
        ) from exc

    await db.refresh(version)
    await audit.record(
        module=MODULE_VERSIONS,
        action=f"Publication questionnaire v{version.number}",
        entity_type="questionnaire_version",
        entity_id=version.id,
        entity_label=version.label or f"v{version.number}",
        before=previous_label,
        after=f"v{version.number} publiée",
        details={
            "dimensions": version.dimension_count,
            "questions": version.question_count,
            "changements": len(version.changelog or []),
        },
    )
    return _detail(version, await _assessment_counts(db))


@router.get("/versions", response_model=list[VersionSummary], dependencies=[Depends(require_back_office)])
async def list_versions(db: AsyncSession = Depends(get_db)):
    """Newest first, archived ones included.

    Snapshots are excluded, they're large and unused here. Archived versions
    are returned with their flag rather than filtered out: the log is small and
    the page decides what to show, so "voir les archivées" costs no round-trip.
    """
    stmt = select(QuestionnaireVersion).order_by(QuestionnaireVersion.number.desc())
    versions = (await db.execute(stmt)).scalars().all()
    counts = await _assessment_counts(db)
    return [_summary(v, counts) for v in versions]


@router.get("/versions/{version_id}", response_model=VersionDetail, dependencies=[Depends(require_back_office)])
async def get_version(version_id: int, db: AsyncSession = Depends(get_db)):
    version = await db.get(QuestionnaireVersion, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version introuvable")
    return _detail(version, await _assessment_counts(db))


@router.patch("/versions/{version_id}", response_model=VersionDetail, dependencies=[Depends(require_super_admin)])
async def edit_version(
    version_id: int,
    payload: VersionEdit,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    """Fix a version's label or note after the fact.

    Only these two: the snapshot and the computed changelog are the record of
    what was published, and rewriting them would make the log a worse witness
    than no log at all.
    """
    version = await db.get(QuestionnaireVersion, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version introuvable")

    previous = {"label": version.label, "note": version.note}
    version.label = payload.label.strip()
    version.note = payload.note.strip()
    await db.commit()
    await db.refresh(version)
    before, after, fields = summarize_changes(
        previous,
        {"label": version.label, "note": version.note},
        {"label": "Libellé", "note": "Note"},
    )
    if fields:
        await audit.record(
            module=MODULE_VERSIONS,
            action=f"Modification version v{version.number}",
            entity_type="questionnaire_version",
            entity_id=version.id,
            entity_label=version.label or f"v{version.number}",
            before=before,
            after=after,
            details={"champs": fields},
        )
    return _detail(version, await _assessment_counts(db))


@router.put("/versions/{version_id}/archived", response_model=VersionDetail, dependencies=[Depends(require_super_admin)])
async def set_version_archived(
    version_id: int,
    payload: VersionArchivedUpdate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    """Retire a version from the log's default view, or bring it back.

    Nothing is destroyed: the snapshot stays readable, assessments keep
    pointing at it, and it can still be restored (which un-archives it).
    """
    version = await db.get(QuestionnaireVersion, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version introuvable")

    if payload.archived and version.is_active:
        raise HTTPException(
            status_code=400,
            detail=(
                f"La version v{version.number} est celle en ligne. Restaurez une "
                "autre version avant de l'archiver."
            ),
        )

    version.archived = payload.archived
    await db.commit()
    await db.refresh(version)
    await audit.record(
        module=MODULE_VERSIONS,
        action=("Archivage" if payload.archived else "Désarchivage")
        + f" version questionnaire v{version.number}",
        entity_type="questionnaire_version",
        entity_id=version.id,
        entity_label=version.label or f"v{version.number}",
        before="Archivé" if not payload.archived else "Publié",
        after="Archivé" if payload.archived else "Publié",
    )
    return _detail(version, await _assessment_counts(db))


@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_super_admin)])
async def delete_version(
    version_id: int,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    """Erase a version for good, only when nothing depends on it.

    Three things can depend on one: it can be the live questionnaire, it can be
    what assessments were answered on (the FK is ``RESTRICT``, so the database
    would refuse anyway, this just says so in French), or it can be the
    version the pending draft was started from, which publishing compares
    against. Anything else obsolete should be archived, not deleted.
    """
    version = await db.get(QuestionnaireVersion, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version introuvable")

    if version.is_active:
        raise HTTPException(
            status_code=400,
            detail=(
                f"La version v{version.number} est celle en ligne et ne peut pas "
                "être supprimée."
            ),
        )

    used = (await _assessment_counts(db)).get(version.id, 0)
    if used:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{used} évaluation{'s' if used > 1 else ''} "
                f"{'ont' if used > 1 else 'a'} été réalisée"
                f"{'s' if used > 1 else ''} sur la version v{version.number}. "
                "Elle doit rester lisible : archivez-la plutôt que de la supprimer."
            ),
        )

    draft = await _get_draft(db)
    if draft is not None and draft.base_version_id == version.id:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Les modifications en cours sont basées sur la version "
                f"v{version.number}. Publiez-les ou abandonnez-les d'abord."
            ),
        )

    number, label = version.number, version.label
    await db.delete(version)
    await db.commit()
    await audit.record(
        module=MODULE_VERSIONS,
        action=f"Suppression version questionnaire v{number}",
        status=STATUS_WARNING,
        entity_type="questionnaire_version",
        entity_id=version_id,
        entity_label=label or f"v{number}",
        before=f"v{number}",
        after="Supprimée définitivement",
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/versions/{version_id}/restore", response_model=VersionDetail)
async def restore_version(
    version_id: int,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_super_admin),
    audit: Audit = Depends(audit_context),
):
    """Put an older version back in service.

    The version row is never rewritten: its snapshot is replayed onto the live
    ``dimensions`` / ``sub_dimensions`` / ``questions`` tables through the same
    reconciliation publishing uses, and the active flag moves to it. So the log
    keeps every version exactly as published, while the questionnaire people
    answer becomes the restored one.

    Same safety as a publish: a question that already carries answers is
    deactivated rather than deleted, so nothing in the assessment history is
    lost by going back and forth between versions.
    """
    version = await db.get(QuestionnaireVersion, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version introuvable")

    if version.is_active:
        raise HTTPException(
            status_code=400,
            detail=f"La version v{version.number} est déjà celle en ligne.",
        )

    # Same reason as in publish(): capture it before _set_active() expires it.
    replaced = await _active_version(db)
    replaced_label = (
        f"v{replaced.number} en ligne" if replaced else "Aucune version active"
    )

    # Restoring would silently overwrite whatever is staged, so make the admin
    # decide what happens to it first.
    if await _get_draft(db) is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "Des modifications non publiées sont en cours. Publiez-les ou "
                "abandonnez-les avant de restaurer une version."
            ),
        )

    tree = version.snapshot.get("dimensions") if isinstance(version.snapshot, dict) else None
    if not tree:
        raise HTTPException(
            status_code=400,
            detail=f"La version v{version.number} ne contient aucun questionnaire exploitable.",
        )

    try:
        await apply_tree(db, tree)
        await _set_active(db, version)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:  # noqa: BLE001, reported verbatim to the admin
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Restauration impossible : {exc}",
        ) from exc

    await db.refresh(version)
    await audit.record(
        module=MODULE_VERSIONS,
        action=f"Restauration version questionnaire v{version.number}",
        entity_type="questionnaire_version",
        entity_id=version.id,
        entity_label=version.label or f"v{version.number}",
        before=replaced_label,
        after=f"v{version.number} en ligne",
    )
    return _detail(version, await _assessment_counts(db))
