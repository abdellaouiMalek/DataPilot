"""SVG geometry for the PDF report exhibits.

WeasyPrint renders inline SVG but runs no JavaScript, so a chart in a
report is plain, pre-computed vector geometry: these functions turn scores
into coordinates and the templates only loop over what they return. Keeping
the maths here means the exhibits can be checked without rendering a PDF,
and that one palette definition serves every chart.

Coordinates are in abstract viewBox units; the template fixes the physical
size (``width="178mm"``), so a chart keeps its proportions at any scale.
"""

from __future__ import annotations

import math

# The maturity bands carry the colours the web app uses (Tailwind 200-400
# pastels). On paper those read as decoration rather than data and wash out
# entirely in greyscale, so a band is mapped by *position* onto this print
# ramp instead: darker, desaturated, monotonic in luminance, and still
# ordered when photocopied.
BAND_COLORS = ["#9C2A24", "#C0641C", "#AC8A1C", "#3E7D52", "#1F6079"]

INK = "#10161F"
MUTED = "#6F7A88"
HAIRLINE = "#DFE3E8"
TRACK = "#F1F3F5"

# Movement between two evaluations, on the same print ramp as the bands.
TREND_UP = "#3E7D52"
TREND_DOWN = "#9C2A24"
TREND_FLAT = "#8A94A1"
# EY yellow is unreadable as a hairline on white; this is its print weight,
# used for every benchmark/reference mark so "the dotted gold line" means
# one thing across the whole report.
REFERENCE = "#B8952A"


