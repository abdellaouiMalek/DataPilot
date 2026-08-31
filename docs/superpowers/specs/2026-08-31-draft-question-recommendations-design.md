# Draft Question ↔ Draft Recommendation Workflow — Design

**Date:** 2026-08-31
**Status:** Approved (pending written-spec review)

## Context

Today, preparing recommendations for a newly created question requires a full
round trip through publication:

```
Create question in Gestion du Framework
        ↓
Question sits in the framework draft (staged, not live)
        ↓
Publish framework  ← forced, just to get a real question_id
        ↓
Manually navigate to Catalogue des recommandations
        ↓
Search for the question, select it, create each level's recommendation
```

The first proposed fix (see the earlier design turn in this conversation) had
"Configurer les recommandations →" silently open the existing `PublishDialog`
to obtain a real `question_id`. Rejected: publication is a deliberate action
with its own review/label/changelog semantics ("N modifications seront
appliquées et figées dans une nouvelle version") and must never be a side
effect of wanting to prepare recommendations.

Goal: let an admin create a question, immediately configure its
recommendations, and have both stay entirely in draft — persisted, surviving
refreshes/navigation — until the admin explicitly publishes the framework
through the existing flow. At that point, and only then, the question and its
recommendations become live together, atomically.

**Key architectural fact this design is built around** (verified by reading
the actual code, not assumed):

- `Gestion du Framework` never writes through. `staging.createQuestion(...)`
  (`frameworkStaging.tsx`) only mutates an in-memory tree with a client-side
  temp id (`"new-q-N"`). The tree autosaves to `framework_drafts` (single row,
  `id=1`, `tree: JSONB`) via `PUT /api/super-admin/framework/draft`. Nothing
  reaches the live `questions` table until `POST /api/super-admin/framework/publish`
  → `apply_tree()`, in one transaction that also writes an immutable
  `QuestionnaireVersion` snapshot.
- `Recommendation.question_id` is a hard FK to `questions.id` — it can only
  ever reference an already-published question. This is the actual blocker:
  a temp id has no numeric id for the FK to point at.
- The recommendation engine's only read of the catalog is
  `recommendation_engine.load_reference()`:
  `select(Recommendation)` (no filter) →
  `catalog = {(r.question_id, r.trigger_level): r for r in recommendations}`.
  Every lookup afterward, in `scoring.py`'s
  `select_recommendations_dimension_plus_one` /
  `select_recommendations_custom_target`, is
  `catalog.get((question_id, level))` where `question_id` comes from
  `evaluation` — built from `assessment.answers`, i.e. always a real,
  live question id. **A row with `question_id = NULL` can never be produced
  by that lookup.** This is the load-bearing safety property the whole
  design leans on: a nullable `question_id` makes draft rows structurally
  unreachable by the engine, with no extra filtering logic required anywhere
  in `recommendation_engine.py` or `scoring.py`.
- Side finding, explicitly out of scope: `load_reference()`'s query has no
  `is_active` filter at all, even though the admin catalog's UI copy claims a
  disabled recommendation is "retirée du moteur de scoring." Pre-existing,
  unrelated to this feature. Not touched here.
- `apply_tree()` is called by both `publish()` and `restore_version()`.
  `restore_version()` only ever passes a tree from `build_snapshot()` (past
  published state), which never contains temp ids — so extending
  `apply_tree()`'s behavior for temp ids is a verified no-op on that call
  site.
- Editing an *existing* published question (`staging.updateQuestion(realId, …)`)
  always carries its real numeric id through `apply_tree()` unchanged — its
  recommendations' `question_id` never moves. Not affected by this design.

## Decisions

| Question | Decision | Why |
|---|---|---|
| How does a draft recommendation reference a not-yet-real question? | New nullable `Recommendation.draft_question_key` column, `question_id` made nullable, CHECK constraint enforces exactly one is set | Reuses the FK for the real case unchanged; the draft case is structurally excluded from every engine query for free (see above) |
| What is `draft_question_key`'s value? | The exact frontend temp id string (`"new-q-<uuid>"`) | Same identifier already flowing through `framework_drafts.tree`; no second id scheme to keep in sync |
| Temp id generation | Switch `frameworkStaging.tsx`'s counter-based `newId()` to `crypto.randomUUID()` | Found a real latent collision bug: the counter resets to 0 on every page load and can collide with an id already sitting in the persisted draft. Must be fixed for the id to be safe as a durable cross-reference. |
| Should draft questions be selectable in the manual "Nouvelle recommandation" flow, not just via deep-link? | Yes — merge the draft tree into the wizard's dimension/sub-dimension/question selectors, tagged "Brouillon" | User decision (asked explicitly); keeps the catalog fully usable for draft work without forcing every visit through the deep-link |
| Orphaned draft recommendations (draft question deleted/discarded before publish) | Hard delete | They were never real/published; matches how `staging.deleteQuestion` already just drops an unsaved draft question with no "archive" concept |
| Where does promotion happen at publish time? | Inside the existing `publish()` transaction, right after `apply_tree()`, before the single `db.commit()` | Reuses the transaction that's already there — avoids the "question published, recommendations failed" partial-state the user explicitly called out |
| Draft recommendation `code` | Placeholder `"DRAFT-<key>-<level>"` at creation, rewritten to the real `f"{dim.code}Q{question.id}-{level}"` at promotion | Same code convention already used by the regulatory auto-publish path (`app/services/regulatory.py`) and the recommendations router built earlier — no new convention invented |
| Draft badge visual | Reuse the existing amber "Brouillon" tint (`bg #FFF4DC`, `fg #8A6A1A`) already used for circular drafts in `AdminVeille.tsx` | Consistent with the app's established draft-state language, no new colors |

## Architecture

### 1. Temp-id stability fix — `frontend/src/pages/superAdmin/frameworkStaging.tsx`

```ts
// Before: let counter = 0; const newId = (prefix) => `new-${prefix}-${++counter}`;
const newId = (prefix: string) => `new-${prefix}-${crypto.randomUUID()}`;
```

`isNewId` (`id.startsWith("new-")`) is untouched. No other change in this
file — `createQuestion`/`createDimension`/`createSubDimension` already return
`{ id }` from this function.

### 2. Data model — `backend/app/models/recommendation.py`

```python
question_id: Mapped[Optional[int]] = mapped_column(
    ForeignKey("questions.id", ondelete="CASCADE"), nullable=True, index=True
)
draft_question_key: Mapped[Optional[str]] = mapped_column(
    String(80), nullable=True, index=True
)
```

`__table_args__` gains:
- `CheckConstraint("(question_id IS NOT NULL) != (draft_question_key IS NOT NULL)", name="chk_question_or_draft")`
- A **partial unique index** (not a plain `UniqueConstraint`, which can't express "unique only when this column is set"):
  `Index("uq_draft_question_trigger", "draft_question_key", "trigger_level", unique=True, postgresql_where=text("draft_question_key IS NOT NULL"))`

The existing `uq_question_trigger` constraint on `(question_id, trigger_level)`
needs no change — Postgres already treats each `NULL` as distinct under a
plain `UNIQUE` constraint, so multiple draft rows (`question_id = NULL`)
don't collide there.

Alembic migration: one new revision on top of the current single head
(`c274f6680a05`), adding the column, relaxing `question_id`'s nullability,
and adding the CHECK constraint + partial unique index. No data migration
needed — no existing rows have `draft_question_key`.

### 3. Question creation UX — `frontend/src/pages/superAdmin/AdminDimensions.tsx`

**`QuestionModal`**: on a successful *create* only (`!initial`), don't call
`onClose()` immediately. Capture `{ id: tempId }` from
`staging.createQuestion(...)`, store it as local `justCreated` state, and
render a success view in place of the form (same `ModalShell`, no new
component):

```
✓ Question ajoutée avec succès

[Terminer]   [Configurer les recommandations →]
```

`Terminer` = today's exact `onClose()` — nothing published, question stays in
the draft exactly as it does today when the modal is simply closed.

`Configurer les recommandations →` calls a new prop
`onConfigureRecommendations(tempId: string, label: string)`, bubbled up to
`DimensionsManagement`. Edit mode (`initial` present) is untouched — closes
immediately with today's toast, exactly as now.

**`DimensionsManagement`**: the new handler does, in order:
1. `setQModal(null)` (close the question modal).
2. `await saveDraft(dimensions, baseVersionId)` — the **existing** autosave
   function, called eagerly instead of waiting for the 900ms debounce. This
   guarantees the backend's `framework_drafts` row actually contains the new
   question before the recommendation catalog tries to resolve it — closing
   the race where the debounce hasn't fired yet.
3. `navigate(`/super-admin/recommendations?draftQuestionId=${encodeURIComponent(tempId)}`)`.

No `PublishDialog`, no `publishFramework`, anywhere in this path. A separate
query param name (`draftQuestionId` vs. the real-id case's `questionId`, see
§5) makes the two cases unambiguous on the receiving end without needing to
sniff the string format.

### 4. Recommendation creation API — `backend/app/schemas/admin.py`, `backend/app/routers/admin.py`

`RecommendationCreate`:
```python
question_id: Optional[int] = None
draft_question_key: Optional[str] = None
# + a model_validator requiring exactly one of the two
```

`RecommendationAdminRead` gains `draft_question_key: Optional[str] = None`
alongside the existing `question_id: Optional[int]` (widened from `int`) so
the frontend can distinguish rows.

`POST /api/super-admin/recommendations` branches:
- `question_id` set → **today's exact logic**, unchanged (real question
  lookup, `code=f"{dim.code}Q{question.id}-{level}"`, occupied-level skip
  logic).
- `draft_question_key` set → load the current `FrameworkDraft` (`DRAFT_ID`),
  walk its `tree` JSON with a small helper
  `_find_draft_question(tree, key) -> (dim_node, sub_node, question_node) | None`
  to confirm the key still exists (404 with a clear message if the draft
  changed since — e.g. the question was deleted or the draft discarded).
  Same per-level skip logic, checked against existing rows via
  `Recommendation.draft_question_key == key` instead of `question_id`.
  Inserts with `question_id=None`, `draft_question_key=key`,
  `code=f"DRAFT-{key}-{level}"`.

`PATCH /recommendations/{id}` and `DELETE /recommendations/{id}`: **no
changes** — both already operate purely on the row's own `id`, agnostic to
which linkage it uses.

`GET /recommendations`: **no changes** — already returns every row; draft
rows just come back with `question_id: null` and `draft_question_key` set.

### 5. Catalog UI — `frontend/src/pages/superAdmin/AdminRecommendations.tsx`

`RecommendationCatalog`'s `load()` also calls the existing
`getFrameworkState()` (from `lib/adminFramework.ts`) alongside
`listDimensions()`/`listRecommendations()`. The draft tree (if any) is merged
into the `Dimension[]` passed to `WizardDrawer`, using the existing
`fromApiTree()` converter — draft-only dimensions/sub-dimensions/questions
(detected via `isNewId()`) are tagged so the UI can badge them "Brouillon" in
the `FSelect` options, per your answer to include them in the manual flow.

`flattenRecommendations()` extended: a row with `draftQuestionKey` set
resolves its dimension/sub-dimension/question display text against the
merged tree by matching the draft key, instead of the real id; flagged
`isDraft: true` for the badge (reusing the amber tint decided above).

Deep-link consumption: `useSearchParams` reads `draftQuestionId`. Once the
merged tree has loaded, resolve it to (dimension, sub-dimension, question);
auto-open `WizardDrawer` pre-filled exactly like the real-id case, then clear
the param (`setSearchParams({}, { replace: true })`) so a refresh doesn't
reopen it. Not found (stale link, draft changed) → normal empty wizard +
toast, never a dead end.

`WizardDrawer`'s save branches on `isNewId(d.questionId)`:
- draft → new thin client `adminApi.createDraftRecommendations(draftKey, levels, input)`,
  posting `draft_question_key` instead of `question_id`.
- real → **today's exact** `adminApi.createRecommendations(...)`, unchanged.

Everything else in `WizardDrawer` (steps, cascading `FSelect`s, validation,
preview) needs no structural change — it already operates generically over
whatever `Dimension[]` tree it's given.

### 6. Publish-time promotion — `backend/app/services/framework_publish.py`, `backend/app/routers/admin_framework.py`

`apply_tree(db, tree)` starts **returning** `dict[str, int]` — for every
question created via the `question is None` branch, record
`promoted[raw_temp_id] = question.id` right after the `await db.flush()`
that populates the real id (`raw_temp_id` is the original string from
`question_node.get("id")`, captured before the existing `_as_id()`
coercion-to-None). Nothing else in the function changes; `restore_version()`
(the other caller) just receives and discards an always-empty dict, verified
harmless above.

In `publish()`, **inside the existing try/commit block**, right after
`apply_tree()`:

```python
promoted = await apply_tree(db, payload.tree)
if promoted:
    await _promote_draft_recommendations(db, promoted)
await _delete_orphaned_draft_recommendations(db)
```

- `_promote_draft_recommendations(db, promoted)`: for each `(temp_id, real_id)`,
  loads matching `Recommendation` rows (`draft_question_key == temp_id`),
  sets `question_id = real_id`, `draft_question_key = None`, and recomputes
  `code` from the question's dimension (`f"{dim.code}Q{real_id}-{trigger_level}"`)
  — same convention as §4's real-question branch.
- `_delete_orphaned_draft_recommendations(db)`: `DELETE ... WHERE draft_question_key IS NOT NULL`.
  Anything still draft-flagged after promotion belongs to a question that
  isn't in the tree just published — orphaned by definition. Reused by §7 too.

One commit, one rollback path — the transaction `publish()` already has.
Satisfies "never end up with question published ✅ / recommendations failed ❌."

### 7. Discard / reconciliation — `backend/app/routers/admin_framework.py`

- `DELETE /framework/draft` (`discard_draft`): after deleting the
  `FrameworkDraft` row, call `_delete_orphaned_draft_recommendations(db)` in
  the same commit — the whole draft is gone, so every current draft
  recommendation is now orphaned.
- `PUT /framework/draft` (`save_draft`, the autosave): after upserting the
  tree, walk it to collect every question node's id (temp or real —
  dimension/sub-dimension ids don't matter here, `draft_question_key` only
  ever holds a *question* temp id, so including other node ids in the
  collected set is harmless, just unused), then
  `DELETE ... WHERE draft_question_key IS NOT NULL AND draft_question_key NOT IN (:present)`
  in the same commit. Covers the case where the admin deletes a draft
  question via the UI and that removal autosaves.

### 8. Frontend types — `frontend/src/lib/admin.ts`

`ApiRecommendation`/`Recommendation`: `question_id`/`questionId` widened to
`number | null` / `string | null`; new `draft_question_key` /
`draftQuestionKey: string | null`. `createRecommendations` unchanged; new
`createDraftRecommendations(draftQuestionKey, triggerLevels, input)` posting
the alternate field, mirroring the existing function's shape.

## Out of scope

- Fixing `load_reference()`'s missing `is_active` filter (pre-existing,
  unrelated).
- Concurrent-editing conflict handling beyond what already exists (the
  framework draft is already a single shared row — this design doesn't make
  that better or worse).
- Anything about `restore_version()` beyond confirming it's unaffected.
- The `admin/AdminVeille.tsx` / `AdminRecommendations.tsx`-adjacent
  `StatutBadge` duplicates noted in earlier work this session — untouched.
