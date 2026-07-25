"""Couche d'explicabilite SHAP pour le modele de ranking des recommandations.

Le modele pointwise (LightGBM regressor, backend/ml/model.txt) predit un score
de pertinence par recommandation candidate ; on trie par ce score. SHAP
(TreeExplainer, adapte aux modeles a base d'arbres) decompose ce score en
contributions signees par feature : les features a forte contribution
POSITIVE sont les raisons pour lesquelles la recommandation est bien classee,
les negatives celles qui la penalisent.

Ces facteurs sont destines a alimenter une generation de texte par LLM -- ils
doivent donc rester structures et strictement fideles au modele (jamais
invente : chaque valeur SHAP vient d'un calcul reel sur le modele charge).

Le modele et l'explainer SHAP sont charges UNE SEULE FOIS a l'import de ce
module (pas a chaque appel de `explain_recommendations`), pour la
performance -- `shap.TreeExplainer` fait un travail de pretraitement de
l'arbre couteux a l'instanciation.
"""

from __future__ import annotations

import json
from pathlib import Path

import lightgbm as lgb
import pandas as pd
import shap

MODEL_DIR = Path(__file__).resolve().parent
CATEGORY_COL = "category_id"

FEATURE_COLUMNS: list[str] = json.loads(
    (MODEL_DIR / "model_features.json").read_text(encoding="utf-8")
)

_booster = lgb.Booster(model_file=str(MODEL_DIR / "model.txt"))
_explainer = shap.TreeExplainer(_booster)

# --- Traduction feature -> libelle metier ----------------------------------
# Un LLM en aval compose des phrases ("priorite elevee car ...") a partir de
# ces libelles : ils doivent donc rester courts, en francais, et lisibles
# telles quelles dans une enumeration.

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

# Meme ordre que app.services.features.CATEGORY_ORDER (l'ENUM Postgres
# reco_category) : category_id est le code entier 0..7 de cette liste.
CATEGORY_NAMES = (
    "strategie",
    "gouvernance",
    "qualite",
    "architecture",
    "securite",
    "analytique",
    "competences",
    "process",
)


def _describe_feature(feature: str, value: float) -> str:
    """Libelle metier d'une feature ; pour category_id, mentionne la categorie
    concernee plutot que le code numerique brut."""
    if feature == CATEGORY_COL:
        idx = int(value)
        in_range = 0 <= idx < len(CATEGORY_NAMES)
        name = CATEGORY_NAMES[idx] if in_range else str(idx)
        return f"recommandation de categorie « {name} »"
    return FEATURE_LABELS.get(feature, feature)


def _to_model_frame(features_df: pd.DataFrame) -> pd.DataFrame:
    """Aligne les colonnes sur l'ordre canonique et force category_id en
    categoriel a 8 modalites fixes -- meme encodage qu'a l'entrainement."""
    X = features_df[FEATURE_COLUMNS].copy()
    X[CATEGORY_COL] = pd.Categorical(
        X[CATEGORY_COL], categories=list(range(len(CATEGORY_NAMES)))
    )
    return X


def explain_recommendations(
    features_df: pd.DataFrame, top_k: int = 3
) -> list[list[dict]]:
    """Explique le score de chaque recommandation candidate via SHAP.

    ``features_df`` : une ligne par recommandation candidate, colonnes dans
    (ou sur-ensemble de) l'ordre FEATURE_COLUMNS -- les memes features que
    celles passees au modele pour le scoring.

    Retourne une liste (une entree par ligne de ``features_df``, meme ordre)
    de listes de ``top_k`` facteurs, chacun :
      - ``feature``    : nom brut de la feature (colonne de FEATURE_COLUMNS)
      - ``shap_value`` : contribution signee au score (propriete d'additivite
                         SHAP : base_value + somme de TOUTES les contributions
                         = score predit par le modele -- verifie ci-dessous)
      - ``direction``  : "positif" (augmente la priorite) ou "negatif" (la
                         diminue)
      - ``label``      : libelle metier en francais, exploitable tel quel
                         dans un texte genere par un LLM

    Les facteurs sont tries par contribution ABSOLUE decroissante -- une
    feature qui tire fortement le score vers le bas est tout aussi
    explicative qu'une qui le tire vers le haut.
    """
    if features_df.empty:
        return []

    X = _to_model_frame(features_df)
    shap_values = _explainer.shap_values(X)
    base_value = _explainer.expected_value
    predicted_scores = _booster.predict(X)

    # --- Controle d'additivite SHAP (assertion de controle) ----------------
    # base_value + somme des contributions doit reconstituer exactement le
    # score predit par le modele ; sinon les contributions ne sont pas
    # fideles au modele et il ne faut pas les exposer telles quelles.
    reconstructed = base_value + shap_values.sum(axis=1)
    max_error = float(abs(reconstructed - predicted_scores).max())
    assert max_error < 1e-4, (
        "Propriete d'additivite SHAP violee (ecart max "
        f"{max_error:.2e}) -- base_value + somme(shap_values) doit "
        "reconstituer le score predit par le modele."
    )

    explanations: list[list[dict]] = []
    for row_idx in range(len(X)):
        row_shap = shap_values[row_idx]
        row_raw_values = X.iloc[row_idx]

        # Tri par contribution absolue decroissante ; ties brisees par
        # l'ordre de FEATURE_COLUMNS (stable, deterministe).
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
