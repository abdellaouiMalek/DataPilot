"""Entrainement de production du modele de ranking gagnant.

Le modele gagnant est le **pointwise (regression LightGBM)**, objective=
"regression", `n_estimators=121` trouve par early stopping dans
`compare_ltr_models.ipynb`. Ce choix a ete confirme par validation croisee
repetee dans `cross_validation_ltr.ipynb` (5 plis x 5 seeds) : le pointwise y
obtient le meilleur NDCG@5 moyen (0.9801 +/- 0.0018), un ecart statistiquement
significatif face au pairwise et au listwise (Wilcoxon apparie, p < 1e-3),
meme si l'ampleur reste faible en pratique (< 0.002 point de NDCG@5). Le
listwise, pourtant mieux aligne en theorie avec un objectif de classement,
n'a pas confirme d'avantage mesure sur ce jeu de donnees -- voir la
conclusion de `cross_validation_ltr.ipynb` pour le detail du raisonnement.

Ce script reentraine ce meme modele, memes hyperparametres, sur
**train + validation reunis** (le jeu de test reste isole -- meme decoupage,
meme graine -- pour un rapport final independant si besoin), puis sauvegarde :
  - `model.txt`            : le booster LightGBM
  - `model_features.json`  : FEATURE_COLUMNS dans l'ordre, pour garantir la
                             coherence train/inference (train/serve skew).

Usage :
    python train_model.py --data ltr_dataset.csv --out-dir . --seed 42
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import lightgbm as lgb
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.features import CATEGORY_ORDER, FEATURE_COLUMNS  # noqa: E402

CATEGORY_COL = "category_id"

# Hyperparametres et nombre d'iterations du modele gagnant (pointwise), tels
# que trouves dans compare_ltr_models.ipynb (early stopping sur le jeu de
# validation) et confirmes par cross_validation_ltr.ipynb.
# A remettre a jour si l'un des deux notebooks est rejoue et designe un autre
# gagnant.
WINNER_PARAMS = {
    "objective": "regression",
    "n_estimators": 121,
    "learning_rate": 0.05,
    "num_leaves": 31,
}


def to_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Extrait les features dans l'ordre canonique, category_id en categoriel.

    Les 8 categories sont fixees explicitement (``categories=range(8)``)
    plutot que deduites des valeurs presentes dans ``frame`` : sans cela, un
    petit lot de candidats a l'inference ne couvrant que 2-3 categories
    recevrait un encodage categoriel different de celui utilise a
    l'entrainement (les codes entiers pandas dependent des valeurs
    presentes), ce qui corromprait silencieusement les predictions.
    """
    X = frame[FEATURE_COLUMNS].copy()
    X[CATEGORY_COL] = pd.Categorical(
        X[CATEGORY_COL], categories=list(range(len(CATEGORY_ORDER)))
    )
    return X


