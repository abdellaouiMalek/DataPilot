"""Génère le support PowerPoint de soutenance DataPilot (PFE).

Autonome : pas de dépendance au reste du projet, ne lit/écrit rien d'autre
que le fichier .pptx de sortie. Chiffres et faits techniques reproduits
depuis le code réel du dépôt (voir commentaires) -- jamais inventés.

Usage :
    python scripts/generate_pptx.py
"""

from __future__ import annotations

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

# ── Palette (reprise du thème EY déjà utilisé sur le login Keycloak et les
# decks de soutenance HTML de ce projet -- continuité visuelle) ─────────────
INK = RGBColor(0x17, 0x16, 0x0F)
INK_SOFT = RGBColor(0x4A, 0x48, 0x38)
MUTED = RGBColor(0x8B, 0x87, 0x6F)
PAPER = RGBColor(0xFA, 0xFA, 0xF8)
PAPER_RAISED = RGBColor(0xFF, 0xFF, 0xFF)
LINE = RGBColor(0xE4, 0xE0, 0xD2)
ACCENT = RGBColor(0xFF, 0xE6, 0x00)
ACCENT_INK = RGBColor(0x17, 0x16, 0x0F)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
DARK_PANEL = RGBColor(0x1A, 0x1A, 0x1A)

FONT_DISPLAY = "Georgia"      # titres -- registre thèse/soutenance
FONT_BODY = "Segoe UI"        # corps -- lisible, standard Windows
FONT_MONO = "Consolas"        # chiffres/données -- standard Windows

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
MARGIN = Inches(0.65)

prs = Presentation()
prs.slide_width = SLIDE_W
prs.slide_height = SLIDE_H
BLANK = prs.slide_layouts[6]

_page_counter = {"n": 0}
TOTAL_SLIDES = 16


# ── Primitives ───────────────────────────────────────────────────────────

def new_slide(bg=PAPER):
    slide = prs.slides.add_slide(BLANK)
    rect = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_W, SLIDE_H)
    rect.fill.solid()
    rect.fill.fore_color.rgb = bg
    rect.line.fill.background()
    rect.shadow.inherit = False
    # Renvoie l'objet en fond -- les formes suivantes s'empilent par-dessus.
    return slide


def set_no_autosize(tf):
    tf.word_wrap = True
    try:
        tf.auto_size = None
    except Exception:
        pass


def add_text(slide, x, y, w, h, text, *, size=14, color=INK, bold=False,
             italic=False, font=FONT_BODY, align=PP_ALIGN.LEFT,
             anchor=MSO_ANCHOR.TOP, line_spacing=1.0, letter_spacing=None):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    set_no_autosize(tf)
    tf.vertical_anchor = anchor
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    lines = text.split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing
        run = p.add_run()
        run.text = line
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.name = font
        run.font.color.rgb = color
    return box


def add_eyebrow(slide, text, x=MARGIN, y=Inches(0.55)):
    return add_text(slide, x, y, Inches(9), Inches(0.35), text.upper(),
                     size=12, color=MUTED, bold=True, font=FONT_MONO)


def add_rect(slide, x, y, w, h, color, line_color=None, line_w=None, shadow=False):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    try:
        shp.adjustments[0] = 0.06
    except Exception:
        pass
    shp.fill.solid()
    shp.fill.fore_color.rgb = color
    if line_color is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line_color
        shp.line.width = line_w or Pt(0.75)
    shp.shadow.inherit = False
    return shp


def add_footer(slide, page_label):
    y = SLIDE_H - Inches(0.55)
    ln = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, MARGIN, y, SLIDE_W - 2 * MARGIN, Pt(0.75))
    ln.fill.solid(); ln.fill.fore_color.rgb = LINE; ln.line.fill.background(); ln.shadow.inherit = False
    add_text(slide, MARGIN, y + Inches(0.08), Inches(7), Inches(0.3),
              "DataPilot — EY Tunisie", size=9, color=MUTED, font=FONT_MONO)
    add_text(slide, SLIDE_W - MARGIN - Inches(1.5), y + Inches(0.08), Inches(1.5), Inches(0.3),
              page_label, size=9, color=MUTED, font=FONT_MONO, align=PP_ALIGN.RIGHT)


