"""Tests pour les helpers de résolution de l'arbre de brouillon
(find_draft_question, collect_question_ids).

    pytest backend/tests/test_draft_recommendations_helpers.py
"""

from __future__ import annotations

from app.services.framework_publish import collect_question_ids, find_draft_question

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


def test_find_draft_question_in_draft_dimension() -> None:
    result = find_draft_question(TREE, "new-q-def")
    assert result is not None
    dim, sub, question = result
    assert dim["id"] == "new-dim-xyz"
    assert sub["id"] == "new-sub-1"


def test_find_draft_question_missing() -> None:
    assert find_draft_question(TREE, "new-q-does-not-exist") is None


def test_find_draft_question_empty_tree() -> None:
    assert find_draft_question([], "new-q-abc") is None


def test_collect_question_ids() -> None:
    ids = collect_question_ids(TREE)
    assert ids == {"100", "new-q-abc", "new-q-def"}, ids


def test_collect_question_ids_empty_tree() -> None:
    assert collect_question_ids([]) == set()
