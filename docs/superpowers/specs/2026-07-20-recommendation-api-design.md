# Recommendation API — Design

**Date:** 2026-07-20
**Status:** Approved (pending written-spec review)

## Context

The recommendation engine's pieces already exist but aren't connected to the
running API:

- `app/services/scoring.py` — `compute_scores`, plus two candidate-selection
  functions: `select_recommendations_dimension_plus_one` (Scenario 1: an
  automatic "+1 per dimension" plan) and `select_recommendations_custom_target`
  (Scenario 2: the bank picks one dimension and a target level).
- `app/services/features.py` — `build_features` / `FEATURE_COLUMNS`, the
  train/serve-shared feature builder.
- `backend/ml/` — offline tooling that produced a trained LightGBM model
  (`model.txt` + `model_features.json`), currently only living in the
  `ml/` output folder (gitignored, not part of the deployed app).
- `app/models/recommendation.py` — the `Recommendation` catalog table.
- `app/routers/assessments.py` — `POST /api/assessments` scores and persists
  a submission (`Assessment`, `Answer`, `DimensionScore` rows) but returns
  nothing about recommendations.

Goal: expose ranked recommendations for a stored assessment over HTTP, using
the trained model, without reimplementing any of the scoring/selection/feature
logic that already exists.

**Out of scope for this pass:** rewiring `frontend/src/pages/RecommendationsPage.tsx`.
It's currently 100% hardcoded mock data with fields (`timeline`, `businessValue.risk/time/compliance`,
`quick-win`/`structurant` labels) that don't exist anywhere in the real
`Recommendation` model — mapping or dropping those needs its own design pass,
separate from this one.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Scope | Backend API only | Frontend field mismatch needs its own design pass |
| Scenarios | Both 1 and 2 | Matches the two usage scenarios `scoring.py` already documents |
| Persistence | Compute on-demand, no storage | Small/cheap computation; always reflects the current catalog and model; no cache-invalidation problem |
| Model location | Copy into `app/ml_models/`, committed to git | Deployed API shouldn't need the `ml/` training toolchain (jupyter, pandas, scikit-learn) to serve a request |
| Prediction input | Plain Python lists, not pandas DataFrames | Verified empirically: LightGBM's saved model stores categorical split info internally, so a plain list of the same integer codes predicts identically to the pandas-categorical path used in training. Avoids adding `pandas`/`numpy` as API runtime dependencies — only `lightgbm` is needed. |

## Architecture

New files:

- **`app/ml_models/model.txt`, `app/ml_models/model_features.json`** — copied
  from a `train_model.py` run. Committed to git (unlike the `ml/` copies,
  which stay gitignored as regenerable training output).
- **`app/services/ranking.py`** — loads the `lgb.Booster` once at import
  (module-level singleton, same pattern as the JWKS cache in `core/auth.py`).
  Exposes `predict(rows: list[list[float]]) -> list[float]`.
- **`app/services/recommendation_engine.py`** — the orchestration layer:
  - Loads live reference data from the DB: active questions → dimension_id,
    active dimension weights, active recommendation catalog keyed by
    `(question_id, trigger_level)`, and intra-dimension weight
    (`1 / count of active questions in that dimension`) — this mirrors
    `ml/generate_ltr_dataset.py`'s DB loader exactly, so the live feature
    computation can never drift from what the model was trained on.
  - Builds the evaluation dict (`{question_id: value}`) from a stored
    `Assessment`'s `Answer` rows.
  - Runs `compute_scores` (needed in both scenarios — its output feeds
    `build_features` regardless of which scenario selects candidates).
  - Dispatches to `select_recommendations_dimension_plus_one` or
    `select_recommendations_custom_target` depending on which scenario was
    requested.
  - Builds features per candidate via `build_features`, predicts via
    `ranking.predict`, sorts descending by score.