def shell(eyebrow, title, *, title_size=30, title_w=Inches(10.5)):
    """Squelette standard : bande de garde + eyebrow + titre + footer paginé."""
    _page_counter["n"] += 1
    slide = new_slide()
    guard = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.12), SLIDE_H)
    guard.fill.solid(); guard.fill.fore_color.rgb = ACCENT; guard.line.fill.background(); guard.shadow.inherit = False
    add_eyebrow(slide, eyebrow)
    add_text(slide, MARGIN, Inches(0.92), title_w, Inches(1.1), title,
              size=title_size, color=INK, bold=False, font=FONT_DISPLAY, line_spacing=1.05)
    add_footer(slide, f"{_page_counter['n']:02d} / {TOTAL_SLIDES}")
    return slide


def add_stat_tile(slide, x, y, w, h, value, label, *, highlight=False, value_size=26):
    fill = ACCENT if highlight else PAPER_RAISED
    val_color = ACCENT_INK if highlight else INK
    tile = add_rect(slide, x, y, w, h, fill, line_color=None if highlight else LINE, line_w=Pt(0.75))
    add_text(slide, x + Inches(0.18), y + Inches(0.14), w - Inches(0.36), Inches(0.55),
              value, size=value_size, color=val_color, bold=True, font=FONT_MONO)
    label_h = Inches(0.62)
    add_text(slide, x + Inches(0.18), y + h - label_h - Inches(0.1), w - Inches(0.36), label_h,
              label, size=9.5, color=(INK_SOFT if highlight else MUTED), font=FONT_BODY, line_spacing=1.08)
    return tile


def add_bullets(slide, x, y, w, h, items, *, size=13.5, color=INK_SOFT, gap=Pt(10),
                 marker_color=ACCENT, bold_lead=False):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    set_no_autosize(tf)
    tf.margin_left = 0; tf.margin_right = 0; tf.margin_top = 0; tf.margin_bottom = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = gap
        p.line_spacing = 1.18
        r0 = p.add_run(); r0.text = "—  "
        r0.font.size = Pt(size); r0.font.color.rgb = marker_color; r0.font.bold = True; r0.font.name = FONT_BODY
        if isinstance(item, tuple):
            lead, rest = item
            r1 = p.add_run(); r1.text = lead
            r1.font.size = Pt(size); r1.font.color.rgb = INK; r1.font.bold = True; r1.font.name = FONT_BODY
            r2 = p.add_run(); r2.text = rest
            r2.font.size = Pt(size); r2.font.color.rgb = color; r2.font.name = FONT_BODY
        else:
            r1 = p.add_run(); r1.text = item
            r1.font.size = Pt(size); r1.font.color.rgb = color; r1.font.name = FONT_BODY
    return box


def add_card(slide, x, y, w, h, tag, title, body, *, tag_color=MUTED):
    add_rect(slide, x, y, w, h, PAPER_RAISED, line_color=LINE, line_w=Pt(0.75))
    pad = Inches(0.2)
    add_text(slide, x + pad, y + pad, w - 2 * pad, Inches(0.3), tag.upper(),
              size=9.5, color=tag_color, bold=True, font=FONT_MONO)
    add_text(slide, x + pad, y + pad + Inches(0.32), w - 2 * pad, Inches(0.45), title,
              size=13.5, color=INK, bold=True, font=FONT_BODY, line_spacing=1.05)
    add_text(slide, x + pad, y + pad + Inches(0.75), w - 2 * pad, h - Inches(1.0), body,
              size=11, color=INK_SOFT, font=FONT_BODY, line_spacing=1.2)


def add_flow(slide, x, y, w, h, steps, *, box_color=PAPER_RAISED, text_color=INK, arrow_color=MUTED):
    n = len(steps)
    gap = Inches(0.35)
    box_w = (w - gap * (n - 1)) / n
    for i, step in enumerate(steps):
        bx = x + i * (box_w + gap)
        add_rect(slide, bx, y, box_w, h, box_color, line_color=LINE, line_w=Pt(0.75))
        add_text(slide, bx + Inches(0.1), y, box_w - Inches(0.2), h, step,
                  size=11, color=text_color, bold=True, font=FONT_BODY,
                  align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.1)
        if i < n - 1:
            ax = bx + box_w
            add_text(slide, ax, y, gap, h, "→", size=16, color=arrow_color,
                      align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, font=FONT_BODY)


