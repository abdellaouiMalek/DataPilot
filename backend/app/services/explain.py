"""Couche d'explicabilite SHAP pour le modele de ranking, cote API.

Meme logique que backend/ml/explain.py, mais chargee depuis le modele deploye
(app/ml_models/) et reutilisant FEATURE_COLUMNS/CATEGORY_ORDER directement
depuis app.services.features plutot que de reparser model_features.json --
une seule source de verite pour l'ordre des features cote application. Voir
backend/ml/explain.py pour les commentaires detailles sur la methode SHAP et
le controle d'additivite ; ce module ne les repete pas.

Charge le modele et l'explainer SHAP une seule fois a l'import (pas par
requete), meme pattern que app.services.ranking.
"""

from __future__ import annotations

import shap

from app.services.features import CATEGORY_ORDER, FEATURE_COLUMNS
from app.services.ranking import CATEGORY_COL, booster, to_model_frame

_explainer = shap.TreeExplainer(booster)

FEATURE_LABELS: dict[str, str] = {
    "current_level": "niveau de maturite actuel de la question",
    "gap_to_max": "marge de progression importante",
    "question_global_weight": "fort poids dans le score global",
    "dimension_weight": "poids important de la dimension dans le score global",
    "dimension_score": "score actuel de la dimension",
    "global_score": "score de maturite global de la banque",
    "regulatory_flag": "obligation reglementaire",
    "effort": "effort de mise en oeuvre",
    "dimension_is_weakest": "dimension la plus faible de la banque",
    "na_rate_dimension": "part de questions non applicables dans la dimension",
    "category_id": "categorie de la recommandation",
}


def _describe_feature(feature: str, value: float) -> str:
    if feature == CATEGORY_COL:
        idx = int(value)
        in_range = 0 <= idx < len(CATEGORY_ORDER)
        name = CATEGORY_ORDER[idx] if in_range else str(idx)
        return f"recommandation de categorie « {name} »"
    return FEATURE_LABELS.get(feature, feature)


def explain_recommendations(
    rows: list[dict[str, float]], top_k: int = 3
) -> list[list[dict]]:
    """Explique le score de chaque recommandation candidate via SHAP.

    ``rows`` : une liste de dicts de features (meme forme que celle attendue
    par ``app.services.ranking.predict``). Retourne, pour chaque ligne dans
    le meme ordre, ses ``top_k`` facteurs les plus contributifs (contribution
    absolue decroissante) : ``feature``, ``shap_value`` (contribution signee),
    ``direction`` ("positif"/"negatif"), ``label`` (libelle metier FR).

    Verifie au passage la propriete d'additivite SHAP (base_value + somme des
    contributions == score predit) ; leve une AssertionError si elle n'est
    pas respectee, ce qui signalerait un decalage entre le modele charge et
    l'explainer.
    """
    if not rows:
        return []

    X = to_model_frame(rows)
    shap_values = _explainer.shap_values(X)
    base_value = _explainer.expected_value
    predicted_scores = booster.predict(X)

    reconstructed = base_value + shap_values.sum(axis=1)
    max_error = float(abs(reconstructed - predicted_scores).max())
    assert max_error < 1e-4, (
        "Propriete d'additivite SHAP violee (ecart max "
        f"{max_error:.2e}) entre base_value + somme(shap_values) et le "
        "score predit par le modele."
    )

    explanations: list[list[dict]] = []
    for row_idx in range(len(X)):
        row_shap = shap_values[row_idx]
        row_raw_values = X.iloc[row_idx]

        order = sorted(
            range(len(FEATURE_COLUMNS)), key=lambda i: (-abs(row_shap[i]), i)
        )

        top_factors = []
        for i in order[:top_k]:
            feature = FEATURE_COLUMNS[i]
            contribution = float(row_shap[i])
            direction = "positif" if contribution > 0 else "negatif"
            label = _describe_feature(feature, row_raw_values[feature])
            top_factors.append(
                {
                    "feature": feature,
                    "shap_value": contribution,
                    "direction": direction,
                    "label": label,
                }
            )
        explanations.append(top_factors)

    return explanations
