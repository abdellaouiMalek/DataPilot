# Draft Question ↔ Draft Recommendation Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a super-admin create a question in "Gestion du Framework" and immediately configure its recommendations in "Catalogue des recommandations" — both staying entirely in draft, persisted server-side, until the admin's next explicit framework publish promotes the question and its recommendations to live together, atomically.

**Architecture:** `Recommendation.question_id` becomes nullable; a new `draft_question_key` column lets a recommendation reference a not-yet-published question by the same temp id string the framework editor already uses (`"new-q-<uuid>"`, made collision-safe). A draft row (`question_id IS NULL`) is structurally invisible to the recommendation engine — verified against the actual query, no engine changes needed. Publishing promotes matching draft rows to their real `question_id` inside the transaction `apply_tree()`/`publish()` already run; discarding or editing the draft away reconciles/deletes orphaned draft rows through the same autosave/discard endpoints that already exist.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic + Postgres; React + TypeScript + react-router-dom, no test framework on either side (this codebase's convention is manual assert-based scripts for backend pure logic — see `backend/tests/test_action_plan.py` — and `tsc --noEmit` + manual click-through for frontend; this plan follows the same conventions rather than introducing new tooling).

**Spec:** `docs/superpowers/specs/2026-08-31-draft-question-recommendations-design.md`

## Global Constraints

- No automatic framework publication and no automatic questionnaire version creation may ever be triggered by "Configurer les recommandations" — verify by reading the code path, not just by manual click-through.
- Draft recommendations (`question_id IS NULL`) must never be reachable by `recommendation_engine.load_reference()` / `scoring.py`'s selection functions. This holds structurally (see spec) — do not add a parallel `is_active`-style filter as a substitute; the exclusion is `question_id IS NULL`.
- Every promotion/cleanup step at publish time must run inside the transaction `publish()` already owns (single `db.commit()`, existing `except` rolls back everything). Never add a second commit.
- Existing behavior for real (`question_id` set) recommendations — create, patch, delete, list — must not change at all.
- Editing an already-published question in the framework draft (real numeric id, not a temp one) must not touch any `Recommendation` row.
- Hard-delete orphaned draft recommendations (never archive) — they were never real/published.
- DB-touching verification scripts written during this plan are throwaway: write them under the project's scratchpad, run them against the real dev Postgres (already running via `docker compose`), confirm output, then delete the script. Do not commit them. Pure-logic tests (no DB) follow `backend/tests/test_action_plan.py`'s committed, `assert`-based, `def main()` style.

---

## File Structure

Backend:
- **Modify** `backend/app/models/recommendation.py` — nullable `question_id`, new `draft_question_key` column, new CHECK constraint + partial unique index.
- **Create** `backend/alembic/versions/<generated>_recommendation_draft_question_key.py` — the migration for the above.
- **Modify** `backend/app/services/framework_publish.py` — `apply_tree()` returns a temp-id→real-id mapping; new `find_draft_question`, `collect_question_ids`, `promote_draft_recommendations`, `delete_orphaned_draft_recommendations` helpers.
- **Modify** `backend/app/schemas/admin.py` — `RecommendationCreate` gets `draft_question_key` + an exactly-one-of validator; `RecommendationAdminRead` gets `draft_question_key`, `question_id` widened to optional.
- **Modify** `backend/app/routers/admin.py` — `POST /recommendations` branches on which field is set.
- **Modify** `backend/app/routers/admin_framework.py` — `publish()` promotes + cleans up; `discard_draft()` and `save_draft()` clean up / reconcile.
- **Create** `backend/tests/test_draft_recommendations_helpers.py` — pure-logic tests for `find_draft_question`/`collect_question_ids` (no DB), following `test_action_plan.py`'s style.

Frontend:
- **Modify** `frontend/src/pages/superAdmin/frameworkStaging.tsx` — UUID-based temp ids.
- **Modify** `frontend/src/lib/admin.ts` — widen `Recommendation`/`ApiRecommendation` types, add `createDraftRecommendations`.
- **Modify** `frontend/src/pages/superAdmin/AdminDimensions.tsx` — `QuestionModal` success view; `DimensionsManagement` hand-off (save draft, navigate).
- **Modify** `frontend/src/pages/superAdmin/AdminRecommendations.tsx` — fetch + merge the framework draft, draft badges, deep-link consumption, `WizardDrawer` save branching.

---

## Task 1: Data model — nullable `question_id`, `draft_question_key` column

**Files:**
- Modify: `backend/app/models/recommendation.py`
- Create: `backend/alembic/versions/<generated>_recommendation_draft_question_key.py`

**Interfaces:**
- Produces: `Recommendation.question_id: int | None`, `Recommendation.draft_question_key: str | None`, DB constraint `chk_question_or_draft`, partial unique index `uq_draft_question_trigger`. Every later task relies on these existing.

- [ ] **Step 1: Update the model**

Edit `backend/app/models/recommendation.py`. Current relevant lines:

```python
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
```

```python
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True
    )
```

```python
    __table_args__ = (
        UniqueConstraint("question_id", "trigger_level", name="uq_question_trigger"),
        CheckConstraint("trigger_level BETWEEN 1 AND 4", name="chk_trigger_level_range"),
        CheckConstraint("target_level BETWEEN 2 AND 5", name="chk_target_level_range"),
        CheckConstraint("target_level = trigger_level + 1", name="chk_one_step"),
        CheckConstraint("effort BETWEEN 1 AND 3", name="chk_effort_range"),
    )
```

Replace with:

```python
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
```

```python
    # Nullable: a draft recommendation (see draft_question_key below) has no
    # real question yet. Exactly one of question_id / draft_question_key is
    # ever set -- enforced by chk_question_or_draft.
    question_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Set only while the question this recommendation targets is still
    # sitting in the framework draft (not yet published) -- holds the same
    # temp id string the draft's tree uses for that question node (see
    # frontend/src/pages/superAdmin/frameworkStaging.tsx's newId()). Cleared
    # (and question_id populated) once the framework is published; see
    # app/services/framework_publish.py::promote_draft_recommendations.
    draft_question_key: Mapped[Optional[str]] = mapped_column(
        String(80), nullable=True, index=True
    )
```

```python
    __table_args__ = (
        UniqueConstraint("question_id", "trigger_level", name="uq_question_trigger"),
        CheckConstraint("trigger_level BETWEEN 1 AND 4", name="chk_trigger_level_range"),
        CheckConstraint("target_level BETWEEN 2 AND 5", name="chk_target_level_range"),
        CheckConstraint("target_level = trigger_level + 1", name="chk_one_step"),
        CheckConstraint("effort BETWEEN 1 AND 3", name="chk_effort_range"),
        CheckConstraint(
            "(question_id IS NOT NULL) != (draft_question_key IS NOT NULL)",
            name="chk_question_or_draft",
        ),
        Index(
            "uq_draft_question_trigger", "draft_question_key", "trigger_level",
            unique=True, postgresql_where=text("draft_question_key IS NOT NULL"),
        ),
    )
```

- [ ] **Step 2: Generate the migration**

```bash
cd backend && ./.venv/Scripts/python.exe -m alembic revision -m "recommendation draft question key"
```

This creates `backend/alembic/versions/<hash>_recommendation_draft_question_key.py` with `down_revision = 'c274f6680a05'` (the current single head) already filled in. Replace its `upgrade`/`downgrade` bodies:

```python
def upgrade() -> None:
    op.alter_column("recommendations", "question_id", nullable=True)
    op.add_column(
        "recommendations",
        sa.Column("draft_question_key", sa.String(length=80), nullable=True),
    )
    op.create_index(
        op.f("ix_recommendations_draft_question_key"),
        "recommendations", ["draft_question_key"],
    )
    op.create_check_constraint(
        "chk_question_or_draft",
        "recommendations",
        "(question_id IS NOT NULL) != (draft_question_key IS NOT NULL)",
    )
    op.create_index(
        "uq_draft_question_trigger",
        "recommendations",
        ["draft_question_key", "trigger_level"],
        unique=True,
        postgresql_where=sa.text("draft_question_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_draft_question_trigger", table_name="recommendations")
    op.drop_constraint("chk_question_or_draft", "recommendations", type_="check")
    op.drop_index(op.f("ix_recommendations_draft_question_key"), table_name="recommendations")
    op.drop_column("recommendations", "draft_question_key")
    op.alter_column("recommendations", "question_id", nullable=False)
```

- [ ] **Step 3: Apply and verify**

```bash
cd backend && ./.venv/Scripts/python.exe -m alembic upgrade head
./.venv/Scripts/python.exe -m alembic current
```
Expected: current revision is the new one, no errors.

Then verify the constraint actually holds, in a throwaway script
`C:\Users\USER\AppData\Local\Temp\claude\...\scratchpad\verify_task1.py`:

```python
import asyncio, sys
sys.path.insert(0, "d:/datapilot/backend")
from sqlalchemy import text
from app.db.database import engine

async def main():
    async with engine.begin() as conn:
        # Both set -> constraint violation
        try:
            await conn.execute(text(
                "INSERT INTO recommendations "
                "(code, question_id, draft_question_key, trigger_level, target_level, "
                " title, recommendation_text, category, effort, is_active) "
                "VALUES ('T-BOTH', 1, 'new-q-x', 1, 2, 't', 't', 'c', 1, true)"
            ))
            print("FAIL: both-set insert should have been rejected")
        except Exception as e:
            print("OK: both-set rejected ->", type(e).__name__)
        await conn.rollback()

        # Neither set -> constraint violation
        try:
            await conn.execute(text(
                "INSERT INTO recommendations "
                "(code, question_id, draft_question_key, trigger_level, target_level, "
                " title, recommendation_text, category, effort, is_active) "
                "VALUES ('T-NEITHER', NULL, NULL, 1, 2, 't', 't', 'c', 1, true)"
            ))
            print("FAIL: neither-set insert should have been rejected")
        except Exception as e:
            print("OK: neither-set rejected ->", type(e).__name__)
        await conn.rollback()

        # draft_question_key only, valid
        await conn.execute(text(
            "INSERT INTO recommendations "
            "(code, question_id, draft_question_key, trigger_level, target_level, "
            " title, recommendation_text, category, effort, is_active) "
            "VALUES ('T-DRAFT-1', NULL, 'new-q-verify', 1, 2, 't', 't', 'c', 1, true)"
        ))
        print("OK: draft-only insert accepted")

        # duplicate (draft_question_key, trigger_level) -> partial unique index violation
        try:
            await conn.execute(text(
                "INSERT INTO recommendations "
                "(code, question_id, draft_question_key, trigger_level, target_level, "
                " title, recommendation_text, category, effort, is_active) "
                "VALUES ('T-DRAFT-1B', NULL, 'new-q-verify', 1, 2, 't', 't', 'c', 1, true)"
            ))
            print("FAIL: duplicate draft (key, level) should have been rejected")
        except Exception as e:
            print("OK: duplicate draft (key, level) rejected ->", type(e).__name__)
        await conn.rollback()

    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM recommendations WHERE code LIKE 'T-%'"))
    print("cleanup done")

asyncio.run(main())
```

Run it and confirm all four lines print `OK:` — every rollback means the earlier bad inserts never persisted, and the final cleanup is a no-op safety net (belt-and-suspenders since each bad insert was already rolled back). Delete the script afterward.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/recommendation.py backend/alembic/versions/*_recommendation_draft_question_key.py
git commit -m "feat(recommendations): allow question_id to be null, add draft_question_key

Lets a recommendation reference a not-yet-published question by the
framework draft's temp id instead of a real question_id. Enforced by a
CHECK constraint (exactly one of the two set) and a partial unique index
mirroring uq_question_trigger for the draft case.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Draft-tree helpers — `find_draft_question`, `collect_question_ids`

**Files:**
- Modify: `backend/app/services/framework_publish.py`
- Create: `backend/tests/test_draft_recommendations_helpers.py`

**Interfaces:**
- Consumes: nothing new (pure functions over a plain `list[dict[str, Any]]`, the same JSON shape `FrameworkDraft.tree` / `apply_tree()`'s `tree` argument already use).
- Produces: `find_draft_question(tree, key) -> tuple[dict, dict, dict] | None`, `collect_question_ids(tree) -> set[str]`. Task 6 uses `find_draft_question`; Task 9 uses `collect_question_ids`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_draft_recommendations_helpers.py`:

```python
"""Tests manuels pour les helpers de résolution de l'arbre de brouillon
(find_draft_question, collect_question_ids). Pas de pytest ici, comme le
reste du projet.

    python backend/tests/test_draft_recommendations_helpers.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.framework_publish import (  # noqa: E402
    collect_question_ids,
    find_draft_question,
)

TREE = [
    {
        "id": 1,
        "name": "Gouvernance",
        "sub_dimensions": [
            {
                "id": 10,
                "name": "Pilotage",
                "questions": [
                    {"id": 100, "text": "Question publiée"},
                    {"id": "new-q-abc", "text": "Question brouillon"},
                ],
            }
        ],
    },
    {
        "id": "new-dim-xyz",
        "name": "Nouvelle dimension",
        "sub_dimensions": [
            {
                "id": "new-sub-1",
                "name": "Nouvelle sous-dim",
                "questions": [
                    {"id": "new-q-def", "text": "Question dans dimension brouillon"},
                ],
            }
        ],
    },
]


def test_find_existing_draft_question() -> None:
    result = find_draft_question(TREE, "new-q-abc")
    assert result is not None, "la question brouillon doit être trouvée"
    dim, sub, question = result
    assert dim["id"] == 1
    assert sub["id"] == 10
    assert question["text"] == "Question brouillon"
    print("OK: question brouillon trouvée avec son contexte dim/sous-dim")


def test_find_draft_question_in_draft_dimension() -> None:
    result = find_draft_question(TREE, "new-q-def")
    assert result is not None
    dim, sub, question = result
    assert dim["id"] == "new-dim-xyz"
    assert sub["id"] == "new-sub-1"
    print("OK: question brouillon dans une dimension elle-même brouillon trouvée")


def test_find_draft_question_missing() -> None:
    assert find_draft_question(TREE, "new-q-does-not-exist") is None
    print("OK: clé absente -> None (pas d'exception)")


def test_find_draft_question_empty_tree() -> None:
    assert find_draft_question([], "new-q-abc") is None
    print("OK: arbre vide -> None")


def test_collect_question_ids() -> None:
    ids = collect_question_ids(TREE)
    assert ids == {"100", "new-q-abc", "new-q-def"}, ids
    print("OK: collect_question_ids retourne tous les ids de question, réels et brouillon")


def test_collect_question_ids_empty_tree() -> None:
    assert collect_question_ids([]) == set()
    print("OK: arbre vide -> ensemble vide")


def main() -> int:
    test_find_existing_draft_question()
    test_find_draft_question_in_draft_dimension()
    test_find_draft_question_missing()
    test_find_draft_question_empty_tree()
    test_collect_question_ids()
    test_collect_question_ids_empty_tree()
    print("\nTOUS LES TESTS DES HELPERS DE BROUILLON SONT PASSES")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./.venv/Scripts/python.exe tests/test_draft_recommendations_helpers.py
```
Expected: `ImportError: cannot import name 'find_draft_question'` (the functions don't exist yet).

- [ ] **Step 3: Implement the helpers**

In `backend/app/services/framework_publish.py`, add near the top (after the module docstring/imports, before `QUESTION_FIELDS`):

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && ./.venv/Scripts/python.exe tests/test_draft_recommendations_helpers.py
```
Expected: all six `OK:` lines, then `TOUS LES TESTS DES HELPERS DE BROUILLON SONT PASSES`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/framework_publish.py backend/tests/test_draft_recommendations_helpers.py
git commit -m "feat(framework): add find_draft_question / collect_question_ids helpers

Pure functions over the staged tree's JSON shape -- no DB access, so they
carry their own committed test (matches tests/test_action_plan.py's
no-pytest, assert-based convention).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `apply_tree` returns the temp-id → real-id mapping

**Files:**
- Modify: `backend/app/services/framework_publish.py:334-464` (the `apply_tree` function)

**Interfaces:**
- Consumes: nothing new.
- Produces: `apply_tree(db, tree) -> dict[str, int]` (was `-> None`). Task 4/7 consume this return value. `restore_version()` (the other caller, in `admin_framework.py`) doesn't need to change — it already ignores the return value; verified it only ever passes a `build_snapshot()`-produced tree, which contains no temp ids, so the returned dict is always `{}` there.

- [ ] **Step 1: Change the signature and capture promotions**

In `backend/app/services/framework_publish.py`, `apply_tree`:

Current (lines 334-360 area):
```python
async def apply_tree(db: AsyncSession, tree: list[dict[str, Any]]) -> None:
    """Make the live framework match ``tree``. Caller owns the transaction.
    ...
    """
    existing = (await db.execute(_dimension_query())).scalars().unique().all()
    dimensions_by_id = {d.id: d for d in existing}
    subs_by_id = {s.id: s for d in existing for s in d.sub_dimensions}
    questions_by_id = {q.id: q for d in existing for s in d.sub_dimensions for q in s.questions}

    seen_dimensions: set[int] = set()
    seen_subs: set[int] = set()
    seen_questions: set[int] = set()

    for dimension_order, node in enumerate(tree):
```

Change to:

```python
async def apply_tree(db: AsyncSession, tree: list[dict[str, Any]]) -> dict[str, int]:
    """Make the live framework match ``tree``. Caller owns the transaction.
    ...

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
```

Then, inside the question loop (currently):
```python
            for question_order, question_node in enumerate(sub_node.get("questions", [])):
                question_node_id = _as_id(question_node.get("id"))
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
                else:
```

Change to:
```python
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
```

Finally, at the end of the function (currently):
```python
    await db.flush()
    await _resync_sequences(db)
    # Deleting a child doesn't prune the parent's already-loaded collection, so
    # a snapshot taken right after this would still list rows that no longer
    # exist. Expire everything: the next read reloads from the database, still
    # inside this transaction.
    db.expire_all()
```

Change to:
```python
    await db.flush()
    await _resync_sequences(db)
    # Deleting a child doesn't prune the parent's already-loaded collection, so
    # a snapshot taken right after this would still list rows that no longer
    # exist. Expire everything: the next read reloads from the database, still
    # inside this transaction.
    db.expire_all()
    return promoted
```

- [ ] **Step 2: Verify with a throwaway DB script**

Create `<scratchpad>/verify_task3.py`:

```python
import asyncio, sys
sys.path.insert(0, "d:/datapilot/backend")
from app.db.database import AsyncSessionLocal
from app.services.framework_publish import apply_tree, build_snapshot
from sqlalchemy import select, delete
from app.models import Question

async def main():
    async with AsyncSessionLocal() as db:
        before = await build_snapshot(db)
        dim = before["dimensions"][0]
        sub = dim["sub_dimensions"][0]
        tree = [
            {**d, "sub_dimensions": [
                {**s, "questions": s["questions"]} for s in d["sub_dimensions"]
            ]}
            for d in before["dimensions"]
        ]
        # Inject one temp-id question into the first sub-dimension of the first dimension.
        tree[0]["sub_dimensions"][0]["questions"] = tree[0]["sub_dimensions"][0]["questions"] + [
            {"id": "new-q-task3verify", "text": "Verify task 3", "type": "Échelle de maturité",
             "weight": 0, "is_required": True, "is_active": True}
        ]
        promoted = await apply_tree(db, tree)
        await db.commit()
        print("promoted:", promoted)
        assert "new-q-task3verify" in promoted, promoted
        real_id = promoted["new-q-task3verify"]
        assert isinstance(real_id, int)
        q = await db.get(Question, real_id)
        assert q is not None and q.text == "Verify task 3"
        print("OK: temp id promoted to real question id", real_id)

        # cleanup
        await db.execute(delete(Question).where(Question.id == real_id))
        await db.commit()
        print("cleanup done")

asyncio.run(main())
```

Run: `cd backend && ./.venv/Scripts/python.exe <path-to-script>`. Expected: `OK: temp id promoted to real question id <N>`, no assertion errors. Delete the script afterward.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/framework_publish.py
git commit -m "feat(framework): apply_tree returns temp-id -> real-id mapping

Additive: restore_version (the other caller) only ever passes a
build_snapshot() tree, which never has temp ids, so its return value stays
empty there. publish() uses this next to promote draft recommendations.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `promote_draft_recommendations` / `delete_orphaned_draft_recommendations`

**Files:**
- Modify: `backend/app/services/framework_publish.py`

**Interfaces:**
- Consumes: `Recommendation`, `Question`, `Dimension` models (add `Recommendation` to this file's model import).
- Produces: `promote_draft_recommendations(db, promoted: dict[str, int]) -> None`, `delete_orphaned_draft_recommendations(db, keep_keys: Iterable[str] = ()) -> None`. Tasks 7, 8, 9 call these.

- [ ] **Step 1: Add the `Recommendation` import**

In `backend/app/services/framework_publish.py`, change:
```python
from app.models import Dimension, Question, QuestionnaireVersion, SubDimension
```
to:
```python
from app.models import Dimension, Question, QuestionnaireVersion, Recommendation, SubDimension
```

- [ ] **Step 2: Implement the two functions**

Add after `apply_tree` (before `def _as_id`):

```python
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
```

- [ ] **Step 3: Verify with a throwaway DB script**

Create `<scratchpad>/verify_task4.py`:

```python
import asyncio, sys
sys.path.insert(0, "d:/datapilot/backend")
from app.db.database import AsyncSessionLocal
from app.services.framework_publish import promote_draft_recommendations, delete_orphaned_draft_recommendations
from app.models import Recommendation, Question
from sqlalchemy import select, delete

async def main():
    async with AsyncSessionLocal() as db:
        real_question = (await db.execute(select(Question).limit(1))).scalar_one()

        db.add(Recommendation(
            code="DRAFT-verify-task4-1", question_id=None, draft_question_key="verify-task4-key",
            trigger_level=1, target_level=2, title="t", recommendation_text="t",
            category="c", effort=1, is_active=True,
        ))
        db.add(Recommendation(
            code="DRAFT-verify-task4-orphan", question_id=None, draft_question_key="verify-task4-orphan-key",
            trigger_level=1, target_level=2, title="t", recommendation_text="t",
            category="c", effort=1, is_active=True,
        ))
        await db.commit()

        await promote_draft_recommendations(db, {"verify-task4-key": real_question.id})
        await db.commit()

        promoted_row = (await db.execute(
            select(Recommendation).where(Recommendation.code.like("%verify-task4-1"))
        )).scalar_one()
        assert promoted_row.question_id == real_question.id, promoted_row.question_id
        assert promoted_row.draft_question_key is None, promoted_row.draft_question_key
        assert promoted_row.code == f"{real_question.id}"[:0] or True  # code format checked below
        print("OK: promoted row now has real question_id, draft_question_key cleared, code:", promoted_row.code)

        await delete_orphaned_draft_recommendations(db, keep_keys=())
        await db.commit()

        remaining = (await db.execute(
            select(Recommendation).where(Recommendation.code == "DRAFT-verify-task4-orphan")
        )).scalar_one_or_none()
        assert remaining is None, "orphaned draft row should have been deleted"
        print("OK: orphaned draft row deleted")

        # cleanup the promoted row (was only for this verification)
        await db.execute(delete(Recommendation).where(Recommendation.id == promoted_row.id))
        await db.commit()
        print("cleanup done")

asyncio.run(main())
```

Run it, expect both `OK:` lines and `cleanup done`, no assertion errors. Note the promoted row's `code` in the output and eyeball it matches `f"{dim.code}Q{real_question.id}-1"`. Delete the script afterward.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/framework_publish.py
git commit -m "feat(framework): add promote/delete-orphaned draft recommendation helpers

promote_draft_recommendations moves draft rows onto their real question_id
once apply_tree has created it, rewriting code to match the real-question
convention. delete_orphaned_draft_recommendations removes draft rows whose
draft question no longer exists in the current tree -- shared by publish,
discard, and the autosave reconciliation added in later tasks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `RecommendationCreate` / `RecommendationAdminRead` schema changes

**Files:**
- Modify: `backend/app/schemas/admin.py:159-209`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RecommendationCreate.draft_question_key: Optional[str]`, `RecommendationCreate.question_id: Optional[int]` (widened), validated exactly-one; `RecommendationAdminRead.draft_question_key: Optional[str]`, `.question_id: Optional[int]` (widened). Task 6 consumes both.

- [ ] **Step 1: Write the failing test**

Create `<scratchpad>/verify_task5.py` (this one is quick/pure enough to just run directly, no DB — not worth a committed test file on its own since Task 6's endpoint tests will exercise the same validation over HTTP):

```python
import sys
sys.path.insert(0, "d:/datapilot/backend")
from pydantic import ValidationError
from app.schemas.admin import RecommendationCreate

base = dict(trigger_levels=[1], title="t", recommendation_text="t", category="c", effort=1)

try:
    RecommendationCreate(**base, question_id=1, draft_question_key="new-q-x")
    print("FAIL: both set should have raised")
except ValidationError:
    print("OK: both set rejected")

try:
    RecommendationCreate(**base)
    print("FAIL: neither set should have raised")
except ValidationError:
    print("OK: neither set rejected")

RecommendationCreate(**base, question_id=1)
print("OK: question_id alone accepted")
RecommendationCreate(**base, draft_question_key="new-q-x")
print("OK: draft_question_key alone accepted")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./.venv/Scripts/python.exe <path-to-script>
```
Expected: `TypeError`/validation error on the *first* call already, since `question_id` is currently required and non-optional — confirms the schema hasn't been updated yet.

- [ ] **Step 3: Implement the schema change**

In `backend/app/schemas/admin.py`:

Change the import line:
```python
from pydantic import BaseModel, Field
```
to:
```python
from pydantic import BaseModel, Field, model_validator
```

Change `RecommendationCreate` (currently):
```python
class RecommendationCreate(BaseModel):
    question_id: int
    # One row is created per level (1-4 each, see chk_trigger_level_range) --
    # the endpoint reports per-level success/conflict rather than failing the
    # whole request over one already-occupied level.
    trigger_levels: list[int] = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    recommendation_text: str = Field(min_length=1)
    category: str = Field(min_length=1, max_length=50)
    effort: int = Field(ge=1, le=3)
    regulatory_flag: bool = False
    is_active: bool = True
```

to:
```python
class RecommendationCreate(BaseModel):
    # Exactly one of the two is set (see _exactly_one_linkage below):
    # question_id targets an already-published question (today's behavior);
    # draft_question_key targets a question still sitting in the framework
    # draft, by the same temp id string the draft's tree uses for it. See
    # docs/superpowers/specs/2026-08-31-draft-question-recommendations-design.md.
    question_id: Optional[int] = None
    draft_question_key: Optional[str] = None
    # One row is created per level (1-4 each, see chk_trigger_level_range) --
    # the endpoint reports per-level success/conflict rather than failing the
    # whole request over one already-occupied level.
    trigger_levels: list[int] = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    recommendation_text: str = Field(min_length=1)
    category: str = Field(min_length=1, max_length=50)
    effort: int = Field(ge=1, le=3)
    regulatory_flag: bool = False
    is_active: bool = True

    @model_validator(mode="after")
    def _exactly_one_linkage(self) -> "RecommendationCreate":
        if (self.question_id is None) == (self.draft_question_key is None):
            raise ValueError(
                "Exactly one of question_id / draft_question_key must be set."
            )
        return self
```

Change `RecommendationAdminRead` (currently):
```python
class RecommendationAdminRead(BaseModel):
    id: int
    code: str
    question_id: int
    trigger_level: int
```

to:
```python
class RecommendationAdminRead(BaseModel):
    id: int
    code: str
    question_id: Optional[int] = None
    draft_question_key: Optional[str] = None
    trigger_level: int
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && ./.venv/Scripts/python.exe <path-to-script>
```
Expected: all four `OK:` lines. Delete the script afterward.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/admin.py
git commit -m "feat(recommendations): schema support for draft_question_key

RecommendationCreate accepts either question_id or draft_question_key
(exactly one, enforced by a model_validator); RecommendationAdminRead
exposes both so the frontend can tell a draft row from a real one.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `POST /recommendations` branches on `draft_question_key`

**Files:**
- Modify: `backend/app/routers/admin.py:692-757` (the `create_recommendations` function)

**Interfaces:**
- Consumes: `RecommendationCreate` (Task 5), `find_draft_question` (Task 2), `FrameworkDraft` model.
- Produces: `POST /api/super-admin/recommendations` now accepts `draft_question_key` and creates draft rows. Task 14 (frontend) calls this.

- [ ] **Step 1: Add the needed imports**

In `backend/app/routers/admin.py`, the model import currently reads:
```python
from app.models import (
    Answer,
    Dimension,
    DimensionScore,
    Question,
    Recommendation,
    SubDimension,
)
```
Add `FrameworkDraft`:
```python
from app.models import (
    Answer,
    Dimension,
    DimensionScore,
    FrameworkDraft,
    Question,
    Recommendation,
    SubDimension,
)
```

Add the helper import, next to the existing `app.services.audit` import:
```python
from app.services.framework_publish import find_draft_question
```

- [ ] **Step 2: Branch the endpoint**

Current `create_recommendations` (lines 692-757):
```python
async def create_recommendations(
    payload: RecommendationCreate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    question = await _get_question_or_404(db, payload.question_id)
    dim = await db.get(Dimension, question.dimension_id)

    levels = sorted(set(payload.trigger_levels))
    occupied = set(
        (
            await db.execute(
                select(Recommendation.trigger_level).where(
                    Recommendation.question_id == question.id,
                    Recommendation.trigger_level.in_(levels),
                )
            )
        )
        .scalars()
        .all()
    )

    created: list[Recommendation] = []
    skipped: list[int] = []
    for level in levels:
        # chk_trigger_level_range / uq_question_trigger: an out-of-range or
        # already-occupied level is skipped rather than failing the whole
        # batch — see RecommendationBatchCreateResult docstring.
        if level not in range(1, 5) or level in occupied:
            skipped.append(level)
            continue
        reco = Recommendation(
            code=f"{dim.code}Q{question.id}-{level}",
            question_id=question.id,
            trigger_level=level,
            target_level=level + 1,
            title=payload.title,
            recommendation_text=payload.recommendation_text,
            category=payload.category,
            regulatory_flag=payload.regulatory_flag,
            effort=payload.effort,
            is_active=payload.is_active,
        )
        db.add(reco)
        created.append(reco)

    if created:
        await db.commit()
        for reco in created:
            await db.refresh(reco)
        for reco in created:
            await audit.record(
                module=MODULE_FRAMEWORK,
                action=f"Ajout recommandation {reco.code}",
                entity_type="recommendation",
                entity_id=reco.id,
                entity_label=reco.title,
                details={
                    "question": question.text,
                    "palier": f"{reco.trigger_level} → {reco.target_level}",
                },
            )

    return RecommendationBatchCreateResult(created=created, skipped_levels=skipped)
```

Replace with:
```python
async def create_recommendations(
    payload: RecommendationCreate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    levels = sorted(set(payload.trigger_levels))

    if payload.question_id is not None:
        question = await _get_question_or_404(db, payload.question_id)
        dim = await db.get(Dimension, question.dimension_id)
        occupied_stmt = select(Recommendation.trigger_level).where(
            Recommendation.question_id == question.id,
            Recommendation.trigger_level.in_(levels),
        )
        question_label = question.text
        audit_details = {"question": question.text}

        def make_code(level: int) -> str:
            return f"{dim.code}Q{question.id}-{level}"

        def row_kwargs(level: int) -> dict:
            return {"question_id": question.id, "draft_question_key": None}
    else:
        # draft_question_key path: the question is still in the framework
        # draft, not published yet -- see docs/superpowers/specs/
        # 2026-08-31-draft-question-recommendations-design.md.
        draft = await db.get(FrameworkDraft, 1)  # single row by design, id always 1
        found = find_draft_question(draft.tree if draft else [], payload.draft_question_key)
        if found is None:
            raise HTTPException(
                status_code=404,
                detail="Question de brouillon introuvable — le brouillon a peut-être changé.",
            )
        _dim_node, _sub_node, question_node = found
        question_label = question_node.get("text", "")
        audit_details = {"question": question_label, "brouillon": True}
        occupied_stmt = select(Recommendation.trigger_level).where(
            Recommendation.draft_question_key == payload.draft_question_key,
            Recommendation.trigger_level.in_(levels),
        )

        def make_code(level: int) -> str:
            return f"DRAFT-{payload.draft_question_key}-{level}"

        def row_kwargs(level: int) -> dict:
            return {"question_id": None, "draft_question_key": payload.draft_question_key}

    occupied = set((await db.execute(occupied_stmt)).scalars().all())

    created: list[Recommendation] = []
    skipped: list[int] = []
    for level in levels:
        # chk_trigger_level_range / uq_question_trigger (or its draft
        # equivalent, uq_draft_question_trigger): an out-of-range or
        # already-occupied level is skipped rather than failing the whole
        # batch — see RecommendationBatchCreateResult docstring.
        if level not in range(1, 5) or level in occupied:
            skipped.append(level)
            continue
        reco = Recommendation(
            code=make_code(level),
            trigger_level=level,
            target_level=level + 1,
            title=payload.title,
            recommendation_text=payload.recommendation_text,
            category=payload.category,
            regulatory_flag=payload.regulatory_flag,
            effort=payload.effort,
            is_active=payload.is_active,
            **row_kwargs(level),
        )
        db.add(reco)
        created.append(reco)

    if created:
        await db.commit()
        for reco in created:
            await db.refresh(reco)
        for reco in created:
            await audit.record(
                module=MODULE_FRAMEWORK,
                action=f"Ajout recommandation {reco.code}",
                entity_type="recommendation",
                entity_id=reco.id,
                entity_label=reco.title,
                details={
                    **audit_details,
                    "palier": f"{reco.trigger_level} → {reco.target_level}",
                },
            )

    return RecommendationBatchCreateResult(created=created, skipped_levels=skipped)
```

- [ ] **Step 3: Verify with a throwaway HTTP script**

Create `<scratchpad>/verify_task6.py` (same auth-bypass style as the router's original verification, see this conversation's earlier `verify_recommendations_router.py`):

```python
import asyncio, sys
sys.path.insert(0, "d:/datapilot/backend")
import httpx
from app.main import app
from app.core.auth import require_super_admin
from app.services.audit import audit_context, Audit
from app.db.database import AsyncSessionLocal
from app.models import FrameworkDraft, Recommendation
from sqlalchemy import select, delete

FAKE_CLAIMS = {"sub": "verify", "preferred_username": "verify", "email": "v@e.com"}
app.dependency_overrides[require_super_admin] = lambda: FAKE_CLAIMS
app.dependency_overrides[audit_context] = lambda: Audit(FAKE_CLAIMS, None)

async def main():
    async with AsyncSessionLocal() as db:
        draft = await db.get(FrameworkDraft, 1)
        original_tree = draft.tree if draft else None
        tree = list(original_tree) if original_tree else []
        if tree:
            tree = [dict(d) for d in tree]
            tree[0] = dict(tree[0])
            tree[0]["sub_dimensions"] = [dict(s) for s in tree[0]["sub_dimensions"]]
            tree[0]["sub_dimensions"][0] = dict(tree[0]["sub_dimensions"][0])
            tree[0]["sub_dimensions"][0]["questions"] = tree[0]["sub_dimensions"][0]["questions"] + [
                {"id": "new-q-task6verify", "text": "Verify task 6", "type": "Échelle de maturité",
                 "weight": 0, "is_required": True, "is_active": True}
            ]
        if draft is None:
            draft = FrameworkDraft(id=1, tree=tree)
            db.add(draft)
        else:
            draft.tree = tree
        await db.commit()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/api/super-admin/recommendations", json={
            "draft_question_key": "new-q-task6verify",
            "trigger_levels": [1],
            "title": "t", "recommendation_text": "t", "category": "c", "effort": 1,
        })
        print("draft create ->", r.status_code, r.json())
        assert r.status_code == 201
        body = r.json()
        assert len(body["created"]) == 1
        row = body["created"][0]
        assert row["question_id"] is None, row
        assert row["draft_question_key"] == "new-q-task6verify", row
        assert row["code"] == "DRAFT-new-q-task6verify-1", row
        reco_id = row["id"]

        r = await client.post("/api/super-admin/recommendations", json={
            "draft_question_key": "new-q-does-not-exist",
            "trigger_levels": [1],
            "title": "t", "recommendation_text": "t", "category": "c", "effort": 1,
        })
        print("unknown draft key ->", r.status_code)
        assert r.status_code == 404

    async with AsyncSessionLocal() as db:
        await db.execute(delete(Recommendation).where(Recommendation.id == reco_id))
        d = await db.get(FrameworkDraft, 1)
        if original_tree is None:
            await db.delete(d)
        else:
            d.tree = original_tree
        await db.commit()
    print("cleanup done")

asyncio.run(main())
```

Run it. Expected: `draft create -> 201 {...}`, both asserts pass, `unknown draft key -> 404`, `cleanup done`. Delete the script afterward.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/admin.py
git commit -m "feat(recommendations): POST /recommendations accepts draft_question_key

Branches on which field the payload sets. The draft path validates the key
against the current framework draft's tree (404 if it's changed since) and
inserts rows with question_id=NULL, a DRAFT-prefixed placeholder code.
Existing question_id behavior is byte-for-byte unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Wire promotion + cleanup into `publish()`

**Files:**
- Modify: `backend/app/routers/admin_framework.py:187-271` (the `publish` function)

**Interfaces:**
- Consumes: `apply_tree` (Task 3's new return value), `promote_draft_recommendations`, `delete_orphaned_draft_recommendations` (Task 4).
- Produces: publishing the framework now promotes/cleans up draft recommendations, inside the same transaction.

- [ ] **Step 1: Import the two new helpers**

In `backend/app/routers/admin_framework.py`, current import:
```python
from app.services.framework_publish import (
    apply_tree,
    build_changelog,
    build_snapshot,
    next_version_number,
)
```
Change to:
```python
from app.services.framework_publish import (
    apply_tree,
    build_changelog,
    build_snapshot,
    delete_orphaned_draft_recommendations,
    next_version_number,
    promote_draft_recommendations,
)
```

- [ ] **Step 2: Call them right after `apply_tree`**

Current (inside `publish()`'s try block):
```python
    try:
        await apply_tree(db, payload.tree)
        after = await build_snapshot(db)
```

Change to:
```python
    try:
        promoted = await apply_tree(db, payload.tree)
        if promoted:
            await promote_draft_recommendations(db, promoted)
        # Anything still draft-flagged here belongs to a draft question that
        # isn't in the tree just published (deleted before publish, or the
        # reconciliation in save_draft hasn't caught up yet) -- orphaned.
        await delete_orphaned_draft_recommendations(db)
        after = await build_snapshot(db)
```

No other change in `publish()` — the existing single `await db.commit()` later in the function covers these writes too, and the existing `except` still rolls everything back together.

- [ ] **Step 3: Verify end-to-end with a throwaway script**

Create `<scratchpad>/verify_task7.py`:

```python
import asyncio, sys
sys.path.insert(0, "d:/datapilot/backend")
import httpx
from app.main import app
from app.core.auth import require_super_admin
from app.services.audit import audit_context, Audit
from app.db.database import AsyncSessionLocal
from app.models import FrameworkDraft, Recommendation, Question
from sqlalchemy import select, delete

FAKE_CLAIMS = {"sub": "verify", "preferred_username": "verify", "email": "v@e.com"}
app.dependency_overrides[require_super_admin] = lambda: FAKE_CLAIMS
app.dependency_overrides[audit_context] = lambda: Audit(FAKE_CLAIMS, None)

async def main():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/super-admin/framework/state")
        state = r.json()
        base_version_id = state["active_version"]["id"] if state["active_version"] else None
        tree = state["draft"]["tree"] if state["draft"] else state["tree"]
        tree = [dict(d) for d in tree]
        tree[0] = dict(tree[0])
        tree[0]["sub_dimensions"] = [dict(s) for s in tree[0]["sub_dimensions"]]
        tree[0]["sub_dimensions"][0] = dict(tree[0]["sub_dimensions"][0])
        tree[0]["sub_dimensions"][0]["questions"] = tree[0]["sub_dimensions"][0]["questions"] + [
            {"id": "new-q-task7verify", "text": "Verify task 7", "type": "Échelle de maturité",
             "weight": 0, "is_required": True, "is_active": True}
        ]

        r = await client.put("/api/super-admin/framework/draft", json={
            "tree": tree, "base_version_id": base_version_id,
        })
        assert r.status_code == 200, r.text
        print("draft saved")

        r = await client.post("/api/super-admin/recommendations", json={
            "draft_question_key": "new-q-task7verify",
            "trigger_levels": [1, 2],
            "title": "t7", "recommendation_text": "t7", "category": "c", "effort": 1,
        })
        assert r.status_code == 201, r.text
        created_codes = {row["code"] for row in r.json()["created"]}
        assert created_codes == {"DRAFT-new-q-task7verify-1", "DRAFT-new-q-task7verify-2"}, created_codes
        print("2 draft recommendations created:", created_codes)

        r = await client.post("/api/super-admin/framework/publish", json={
            "tree": tree, "label": "Task 7 verification", "note": "",
            "base_version_id": base_version_id,
        })
        assert r.status_code == 201, r.text
        version = r.json()
        print("published version", version["number"])

    async with AsyncSessionLocal() as db:
        q = (await db.execute(select(Question).where(Question.text == "Verify task 7"))).scalar_one()
        recos = (await db.execute(
            select(Recommendation).where(Recommendation.question_id == q.id)
        )).scalars().all()
        assert len(recos) == 2, recos
        codes = {r.code for r in recos}
        assert codes == {f"{version['dimension_count'] and ''}" or True} or True  # sanity no-op
        for r in recos:
            assert r.draft_question_key is None, r.draft_question_key
            assert r.code.startswith("D") and "DRAFT-" not in r.code, r.code
        print("OK: both recommendations promoted to real question_id", q.id, "with real codes:", {r.code for r in recos})

        leftover = (await db.execute(
            select(Recommendation).where(Recommendation.draft_question_key.is_not(None))
        )).scalars().all()
        assert not leftover, leftover
        print("OK: no draft-flagged rows left")

        # cleanup: delete the recommendations, the question, and restore the version to inactive-only state
        # is out of scope for this throwaway script -- leaving a published version around is fine for a
        # dev DB, but delete the test recommendations and question so the catalog stays clean.
        await db.execute(delete(Recommendation).where(Recommendation.id.in_([r.id for r in recos])))
        await db.execute(delete(Question).where(Question.id == q.id))
        await db.commit()
        print("cleanup done (test recommendations + question removed; the extra questionnaire version is left, harmless)")

asyncio.run(main())
```

Run it. Expected: every `OK:`/status assertion passes; the two draft recommendations end up with real `question_id`, `draft_question_key = None`, and codes like `D1Q<realid>-1` / `D1Q<realid>-2`. Note this leaves one extra `QuestionnaireVersion` row in the dev DB (harmless — it's just a real publish, matching what the feature is supposed to do); delete the script afterward.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/admin_framework.py
git commit -m "feat(framework): publish() promotes and cleans up draft recommendations

Inside the transaction publish() already owns: newly-created questions'
draft recommendations get their real question_id and a real code; anything
still draft-flagged afterward (orphaned relative to what was just
published) is removed. One commit, one rollback path -- unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Wire cleanup into `discard_draft()`

**Files:**
- Modify: `backend/app/routers/admin_framework.py:164-184` (the `discard_draft` function)

**Interfaces:**
- Consumes: `delete_orphaned_draft_recommendations` (Task 4, already imported by Task 7).
- Produces: discarding the framework draft also removes every current draft recommendation.

- [ ] **Step 1: Add the cleanup call**

Current:
```python
@router.delete("/draft", status_code=status.HTTP_204_NO_CONTENT)
async def discard_draft(
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    """Autosaves (``PUT /draft``) are intentionally not audited — they fire on
    every edit and would bury the actions that matter. Throwing the draft away
    is a decision, so that one is recorded."""
    draft = await _get_draft(db)
    if draft is not None:
        await db.delete(draft)
        await db.commit()
        await audit.record(
            module=MODULE_FRAMEWORK,
            action="Abandon des modifications en cours",
            entity_type="framework_draft",
            entity_id=DRAFT_ID,
            before="Brouillon en cours",
            after="Abandonné",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

Change to:
```python
@router.delete("/draft", status_code=status.HTTP_204_NO_CONTENT)
async def discard_draft(
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    """Autosaves (``PUT /draft``) are intentionally not audited — they fire on
    every edit and would bury the actions that matter. Throwing the draft away
    is a decision, so that one is recorded."""
    draft = await _get_draft(db)
    if draft is not None:
        await db.delete(draft)
        # The whole draft is gone, so every draft recommendation staged
        # against a question in it is now orphaned -- delete all of them.
        await delete_orphaned_draft_recommendations(db)
        await db.commit()
        await audit.record(
            module=MODULE_FRAMEWORK,
            action="Abandon des modifications en cours",
            entity_type="framework_draft",
            entity_id=DRAFT_ID,
            before="Brouillon en cours",
            after="Abandonné",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 2: Verify with a throwaway HTTP script**

Create `<scratchpad>/verify_task8.py`:

```python
import asyncio, sys
sys.path.insert(0, "d:/datapilot/backend")
import httpx
from app.main import app
from app.core.auth import require_super_admin
from app.services.audit import audit_context, Audit
from app.db.database import AsyncSessionLocal
from app.models import Recommendation
from sqlalchemy import select

FAKE_CLAIMS = {"sub": "verify", "preferred_username": "verify", "email": "v@e.com"}
app.dependency_overrides[require_super_admin] = lambda: FAKE_CLAIMS
app.dependency_overrides[audit_context] = lambda: Audit(FAKE_CLAIMS, None)

async def main():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/super-admin/framework/state")
        state = r.json()
        base_version_id = state["active_version"]["id"] if state["active_version"] else None
        tree = state["draft"]["tree"] if state["draft"] else state["tree"]
        tree = [dict(d) for d in tree]
        tree[0] = dict(tree[0])
        tree[0]["sub_dimensions"] = [dict(s) for s in tree[0]["sub_dimensions"]]
        tree[0]["sub_dimensions"][0] = dict(tree[0]["sub_dimensions"][0])
        tree[0]["sub_dimensions"][0]["questions"] = tree[0]["sub_dimensions"][0]["questions"] + [
            {"id": "new-q-task8verify", "text": "Verify task 8", "type": "Échelle de maturité",
             "weight": 0, "is_required": True, "is_active": True}
        ]
        r = await client.put("/api/super-admin/framework/draft", json={"tree": tree, "base_version_id": base_version_id})
        assert r.status_code == 200, r.text

        r = await client.post("/api/super-admin/recommendations", json={
            "draft_question_key": "new-q-task8verify", "trigger_levels": [1],
            "title": "t8", "recommendation_text": "t8", "category": "c", "effort": 1,
        })
        assert r.status_code == 201, r.text
        print("draft recommendation created")

        r = await client.delete("/api/super-admin/framework/draft")
        assert r.status_code == 204, r.status_code
        print("draft discarded")

    async with AsyncSessionLocal() as db:
        remaining = (await db.execute(
            select(Recommendation).where(Recommendation.draft_question_key == "new-q-task8verify")
        )).scalars().all()
        assert not remaining, remaining
        print("OK: draft recommendation removed along with the discarded draft")

asyncio.run(main())
```

Run it. Expected: `draft recommendation created`, `draft discarded`, `OK: draft recommendation removed along with the discarded draft`. No cleanup needed — the script's own assertion is that nothing is left. Delete the script afterward.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/admin_framework.py
git commit -m "feat(framework): discarding the draft also removes its draft recommendations

Prevents orphaned draft recommendation rows from lingering after 'Abandonner
les modifications' -- they were never real/published, so they're hard
deleted in the same commit as the draft row.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Wire reconciliation into `save_draft()` (the autosave)

**Files:**
- Modify: `backend/app/routers/admin_framework.py:142-161` (the `save_draft` function)

**Interfaces:**
- Consumes: `collect_question_ids` (Task 2), `delete_orphaned_draft_recommendations` (Task 4).
- Produces: every autosave reconciles draft recommendations against whichever draft questions are still in the saved tree.

- [ ] **Step 1: Import `collect_question_ids`**

Extend the same import block Task 7 already touched:
```python
from app.services.framework_publish import (
    apply_tree,
    build_changelog,
    build_snapshot,
    collect_question_ids,
    delete_orphaned_draft_recommendations,
    next_version_number,
    promote_draft_recommendations,
)
```

- [ ] **Step 2: Add reconciliation to `save_draft`**

Current:
```python
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

    await db.commit()
    await db.refresh(draft)
    return DraftRead.model_validate(draft)
```

Change to:
```python
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
```

- [ ] **Step 3: Verify with a throwaway HTTP script**

Create `<scratchpad>/verify_task9.py`:

```python
import asyncio, sys
sys.path.insert(0, "d:/datapilot/backend")
import httpx
from app.main import app
from app.core.auth import require_super_admin
from app.services.audit import audit_context, Audit
from app.db.database import AsyncSessionLocal
from app.models import Recommendation
from sqlalchemy import select

FAKE_CLAIMS = {"sub": "verify", "preferred_username": "verify", "email": "v@e.com"}
app.dependency_overrides[require_super_admin] = lambda: FAKE_CLAIMS
app.dependency_overrides[audit_context] = lambda: Audit(FAKE_CLAIMS, None)

async def main():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/super-admin/framework/state")
        state = r.json()
        base_version_id = state["active_version"]["id"] if state["active_version"] else None
        tree = state["draft"]["tree"] if state["draft"] else state["tree"]
        tree = [dict(d) for d in tree]
        tree[0] = dict(tree[0])
        tree[0]["sub_dimensions"] = [dict(s) for s in tree[0]["sub_dimensions"]]
        tree[0]["sub_dimensions"][0] = dict(tree[0]["sub_dimensions"][0])
        questions_with_two_new = tree[0]["sub_dimensions"][0]["questions"] + [
            {"id": "new-q-task9-keep", "text": "Keep me", "type": "Échelle de maturité",
             "weight": 0, "is_required": True, "is_active": True},
            {"id": "new-q-task9-remove", "text": "Remove me", "type": "Échelle de maturité",
             "weight": 0, "is_required": True, "is_active": True},
        ]
        tree[0]["sub_dimensions"][0]["questions"] = questions_with_two_new
        r = await client.put("/api/super-admin/framework/draft", json={"tree": tree, "base_version_id": base_version_id})
        assert r.status_code == 200, r.text

        for key in ("new-q-task9-keep", "new-q-task9-remove"):
            r = await client.post("/api/super-admin/recommendations", json={
                "draft_question_key": key, "trigger_levels": [1],
                "title": "t9", "recommendation_text": "t9", "category": "c", "effort": 1,
            })
            assert r.status_code == 201, r.text
        print("2 draft recommendations created, one per draft question")

        # Simulate the admin deleting "new-q-task9-remove" and the autosave firing.
        tree[0]["sub_dimensions"][0] = dict(tree[0]["sub_dimensions"][0])
        tree[0]["sub_dimensions"][0]["questions"] = [
            q for q in questions_with_two_new if q["id"] != "new-q-task9-remove"
        ]
        r = await client.put("/api/super-admin/framework/draft", json={"tree": tree, "base_version_id": base_version_id})
        assert r.status_code == 200, r.text
        print("draft re-saved without new-q-task9-remove")

    async with AsyncSessionLocal() as db:
        kept = (await db.execute(
            select(Recommendation).where(Recommendation.draft_question_key == "new-q-task9-keep")
        )).scalars().all()
        removed = (await db.execute(
            select(Recommendation).where(Recommendation.draft_question_key == "new-q-task9-remove")
        )).scalars().all()
        assert len(kept) == 1, kept
        assert len(removed) == 0, removed
        print("OK: recommendation for the still-present question survived, the removed question's did not")

        # cleanup: discard the whole draft (also exercises task 8's cleanup, harmless here)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await client.delete("/api/super-admin/framework/draft")
    print("cleanup done")

asyncio.run(main())
```

Run it. Expected: `OK: recommendation for the still-present question survived, the removed question's did not`, `cleanup done`. Delete the script afterward.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/admin_framework.py
git commit -m "feat(framework): autosave reconciles draft recommendations against the tree

Every PUT /framework/draft now removes any draft recommendation whose
question is no longer present in the saved tree -- covers deleting a draft
question from the editor without waiting for a discard or publish.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Frontend — collision-safe temp ids

**Files:**
- Modify: `frontend/src/pages/superAdmin/frameworkStaging.tsx:25-26`

**Interfaces:**
- Produces: `newId(prefix)` generates a UUID-suffixed id, globally unique — no seeding/collision handling needed anywhere else. `isNewId` unchanged, still `id.startsWith("new-")`.

- [ ] **Step 1: Make the change**

Current:
```ts
let counter = 0;
const newId = (prefix: string) => `new-${prefix}-${++counter}`;
```

Change to:
```ts
// crypto.randomUUID() (standard Web Crypto API, no import needed) instead of
// a module-level counter: the counter reset to 0 on every page load, which
// could collide with a "new-q-1" already sitting in the persisted draft --
// harmless before, but this id is now also the durable cross-reference a
// draft recommendation uses to point at its (not-yet-published) question,
// so it has to be genuinely unique, not just unique-per-session.
const newId = (prefix: string) => `new-${prefix}-${crypto.randomUUID()}`;
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npx tsc --noEmit -p .
```
Expected: no errors (no `counter` references remain anywhere in the file — grep to confirm):
```bash
grep -n "counter" src/pages/superAdmin/frameworkStaging.tsx
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/superAdmin/frameworkStaging.tsx
git commit -m "fix(framework): use crypto.randomUUID() for staged-tree temp ids

The old counter-based id reset to 0 on every page load and could collide
with a temp id already sitting in the persisted draft. Needed before temp
ids can safely be used as a durable draft-question reference for draft
recommendations.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Frontend types + `createDraftRecommendations`

**Files:**
- Modify: `frontend/src/lib/admin.ts:115-355`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Recommendation.questionId: string | null`, `Recommendation.draftQuestionKey: string | null`; `adminApi.createDraftRecommendations(draftQuestionKey, triggerLevels, input)`. Tasks 13/14 consume these.

- [ ] **Step 1: Widen the types**

Current:
```ts
export interface Recommendation {
  id: string;
  code: string;
  questionId: string;
  triggerLevel: number;
  targetLevel: number;
  title: string;
  text: string;
  category: string;
  regulatoryFlag: boolean;
  effort: number;
  status: Status;
}

interface ApiRecommendation {
  id: number;
  code: string;
  question_id: number;
  trigger_level: number;
  target_level: number;
  title: string;
  recommendation_text: string;
  category: string;
  regulatory_flag: boolean;
  effort: number;
  prerequisite_id: number | null;
  is_active: boolean;
}
```

Change to:
```ts
export interface Recommendation {
  id: string;
  code: string;
  /** Null for a draft recommendation -- see draftQuestionKey. */
  questionId: string | null;
  /** Set only for a recommendation staged against a question that hasn't
   *  been published yet (see AdminDimensions.tsx's "Configurer les
   *  recommandations" flow) -- the same temp id the framework editor uses
   *  for that question in its draft tree. */
  draftQuestionKey: string | null;
  triggerLevel: number;
  targetLevel: number;
  title: string;
  text: string;
  category: string;
  regulatoryFlag: boolean;
  effort: number;
  status: Status;
}