def add_table(slide, x, y, w, h, headers, rows, *, col_widths=None):
    n_rows = len(rows) + 1
    n_cols = len(headers)
    gshape = slide.shapes.add_table(n_rows, n_cols, x, y, w, h)
    table = gshape.table
    if col_widths:
        total = sum(col_widths)
        for i, cw in enumerate(col_widths):
            table.columns[i].width = Emu(int(w * (cw / total)))
    for j, htext in enumerate(headers):
        cell = table.cell(0, j)
        cell.text = htext
        cell.fill.solid(); cell.fill.fore_color.rgb = DARK_PANEL
        p = cell.text_frame.paragraphs[0]
        p.runs[0].font.size = Pt(11); p.runs[0].font.bold = True
        p.runs[0].font.color.rgb = ACCENT; p.runs[0].font.name = FONT_MONO
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        cell.margin_left = Inches(0.1); cell.margin_top = Inches(0.05); cell.margin_bottom = Inches(0.05)
    for i, row in enumerate(rows, start=1):
        for j, val in enumerate(row):
            cell = table.cell(i, j)
            cell.text = str(val)
            cell.fill.solid()
            cell.fill.fore_color.rgb = PAPER_RAISED if i % 2 else PAPER
            p = cell.text_frame.paragraphs[0]
            p.runs[0].font.size = Pt(11)
            p.runs[0].font.name = FONT_MONO if j > 0 else FONT_BODY
            p.runs[0].font.color.rgb = INK
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.margin_left = Inches(0.1); cell.margin_top = Inches(0.04); cell.margin_bottom = Inches(0.04)
    # Neutralise le style de thème par défaut (bandes bleues) pour garder
    # uniquement les couleurs posées manuellement ci-dessus.
    tbl_elem = table._tbl
    tblPr = tbl_elem.find(qn('a:tblPr'))
    if tblPr is not None:
        tblPr.set('firstRow', '0')
        tblPr.set('bandRow', '0')
    return table


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 1 — Titre
# ═══════════════════════════════════════════════════════════════════════
_page_counter["n"] += 1
s = new_slide(bg=DARK_PANEL)
beam = s.shapes.add_shape(MSO_SHAPE.PARALLELOGRAM, Inches(9.2), Inches(-0.8), Inches(5.5), Inches(9.5))
beam.rotation = 20
beam.fill.solid(); beam.fill.fore_color.rgb = ACCENT; beam.fill.fore_color.brightness = 0
beam.line.fill.background(); beam.shadow.inherit = False
# Assombrit légèrement pour un effet "faisceau" discret plutôt qu'un bloc plein.
beam.fill.transparency = 0.0

add_text(s, MARGIN, Inches(0.6), Inches(6), Inches(0.4), "DATAPILOT · PROJET DE FIN D'ÉTUDES",
          size=12, color=RGBColor(0xC9, 0xC5, 0xB2), bold=True, font=FONT_MONO)
add_text(s, MARGIN, Inches(2.35), Inches(10.8), Inches(2.6),
          "Outil de gestion de la maturité data\net accélérateur de transformation\ndigitale pour les banques tunisiennes",
          size=31, color=WHITE, bold=False, font=FONT_DISPLAY, line_spacing=1.14)
add_text(s, MARGIN, Inches(5.05), Inches(9.5), Inches(0.6),
          "Diagnostic structuré · Plan d'action priorisé par IA · Veille réglementaire automatisée",
          size=14, color=RGBColor(0xC9, 0xC5, 0xB2), font=FONT_BODY)

add_text(s, MARGIN, Inches(6.45), Inches(6), Inches(0.4), "Malek Abdellaoui",
          size=14, color=WHITE, bold=True, font=FONT_BODY)
add_text(s, MARGIN, Inches(6.78), Inches(7), Inches(0.4),
          "Ingénieur Data Science — Projet de fin d'études, EY Tunisie",
          size=11, color=RGBColor(0xC9, 0xC5, 0xB2), font=FONT_BODY)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 2 — Sommaire
