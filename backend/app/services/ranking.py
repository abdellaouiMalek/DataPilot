"""Loads the trained recommendation-ranking model and scores candidates.

The model is trained offline (see backend/ml/train_model.py) and its output
(model.txt + model_features.json) is copied into app/ml_models/ as a
deployment artifact -- the running API never needs the ml/ training
toolchain (jupyter, scikit-learn, ...), just this module's two runtime deps:
lightgbm and pandas.

Loaded once at import time (module-level singleton), not per request.
"""

from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import pandas as pd

from app.services.features import CATEGORY_ORDER, FEATURE_COLUMNS

MODEL_DIR = Path(__file__).resolve().parents[1] / "ml_models"
CATEGORY_COL = "category_id"

booster = lgb.Booster(model_file=str(MODEL_DIR / "model.txt"))

# Startup safety check: catch a model trained against a different feature set
# than the code currently builds, before it ever silently mis-scores requests.
_features_path = MODEL_DIR / "model_features.json"
_saved_features = json.loads(_features_path.read_text(encoding="utf-8"))
if _saved_features != FEATURE_COLUMNS:
    raise RuntimeError(
        "app/ml_models/model_features.json does not match "
        "app.services.features.FEATURE_COLUMNS -- the deployed model was "
        "trained against a different feature set than the running code "
        f"builds. Saved: {_saved_features!r}. Current: {FEATURE_COLUMNS!r}."
    )


def to_model_frame(rows: list[dict[str, float]]) -> pd.DataFrame:
    """Convertit une liste de dicts de features en DataFrame pour le modele.

    Colonnes dans l'ordre canonique FEATURE_COLUMNS, category_id force a un
    type categoriel a 8 modalites fixes (0..7) -- meme encodage qu'a
    l'entrainement, indispensable pour que le modele interprete correctement
    cette colonne (voir ml/train_model.py::to_features).
    """
    X = pd.DataFrame(rows, columns=FEATURE_COLUMNS)
    X[CATEGORY_COL] = pd.Categorical(
        X[CATEGORY_COL], categories=list(range(len(CATEGORY_ORDER)))
    )
    return X


def predict(rows: list[dict[str, float]]) -> list[float]:
    """Score de pertinence predit par le modele, une valeur par ligne."""
    if not rows:
        return []
    X = to_model_frame(rows)
    return [float(s) for s in booster.predict(X)]