def print_color(position: int, band_count: int) -> str:
    """The print colour for a maturity band at ``position`` (0-based) out of
    ``band_count``. Interpolating on position rather than indexing keeps the
    ramp correct if the framework is ever published with 4 or 6 bands."""
    if band_count <= 1:
        return BAND_COLORS[len(BAND_COLORS) // 2]
    ratio = min(max(position / (band_count - 1), 0.0), 1.0)
    return BAND_COLORS[round(ratio * (len(BAND_COLORS) - 1))]


def _clamp(value: float, low: float = 0.0, high: float = 5.0) -> float:
    return max(low, min(high, float(value)))


def _wrap(text: str, max_chars: int, max_lines: int = 3) -> list[str]:
    """Greedy word wrap for SVG labels, which have no automatic wrapping.
    Overflow is elided rather than allowed to run into the next axis."""
    words = text.split()
    if not words:
        return [""]

    lines: list[str] = []
    current = ""
    remaining = list(words)
    while remaining and len(lines) < max_lines:
        word = remaining[0]
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars or not current:
            current = candidate
            remaining.pop(0)
        else:
            lines.append(current)
            current = ""
    if current:
        lines.append(current)

    if remaining and lines:
        last = lines[-1]
        lines[-1] = last[: max(0, max_chars - 1)].rstrip() + "…"
    return lines or [text[:max_chars]]


# ── Figure 1, maturity profile (radar) ───────────────────────────────────

def radar_chart(
    dimensions: list[dict],
    *,
    reference: float | None = None,
    overlay: list[dict] | None = None,
    width: float = 360.0,
    height: float = 300.0,
    max_label_chars: int = 14,
) -> dict | None:
    """Radar of every dimension's score on the 0-5 scale.

    Axis labels are the dimension names (wrapped, elided if they still don't
    fit) rather than numbers with a legend: a reader should not have to
    cross-reference a key to read the shape. ``reference`` draws a dashed
    ring at the weighted average, so an axis inside the ring is visibly
    below the bank's own mean. ``overlay`` draws a second, earlier profile
    behind the current one (same order, same axes) for evolution reports --
    two shapes on one set of axes read far better than two charts.
    """
    n = len(dimensions)
    if n < 3:
        return None  # a 1-2 axis "radar" degenerates to a point or a line

    # The plot is deliberately small for its box: dimension names are long
    # ("Sécurité & Conformité réglementaire"), and a reader should get the
    # name in full rather than an ellipsis and a legend to cross-reference.
    cx = width / 2
    cy = height / 2 + 2
    radius = 76.0
    label_radius = radius + 12
    line_height = 11.0

    def point(angle_deg: float, r: float) -> tuple[float, float]:
        angle = math.radians(angle_deg)
        return (cx + r * math.sin(angle), cy - r * math.cos(angle))

    angles = [i * 360 / n for i in range(n)]

    rings = [
        {
            "level": level,
            "points": " ".join(
                f"{x:.1f},{y:.1f}"
                for x, y in (point(a, radius * level / 5) for a in angles)
            ),
        }
        for level in range(1, 6)
    ]

    axes = [
        {"x2": f"{x:.1f}", "y2": f"{y:.1f}"}
        for x, y in (point(a, radius) for a in angles)
    ]

    vertices = [
        {"x": f"{x:.1f}", "y": f"{y:.1f}"}
        for x, y in (
            point(a, radius * _clamp(d["score"]) / 5)
            for d, a in zip(dimensions, angles)
        )
    ]

    labels = []
    for d, angle in zip(dimensions, angles):
        px, py = point(angle, label_radius)
        sin_a = math.sin(math.radians(angle))
        cos_a = math.cos(math.radians(angle))
        anchor = "middle"
        if sin_a > 0.35:
            anchor = "start"
        elif sin_a < -0.35:
            anchor = "end"

        lines = _wrap(d["name"], max_label_chars)
        if cos_a > 0.35:  # above the chart: stack upwards from the anchor
            base = py - 3 - (len(lines) - 1) * line_height
        elif cos_a < -0.35:  # below: stack downwards
            base = py + 10
        else:  # beside: centre the block on the axis
            base = py - (len(lines) - 1) * line_height / 2 + 3.4
        labels.append({
            "anchor": anchor,
            "lines": [
                {"x": f"{px:.1f}", "y": f"{base + i * line_height:.1f}", "text": text}
                for i, text in enumerate(lines)
            ],
        })

    # Ring values sit on the empty bearing between the first two axes, so
    # they never collide with an axis line or a label.
    scale_angle = -180 / n
    scale_labels = [
        {
            "x": f"{point(scale_angle, radius * level / 5)[0]:.1f}",
            "y": f"{point(scale_angle, radius * level / 5)[1] + 2.6:.1f}",
            "text": str(level),
        }
        for level in range(1, 6)
    ]

    reference_ring = None
    if reference is not None:
        reference_ring = " ".join(
            f"{x:.1f},{y:.1f}"
            for x, y in (point(a, radius * _clamp(reference) / 5) for a in angles)
        )

    overlay_polygon = None
    if overlay and len(overlay) == n:
        overlay_polygon = " ".join(
            f"{x:.1f},{y:.1f}"
            for x, y in (
                point(a, radius * _clamp(d["score"]) / 5)
                for d, a in zip(overlay, angles)
            )
        )

    return {
        "width": width,
        "height": height,
        "cx": f"{cx:.1f}",
        "cy": f"{cy:.1f}",
        "rings": rings,
        "axes": axes,
        "polygon": " ".join(f"{v['x']},{v['y']}" for v in vertices),
        "vertices": vertices,
        "labels": labels,
        "scale_labels": scale_labels,
        "reference_ring": reference_ring,
        "overlay_polygon": overlay_polygon,
    }


# ── Evolution, dumbbell chart (two evaluations compared) ─────────────────

def evolution_chart(
    dimensions: list[dict],
    *,
    period_init: str,
    period_curr: str,
    threshold: float = 3.0,
    width: float = 560.0,
    max_label_chars: int = 24,
) -> dict | None:
    """Dumbbell chart: one connector per dimension, from its earlier score to
    its current one.

    Two bars per dimension (the previous design) makes the reader compute the
    movement themselves; a connector *is* the movement, its length is the
    delta and its colour the direction, while both endpoints stay readable
    on the same 0-5 axis.
    """
    if not dimensions:
        return None

    row_h = 26.0
    top = 22.0
    axis_h = 32.0
    plot_x0, plot_x1 = 168.0, 462.0
    initial_x, current_x = 506.0, 550.0
    height = top + len(dimensions) * row_h + axis_h
    baseline = top + len(dimensions) * row_h

    def x_for(score: float) -> float:
        return plot_x0 + (plot_x1 - plot_x0) * _clamp(score) / 5

    rows = []
    for i, d in enumerate(dimensions):
        center = top + i * row_h + row_h / 2
        lines = _wrap(d["name"], max_label_chars, max_lines=2)
        if len(lines) == 1:
            label_lines = [{"y": f"{center + 3.2:.1f}", "text": lines[0]}]
        else:
            label_lines = [
                {"y": f"{center - 1.8 + i2 * 10.5:.1f}", "text": text}
                for i2, text in enumerate(lines)
            ]
        x_initial, x_current = x_for(d["initial"]), x_for(d["current"])
        rows.append({
            "label_x": f"{plot_x0 - 12:.1f}",
            "label_lines": label_lines,
            "cy": f"{center:.1f}",
            "x_initial": f"{x_initial:.1f}",
            "x_current": f"{x_current:.1f}",
            "connector_x": f"{min(x_initial, x_current):.1f}",
            "connector_w": f"{max(abs(x_current - x_initial), 0.6):.1f}",
            "color": d["color"],
            "initial_value": f"{d['initial']:.1f}",
            "current_value": f"{d['current']:.1f}",
            "value_y": f"{center + 3.4:.1f}",
        })

    # A legend above the plot, rather than captions over the two value
    # columns: at this scale "Mars 2026" and "Septembre 2026" set side by
    # side in 44 units of column gap overlap into an unreadable smear.
    legend = []
    legend_x = plot_x0
    for label, filled in ((period_init, False), (period_curr, True)):
        legend.append({
            "cx": f"{legend_x + 4:.1f}",
            "cy": f"{top - 12:.1f}",
            "text_x": f"{legend_x + 12:.1f}",
            "text_y": f"{top - 9:.1f}",
            "filled": filled,
            "label": label,
        })
        legend_x += 12 + len(label) * 4.8 + 18

    return {
        "width": width,
        "height": height,
        "plot_x0": f"{plot_x0:.1f}",
        "plot_x1": f"{plot_x1:.1f}",
        "initial_x": f"{initial_x:.1f}",
        "current_x": f"{current_x:.1f}",
        "top": f"{top:.1f}",
        "baseline": f"{baseline:.1f}",
        "legend": legend,
        "rows": rows,
        "ticks": [
            {"x": f"{x_for(v):.1f}", "label": str(v), "y_label": f"{baseline + 16:.1f}"}
            for v in range(0, 6)
        ],
        "threshold_x": f"{x_for(threshold):.1f}",
        "threshold_label": f"Seuil {threshold:.1f}",
    }


# ── Score trend, N evaluations compared ───────────────────────────────────

def score_trend_chart(
    points: list[dict],
    *,
    threshold: float = 3.0,
    width: float = 560.0,
    height: float = 210.0,
) -> dict | None:
    """Global score across every compared evaluation, oldest to newest.

    The radar and the dumbbell figure only ever read as two profiles (more
    than two overlapping polygons or connectors stop being legible), so when
    more than two evaluations are being compared, the trajectory across all
    of them lives here instead -- the one figure in the report built to
    scale to N points rather than exactly two. ``points`` are already sorted
    chronologically; each needs ``label`` (period) and ``score``.

    Periods are spaced evenly by index, not by actual elapsed time, same as
    the app's own trend chart (the point six months on is drawn the same
    width apart as the one six weeks on) -- reading gaps between points
    consistently matters more here than a true time scale.
    """
    if len(points) < 2:
        return None

    top = 16.0
    axis_h = 30.0
    plot_x0, plot_x1 = 40.0, width - 24.0
    plot_y0, plot_y1 = top, height - axis_h
    n = len(points)

    def x_for(i: int) -> float:
        return plot_x0 if n == 1 else plot_x0 + (plot_x1 - plot_x0) * i / (n - 1)

    def y_for(score: float) -> float:
        return plot_y1 - (plot_y1 - plot_y0) * _clamp(score) / 5

    coords = [(x_for(i), y_for(p["score"])) for i, p in enumerate(points)]

    dots = []
    for i, (p, (x, y)) in enumerate(zip(points, coords)):
        is_last = i == n - 1
        dots.append({
            "x": f"{x:.1f}",
            "y": f"{y:.1f}",
            "r": "5.2" if is_last else "3.6",
            "filled": is_last,
            "value": f"{p['score']:.1f}",
            "value_y": f"{y - 10:.1f}",
            "label_x": f"{x:.1f}",
            "label_y": f"{plot_y1 + 16:.1f}",
            "label": p["label"],
        })

    return {
        "width": width,
        "height": height,
        "plot_x0": f"{plot_x0:.1f}",
        "plot_x1": f"{plot_x1:.1f}",
        "top": f"{plot_y0:.1f}",
        "baseline": f"{plot_y1:.1f}",
        "polyline": " ".join(f"{x:.1f},{y:.1f}" for x, y in coords),
        "dots": dots,
        "ticks": [
            {"y": f"{y_for(v):.1f}", "label": str(v)}
            for v in range(0, 6)
        ],
        "threshold_y": f"{y_for(threshold):.1f}",
        "threshold_label": f"Seuil {threshold:.1f}",
    }


# ── Figure 3, impact / effort matrix ─────────────────────────────────────

_EFFORT_COLUMNS = {1: 0.14, 2: 0.50, 3: 0.86}
_EFFORT_TICKS = [(0.14, "Effort faible"), (0.50, "Effort moyen"), (0.86, "Effort élevé")]


def priority_matrix(
    recommendations: list[dict],
    *,
    width: float = 560.0,
    height: float = 268.0,
) -> dict | None:
    """Classic prioritisation 2x2: implementation effort against estimated
    impact, each initiative plotted at its rank.

    Effort is a 1-3 grade, so points would stack in three vertical lines;
    ties within a column are spread deterministically (by rank order) so
    every initiative stays readable without moving it between quadrants.
    """
    items = [r for r in recommendations if r.get("impact") is not None]
    if len(items) < 2:
        return None

    x0, x1 = 92.0, 524.0
    y0, y1 = 30.0, 210.0
    # Points are confined to a band inside the plot so that neither the
    # highest- nor the lowest-impact initiative lands on the quadrant
    # captions printed in the corners (a marker is 9.4 units of radius).
    plot_top, plot_bottom = y0 + 34.0, y1 - 30.0

    impacts = [float(r["impact"]) for r in items]
    lo, hi = min(impacts), max(impacts)
    span = hi - lo

    def y_for(value: float) -> float:
        if span <= 0:
            return (plot_top + plot_bottom) / 2
        return plot_bottom - (float(value) - lo) / span * (plot_bottom - plot_top)

    groups: dict[int, list[dict]] = {}
    for r in items:
        groups.setdefault(int(r.get("effort") or 2), []).append(r)

    points = []
    for effort, group in groups.items():
        fraction = _EFFORT_COLUMNS.get(effort, 0.5)
        base_x = x0 + fraction * (x1 - x0)
        for k, r in enumerate(sorted(group, key=lambda item: item["rank"])):
            offset = (k - (len(group) - 1) / 2) * 17.0
            points.append({
                "x": f"{base_x + offset:.1f}",
                "y": f"{y_for(r['impact']):.1f}",
                "rank": r["rank"],
                "regulatory": bool(r.get("regulatory_flag")),
            })

    median = sorted(impacts)[len(impacts) // 2]
    divider_y = y_for(median)
    divider_x = x0 + 0.32 * (x1 - x0)

    return {
        "width": width,
        "height": height,
        "x0": f"{x0:.1f}", "x1": f"{x1:.1f}",
        "y0": f"{y0:.1f}", "y1": f"{y1:.1f}",
        "divider_x": f"{divider_x:.1f}",
        "divider_y": f"{divider_y:.1f}",
        "points": points,
        "ticks": [
            {"x": f"{x0 + f * (x1 - x0):.1f}", "label": label, "y": f"{y1 + 16:.1f}"}
            for f, label in _EFFORT_TICKS
        ],
        "quadrants": [
            {"x": f"{x0 + 7:.1f}", "y": f"{y0 + 11:.1f}", "anchor": "start",
             "text": "Quick wins"},
            {"x": f"{x1 - 7:.1f}", "y": f"{y0 + 11:.1f}", "anchor": "end",
             "text": "Chantiers structurants"},
            {"x": f"{x0 + 7:.1f}", "y": f"{y1 - 7:.1f}", "anchor": "start",
             "text": "Gains opportunistes"},
            {"x": f"{x1 - 7:.1f}", "y": f"{y1 - 7:.1f}", "anchor": "end",
             "text": "À planifier"},
        ],
    }