# ═══════════════════════════════════════════════════════════════════════
s = shell("Sommaire", "Ce que couvre cette présentation")
sections = [
    ("01", "Contexte & enjeux", "Les défis data des banques tunisiennes"),
    ("02", "La solution DataPilot", "Diagnostic, priorisation, veille"),
    ("03", "Architecture & stack technique", "React, FastAPI, PostgreSQL, pgvector"),
    ("04", "Pipeline Machine Learning", "Scoring, Learning-to-Rank, SHAP"),
    ("05", "Pipeline RAG & LLM", "Veille réglementaire automatisée"),
    ("06", "Fiabilité & gouvernance IA", "Garde-fous, validation humaine"),
    ("07", "Cas d'usage & fonctionnalités", "Ce que l'outil permet de faire"),
    ("08", "Chiffres clés & conclusion", "Résultats mesurés, perspectives"),
]
col_w = Inches(5.7)
for i, (num, title, sub) in enumerate(sections):
    col = i // 4
    row = i % 4
    x = MARGIN + col * (col_w + Inches(0.5))
    y = Inches(2.3) + row * Inches(1.05)
    add_text(s, x, y, Inches(0.7), Inches(0.5), num, size=20, color=ACCENT, bold=True, font=FONT_MONO)
    add_text(s, x + Inches(0.75), y, col_w - Inches(0.75), Inches(0.4), title, size=15, color=INK, bold=True, font=FONT_BODY)
    add_text(s, x + Inches(0.75), y + Inches(0.36), col_w - Inches(0.75), Inches(0.4), sub, size=11, color=MUTED, font=FONT_BODY)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 3 — Contexte & enjeux
# ═══════════════════════════════════════════════════════════════════════
s = shell("01 · Contexte", "Les banques tunisiennes face à leurs données")
add_text(s, MARGIN, Inches(2.15), Inches(11.5), Inches(0.7),
          "Une pression croissante, sans outil structuré pour la mesurer",
          size=16, color=INK_SOFT, italic=True, font=FONT_DISPLAY)
challenges = [
    ("Pression réglementaire croissante", " — circulaires BCT de plus en plus fréquentes, à traduire en actions concrètes."),
    ("Écosystèmes de données fragmentés", " — silos entre directions, peu de vision consolidée."),
    ("Gouvernance et qualité inégales", " — pas de référentiel commun pour situer la maturité réelle."),
    ("Décisions lentes, priorités peu claires", " — difficile de savoir par où commencer, ni de mesurer le progrès."),
]
add_bullets(s, MARGIN, Inches(3.0), Inches(11.5), Inches(3.5), challenges, size=15, gap=Pt(16))


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 4 — La solution
# ═══════════════════════════════════════════════════════════════════════
s = shell("02 · La solution", "DataPilot : mesurer, prioriser, suivre")
pillars = [
    ("DIAGNOSTIC", "Évaluation structurée", "Questionnaire de maturité data (32 questions, 6 dimensions pondérées), scoring automatique et positionnement sur 5 niveaux de maturité."),
    ("PRIORISATION", "Plan d'action par IA", "Les recommandations candidates sont classées par un modèle de Learning-to-Rank — jamais un ordre arbitraire, jamais une liste plate."),
    ("VEILLE", "Conformité réglementaire", "Chaque nouvelle circulaire est analysée automatiquement (RAG + LLM) et confrontée au référentiel — proposition, jamais application sans validation humaine."),
]
card_w = Inches(3.75)
for i, (tag, title, body) in enumerate(pillars):
    x = MARGIN + i * (card_w + Inches(0.28))
    add_card(s, x, Inches(2.25), card_w, Inches(3.9), tag, title, body)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 5 — Architecture globale
# ═══════════════════════════════════════════════════════════════════════
s = shell("03 · Architecture", "Trois services, une base de données commune")
add_flow(s, MARGIN, Inches(2.4), Inches(11.5), Inches(0.9),
          ["Frontend\nReact + TypeScript", "Backend\nFastAPI (Python)", "PostgreSQL\n+ pgvector"])
