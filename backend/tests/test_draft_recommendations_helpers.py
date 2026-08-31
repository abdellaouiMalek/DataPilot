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
