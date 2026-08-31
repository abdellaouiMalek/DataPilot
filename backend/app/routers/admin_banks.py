"""Admin bank-management endpoints.

Banks live in the app's own Postgres (unlike users, which live in Keycloak).
Each bank row is enriched with assessment stats via a grouped join — latest
global score, number of submissions, date of the last one. Lifecycle mirrors
the users module: ``is_active`` toggles (Désactivé), ``archived`` hides from
the default list; banks with assessments can't be deleted (FK RESTRICT), they
get archived instead.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_super_admin
from app.db.database import get_db
from app.models import Assessment, Bank
from app.models.audit_log import MODULE_BANKS
from app.schemas.admin_bank import (
    BankActiveUpdate,
    BankAdminRead,
    BankArchivedUpdate,
    BankCreate,
    BankUpdate,
)
from app.services.audit import Audit, audit_context, summarize_changes

router = APIRouter(prefix="/api/super-admin/banks", tags=["super-admin-banks"])


# Field -> French label, for the "avant → après" text on an edit.
BANK_FIELD_LABELS = {
    "name": "Nom",
    "country": "Pays",
    "sector": "Secteur",
    "contact": "Contact",
    "description": "Description",
}


def _status(bank: Bank) -> str:
    if bank.archived:
        return "Archivé"
    return "Actif" if bank.is_active else "Désactivé"


def _to_read(bank: Bank, stats: dict[str, Any]) -> BankAdminRead:
    count = stats.get("count", 0)
    return BankAdminRead(
        id=bank.id,
        name=bank.name,
        country=bank.country,
        sector=bank.sector,
        contact=bank.contact,
        description=bank.description,
        is_active=bank.is_active,
        archived=bank.archived,
        status=_status(bank),
        created_at=bank.created_at,
        score=stats.get("score"),
        assessments_count=count,
        last_assessment_at=stats.get("last_at"),
    )


async def _stats_by_bank(db: AsyncSession) -> dict[int, dict[str, Any]]:
    """bank_id -> {count, last_at, score (latest assessment's global score)}."""
    grouped = await db.execute(
        select(
            Assessment.bank_id,
            func.count(Assessment.id),
            func.max(Assessment.created_at),
        ).group_by(Assessment.bank_id)
    )
    stats = {
        bank_id: {"count": count, "last_at": last_at, "score": None}
        for bank_id, count, last_at in grouped.all()
    }

    # Latest score per bank (Postgres DISTINCT ON, newest first).
    latest = await db.execute(
        select(Assessment.bank_id, Assessment.score_global)
        .distinct(Assessment.bank_id)
        .order_by(Assessment.bank_id, Assessment.created_at.desc())
    )
    for bank_id, score in latest.all():
        if bank_id in stats:
            stats[bank_id]["score"] = score
    return stats


async def _get_bank(db: AsyncSession, bank_id: int) -> Bank:
    bank = await db.get(Bank, bank_id)
    if bank is None:
        raise HTTPException(status_code=404, detail="Banque introuvable.")
    return bank


async def _read_one(db: AsyncSession, bank: Bank) -> BankAdminRead:
    stats = await _stats_by_bank(db)
    return _to_read(bank, stats.get(bank.id, {}))


@router.get("", response_model=list[BankAdminRead])
async def list_banks(
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_super_admin),
):
    banks = (
        (await db.execute(select(Bank).order_by(Bank.sort_order, Bank.id)))
        .scalars()
        .all()
    )
    stats = await _stats_by_bank(db)
    return [_to_read(b, stats.get(b.id, {})) for b in banks]


@router.post("", response_model=BankAdminRead, status_code=201)
async def create_bank(
    payload: BankCreate,
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_super_admin),
    audit: Audit = Depends(audit_context),
):
    max_order = (
        await db.execute(select(func.coalesce(func.max(Bank.sort_order), 0)))
    ).scalar_one()
    bank = Bank(
        name=payload.name.strip(),
        country=payload.country.strip(),
        sector=payload.sector.strip(),
        contact=(payload.contact or "").strip() or None,
        description=payload.description.strip(),
        sort_order=max_order + 1,
    )
    db.add(bank)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Une banque porte déjà ce nom.")
    await db.refresh(bank)
    await audit.record(
        module=MODULE_BANKS,
        action=f"Création banque {bank.name}",
        entity_type="bank",
        entity_id=bank.id,
        entity_label=bank.name,
        after=f"{bank.name} · {bank.sector or 'secteur non renseigné'}",
    )
    return await _read_one(db, bank)


@router.put("/{bank_id}", response_model=BankAdminRead)
async def update_bank(
    bank_id: int,
    payload: BankUpdate,
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_super_admin),
    audit: Audit = Depends(audit_context),
):
    bank = await _get_bank(db, bank_id)
    previous = {
        "name": bank.name,
        "country": bank.country,
        "sector": bank.sector,
        "contact": bank.contact,
        "description": bank.description,
    }
    bank.name = payload.name.strip()
    bank.country = payload.country.strip()
    bank.sector = payload.sector.strip()
    bank.contact = (payload.contact or "").strip() or None
    bank.description = payload.description.strip()
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Une banque porte déjà ce nom.")
    await db.refresh(bank)
    before, after, fields = summarize_changes(
        previous,
        {
            "name": bank.name,
            "country": bank.country,
            "sector": bank.sector,
            "contact": bank.contact,
            "description": bank.description,
        },
        BANK_FIELD_LABELS,
    )
    if fields:
        await audit.record(
            module=MODULE_BANKS,
            action=f"Modification banque {bank.name}",
            entity_type="bank",
            entity_id=bank.id,
            entity_label=bank.name,
            before=before,
            after=after,
            details={"champs": fields},
        )
    return await _read_one(db, bank)


@router.put("/{bank_id}/active", response_model=BankAdminRead)
async def set_bank_active(
    bank_id: int,
    payload: BankActiveUpdate,
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_super_admin),
    audit: Audit = Depends(audit_context),
):
    bank = await _get_bank(db, bank_id)
    was = _status(bank)
    bank.is_active = payload.is_active
    await db.commit()
    await db.refresh(bank)
    await audit.record(
        module=MODULE_BANKS,
        action=("Activation" if payload.is_active else "Désactivation")
        + f" banque {bank.name}",
        entity_type="bank",
        entity_id=bank.id,
        entity_label=bank.name,
        before=was,
        after=_status(bank),
    )
    return await _read_one(db, bank)


@router.put("/{bank_id}/archived", response_model=BankAdminRead)
async def set_bank_archived(
    bank_id: int,
    payload: BankArchivedUpdate,
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(require_super_admin),
    audit: Audit = Depends(audit_context),
):
    bank = await _get_bank(db, bank_id)
    was = _status(bank)
    bank.archived = payload.archived
    # Archiving hides the bank from the public selector too; restoring re-enables.
    bank.is_active = not payload.archived
    await db.commit()
    await db.refresh(bank)
    await audit.record(
        module=MODULE_BANKS,
        action=("Archivage" if payload.archived else "Restauration")
        + f" banque {bank.name}",
        entity_type="bank",
        entity_id=bank.id,
        entity_label=bank.name,
        before=was,
        after=_status(bank),
    )
    return await _read_one(db, bank)