add_text(s, MARGIN, Inches(3.7), Inches(11.5), Inches(0.4), "AUTHENTIFICATION & IDENTITÉ", size=10.5, color=MUTED, bold=True, font=FONT_MONO)
add_flow(s, MARGIN, Inches(4.05), Inches(5.6), Inches(0.75), ["Keycloak (SSO)", "Thème EY sur-mesure"])
add_text(s, MARGIN, Inches(5.05), Inches(11.5), Inches(0.4), "SERVICES IA (à l'intérieur du backend)", size=10.5, color=MUTED, bold=True, font=FONT_MONO)
add_flow(s, MARGIN, Inches(5.4), Inches(11.5), Inches(0.75),
          ["Moteur de scoring", "Ranking ML (LightGBM)", "RAG (pgvector)", "LLM (Gemini / Ollama)"])
add_bullets(s, MARGIN, Inches(6.35), Inches(11.5), Inches(0.9), [
    "Conteneurisé (Docker) pour Keycloak et PostgreSQL — même stack en local et en déploiement.",
], size=11.5, gap=Pt(4))


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 6 — Stack technique
# ═══════════════════════════════════════════════════════════════════════
s = shell("03 · Stack technique", "Des choix technologiques éprouvés, pas des effets de mode")
stacks = [
    ("FRONTEND", ["React 18 + TypeScript", "Tailwind CSS 4 + Radix UI", "Recharts (visualisation)", "React Router, Vite"]),
    ("BACKEND", ["FastAPI (async)", "SQLAlchemy 2 (async) + Alembic", "33 migrations de schéma", "Pydantic (validation)"]),
    ("DONNÉES & IA", ["PostgreSQL + pgvector", "LightGBM, scikit-learn, SHAP", "bge-m3 (embeddings, 1024-d)", "Gemini + Ollama (LLM)"]),
    ("INFRA & SÉCURITÉ", ["Keycloak (SSO, RBAC)", "Docker Compose", "Audit trail (logs d'actions)", "WeasyPrint (rapports PDF)"]),
]
col_w = Inches(2.78)
for i, (tag, items) in enumerate(stacks):
    x = MARGIN + i * (col_w + Inches(0.14))
    add_text(s, x, Inches(2.25), col_w, Inches(0.35), tag, size=11.5, color=ACCENT_INK, bold=True, font=FONT_MONO)
    ln = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, Inches(2.58), Inches(0.5), Pt(2.5))
    ln.fill.solid(); ln.fill.fore_color.rgb = ACCENT; ln.line.fill.background(); ln.shadow.inherit = False
    add_bullets(s, x, Inches(2.8), col_w, Inches(3.5), items, size=12, gap=Pt(11))


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 7 — Pipeline IA, vue d'ensemble
# ═══════════════════════════════════════════════════════════════════════
s = shell("04 · Pipeline IA", "Deux systèmes IA, deux logiques différentes")
add_card(s, MARGIN, Inches(2.25), Inches(5.65), Inches(3.9), "PILIER 1 — MACHINE LEARNING",
          "Prioriser les recommandations",
          "Un modèle appris (Learning-to-Rank) classe les recommandations candidates par pertinence pour une banque donnée. Validé par validation croisée répétée et significativité statistique. Explicable (SHAP) à chaque prédiction.")
add_card(s, MARGIN + Inches(5.93), Inches(2.25), Inches(5.65), Inches(3.9), "PILIER 2 — RAG & LLM",
          "Analyser la réglementation",
          "Chaque circulaire est confrontée au référentiel par recherche vectorielle (RAG), puis analysée par un LLM sous contrainte stricte de fidélité. Aucune proposition n'est jamais appliquée sans validation humaine.")


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 8 — Pipeline ML (scoring & priorisation)
# ═══════════════════════════════════════════════════════════════════════
s = shell("04 · Machine Learning", "Du questionnaire au plan d'action priorisé")
add_flow(s, MARGIN, Inches(2.3), Inches(11.5), Inches(0.85),
          ["Réponses au\nquestionnaire", "Scoring pondéré\npar dimension", "Génération des\ncandidats", "Ranking\nLightGBM", "Explicabilité\nSHAP", "Plan d'action\npriorisé"])
