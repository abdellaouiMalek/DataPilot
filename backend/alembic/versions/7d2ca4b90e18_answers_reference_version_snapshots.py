"""answers reference version snapshots, not live questions

Cuts the last thread tying a stored assessment to the live framework.

Until now ``answers.question_id`` and ``dimension_scores.dimension_id`` were
``RESTRICT`` foreign keys, so the database physically refused to delete a
question anybody had answered. Publishing or restoring a version had no choice
but to *deactivate* those rows instead, which meant every question ever asked
accumulated in the live tables for ever, and an old assessment was read back
against today's questionnaire rather than the one it was answered on.

The snapshot frozen in ``questionnaire_versions`` already holds the complete
questionnaire for every published version, and a version referenced by
assessments can't be deleted. So the snapshot is a better home for that link:
the two columns become plain historical keys into their assessment's snapshot,
and the live tables are free to drop what a version no longer contains.

Backfill: assessments predating the first publication have no snapshot to point
at, which would strand them the moment a question is really deleted. They get a
synthetic version 0 -- archived, and labelled as reconstructed -- carrying the
earliest published snapshot, that being the closest surviving record of the
questionnaire those respondents actually saw. Where nothing has ever been
published, the live framework is frozen into it instead.

Revision ID: 7d2ca4b90e18
Revises: 3fb1c8d5e207
Create Date: 2026-08-19

"""
import json
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '7d2ca4b90e18'
down_revision: Union[str, Sequence[str], None] = '3fb1c8d5e207'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SYNTHETIC_LABEL = "État antérieur au versionnage"
SYNTHETIC_NOTE = (
    "Version reconstruite : ces évaluations ont été soumises avant la mise en "
    "place des versions, aucun instantané du questionnaire qu'elles ont "
    "réellement vu n'existe. Le contenu repris ici est le plus proche "
    "enregistrement disponible."
)


def _live_snapshot(bind) -> dict[str, Any]:
    """Freeze the live framework in the shape ``build_snapshot`` produces."""
    dimensions = bind.execute(sa.text(
        "SELECT id, key, code, name, short_name, description, weight, color,"
        " sort_order, is_active FROM dimensions ORDER BY sort_order, id"
    )).mappings().all()
    subs = bind.execute(sa.text(
        "SELECT id, dimension_id, name, sort_order, is_active"
        " FROM sub_dimensions ORDER BY sort_order, id"
    )).mappings().all()
    questions = bind.execute(sa.text(
        "SELECT id, dimension_id, sub_dimension_id, text, description, type,"
        " weight, sort_order, is_required, is_active, level_responses,"
        " choice_options FROM questions ORDER BY sort_order, id"
    )).mappings().all()

    tree = []
    for dimension in dimensions:
        node = dict(dimension)
        node["description"] = dimension["description"] or ""
        node["sub_dimensions"] = []
        for sub in subs:
            if sub["dimension_id"] != dimension["id"]:
                continue
            sub_node = dict(sub)
            sub_node["questions"] = [
                {**dict(q), "description": q["description"] or ""}
                for q in questions
                if q["sub_dimension_id"] == sub["id"]
            ]
            node["sub_dimensions"].append(sub_node)
        tree.append(node)

    return {
        "dimensions": tree,
        "dimension_count": len(tree),
        "question_count": sum(
            len(s["questions"]) for d in tree for s in d["sub_dimensions"]
        ),
    }


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    orphans = bind.execute(sa.text(
        "SELECT COUNT(*) FROM assessments WHERE version_id IS NULL"
    )).scalar_one()

    if orphans:
        earliest = bind.execute(sa.text(
            "SELECT snapshot, dimension_count, question_count"
            " FROM questionnaire_versions WHERE number > 0"
            " ORDER BY number LIMIT 1"
        )).mappings().first()

        if earliest is not None:
            snapshot = earliest["snapshot"]
            dimension_count = earliest["dimension_count"]
            question_count = earliest["question_count"]
        else:
            snapshot = _live_snapshot(bind)
            dimension_count = snapshot["dimension_count"]
            question_count = snapshot["question_count"]

        if isinstance(snapshot, (dict, list)):
            snapshot = json.dumps(snapshot)

        bind.execute(
            sa.text(
                "INSERT INTO questionnaire_versions"
                " (number, is_active, archived, label, note, changelog, snapshot,"
                "  dimension_count, question_count, created_by_name)"
                " VALUES (0, false, true, :label, :note, '[]'::jsonb,"
                "  CAST(:snapshot AS jsonb), :dimension_count, :question_count, NULL)"
                " ON CONFLICT (number) DO NOTHING"
            ),
            {
                "label": SYNTHETIC_LABEL,
                "note": SYNTHETIC_NOTE,
                "snapshot": snapshot,
                "dimension_count": dimension_count,
                "question_count": question_count,
            },
        )
        bind.execute(sa.text(
            "UPDATE assessments SET version_id ="
            " (SELECT id FROM questionnaire_versions WHERE number = 0)"
            " WHERE version_id IS NULL"
        ))

    # The point of the migration: an answer is a historical key into its
    # assessment's snapshot, not a pointer at a row that must still exist.
    op.drop_constraint("answers_question_id_fkey", "answers", type_="foreignkey")
    op.drop_constraint(
        "dimension_scores_dimension_id_fkey", "dimension_scores", type_="foreignkey"
    )


def downgrade() -> None:
    """Downgrade schema.

    Restoring the foreign keys requires every answered question and scored
    dimension to still exist, which is exactly what this migration stopped
    guaranteeing. It will fail if the live framework has since dropped any of
    them -- deliberately, rather than silently deleting history to fit.
    """
    op.create_foreign_key(
        "answers_question_id_fkey",
        "answers",
        "questions",
        ["question_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "dimension_scores_dimension_id_fkey",
        "dimension_scores",
        "dimensions",
        ["dimension_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    bind = op.get_bind()
    synthetic = bind.execute(sa.text(
        "SELECT id FROM questionnaire_versions WHERE number = 0"
    )).scalar()
    if synthetic is not None:
        bind.execute(
            sa.text("UPDATE assessments SET version_id = NULL WHERE version_id = :vid"),
            {"vid": synthetic},
        )
        bind.execute(
            sa.text("DELETE FROM questionnaire_versions WHERE id = :vid"),
            {"vid": synthetic},
        )
