"""Publishing the staged framework: snapshot → changelog → reconciliation.

The admin page edits a whole tree offline and sends it back in one piece, so
publishing is a *reconciliation* (diff the desired tree against what's in the
database and apply the difference) rather than a stream of CRUD calls. Doing it
in one transaction is the point: a framework left half-applied, a question
moved but its sub-dimension not yet created, is worse than a rejected publish.

Deletion policy: whatever the new tree no longer contains is deleted outright,
answers or not. Historical assessments don't depend on these rows, they read
the questionnaire from the snapshot frozen in their own version (see
``app.services.questionnaire_reference``), so the live tables hold only the
current questionnaire instead of every question ever asked.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Iterable

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Dimension, Question, QuestionnaireVersion, Recommendation, SubDimension


def find_draft_question(
    tree: list[dict[str, Any]], question_key: str
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]] | None:
    """Locate ``(dimension_node, sub_dimension_node, question_node)`` for
    ``question_key`` inside a staged tree (same shape as
    ``FrameworkDraft.tree`` / this module's ``apply_tree`` argument).

    Returns ``None`` if the key isn't present -- the draft may have changed
    since the admin followed the "Configurer les recommandations" link
    (question edited/removed, or the draft discarded).
    """
    for dim_node in tree:
        for sub_node in dim_node.get("sub_dimensions", []):
            for question_node in sub_node.get("questions", []):
                if question_node.get("id") == question_key:
                    return dim_node, sub_node, question_node
    return None


def collect_question_ids(tree: list[dict[str, Any]]) -> set[str]:
    """Every question node id in a staged tree, as strings -- both real
    (already-numeric) and draft (temp) ids. Used to reconcile draft
    recommendations against whichever draft questions are still staged
    (see ``app.routers.admin_framework.save_draft``); including real ids in
    the result is harmless since a ``draft_question_key`` is never a bare
    number.
    """
    return {
        str(question_node.get("id"))
        for dim_node in tree
        for sub_node in dim_node.get("sub_dimensions", [])
        for question_node in sub_node.get("questions", [])
    }

# Question fields whose change is worth naming in the changelog.
QUESTION_FIELDS: dict[str, str] = {
    "text": "libellé",
    "description": "description",
    "type": "type",
    "weight": "poids",
    "is_required": "obligatoire",
    "is_active": "actif",
    "level_responses": "réponses par niveau",
    "choice_options": "options",
}

DIMENSION_FIELDS: dict[str, str] = {
    "name": "nom",
    "description": "description",
    "weight": "poids",
    "color": "couleur",
    "is_active": "actif",
}

SUBDIMENSION_FIELDS: dict[str, str] = {
    "name": "nom",
    "is_active": "actif",
}


# ── Snapshot ─────────────────────────────────────────────────────────────────

def _question_snapshot(question: Question) -> dict[str, Any]:
    # Shaped exactly like the admin API's question payload so the editor can
    # feed a snapshot through the same mapper it uses for the live tree.
    return {
        "id": question.id,
        "dimension_id": question.dimension_id,
        "sub_dimension_id": question.sub_dimension_id,
        "text": question.text,
        "description": question.description or "",
        "type": question.type,
        "weight": question.weight,
        "sort_order": question.sort_order,
        "is_required": question.is_required,
        "is_active": question.is_active,
        "level_responses": question.level_responses,
        "choice_options": question.choice_options,
    }


def _subdimension_snapshot(sub: SubDimension) -> dict[str, Any]:
    return {
        "id": sub.id,
        "dimension_id": sub.dimension_id,
        "name": sub.name,
        "sort_order": sub.sort_order,
        "is_active": sub.is_active,
        "questions": [
            _question_snapshot(q)
            for q in sorted(sub.questions, key=lambda q: (q.sort_order, q.id))
        ],
    }


def _dimension_snapshot(dimension: Dimension) -> dict[str, Any]:
    return {
        "id": dimension.id,
        "key": dimension.key,
        "code": dimension.code,
        "name": dimension.name,
        "short_name": dimension.short_name,
        "description": dimension.description,
        "weight": dimension.weight,
        "color": dimension.color,
        "sort_order": dimension.sort_order,
        "is_active": dimension.is_active,
        "sub_dimensions": [
            _subdimension_snapshot(s)
            for s in sorted(dimension.sub_dimensions, key=lambda s: (s.sort_order, s.id))
        ],
    }


def _dimension_query():
    return (
        select(Dimension)
        .options(selectinload(Dimension.sub_dimensions).selectinload(SubDimension.questions))
        .order_by(Dimension.sort_order, Dimension.id)
    )


async def build_snapshot(db: AsyncSession) -> dict[str, Any]:
    """Freeze the live framework as it stands right now."""
    dimensions = (await db.execute(_dimension_query())).scalars().unique().all()
    tree = [_dimension_snapshot(d) for d in dimensions]
    return {
        "dimensions": tree,
        "dimension_count": len(tree),
        "question_count": sum(
            len(s["questions"]) for d in tree for s in d["sub_dimensions"]
        ),
    }


# ── Changelog ────────────────────────────────────────────────────────────────

def _fmt(value: Any) -> str:
    if isinstance(value, bool):
        return "oui" if value else "non"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if value in (None, ""):
        return "-"
    if isinstance(value, (list, dict)):
        return "…"
    text = str(value)
    return text if len(text) <= 60 else text[:57] + "…"


def _short(text: str, limit: int = 60) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _diff_window(old: str, new: str, width: int = 44) -> str:
    """Show the neighbourhood of the first difference.

    Two long question labels that differ near the end are identical once
    truncated, which would render as ``libellé : même texte… → même texte…``.
    Anchoring the window on the first differing character keeps the entry
    short *and* informative.
    """
    limit = min(len(old), len(new))
    cut = next((i for i in range(limit) if old[i] != new[i]), limit)
    start = max(0, cut - 10)
    lead = "…" if start > 0 else ""
    old_tail = old[start : start + width]
    new_tail = new[start : start + width]
    old_end = "…" if start + width < len(old) else ""
    new_end = "…" if start + width < len(new) else ""
    return f"{lead}{old_tail}{old_end} → {lead}{new_tail}{new_end}"


def _field_changes(
    before: dict[str, Any], after: dict[str, Any], fields: dict[str, str]
) -> list[str]:
    changes: list[str] = []
    for key, label in fields.items():
        old, new = before.get(key), after.get(key)
        # JSON round-trips make 5 and 5.0 both plausible for the same weight.
        if isinstance(old, (int, float)) and isinstance(new, (int, float)):
            if float(old) == float(new):
                continue
        elif old == new:
            continue
        if key in ("level_responses", "choice_options"):
            changes.append(f"{label} modifiées")
        elif isinstance(old, str) and isinstance(new, str) and old and new:
            changes.append(f"{label} : {_diff_window(old, new)}")
        else:
            changes.append(f"{label} : {_fmt(old)} → {_fmt(new)}")
    return changes


def _index(tree: Iterable[dict[str, Any]]) -> tuple[dict, dict, dict]:
    """id → node, for each level of a snapshot tree (new items have no id)."""
    dims, subs, questions = {}, {}, {}
    for dimension in tree:
        if dimension.get("id"):
            dims[dimension["id"]] = dimension
        for sub in dimension.get("sub_dimensions", []):
            if sub.get("id"):
                subs[sub["id"]] = (sub, dimension)
            for question in sub.get("questions", []):
                if question.get("id"):
                    questions[question["id"]] = (question, dimension, sub)
    return dims, subs, questions


def build_changelog(
    before: list[dict[str, Any]], after: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Structured diff between two snapshot trees, newest state second.

    Entries are shaped for display: ``kind`` drives the icon/colour, ``label``
    names the item, ``details`` lists the individual field changes.
    """
    old_dims, old_subs, old_questions = _index(before)
    new_dims, new_subs, new_questions = _index(after)
    entries: list[dict[str, Any]] = []

    # Dimensions
    for dimension_id, dimension in new_dims.items():
        old = old_dims.get(dimension_id)
        if old is None:
            continue  # id present but unknown upstream, treated as added below
        changes = _field_changes(old, dimension, DIMENSION_FIELDS)
        if changes:
            entries.append({
                "kind": "dimension.updated",
                "label": dimension.get("name", ""),
                "details": changes,
            })
    for dimension in after:
        if not dimension.get("id") or dimension["id"] not in old_dims:
            entries.append({
                "kind": "dimension.added",
                "label": dimension.get("name", ""),
                "details": [],
            })
    for dimension_id, dimension in old_dims.items():
        if dimension_id not in new_dims:
            entries.append({
                "kind": "dimension.removed",
                "label": dimension.get("name", ""),
                "details": [],
            })

    # Sub-dimensions
    for sub_id, (sub, dimension) in new_subs.items():
        old = old_subs.get(sub_id)
        if old is None:
            continue
        changes = _field_changes(old[0], sub, SUBDIMENSION_FIELDS)
        if old[1].get("id") != dimension.get("id"):
            changes.append(f"déplacée vers « {dimension.get('name', '')} »")
        if changes:
            entries.append({
                "kind": "subdimension.updated",
                "label": f"{dimension.get('name', '')} › {sub.get('name', '')}",
                "details": changes,
            })
    for dimension in after:
        for sub in dimension.get("sub_dimensions", []):
            if not sub.get("id") or sub["id"] not in old_subs:
                entries.append({
                    "kind": "subdimension.added",
                    "label": f"{dimension.get('name', '')} › {sub.get('name', '')}",
                    "details": [],
                })
    for sub_id, (sub, dimension) in old_subs.items():
        if sub_id not in new_subs:
            entries.append({
                "kind": "subdimension.removed",
                "label": f"{dimension.get('name', '')} › {sub.get('name', '')}",
                "details": [],
            })

    # Questions
    for question_id, (question, dimension, sub) in new_questions.items():
        old = old_questions.get(question_id)
        if old is None:
            continue
        changes = _field_changes(old[0], question, QUESTION_FIELDS)
        if old[2].get("id") != sub.get("id"):
            changes.append(f"déplacée vers « {sub.get('name', '')} »")
        if changes:
            entries.append({
                "kind": "question.updated",
                "label": _short(question.get("text", "")),
                "details": changes,
            })
    for dimension in after:
        for sub in dimension.get("sub_dimensions", []):
            for question in sub.get("questions", []):
                if not question.get("id") or question["id"] not in old_questions:
                    entries.append({
                        "kind": "question.added",
                        "label": _short(question.get("text", "")),
                        "details": [f"{dimension.get('name', '')} › {sub.get('name', '')}"],
                    })
    for question_id, (question, dimension, sub) in old_questions.items():
        if question_id not in new_questions:
            entries.append({
                "kind": "question.removed",
                "label": _short(question.get("text", "")),
                "details": [f"{dimension.get('name', '')} › {sub.get('name', '')}"],
            })

    return entries


# ── Reconciliation ───────────────────────────────────────────────────────────

async def _resync_sequences(db: AsyncSession) -> None:
    """Keep each id sequence ahead of every id that has *ever* been used.

    Re-creating a row under an id a snapshot froze bypasses the sequence, so
    without this the next genuinely new row would be handed an id that is
    already taken.

    ``GREATEST`` with the sequence's own position is what stops it moving
    backwards after a deletion. Otherwise dropping the highest-numbered
    question would let the next one reuse its id, and that id already means
    something else in the snapshots of every version that contained it.
    """
    for table in ("dimensions", "sub_dimensions", "questions"):
        await db.execute(
            text(
                "SELECT setval(pg_get_serial_sequence(:table, 'id'), GREATEST("
                "  COALESCE((SELECT MAX(id) FROM " + table + "), 1),"
                "  COALESCE(pg_sequence_last_value("
                "    pg_get_serial_sequence(:table, 'id')::regclass), 1)"
                "))"
            ),
            {"table": table},
        )


async def apply_tree(db: AsyncSession, tree: list[dict[str, Any]]) -> dict[str, int]:
    """Make the live framework match ``tree``. Caller owns the transaction.

    Nodes carrying a numeric ``id`` are matched to existing rows; anything else
    (a temporary client id, or no id) is created. Rows absent from the tree are
    deleted outright.

    Two details make that safe:

    * Answers are keyed to the snapshot of the version they were collected
      under, not to live rows (see ``app.services.questionnaire_reference``), so
      dropping a question the new tree no longer contains loses no history.
    * A node whose numeric id no longer exists is re-created *with that id*
      rather than a fresh one. Restoring a version has to reproduce the ids its
      snapshot recorded, otherwise answers collected under the restored version
      would point at ids the snapshot never described.

    Returns a ``{temp_id: real_question_id}`` mapping for every question
    newly created in this call (empty if the tree had no temp ids, which is
    always true for ``restore_version``'s call -- it only ever passes a
    ``build_snapshot()`` tree, never one with temp ids). Consumed by
    ``promote_draft_recommendations`` right after ``publish()`` calls this.
    """
    existing = (await db.execute(_dimension_query())).scalars().unique().all()
    dimensions_by_id = {d.id: d for d in existing}
    subs_by_id = {s.id: s for d in existing for s in d.sub_dimensions}
    questions_by_id = {q.id: q for d in existing for s in d.sub_dimensions for q in s.questions}

    seen_dimensions: set[int] = set()
    seen_subs: set[int] = set()
    seen_questions: set[int] = set()
    promoted: dict[str, int] = {}

    for dimension_order, node in enumerate(tree):
        node_id = _as_id(node.get("id"))
        dimension = dimensions_by_id.get(node_id)
        if dimension is None:
            dimension = Dimension(
                # Replaying a snapshot re-creates rows under the ids it froze;
                # a genuinely new node has no numeric id and gets a fresh one.
                id=node_id,
                key=await _unique_key(db, _slugify(node.get("name", ""))),
                code=node.get("code") or f"{dimension_order + 1:02d}",
                short_name=node.get("short_name") or node.get("name", "")[:100],
                name=node.get("name", ""),
                description=node.get("description", "") or "",
                weight=float(node.get("weight", 0) or 0),
                color=node.get("color") or "#1A1A1A",
                sort_order=dimension_order,
                is_active=bool(node.get("is_active", True)),
            )
            db.add(dimension)
            await db.flush()
        else:
            dimension.name = node.get("name", dimension.name)
            dimension.description = node.get("description", "") or ""
            dimension.weight = float(node.get("weight", 0) or 0)
            dimension.color = node.get("color") or dimension.color
            dimension.is_active = bool(node.get("is_active", True))
            dimension.sort_order = dimension_order
        seen_dimensions.add(dimension.id)

        for sub_order, sub_node in enumerate(node.get("sub_dimensions", [])):
            sub_node_id = _as_id(sub_node.get("id"))
            sub = subs_by_id.get(sub_node_id)
            if sub is None:
                sub = SubDimension(
                    id=sub_node_id,
                    dimension_id=dimension.id,
                    name=sub_node.get("name", ""),
                    sort_order=sub_order,
                    is_active=bool(sub_node.get("is_active", True)),
                )
                db.add(sub)
                await db.flush()
            else:
                sub.dimension_id = dimension.id  # supports moving between dimensions
                sub.name = sub_node.get("name", sub.name)
                sub.is_active = bool(sub_node.get("is_active", True))
                sub.sort_order = sub_order
            seen_subs.add(sub.id)

            for question_order, question_node in enumerate(sub_node.get("questions", [])):
                raw_question_id = question_node.get("id")
                question_node_id = _as_id(raw_question_id)
                question = questions_by_id.get(question_node_id)
                if question is None:
                    question = Question(
                        id=question_node_id,
                        dimension_id=dimension.id,
                        sub_dimension_id=sub.id,
                        text=question_node.get("text", ""),
                        description=question_node.get("description") or None,
                        type=question_node.get("type") or "Échelle de maturité",
                        weight=float(question_node.get("weight", 0) or 0),
                        sort_order=question_order,
                        is_required=bool(question_node.get("is_required", True)),
                        level_responses=question_node.get("level_responses"),
                        choice_options=question_node.get("choice_options"),
                        is_active=bool(question_node.get("is_active", True)),
                    )
                    db.add(question)
                    await db.flush()
                    if isinstance(raw_question_id, str) and not raw_question_id.isdigit():
                        promoted[raw_question_id] = question.id
                else:
                    question.dimension_id = dimension.id
                    question.sub_dimension_id = sub.id
                    question.text = question_node.get("text", question.text)
                    question.description = question_node.get("description") or None
                    question.type = question_node.get("type") or question.type
                    question.weight = float(question_node.get("weight", 0) or 0)
                    question.is_required = bool(question_node.get("is_required", True))
                    question.level_responses = question_node.get("level_responses")
                    question.choice_options = question_node.get("choice_options")
                    question.is_active = bool(question_node.get("is_active", True))
                    question.sort_order = question_order
                seen_questions.add(question.id)

    # Removals, deepest first so FKs unwind cleanly. Answers are not among
    # those FKs any more: they key into their own version's snapshot, so a
    # question people answered can be deleted here without losing anything.
    for question_id, question in questions_by_id.items():
        if question_id not in seen_questions:
            await db.delete(question)

    for sub_id, sub in subs_by_id.items():
        if sub_id not in seen_subs:
            await db.delete(sub)

    for dimension_id, dimension in dimensions_by_id.items():
        if dimension_id not in seen_dimensions:
            await db.delete(dimension)

    await db.flush()
    await _resync_sequences(db)
    # Deleting a child doesn't prune the parent's already-loaded collection, so
    # a snapshot taken right after this would still list rows that no longer
    # exist. Expire everything: the next read reloads from the database, still
    # inside this transaction.
    db.expire_all()
    return promoted


async def promote_draft_recommendations(db: AsyncSession, promoted: dict[str, int]) -> None:
    """After ``apply_tree`` has created real rows for temp-id questions,
    move every draft recommendation staged against one of those temp ids
    onto the real question -- same code convention as
    ``app.routers.admin``'s recommendations router and the regulatory
    auto-publish path (``f"{dim.code}Q{question.id}-{level}"``), so a
    promoted row looks identical to one created directly against a real
    question.
    """
    if not promoted:
        return

    rows = (
        await db.execute(
            select(Recommendation).where(Recommendation.draft_question_key.in_(promoted.keys()))
        )
    ).scalars().all()
    if not rows:
        return

    real_ids = set(promoted.values())
    questions = {
        q.id: q
        for q in (await db.execute(select(Question).where(Question.id.in_(real_ids)))).scalars().all()
    }
    dimension_ids = {q.dimension_id for q in questions.values()}
    dimensions = {
        d.id: d
        for d in (await db.execute(select(Dimension).where(Dimension.id.in_(dimension_ids)))).scalars().all()
    }

    for row in rows:
        real_id = promoted[row.draft_question_key]
        question = questions[real_id]
        dim = dimensions[question.dimension_id]
        row.question_id = real_id
        row.draft_question_key = None
        row.code = f"{dim.code}Q{real_id}-{row.trigger_level}"


async def delete_orphaned_draft_recommendations(
    db: AsyncSession, keep_keys: Iterable[str] = ()
) -> None:
    """Remove any recommendation still carrying a ``draft_question_key`` not
    in ``keep_keys`` -- the draft question it was staged for no longer
    exists (removed from the tree, or the whole draft discarded/published).
    Never touches a row that already has a real ``question_id``.

    Called with an empty ``keep_keys`` after a publish (anything still
    draft-flagged at that point is orphaned relative to what was just
    published) and after a discard (the whole draft is gone); called with
    the current tree's question ids from ``save_draft`` (the autosave), to
    reconcile as the admin edits.
    """
    keep = set(keep_keys)
    rows = (
        await db.execute(select(Recommendation).where(Recommendation.draft_question_key.is_not(None)))
    ).scalars().all()
    for row in rows:
        if row.draft_question_key not in keep:
            await db.delete(row)


def _as_id(value: Any) -> int | None:
    """Real row ids are ints; the page sends strings like ``new-3`` for
    additions, which must not collide with an existing row."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value)
    return int(text) if text.isdigit() else None


def _slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "dimension"


async def _unique_key(db: AsyncSession, base: str) -> str:
    key, i = base, 2
    while await db.scalar(select(Dimension.id).where(Dimension.key == key)):
        key = f"{base}-{i}"
        i += 1
    return key


async def next_version_number(db: AsyncSession) -> int:
    current = await db.scalar(select(func.max(QuestionnaireVersion.number)))
    return (current or 0) + 1