add_text(s, MARGIN, Inches(3.55), Inches(6), Inches(0.4), "MODÈLE RETENU", size=10.5, color=MUTED, bold=True, font=FONT_MONO)
add_bullets(s, MARGIN, Inches(3.9), Inches(6.2), Inches(2.9), [
    ("Pointwise — LightGBM Regressor", " sélectionné après comparaison de 3 paradigmes (pointwise, pairwise, listwise)."),
    ("11 variables", " par candidat : écart au niveau max, poids dans le score global, obligation réglementaire, effort..."),
    ("Explicable en production", " — chaque score est décomposé (SHAP) pour justifier la priorité affichée à la banque."),
], size=12.5, gap=Pt(12))
add_stat_tile(s, Inches(7.35), Inches(3.9), Inches(2.0), Inches(1.35), "0,9801", "NDCG@5\n(modèle retenu)", highlight=True, value_size=22)
add_stat_tile(s, Inches(9.5), Inches(3.9), Inches(2.0), Inches(1.35), "0,8497", "NDCG@5\n(référence heuristique)", value_size=22)
add_stat_tile(s, Inches(7.35), Inches(5.4), Inches(2.0), Inches(1.35), "25", "estimations\nindépendantes (CV)", value_size=22)
add_stat_tile(s, Inches(9.5), Inches(5.4), Inches(2.0), Inches(1.35), "p < 1e-3", "significativité\n(Wilcoxon)", value_size=20)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 9 — Rigueur de validation
# ═══════════════════════════════════════════════════════════════════════
s = shell("04 · Validation", "Une méthodologie qui résiste à l'examen")
add_bullets(s, MARGIN, Inches(2.25), Inches(11.5), Inches(2.6), [
    ("Validation croisée répétée", " — 5 plis × 5 graines (GroupKFold sur l'évaluation entière), soit 25 estimations indépendantes plutôt qu'un seul découpage chanceux."),
    ("Aucune fuite de données", " — vérifiée par une assertion explicite à chaque pli : une même évaluation n'apparaît jamais à la fois en train et en test (25/25 plis conformes)."),
    ("Tests de significativité", " — Friedman (statistique = 44,95 ; p < 0,0001) puis Wilcoxon apparié confirment que l'écart avec la référence heuristique n'est pas du bruit."),
], size=13, gap=Pt(12))
add_rect(s, MARGIN, Inches(5.0), Inches(11.5), Inches(1.65), PAPER_RAISED, line_color=ACCENT, line_w=Pt(1.5))
add_text(s, Inches(0.95), Inches(5.2), Inches(10.8), Inches(1.3),
          "« L'écart entre les 3 modèles appris est statistiquement réel mais minime en pratique "
          "(moins de 0,002 point de NDCG@5). Ce qui compte pour la décision produit, c'est l'écart "
          "massif et sans ambiguïté avec la référence heuristique — c'est lui qui justifie le passage à l'IA. »",
          size=13, color=INK, italic=True, font=FONT_DISPLAY, line_spacing=1.25)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 10 — Pipeline RAG/LLM
# ═══════════════════════════════════════════════════════════════════════
s = shell("05 · RAG & LLM", "De la circulaire réglementaire à la proposition")
add_flow(s, MARGIN, Inches(2.3), Inches(11.5), Inches(0.85),
          ["Import PDF\n(FR / AR, OCR)", "Traduction FR\n(si arabe)", "Découpage en\nsections", "Recherche\nvectorielle (RAG)", "Analyse LLM\nsous contrainte", "Proposition\n(jamais appliquée)"])