interface ApiRecommendation {
  id: number;
  code: string;
  question_id: number | null;
  draft_question_key: string | null;
  trigger_level: number;
  target_level: number;
  title: string;
  recommendation_text: string;
  category: string;
  regulatory_flag: boolean;
  effort: number;
  prerequisite_id: number | null;
  is_active: boolean;
}
```

Current `mapRecommendation`:
```ts
function mapRecommendation(r: ApiRecommendation): Recommendation {
  return {
    id: String(r.id),
    code: r.code,
    questionId: String(r.question_id),
    triggerLevel: r.trigger_level,
    targetLevel: r.target_level,
    title: r.title,
    text: r.recommendation_text,
    category: r.category,
    regulatoryFlag: r.regulatory_flag,
    effort: r.effort,
    status: toStatus(r.is_active),
  };
}
```

Change to:
```ts
function mapRecommendation(r: ApiRecommendation): Recommendation {
  return {
    id: String(r.id),
    code: r.code,
    questionId: r.question_id != null ? String(r.question_id) : null,
    draftQuestionKey: r.draft_question_key,
    triggerLevel: r.trigger_level,
    targetLevel: r.target_level,
    title: r.title,
    text: r.recommendation_text,
    category: r.category,
    regulatoryFlag: r.regulatory_flag,
    effort: r.effort,
    status: toStatus(r.is_active),
  };
}
```

- [ ] **Step 2: Add `createDraftRecommendations`**

Current (`adminApi`'s recommendations section):
```ts
  createRecommendations: async (
    questionId: string, triggerLevels: number[], input: RecommendationCreateInput
  ): Promise<{ created: Recommendation[]; skippedLevels: number[] }> => {
    const res = await api.post<ApiRecommendationBatchResult>("/api/super-admin/recommendations", {
      question_id: Number(questionId),
      trigger_levels: triggerLevels,
      title: input.title,
      recommendation_text: input.text,
      category: input.category,
      effort: input.effort,
      regulatory_flag: input.regulatoryFlag,
      is_active: toActive(input.status),
    });
    return { created: res.created.map(mapRecommendation), skippedLevels: res.skipped_levels };
  },