def split_train_val_test(
    df: pd.DataFrame, seed: int
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Reproduit exactement le decoupage 70/15/15 par groupe du notebook.

    Meme graine, meme methode (GroupShuffleSplit a deux niveaux) : le jeu de
    test obtenu ici est donc identique a celui du notebook, et reste isole de
    l'entrainement de production.
    """
    gss_train = GroupShuffleSplit(n_splits=1, test_size=0.30, random_state=seed)
    train_idx, temp_idx = next(gss_train.split(df, groups=df["assessment_id"]))
    df_train = df.iloc[train_idx].sort_values("assessment_id").reset_index(drop=True)
    df_temp = df.iloc[temp_idx].sort_values("assessment_id").reset_index(drop=True)

    gss_val_test = GroupShuffleSplit(n_splits=1, test_size=0.50, random_state=seed)
    val_idx, test_idx = next(
        gss_val_test.split(df_temp, groups=df_temp["assessment_id"])
    )
    df_val = df_temp.iloc[val_idx].sort_values("assessment_id").reset_index(drop=True)
    df_test = df_temp.iloc[test_idx].sort_values("assessment_id").reset_index(drop=True)

    return df_train, df_val, df_test


def train_final_model(df_train_full: pd.DataFrame, seed: int) -> lgb.LGBMRegressor:
    """Entraine le modele gagnant (pointwise) sur train+validation reunis.

    Pas de notion de groupe ici : le pointwise est une regression ligne par
    ligne sur `relevance`, contrairement au listwise/pairwise. Pas d'early
    stopping non plus : le nombre d'iterations optimal a deja ete determine
    dans le notebook (`WINNER_PARAMS["n_estimators"]`) ; en refaire un sur
    train+val re-consommerait une partie des donnees de production en
    validation, ce qu'on evite pour l'entrainement final.
    """
    X = to_features(df_train_full)
    y = df_train_full["relevance"].to_numpy()

    model = lgb.LGBMRegressor(random_state=seed, verbosity=-1, **WINNER_PARAMS)
    model.fit(X, y)
    return model


def rank_recommendations(model: lgb.Booster, features_df: pd.DataFrame) -> pd.DataFrame:
    """Ordonne des recommandations candidates par score de pertinence predit.

    ``features_df`` doit contenir au moins les colonnes de FEATURE_COLUMNS ;
    les colonnes supplementaires (ex. reco_code, question_id) sont conservees
    et reordonnees avec le reste. Retourne une copie triee par score
    decroissant (la recommandation la plus pertinente en premier).
    """
    X = to_features(features_df)
    scores = model.predict(X)

    ranked = features_df.copy()
    ranked["score"] = scores
    return ranked.sort_values("score", ascending=False).reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Entraine et sauvegarde le modele de ranking de production."
    )
    parser.add_argument("--data", type=Path, default=Path("ltr_dataset.csv"))
    parser.add_argument("--out-dir", type=Path, default=Path("."))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    df = pd.read_csv(args.data)
    df_train, df_val, df_test = split_train_val_test(df, args.seed)
    df_train_full = (
        pd.concat([df_train, df_val])
        .sort_values("assessment_id")
        .reset_index(drop=True)
    )

    print(
        f"Entrainement final sur {df_train_full['assessment_id'].nunique()} "
        f"evaluations (train+validation), {len(df_train_full)} lignes -- "
        f"{df_test['assessment_id'].nunique()} evaluations ({len(df_test)} lignes) "
        "gardees de cote pour un rapport final independant."
    )

    model = train_final_model(df_train_full, args.seed)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.out_dir / "model.txt"
    features_path = args.out_dir / "model_features.json"

    model.booster_.save_model(str(model_path))
    features_path.write_text(
        json.dumps(FEATURE_COLUMNS, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Modele sauvegarde       : {model_path}")
    print(f"Ordre des features sauvegarde : {features_path}")


if __name__ == "__main__":
    main()

    # --- Exemple d'usage de rank_recommendations ---------------------------
    # Reprend le modele qu'on vient d'entrainer/sauvegarder et l'applique a
    # quelques recommandations candidates factices, pour montrer comment
    # l'API appellerait cette fonction a l'inference.
    demo_booster = lgb.Booster(model_file="model.txt")
    demo_candidates = pd.DataFrame(
        [
            {
                "reco_code": "D1Q1-2",
                "current_level": 2,
                "gap_to_max": 3,
                "question_global_weight": 3.75,
                "dimension_weight": 15.0,
                "dimension_score": 2.5,
                "global_score": 3.0,
                "regulatory_flag": 0,
                "effort": 1,
                "dimension_is_weakest": 1,
                "na_rate_dimension": 0.0,
                "category_id": 0,
            },
            {
                "reco_code": "D2Q5-1",
                "current_level": 1,
                "gap_to_max": 4,
                "question_global_weight": 2.86,
                "dimension_weight": 20.0,
                "dimension_score": 2.1,
                "global_score": 3.0,
                "regulatory_flag": 1,
                "effort": 2,
                "dimension_is_weakest": 0,
                "na_rate_dimension": 0.0,
                "category_id": 1,
            },
        ]
    )
    print("\nExemple -- recommandations ordonnees par score decroissant :")
    print(rank_recommendations(demo_booster, demo_candidates)[["reco_code", "score"]])