add_bullets(s, MARGIN, Inches(3.55), Inches(6.2), Inches(3.2), [
    ("pgvector", " — recherche par similarité cosinus sur les questions/recommandations du référentiel, indexées en 1024 dimensions (bge-m3)."),
    ("Prompt court et ciblé", " — 4 questions + 6 recommandations candidates par section (contre 33 + 128 avant l'introduction du RAG)."),
    ("Français pivot", " — le FR/AR direct s'est révélé peu fiable (similarité ≈ bruit, mesuré empiriquement) ; requêtes traduites en français avant recherche."),
], size=12, gap=Pt(11))
add_stat_tile(s, Inches(7.35), Inches(3.55), Inches(2.0), Inches(1.35), "0,30", "similarité FR↔AR\n(≈ bruit)", value_size=22)
add_stat_tile(s, Inches(9.5), Inches(3.55), Inches(2.0), Inches(1.35), "0,70", "similarité FR↔FR\n(même sujet)", highlight=True, value_size=22)
add_stat_tile(s, Inches(7.35), Inches(5.05), Inches(2.0), Inches(1.35), "2", "fournisseurs LLM\n(cloud + local)", value_size=22)
add_stat_tile(s, Inches(9.5), Inches(5.05), Inches(2.0), Inches(1.35), "7", "types de\nproposition", value_size=22)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 11 — Fiabilité & garde-fous IA
# ═══════════════════════════════════════════════════════════════════════
s = shell("06 · Fiabilité", "Proposer, jamais appliquer")
cards = [
    ("GROUNDING", "Jamais d'invention", "Chaque exigence extraite doit citer le texte source ; le LLM ne référence que des codes réellement proposés — jamais un code inventé."),
    ("DEGRADATION", "Toujours une réponse", "Gemini (cloud) → repli local (Ollama) → gabarit déterministe. Trois niveaux, jamais de panne totale, jamais de blocage utilisateur."),
    ("VALIDATION HUMAINE", "L'IA ne décide jamais", "Chaque proposition reste à l'état « en attente » tant qu'un expert ne l'a pas validée. Aucune écriture automatique sur le référentiel réel."),
]
card_w = Inches(3.75)
for i, (tag, title, body) in enumerate(cards):
    x = MARGIN + i * (card_w + Inches(0.28))
    add_card(s, x, Inches(2.25), card_w, Inches(2.9), tag, title, body)
add_stat_tile(s, MARGIN, Inches(5.35), Inches(3.75), Inches(1.3), "78,9 %", "propositions acceptées telles quelles\npar les experts (données réelles)", highlight=True, value_size=24)
add_stat_tile(s, MARGIN + Inches(4.03), Inches(5.35), Inches(3.75), Inches(1.3), "0", "écriture automatique sur\nle référentiel réel", value_size=24)
add_stat_tile(s, MARGIN + Inches(8.06), Inches(5.35), Inches(3.44), Inches(1.3), "10", "circulaires réglementaires\ndéjà traitées", value_size=24)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 12 — Cas d'usage
# ═══════════════════════════════════════════════════════════════════════
s = shell("07 · Cas d'usage", "Ce que DataPilot permet de faire, au quotidien")
usecases = [
    ("Diagnostic de maturité", "Questionnaire structuré (32 questions, 6 dimensions), progression sauvegardée automatiquement."),
    ("Tableau de bord & scoring", "Score global, scores par dimension, positionnement sur 5 niveaux, historique des évaluations."),
    ("Plan d'action priorisé", "Recommandations classées par IA, justifiées, exportables en rapport PDF."),
    ("Veille réglementaire", "Import de circulaires (PDF, FR/AR), analyse automatique, revue experte avant publication."),
    ("Back-office complet", "Gestion des banques, utilisateurs, référentiel, versions du framework, paramètres."),
    ("Audit & traçabilité", "Historique des actions administrateur, notifications, contrôle d'accès par rôle."),
]
col_w = Inches(5.65)
for i, (title, body) in enumerate(usecases):
    col = i % 2
    row = i // 2
    x = MARGIN + col * (col_w + Inches(0.5))
    y = Inches(2.25) + row * Inches(1.55)
    add_rect(s, x, y, col_w, Inches(1.35), PAPER_RAISED, line_color=LINE, line_w=Pt(0.75))
    add_text(s, x + Inches(0.2), y + Inches(0.15), col_w - Inches(0.4), Inches(0.35), title, size=13.5, color=INK, bold=True, font=FONT_BODY)
    add_text(s, x + Inches(0.2), y + Inches(0.55), col_w - Inches(0.4), Inches(0.7), body, size=11, color=INK_SOFT, font=FONT_BODY, line_spacing=1.15)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 13 — Sécurité, gouvernance & qualité