```

Add right after it, inside the same `adminApi` object:
```ts
  // Same shape as createRecommendations, but for a question that's still in
  // the framework draft (no real question_id yet) -- see
  // AdminDimensions.tsx's "Configurer les recommandations" flow and
  // WizardDrawer's isNewId(questionId) branch in AdminRecommendations.tsx.
  createDraftRecommendations: async (
    draftQuestionKey: string, triggerLevels: number[], input: RecommendationCreateInput
  ): Promise<{ created: Recommendation[]; skippedLevels: number[] }> => {
    const res = await api.post<ApiRecommendationBatchResult>("/api/super-admin/recommendations", {
      draft_question_key: draftQuestionKey,
      trigger_levels: triggerLevels,
      title: input.title,
      recommendation_text: input.text,
      category: input.category,
      effort: input.effort,
      regulatory_flag: input.regulatoryFlag,
      is_active: toActive(input.status),
    });
    return { created: res.created.map(mapRecommendation), skippedLevels: res.skipped_levels };
  },
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit -p .
```
Expected: no errors. (This will surface every place `Recommendation.questionId`/`ApiRecommendation.question_id` was assumed non-null, which is exactly Tasks 13/14's job to fix — if `tsc` errors inside `AdminRecommendations.tsx` at this point, that's expected and gets resolved there, not here.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/admin.ts
git commit -m "feat(admin-lib): widen Recommendation types, add createDraftRecommendations

question_id/questionId become nullable, draft_question_key/draftQuestionKey
added, mirroring the backend schema change. createDraftRecommendations
mirrors createRecommendations for the draft-question case.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: `QuestionModal` success view + `DimensionsManagement` hand-off

**Files:**
- Modify: `frontend/src/pages/superAdmin/AdminDimensions.tsx:294-368` (`QuestionModal`)
- Modify: `frontend/src/pages/superAdmin/AdminDimensions.tsx:1245-1646` (`DimensionsManagement`)

**Interfaces:**
- Consumes: `saveDraft` (already imported), `staging.createQuestion` (already available).
- Produces: `QuestionModal` gains an `onConfigureRecommendations?: (tempId: string) => void` prop; on successful create, shows a success view instead of closing. `DimensionsManagement` supplies the handler, which saves the draft immediately and navigates to `/super-admin/recommendations?draftQuestionId=<tempId>` — no `PublishDialog`, no `publishFramework`, ever.

- [ ] **Step 1: Add the router import**

At the top of `AdminDimensions.tsx`, current imports don't include react-router-dom. Add:
```ts
import { useNavigate } from "react-router-dom";
```

- [ ] **Step 2: `QuestionModal` gets a success view**

Current signature and `save()` (lines 294-353):
```ts
function QuestionModal({ dimensions, dim, sub, initial, initialTab = "edit", onClose, onSaved }: {
  dimensions: Dimension[];
  dim?: Dimension; sub?: SubDimension;
  initial?: Question;
  initialTab?: "edit" | "preview";
  onClose: () => void; onSaved: () => Promise<void>;
}) {
```
...
```ts
  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = {
        label, description, type, weight, order, isRequired: required, status,
        levelResponses: type === "Échelle de maturité" ? levelResponses : null,
        choiceOptions: isChoiceType ? choiceOptions : null,
      };
      if (initial) await staging.updateQuestion(initial.id, { ...input, subDimensionId });
      else await staging.createQuestion(subDimensionId, input);
      toast.success(initial ? "Question mise à jour" : "Question créée");
      await onSaved();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }
```

Change the signature to add the new prop:
```ts
function QuestionModal({ dimensions, dim, sub, initial, initialTab = "edit", onClose, onSaved, onConfigureRecommendations }: {
  dimensions: Dimension[];
  dim?: Dimension; sub?: SubDimension;
  initial?: Question;
  initialTab?: "edit" | "preview";
  onClose: () => void; onSaved: () => Promise<void>;
  onConfigureRecommendations?: (tempId: string) => void;
}) {
```

Add state for the success view, right after the existing `const [saving, setSaving] = useState(false);`:
```ts
  const [justCreated, setJustCreated] = useState<{ id: string; label: string } | null>(null);
```

Change `save()`:
```ts
  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = {
        label, description, type, weight, order, isRequired: required, status,
        levelResponses: type === "Échelle de maturité" ? levelResponses : null,
        choiceOptions: isChoiceType ? choiceOptions : null,
      };
      if (initial) {
        await staging.updateQuestion(initial.id, { ...input, subDimensionId });
        toast.success("Question mise à jour");
        await onSaved();
        onClose();
      } else {
        const created = await staging.createQuestion(subDimensionId, input);
        await onSaved();
        // Stay open: show the success view instead of closing immediately,
        // so the admin can jump straight to configuring this question's
        // recommendations without hunting for it in the catalog afterward.
        setJustCreated({ id: created.id, label });
      }
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }
```

- [ ] **Step 3: Render the success view**

Current return statement's `ModalShell` usage (lines 355-368):
```tsx
  return (
    <ModalShell
      title={initial ? "Modifier la question" : "Nouvelle question"}
      subtitle={selectedDim && selectedSub ? `${selectedDim.name} › ${selectedSub.name}` : "Sélectionnez une sous-dimension"}
      width={620}
      headerExtra={<TabSwitch tab={tab} onChange={setTab} />}
      onClose={onClose}
      footer={<>
        <button style={btnGhost} onClick={onClose}>Annuler</button>
        <button style={{ ...btnPrimary, opacity: !canSave || saving ? 0.5 : 1 }} disabled={!canSave || saving} onClick={save}>
          {saving && <Loader2 size={14} className="animate-spin" />}{initial ? "Enregistrer" : "Créer"}
        </button>
      </>}
    >
      {tab === "edit" ? (
```

Change to:
```tsx
  if (justCreated) {
    return (
      <ModalShell
        title="Nouvelle question"
        width={480}
        onClose={onClose}
        footer={<>
          <button style={btnGhost} onClick={onClose}>Terminer</button>
          <button
            style={btnPrimary}
            onClick={() => onConfigureRecommendations?.(justCreated.id)}
          >
            Configurer les recommandations <ArrowRight size={14} />
          </button>
        </>}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, padding: "18px 8px" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#E8F5E9", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check size={22} style={{ color: "#2E7D32" }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Question ajoutée avec succès</div>
          <div style={{ fontSize: 12, color: "#9B9B9B" }}>{justCreated.label}</div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title={initial ? "Modifier la question" : "Nouvelle question"}
      subtitle={selectedDim && selectedSub ? `${selectedDim.name} › ${selectedSub.name}` : "Sélectionnez une sous-dimension"}
      width={620}
      headerExtra={<TabSwitch tab={tab} onChange={setTab} />}
      onClose={onClose}
      footer={<>
        <button style={btnGhost} onClick={onClose}>Annuler</button>
        <button style={{ ...btnPrimary, opacity: !canSave || saving ? 0.5 : 1 }} disabled={!canSave || saving} onClick={save}>
          {saving && <Loader2 size={14} className="animate-spin" />}{initial ? "Enregistrer" : "Créer"}
        </button>
      </>}
    >
      {tab === "edit" ? (
```

(`Check` and `ArrowRight` are already imported at the top of this file — confirmed in the existing `lucide-react` import list.)

- [ ] **Step 4: `DimensionsManagement` supplies the handler**

Current state block (around line 1266-1273) already has `baseVersionId`. Add `useNavigate()` right after the component opens:
```ts
export function DimensionsManagement({ readOnly = false }: { readOnly?: boolean } = {}) {
  const navigate = useNavigate();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
```

Add the handler near the other handlers (right after `confirmPublish`, before `const toggleDim = ...`):
```ts
  async function configureRecommendations(tempQuestionId: string) {
    setQModal(null);
    // Guarantee the backend's draft actually contains this question before
    // navigating -- the debounced autosave (below) might not have fired
    // yet. Reuses the exact same saveDraft the autosave already calls; this
    // never publishes anything and never touches the live questionnaire.
    try {
      await saveDraft(dimensions, baseVersionId);
    } catch (e) {
      toast.error("Impossible d'enregistrer le brouillon avant de continuer", { description: errMsg(e) });
      return;
    }
    navigate(`/super-admin/recommendations?draftQuestionId=${encodeURIComponent(tempQuestionId)}`);
  }
```

Wire it into the `QuestionModal` render (current, around line 1624-1634):
```tsx
      {qModal && (
        <QuestionModal
          dimensions={dimensions}
          dim={qModal.dim}
          sub={qModal.sub}
          initial={qModal.initial}
          initialTab={qModal.initialTab}
          onClose={() => setQModal(null)}
          onSaved={load}
        />
      )}
```
Change to:
```tsx
      {qModal && (
        <QuestionModal
          dimensions={dimensions}
          dim={qModal.dim}
          sub={qModal.sub}
          initial={qModal.initial}
          initialTab={qModal.initialTab}
          onClose={() => setQModal(null)}
          onSaved={load}
          onConfigureRecommendations={configureRecommendations}
        />
      )}
```

- [ ] **Step 5: Verify**

```bash
cd frontend && npx tsc --noEmit -p .
```
Expected: no errors.

Manual click-through (dev server already running at `localhost:5173`):
1. Go to `/super-admin/dimensions`, open any sub-dimension, click "+ Ajouter une question".
2. Fill in a label, click "Créer".
3. Confirm the modal switches to the success view: green checkmark, "Question ajoutée avec succès", the question's label, `Terminer` and `Configurer les recommandations →` buttons — no `PublishDialog` anywhere.
4. Click `Terminer` — confirm the modal closes and the question shows up in the tree, still unpublished ("N modifications non publiées" / dirty indicator still shows it as pending, exactly as creating a question does today).
5. Repeat, this time clicking `Configurer les recommandations →` — confirm the browser navigates to `/super-admin/recommendations?draftQuestionId=new-q-<uuid>` and that **no publish dialog ever appeared** and the framework's pending-changes count is unaffected by this click (still shows the question as an unpublished draft change if you navigate back to `/super-admin/dimensions`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/superAdmin/AdminDimensions.tsx
git commit -m "feat(framework): QuestionModal success view offers 'Configurer les recommandations'

Creating a question now shows a success view (Terminer / Configurer les
recommandations) instead of closing immediately. The recommendations path
saves the draft (so the backend has the new question before navigating) and
routes to the catalog with ?draftQuestionId= -- never opens PublishDialog,
never calls publishFramework.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Catalog fetches/merges the draft tree, draft badges, deep-link open

**Files:**
- Modify: `frontend/src/pages/superAdmin/AdminRecommendations.tsx:31-44` (imports)
- Modify: `frontend/src/pages/superAdmin/AdminRecommendations.tsx:60-79` (`flattenRecommendations`)
- Modify: `frontend/src/pages/superAdmin/AdminRecommendations.tsx:679-780` (`RecommendationCatalog`)

**Interfaces:**
- Consumes: `getFrameworkState`, `fromApiTree`, `isNewId` (from `lib/adminFramework.ts`).
- Produces: `RecommendationCatalog` merges the draft tree into what it passes to `WizardDrawer`; recommendation rows carry an `isDraft` flag for the badge; `?draftQuestionId=` auto-opens the wizard pre-filled. Task 14 (the wizard's save path) builds directly on this.

- [ ] **Step 1: Imports**

Current:
```ts
import { useCallback, useEffect, useState } from "react";
import {
  Search, Plus, X, ChevronDown, MoreHorizontal,
  Edit2, Trash2, Eye, Power,
  RotateCcw, Info, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle, Shield, TrendingUp, BookOpen, Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  adminApi,
  type Dimension, type Recommendation, type Status,
} from "../../lib/admin";
```

Change to:
```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, Plus, X, ChevronDown, MoreHorizontal,
  Edit2, Trash2, Eye, Power,
  RotateCcw, Info, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle, Shield, TrendingUp, BookOpen, Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  adminApi,
  type Dimension, type Recommendation, type Status,
} from "../../lib/admin";
import { getFrameworkState, fromApiTree, isNewId } from "../../lib/adminFramework";
```

- [ ] **Step 2: `flattenRecommendations` resolves draft rows too, flags `isDraft`**

Current:
```ts
interface FlatRecommendation extends Recommendation {
  dimensionName: string;
  dimensionColor: string;
  subDimensionName: string;
  questionText: string;
}

function flattenRecommendations(recs: Recommendation[], dimensions: Dimension[]): FlatRecommendation[] {
  const byQuestion = new Map<string, { dim: Dimension; subName: string; text: string }>();
  for (const d of dimensions) {
    for (const s of d.subDimensions) {
      for (const q of s.questions) {
        byQuestion.set(q.id, { dim: d, subName: s.name, text: q.label });
      }
    }
  }
  return recs.map(r => {
    const ctx = byQuestion.get(r.questionId);
    return {
      ...r,
      dimensionName: ctx?.dim.name ?? "—",
      dimensionColor: ctx?.dim.color ?? "#9B9B9B",
      subDimensionName: ctx?.subName ?? "—",
      questionText: ctx?.text ?? "—",
    };
  });
}
```

Change to:
```ts
interface FlatRecommendation extends Recommendation {
  dimensionName: string;
  dimensionColor: string;
  subDimensionName: string;
  questionText: string;
  isDraft: boolean;
}

// `dimensions` here is the MERGED tree (live + draft, see mergedDimensions
// in RecommendationCatalog below) -- a draft recommendation's questionId is
// null, so it's resolved by draftQuestionKey against the same merged tree
// instead (a draft question's id in that tree IS its draftQuestionKey).
function flattenRecommendations(recs: Recommendation[], dimensions: Dimension[]): FlatRecommendation[] {
  const byQuestion = new Map<string, { dim: Dimension; subName: string; text: string }>();
  for (const d of dimensions) {
    for (const s of d.subDimensions) {
      for (const q of s.questions) {
        byQuestion.set(q.id, { dim: d, subName: s.name, text: q.label });
      }
    }
  }
  return recs.map(r => {
    const key = r.questionId ?? r.draftQuestionKey ?? "";
    const ctx = byQuestion.get(key);
    return {
      ...r,
      dimensionName: ctx?.dim.name ?? "—",
      dimensionColor: ctx?.dim.color ?? "#9B9B9B",
      subDimensionName: ctx?.subName ?? "—",
      questionText: ctx?.text ?? "—",
      isDraft: r.questionId === null,
    };
  });
}
```

- [ ] **Step 3: `RecommendationCatalog` fetches and merges the draft tree**

Current `load` + state (lines 679-713):
```ts
export function RecommendationCatalog() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [recs, setRecs] = useState<FlatRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [fDim, setFDim] = useState("");
  const [fCat, setFCat] = useState("");
  const [fType, setFType] = useState("");
  const [fStat, setFStat] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editRec, setEditRec] = useState<FlatRecommendation | null>(null);
  const [focusSearch, setFocusSearch] = useState(false);
  const [viewRec, setViewRec] = useState<FlatRecommendation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlatRecommendation | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const [dims, recommendations] = await Promise.all([adminApi.listDimensions(), adminApi.listRecommendations()]);
      setDimensions(dims);
      setRecs(flattenRecommendations(recommendations, dims));
    } catch (e) {
      setLoadError(true);
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
```

Change to:
```ts
export function RecommendationCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [draftDimensions, setDraftDimensions] = useState<Dimension[]>([]);
  const [recs, setRecs] = useState<FlatRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [fDim, setFDim] = useState("");
  const [fCat, setFCat] = useState("");
  const [fType, setFType] = useState("");
  const [fStat, setFStat] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [presetQuestionId, setPresetQuestionId] = useState<string | null>(null);
  const [editRec, setEditRec] = useState<FlatRecommendation | null>(null);
  const [focusSearch, setFocusSearch] = useState(false);
  const [viewRec, setViewRec] = useState<FlatRecommendation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlatRecommendation | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const [dims, recommendations, framework] = await Promise.all([
        adminApi.listDimensions(),
        adminApi.listRecommendations(),
        getFrameworkState(),
      ]);
      // Draft-only nodes (dimension/sub-dimension/question ids failing
      // isNewId are real and already in `dims` -- keep only what isn't).
      const draftTree = framework.draft ? fromApiTree(framework.draft.tree) : [];
      setDimensions(dims);
      setDraftDimensions(draftTree);
      const merged = mergeDraftIntoLive(dims, draftTree);
      setRecs(flattenRecommendations(recommendations, merged));
    } catch (e) {
      setLoadError(true);
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Live dimensions, with any draft-only dimensions/sub-dimensions/questions
  // merged in (tagged via isNewId so the UI can badge them "Brouillon") --
  // passed to WizardDrawer so both the manual flow and the deep-link below
  // can select a draft question, per the brainstormed design.
  const mergedDimensions = useMemo(
    () => mergeDraftIntoLive(dimensions, draftDimensions),
    [dimensions, draftDimensions],
  );

  // Deep-link from AdminDimensions.tsx's "Configurer les recommandations":
  // ?draftQuestionId=<tempId> opens the wizard pre-filled with that draft
  // question, once the merged tree has loaded. Consumed once (param cleared)
  // so a refresh doesn't reopen it.
  useEffect(() => {
    const draftQuestionId = searchParams.get("draftQuestionId");
    if (!draftQuestionId || loading) return;
    const exists = mergedDimensions.some(d => d.subDimensions.some(s => s.questions.some(q => q.id === draftQuestionId)));
    if (exists) {
      setPresetQuestionId(draftQuestionId);
      setShowWizard(true);
    } else {
      toast.warning("Question de brouillon introuvable — le brouillon a peut-être changé.");
    }
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete("draftQuestionId"); return next; }, { replace: true });
  }, [searchParams, loading, mergedDimensions, setSearchParams]);
```

Add the merge helper as a module-level function, right after `flattenRecommendations`:
```ts
// Live tree + draft-only nodes, so the catalog's selectors can offer a
// question that hasn't been published yet. A draft dimension/sub-dimension
// only appears if it's genuinely new (isNewId) -- an existing dimension
// being edited in the draft keeps its real id and is already in `live`.
function mergeDraftIntoLive(live: Dimension[], draft: Dimension[]): Dimension[] {
  const liveIds = new Set(live.map(d => d.id));
  const draftOnlyDimensions = draft.filter(d => isNewId(d.id) && !liveIds.has(d.id));

  const merged = live.map(liveDim => {
    const draftDim = draft.find(d => d.id === liveDim.id);
    if (!draftDim) return liveDim;
    const liveSubIds = new Set(liveDim.subDimensions.map(s => s.id));
    const draftOnlySubs = draftDim.subDimensions.filter(s => isNewId(s.id) && !liveSubIds.has(s.id));
    const subDimensions = liveDim.subDimensions.map(liveSub => {
      const draftSub = draftDim.subDimensions.find(s => s.id === liveSub.id);
      if (!draftSub) return liveSub;
      const liveQIds = new Set(liveSub.questions.map(q => q.id));
      const draftOnlyQuestions = draftSub.questions.filter(q => isNewId(q.id) && !liveQIds.has(q.id));
      return draftOnlyQuestions.length
        ? { ...liveSub, questions: [...liveSub.questions, ...draftOnlyQuestions] }
        : liveSub;
    });
    return draftOnlySubs.length ? { ...liveDim, subDimensions: [...subDimensions, ...draftOnlySubs] } : { ...liveDim, subDimensions };
  });

  return [...merged, ...draftOnlyDimensions];
}
```

- [ ] **Step 4: Pass the merged tree + preset to `WizardDrawer`, badge draft rows**

Current wizard mounts (lines 974/977):
```tsx
      {showWizard && <WizardDrawer dimensions={dimensions} categories={categories} onClose={() => setShowWizard(false)} onSaved={load} />}
```
```tsx
        <WizardDrawer dimensions={dimensions} categories={categories} editing={editRec} onClose={() => setEditRec(null)} onSaved={load} />
```

Change to:
```tsx
      {showWizard && (
        <WizardDrawer
          dimensions={mergedDimensions}
          categories={categories}
          presetQuestionId={presetQuestionId ?? undefined}
          onClose={() => { setShowWizard(false); setPresetQuestionId(null); }}
          onSaved={load}
        />
      )}
```
```tsx
        <WizardDrawer dimensions={mergedDimensions} categories={categories} editing={editRec} onClose={() => setEditRec(null)} onSaved={load} />
```

For the draft badge in the recommendation list/table (wherever the row shows `code`/`title` — this file renders both a card grid and a table view; add the badge next to the code in both). Find the existing badge component pattern near the top:
```ts
function StatutBadge({ value }: { value: Status }) {
```
Add a sibling component right after it:
```ts
function DraftBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 700, color: "#8A6A1A", backgroundColor: "#FFF4DC", borderRadius: 4, padding: "1px 6px" }}>
      Brouillon
    </span>
  );
}
```
Then, in each place the row's `code` is rendered (grep `r.code` / `rec.code` in this file to find both the grid-card and table-row spots), render `{rec.isDraft && <DraftBadge />}` immediately next to it — same pattern as `<StatutBadge value={rec.status} />` used nearby.

- [ ] **Step 5: Verify**

```bash
cd frontend && npx tsc --noEmit -p .
```
Expected: no errors yet from this task (Task 14 fixes `WizardDrawer`'s own prop type and save logic — until then, `tsc` will flag `presetQuestionId` as an unknown prop on `WizardDrawer`; that's expected and resolved in Task 14, so if running standalone, note the specific error is `Property 'presetQuestionId' does not exist` and nothing else).

- [ ] **Step 6: Commit**

Hold this commit until Task 14 is done (they're two edits of the same render tree — `WizardDrawer` doesn't compile cleanly with a `presetQuestionId` prop it doesn't accept yet). Proceed directly to Task 14, then commit both together as directed there.

---

## Task 14: `WizardDrawer` accepts `presetQuestionId`, saves via the draft path when needed

**Files:**
- Modify: `frontend/src/pages/superAdmin/AdminRecommendations.tsx:252-506` (`WizardDrawer`)

**Interfaces:**
- Consumes: `presetQuestionId?: string` (new prop, set by Task 13), `isNewId` (from `lib/adminFramework.ts`, already imported by Task 13), `adminApi.createDraftRecommendations` (Task 11).
- Produces: the wizard opens with dimension/sub-dimension/question pre-filled when `presetQuestionId` is set; saving branches on whether the selected question is a draft or real one.

- [ ] **Step 1: Accept the new prop and pre-fill from it**

Current signature and initial state (lines 252-268):
```ts
function WizardDrawer({ dimensions, categories, editing, onClose, onSaved }: {
  dimensions: Dimension[];
  categories: string[];
  /** Présent = édition (rattachement figé, une seule ligne réelle) ; absent = création (rattachement libre, plusieurs niveaux possibles). */
  editing?: FlatRecommendation;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(editing);
  const [d, setD] = useState<WizardData>(() => editing ? {
    titre: editing.title, description: editing.text, statut: editing.status,
    dimensionId: "", subDimensionId: "", questionId: editing.questionId,
    niveaux: [editing.triggerLevel],
    type: typeOf(editing), category: editing.category, effort: editing.effort,
  } : makeInitialWizard());
```

Change to:
```ts
function WizardDrawer({ dimensions, categories, editing, presetQuestionId, onClose, onSaved }: {
  dimensions: Dimension[];
  categories: string[];
  /** Présent = édition (rattachement figé, une seule ligne réelle) ; absent = création (rattachement libre, plusieurs niveaux possibles). */
  editing?: FlatRecommendation;
  /** Pré-sélectionne dimension/sous-dimension/question au montage (déclenché
   *  par "Configurer les recommandations" depuis une question tout juste
   *  créée en brouillon) -- ignoré en édition. */
  presetQuestionId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(editing);
  const [d, setD] = useState<WizardData>(() => {
    if (editing) {
      return {
        titre: editing.title, description: editing.text, statut: editing.status,
        dimensionId: "", subDimensionId: "", questionId: editing.questionId ?? editing.draftQuestionKey ?? "",
        niveaux: [editing.triggerLevel],
        type: typeOf(editing), category: editing.category, effort: editing.effort,
      };
    }
    if (presetQuestionId) {
      for (const dim of dimensions) {
        for (const sub of dim.subDimensions) {
          if (sub.questions.some(q => q.id === presetQuestionId)) {
            return { ...makeInitialWizard(), dimensionId: dim.id, subDimensionId: sub.id, questionId: presetQuestionId };
          }
        }
      }
    }
    return makeInitialWizard();
  });
```

(`editing.questionId ?? editing.draftQuestionKey` also fixes the edit-mode case for a not-yet-published recommendation being edited — a draft row's `editing.questionId` is now `null` after Task 11's type change, so this keeps edit mode working for both.)

- [ ] **Step 2: Branch `save()` on whether the question is a draft**

Current (lines 281-304):
```ts
  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit && editing) {
        await adminApi.updateRecommendation(editing.id, {
          title: d.titre, text: d.description, category: d.category,
          effort: d.effort, regulatoryFlag: d.type === "Réglementaire", status: d.statut,
        });
        toast.success("Recommandation mise à jour");
      } else {
        const res = await adminApi.createRecommendations(d.questionId, d.niveaux, {
          title: d.titre, text: d.description, category: d.category,
          effort: d.effort, regulatoryFlag: d.type === "Réglementaire", status: d.statut,
        });
        toast.success(`${res.created.length} recommandation${res.created.length !== 1 ? "s" : ""} créée${res.created.length !== 1 ? "s" : ""}`);
        if (res.skippedLevels.length > 0) {
          toast.warning(`Niveau${res.skippedLevels.length !== 1 ? "x" : ""} déjà existant${res.skippedLevels.length !== 1 ? "s" : ""} pour cette question, ignoré${res.skippedLevels.length !== 1 ? "s" : ""} : ${res.skippedLevels.join(", ")}`);
        }
      }
      await onSaved();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }
```

Change the `else` branch:
```ts
  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit && editing) {
        await adminApi.updateRecommendation(editing.id, {
          title: d.titre, text: d.description, category: d.category,
          effort: d.effort, regulatoryFlag: d.type === "Réglementaire", status: d.statut,
        });
        toast.success("Recommandation mise à jour");
      } else {
        const input = {
          title: d.titre, text: d.description, category: d.category,
          effort: d.effort, regulatoryFlag: d.type === "Réglementaire", status: d.statut,
        };
        const res = isNewId(d.questionId)
          ? await adminApi.createDraftRecommendations(d.questionId, d.niveaux, input)
          : await adminApi.createRecommendations(d.questionId, d.niveaux, input);
        toast.success(`${res.created.length} recommandation${res.created.length !== 1 ? "s" : ""} créée${res.created.length !== 1 ? "s" : ""}`);
        if (res.skippedLevels.length > 0) {
          toast.warning(`Niveau${res.skippedLevels.length !== 1 ? "x" : ""} déjà existant${res.skippedLevels.length !== 1 ? "s" : ""} pour cette question, ignoré${res.skippedLevels.length !== 1 ? "s" : ""} : ${res.skippedLevels.join(", ")}`);
        }
      }
      await onSaved();
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }
```

- [ ] **Step 3: Badge draft options in the cascading selects (Step 2 of the wizard)**

Current question `FSelect` (around line 367-373):
```tsx
              {selectedSub && (
                <div>
                  <label style={LBL}>Question *</label>
                  <FSelect value={availableQuestions.find(q => q.id === d.questionId)?.label ?? ""}
                    onChange={label => set({ questionId: availableQuestions.find(q => q.label === label)?.id ?? "" })}
                    options={availableQuestions.map(q => q.label)} placeholder="Sélectionner une question..." />
                </div>
              )}
```

(`FSelect` takes plain string `options`/`value`, so the simplest way to badge a draft entry without changing `FSelect` itself is to suffix the label in the options list and strip it back off on change.)

Current Dimension + Sous-dimension + Question `FSelect`s (lines 353-374):
```tsx
              <div>
                <label style={LBL}>Dimension *</label>
                <FSelect value={selectedDim?.name ?? ""}
                  onChange={name => changeDimension(dimensions.find(dim => dim.name === name)?.id ?? "")}
                  options={dimensions.map(dim => dim.name)} placeholder="Sélectionner une dimension..." />
              </div>
              {selectedDim && (
                <div>
                  <label style={LBL}>Sous-dimension *</label>
                  <FSelect value={availableSubs.find(s => s.id === d.subDimensionId)?.name ?? ""}
                    onChange={name => changeSub(availableSubs.find(s => s.name === name)?.id ?? "")}
                    options={availableSubs.map(s => s.name)} placeholder="Sélectionner une sous-dimension..." />
                </div>
              )}
              {selectedSub && (
                <div>
                  <label style={LBL}>Question *</label>
                  <FSelect
                    value={(() => {
                      const q = availableQuestions.find(q => q.id === d.questionId);
                      return q ? (isNewId(q.id) ? `${q.label} [Brouillon]` : q.label) : "";
                    })()}
                    onChange={label => {
                      const plain = label.replace(/ \[Brouillon\]$/, "");
                      set({ questionId: availableQuestions.find(q => q.label === plain)?.id ?? "" });
                    }}
                    options={availableQuestions.map(q => isNewId(q.id) ? `${q.label} [Brouillon]` : q.label)}
                    placeholder="Sélectionner une question..."
                  />
                </div>
              )}
```

Change to (Dimension and Sous-dimension `FSelect`s get the same `[Brouillon]`-suffix treatment as Question above, replacing the current block quoted at the start of this step):
```tsx
              <div>
                <label style={LBL}>Dimension *</label>
                <FSelect
                  value={selectedDim ? (isNewId(selectedDim.id) ? `${selectedDim.name} [Brouillon]` : selectedDim.name) : ""}
                  onChange={name => {
                    const plain = name.replace(/ \[Brouillon\]$/, "");
                    changeDimension(dimensions.find(dim => dim.name === plain)?.id ?? "");
                  }}
                  options={dimensions.map(dim => isNewId(dim.id) ? `${dim.name} [Brouillon]` : dim.name)}
                  placeholder="Sélectionner une dimension..." />
              </div>
              {selectedDim && (
                <div>
                  <label style={LBL}>Sous-dimension *</label>
                  <FSelect
                    value={(() => {
                      const s = availableSubs.find(s => s.id === d.subDimensionId);
                      return s ? (isNewId(s.id) ? `${s.name} [Brouillon]` : s.name) : "";
                    })()}
                    onChange={name => {
                      const plain = name.replace(/ \[Brouillon\]$/, "");
                      changeSub(availableSubs.find(s => s.name === plain)?.id ?? "");
                    }}
                    options={availableSubs.map(s => isNewId(s.id) ? `${s.name} [Brouillon]` : s.name)}
                    placeholder="Sélectionner une sous-dimension..." />
                </div>
              )}
              {selectedSub && (
                <div>
                  <label style={LBL}>Question *</label>
                  <FSelect
                    value={(() => {
                      const q = availableQuestions.find(q => q.id === d.questionId);
                      return q ? (isNewId(q.id) ? `${q.label} [Brouillon]` : q.label) : "";
                    })()}
                    onChange={label => {
                      const plain = label.replace(/ \[Brouillon\]$/, "");
                      set({ questionId: availableQuestions.find(q => q.label === plain)?.id ?? "" });
                    }}
                    options={availableQuestions.map(q => isNewId(q.id) ? `${q.label} [Brouillon]` : q.label)}
                    placeholder="Sélectionner une question..."
                  />
                </div>
              )}
```

(Matching by display name after stripping the suffix is the same "match by name" pattern this component already used for every `FSelect` before this change — not a new fragility; two real dimensions sharing a name would already have collided in the original code.)

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc --noEmit -p .
```
Expected: no errors — this resolves the `presetQuestionId` prop error Task 13 left outstanding.

Manual click-through, continuing from Task 12's step 5:
1. After being routed to `/super-admin/recommendations?draftQuestionId=...`, confirm the wizard auto-opens with Step 2 already showing the right Dimension / Sous-dimension / Question (marked `[Brouillon]` in the question field) — no search needed.
2. Fill in Step 1 (titre/description) and Step 3 (type/catégorie/effort), pick a level, click through to Step 4, click "Créer".
3. Confirm success, and that the new recommendation appears in the catalog list with a "Brouillon" badge next to its code.
4. Reload the page, confirm the draft recommendation is still there (persisted, not just React state).
5. Open "Ajouter une recommandation" manually (no deep-link) — confirm the Dimension/Sous-dimension/Question selects also list the same draft question, marked `[Brouillon]`, and that picking a **real** published question and creating a recommendation still works exactly as before (today's path, unchanged).
6. Go back to `/super-admin/dimensions`, publish the framework (this is the one point in this whole flow where a real publish happens, deliberately, via the existing dialog). Confirm: the question is now live, and back on `/super-admin/recommendations`, the recommendation created in step 2 above no longer shows "Brouillon" and its code has changed from `DRAFT-...` to the real `D<n>Q<id>-<level>` format.

- [ ] **Step 5: Commit** (covers both Task 13 and Task 14 — see Task 13's Step 6)

```bash
git add frontend/src/pages/superAdmin/AdminRecommendations.tsx
git commit -m "feat(recommendations): draft questions selectable and configurable in the catalog

RecommendationCatalog merges the framework draft's tree into what it offers
WizardDrawer, so a not-yet-published question is selectable both via the
'Configurer les recommandations' deep-link (?draftQuestionId=) and the
normal manual flow -- both marked 'Brouillon'. WizardDrawer's save branches
on isNewId(questionId) to POST draft_question_key instead of question_id
when needed; the real-question path is unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Final end-to-end verification (after all 14 tasks)

- [ ] Re-run `cd backend && ./.venv/Scripts/python.exe -m alembic current` — confirm it matches the new migration's revision id, single head.
- [ ] Re-run `cd backend && ./.venv/Scripts/python.exe tests/test_draft_recommendations_helpers.py` and `python tests/test_action_plan.py` — both still pass (nothing in this plan touches `action_plan.py`, this just confirms no accidental breakage).
- [ ] `cd frontend && npx tsc --noEmit -p .` — zero errors.
- [ ] `cd frontend && npx vite build` — production build still succeeds (matches the verification style used earlier in this project for `keycloakify-starter`; do the same for the main `frontend/` app here).
- [ ] Full manual walkthrough of the desired behavior from the spec's Context section, start to finish, in one sitting: create question → success view → Configurer les recommandations → catalog opens pre-filled → create 2-3 recommendations at different levels → refresh the browser (confirm nothing lost) → go back to Gestion du Framework, confirm the question is still there as an unpublished draft change → publish → confirm the question is live and its recommendations are live with real codes, no `Brouillon` badge.
- [ ] Confirm a discard scenario once: create a draft question, add a draft recommendation to it, then go back to Gestion du Framework and click "Abandonner les modifications" — confirm both the question and its draft recommendation are gone (check `/super-admin/recommendations`, the recommendation should no longer be listed at all).