- **`app/schemas/recommendation.py`** — the response Pydantic model.
- **`app/routers/recommendations.py`** — new router, `/api/assessments`
  prefix (shared with the existing assessments router, kept in a separate
  file since this is a distinct concern — calls a model, has two scenarios —
  from `assessments.py`'s scoring/persistence logic).
- Registered in `app/main.py` alongside the other routers.

Modified files:

- **`backend/requirements.txt`** — add `lightgbm`.

## API contract

```
GET /api/assessments/{assessment_id}/recommendations
GET /api/assessments/{assessment_id}/recommendations?dimension_id=3&target_level=4
```

- Auth: `Depends(verify_token)`, same as `POST /api/assessments`. No
  ownership check — consistent with the rest of the app: `Assessment` has no
  `user_id` column, and no existing endpoint restricts by owner.
- Query params `dimension_id` and `target_level` are both-or-neither:
  - Neither → Scenario 1 (automatic plan).
  - Both → Scenario 2 (custom target on that dimension).
  - Exactly one → `400`.
- `target_level` must be in `2..5` (`400` otherwise — mirrors the DB check
  constraint on `Recommendation.target_level`).
- **Naming note:** the query param `target_level` (the bank's desired final
  level for the chosen dimension) and the response field `target_level`
  (a single recommendation's own one-step transition target, e.g. `3→4`)
  are different things that happen to share a name — a Scenario 2 request
  with `target_level=5` returns a *chain* of recommendations whose individual
  `target_level` values step up to it (`2`, `3`, `4`, `5`), not one row
  with `target_level=5`.
- `dimension_id` must reference an active dimension (`404` otherwise).
- `assessment_id` must reference an existing assessment (`404` otherwise).
- Empty result (bank already fully mature / no matching candidates) is a
  normal `200` with `[]`, not an error.

**Response**, ordered by descending predicted relevance:

```json
[
  {
    "rank": 1,
    "score": 3.81,
    "code": "D2Q5-1",
    "title": "...",
    "recommendation_text": "...",
    "category": "gouvernance",
    "regulatory_flag": true,
    "effort": 2,
    "question_id": 55,
    "dimension_id": 14,
    "trigger_level": 1,
    "target_level": 2
  }
]
```

## Data flow (per request)

1. Load `Assessment` by id (404 if missing), eager-load its `Answer` rows.
2. Load reference data live from the DB (active questions/dimensions/catalog).
3. Build `evaluation = {question_id: value for each Answer}`.
4. `compute_scores(...)` → `ScoreResult` (dimension scores + global score).
5. Validate query params; select candidates via the matching scenario
   function.
6. For each candidate: `build_features(...)`, using the same
   `na_rate_by_dimension` computed from `evaluation` as training did.
7. `ranking.predict(rows)`, zip scores back onto candidates, sort descending.
8. Serialize to the response schema, 1-indexed `rank`.

## Error handling

| Condition | Response |
|---|---|
| `assessment_id` not found | `404` |
| `dimension_id` given but not an active dimension | `404` |
| Exactly one of `dimension_id`/`target_level` given | `400` |
| `target_level` outside `2..5` | `400` |
| No candidates match | `200`, `[]` |
| Missing/invalid bearer token | `401` (existing `verify_token` behavior) |

## Startup safety check

On app startup, assert the loaded `model_features.json` content equals
`app.services.features.FEATURE_COLUMNS`. Cheap guard against ever deploying
a model trained against a feature set the running code no longer builds the
same way. The app itself always uses `FEATURE_COLUMNS` directly (not a
re-parsed copy of the JSON) as the single source of truth for column order.

## Testing / verification plan

- Reuse the existing seeded DB (32 questions, 6 dimensions, 128
  recommendations) and the one real submitted assessment (id 4, STB) as a
  live smoke test for Scenario 1.
- Manually exercise Scenario 2 with a valid `dimension_id`/`target_level`
  pair, and the 400/404 error paths.
- No new automated test suite exists in this codebase yet (verified: no
  `tests/` directory under `backend/`) — verification here means running the
  live server and hitting the endpoint with `curl`/an authenticated token,
  same approach used earlier in this session for `/api/assessments`.

## Follow-ups (explicitly not in this pass)

- Rewiring `RecommendationsPage.tsx` to consume this endpoint.
- Any caching/precomputation if the reference-data query ever becomes a
  measurable cost (unlikely at this data size).