# ═══════════════════════════════════════════════════════════════════════
s = shell("07 · Gouvernance", "Une plateforme pensée pour un usage bancaire")
add_bullets(s, MARGIN, Inches(2.3), Inches(11.5), Inches(4.3), [
    ("Authentification & accès", " — SSO Keycloak, contrôle d'accès par rôle (banque, admin, super-admin), thème de connexion EY sur-mesure."),
    ("Traçabilité", " — chaque action d'administration est journalisée (piste d'audit interrogeable, jamais modifiable a posteriori)."),
    ("Confidentialité des données bancaires", " — les fonctionnalités IA côté banque (reformulation, narration) tournent en local (Ollama), aucune donnée bancaire n'est envoyée à un service tiers."),
    ("Robustesse d'ingénierie", " — 33 migrations de schéma versionnées, garde-fou SSRF sur les imports par URL, cohérence train/serve pour le modèle ML."),
    ("Rapports exportables", " — génération PDF (WeasyPrint) et export Excel pour les livrables destinés aux directions métier."),
], size=13, gap=Pt(13))


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 14 — Chiffres clés
# ═══════════════════════════════════════════════════════════════════════
s = shell("08 · Chiffres clés", "Le projet, en un coup d'œil")
stats = [
    ("31", "pages applicatives"),
    ("17", "familles d'endpoints API"),
    ("33", "migrations de schéma"),
    ("0,98", "NDCG@5 du modèle de ranking"),
    ("78,9 %", "propositions IA validées telles quelles"),
    ("2", "fournisseurs LLM (cloud + local)"),
    ("6", "dimensions de maturité évaluées"),
    ("1024", "dimensions des embeddings (bge-m3)"),
]
col_w = Inches(2.78)
for i, (val, label) in enumerate(stats):
    col = i % 4
    row = i // 4
    x = MARGIN + col * (col_w + Inches(0.14))
    y = Inches(2.3) + row * Inches(1.75)
    add_stat_tile(s, x, y, col_w, Inches(1.55), val, label, highlight=(i in (3, 4)), value_size=27)


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 15 — Conclusion & perspectives
# ═══════════════════════════════════════════════════════════════════════
s = shell("Conclusion", "Une plateforme complète, une IA défendable")
add_bullets(s, MARGIN, Inches(2.3), Inches(11.5), Inches(2.6), [
    ("Un diagnostic qui va au-delà du score", " — priorisation, justification, suivi dans le temps."),
    ("Une IA validée, pas supposée", " — méthodologie de test rigoureuse côté ranking, garde-fous structurels côté génération."),
    ("Une gouvernance pensée pour la banque", " — validation humaine systématique, traçabilité, confidentialité des données."),
], size=14, gap=Pt(14))
add_text(s, MARGIN, Inches(4.6), Inches(11.5), Inches(0.4), "PERSPECTIVES", size=11, color=MUTED, bold=True, font=FONT_MONO)
add_bullets(s, MARGIN, Inches(5.0), Inches(11.5), Inches(1.8), [
    "Élargir la validation de la veille réglementaire à un plus grand nombre de circulaires traitées.",
    "Construire une évaluation formelle du rappel (recall@k) de la recherche vectorielle.",
    "Déploiement pilote auprès d'une première banque partenaire.",
], size=12.5, gap=Pt(9))


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 16 — Merci
# ═══════════════════════════════════════════════════════════════════════
_page_counter["n"] += 1
s = new_slide(bg=DARK_PANEL)
beam2 = s.shapes.add_shape(MSO_SHAPE.PARALLELOGRAM, Inches(-2), Inches(3.5), Inches(6), Inches(6))
beam2.rotation = -20
beam2.fill.solid(); beam2.fill.fore_color.rgb = ACCENT; beam2.line.fill.background(); beam2.shadow.inherit = False
add_text(s, MARGIN, Inches(3.0), Inches(10), Inches(1.2), "Merci de votre attention.",
          size=40, color=WHITE, font=FONT_DISPLAY)
add_text(s, MARGIN, Inches(4.15), Inches(9), Inches(0.6), "Questions & discussion",
          size=16, color=RGBColor(0xC9, 0xC5, 0xB2), font=FONT_BODY)
add_text(s, MARGIN, Inches(6.6), Inches(8), Inches(0.4), "DataPilot — EY Tunisie — Malek Abdellaoui",
          size=11, color=RGBColor(0xC9, 0xC5, 0xB2), font=FONT_MONO)


# ── Sauvegarde ───────────────────────────────────────────────────────────
import os
out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "DataPilot_Soutenance.pptx")
prs.save(out_path)
print(f"OK: {len(prs.slides.__iter__.__self__._sldIdLst)} slides -> {out_path}")
