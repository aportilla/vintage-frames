#!/usr/bin/env python3
"""Measure the *horizontal* metrics of the menu/popup reference art.

The vertical counterpart of `extract-button-pixels.py`, written for the
`--vf-select-gutter` question: our closed pill insets its label 23px (1px
border + `--vf-select-gutter: 22px`), but the reference pill measures a 16px
inset. Before retokening we need to know whether the *open* menu agrees --
i.e. whether the checkmark column in the open art is the same width as the
closed pill's label inset. If it isn't, System 7 shifted the label on open and
the shared-gutter model itself is the thing to revisit.

For each menu panel this reports, relative to the panel's own left border:

- the panel border box (shadow excluded)
- per text row, the ink runs in x (gaps >= GAP_MIN split a run), so a
  checkmark in the gutter is reported separately from the label that follows
- the derived checkmark column and label inset

Also reports the checkmark glyph width and the row pitch, which double as a
1x scale check on sheets that aren't labelled "exact 1x".
"""

import importlib.util

spec = importlib.util.spec_from_file_location(
    "extract", "scripts/extract-button-pixels.py"
)
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)

REF = "Classic Macintosh UI Kit Reference"

# Rough region hints (x0, y0, x1, y1) -- the panel edges are then found
# exactly inside each hint, so these only have to be in the neighborhood.
TARGETS = [
    # The closed pill: the measurement the hit-list already recorded (16px),
    # re-derived here so both halves come from one script.
    (
        "closed pill (Pop-up menu REFERENCE.png)",
        f"{REF}/ui-sprites/Pop-up menu REFERENCE.png",
        (40, 0, 215, 20),
    ),
    # The open popup menu -- the direct counterpart to the closed pill.
    (
        "open popup: pixels/inches/cm (Menus.png)",
        f"{REF}/Menus.png",
        (520, 120, 630, 235),
    ),
    # A pulldown with a checked row, for cross-checking the gutter.
    (
        "pulldown: Hide Finder / checkmark Finder (Menus.png)",
        f"{REF}/Menus.png",
        (360, 118, 515, 220),
    ),
    # The vf-menu-item specimen cluster: checked "Menu item" rows. These have
    # no drawn panel border (the box around them is a magenta annotation), so
    # the origin is given explicitly: the selected row's highlight bar runs
    # x 221..383, and a highlight abuts the border, so the virtual border
    # column is 220. Same "Menu item" label as the closed pill, which takes
    # the glyph out of the closed-vs-open comparison.
    (
        "specimen: checkmark Menu item rows (Menus.png)",
        f"{REF}/Menus.png",
        (220, 470, 390, 570),
        True,
    ),
    # A plain pulldown with no checkmark column at all.
    (
        "pulldown: New Folder / Open / Print (Menus.png)",
        f"{REF}/Menus.png",
        (210, 118, 358, 390),
    ),
    # A second open popup, with icons in the gutter rather than a checkmark.
    (
        "open popup: Documents / Macintosh HD (Menus.png)",
        f"{REF}/Menus.png",
        (366, 228, 515, 290),
    ),
    # The other two closed pills -- same "Menu item" label as the reference
    # sprite, so the leading glyph is identical and the insets are comparable.
    (
        "closed pill A (Controls.png)",
        f"{REF}/Controls.png",
        (300, 255, 490, 285),
    ),
    (
        "closed pill B (Controls.png)",
        f"{REF}/Controls.png",
        (255, 296, 445, 325),
    ),
]

GAP_MIN = 3  # x-gap (px) that separates one ink run from the next
MIN_RUN = 40  # a horizontal black run this long is a panel border, not text


def is_black(px):
    r, g, b, a = px
    return a >= 128 and r < 96 and g < 96 and b < 96


def find_panel(pixels, region, min_run=MIN_RUN):
    """Return (x0, y0, x1, y1) of the panel border box inside `region`.

    The top border is the first row carrying a long black run; that run's own
    extent gives the left/right edges. Classic menus cast a hard 1px shadow
    offset down-right, so the top border row is the one edge the shadow can
    never contaminate -- hence measuring from it.

    `min_run` guards against latching onto some other wide black shape above
    the panel -- a vf-menu's inverted bar label sits directly over its panel
    and is itself wider than the default threshold.
    """
    rx0, ry0, rx1, ry1 = region
    for y in range(ry0, ry1 + 1):
        x = rx0
        while x <= rx1:
            if not is_black(pixels[y][x]):
                x += 1
                continue
            start = x
            while x <= rx1 and is_black(pixels[y][x]):
                x += 1
            if x - start >= min_run:
                x0, x1 = start, x - 1
                # Walk down for the last row that is black across that span.
                y1 = y
                for yy in range(y + 1, ry1 + 1):
                    if all(is_black(pixels[yy][xx]) for xx in range(x0, x1 + 1)):
                        y1 = yy
                return x0, y, x1, y1
    raise SystemExit(f"no panel border found in region {region}")


def ink_runs(pixels, y, x0, x1):
    """Ink runs in [x0, x1] on row y, merged across gaps < GAP_MIN."""
    runs = []
    x = x0
    while x <= x1:
        if not is_black(pixels[y][x]):
            x += 1
            continue
        start = x
        gap = 0
        end = x
        while x <= x1:
            if is_black(pixels[y][x]):
                end = x
                gap = 0
            else:
                gap += 1
                if gap >= GAP_MIN:
                    break
            x += 1
        runs.append((start, end))
    return runs


def text_bands(pixels, box):
    """Group interior rows carrying ink into bands (one per text row)."""
    x0, y0, x1, y1 = box
    ix0, ix1 = x0 + 1, x1 - 1
    bands = []
    cur = None
    for y in range(y0 + 1, y1):
        has_ink = any(is_black(pixels[y][x]) for x in range(ix0, ix1 + 1))
        if has_ink and cur is None:
            cur = [y, y]
        elif has_ink:
            cur[1] = y
        elif cur is not None:
            bands.append(tuple(cur))
            cur = None
    if cur is not None:
        bands.append(tuple(cur))
    return bands


def band_runs(pixels, box, band):
    """Merged ink runs across every row of a band, as (start, end) in x."""
    x0, _, x1, _ = box
    ix0, ix1 = x0 + 1, x1 - 1
    merged = []
    for y in range(band[0], band[1] + 1):
        merged.extend(ink_runs(pixels, y, ix0, ix1))
    if not merged:
        return []
    merged.sort()
    out = [list(merged[0])]
    for s, e in merged[1:]:
        if s - out[-1][1] < GAP_MIN:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return [tuple(r) for r in out]


def measure(name, path, region, explicit=False):
    width, height, pixels = extract.read_png(path)
    rx0, ry0, rx1, ry1 = region
    region = (max(0, rx0), max(0, ry0), min(width - 1, rx1), min(height - 1, ry1))
    box = region if explicit else find_panel(pixels, region)
    x0, y0, x1, y1 = box
    print(f"\n=== {name} ===")
    print(f"  file: {path}  ({width}x{height})")
    # A panel edge sitting exactly on the region hint means the hint clipped
    # the panel, so every offset below would be measured from a false border.
    # This silently under-reports the inset, so it must never pass unnoticed.
    # An edge on the image boundary is the real edge, not a clip (the pill
    # sprite is cropped tight, so its top border is row 0).
    clipped = (
        (x0 == region[0] > 0)
        or (y0 == region[1] > 0)
        or (x1 == region[2] < width - 1)
    )
    if not explicit and clipped:
        print("  *** WARNING: panel touches the region hint -- widen it ***")
    print(
        f"  border box: x {x0}..{x1} (w={x1 - x0 + 1})  "
        f"y {y0}..{y1} (h={y1 - y0 + 1})"
    )
    report_box(pixels, box)


def report_box(pixels, box):
    """Print each text row's ink runs, relative to the panel's left border.

    Shared with scripts/measure-menu-render.py so our own rendered output is
    reduced by exactly the same method as the reference art -- the comparison
    is only meaningful if both sides are measured identically.
    """
    x0, y0, x1, y1 = box
    print("  rows (x offsets are relative to the panel's LEFT BORDER at x0):")

    bands = text_bands(pixels, box)
    starts = []
    for band in bands:
        runs = band_runs(pixels, box, band)
        if not runs:
            continue
        starts.append(band[0])
        rel = [(s - x0, e - x0, e - s + 1) for s, e in runs]
        desc = "  ".join(f"[{s}..{e} w={w}]" for s, e, w in rel)
        print(
            f"    y {band[0] - y0:>3}..{band[1] - y0:<3} "
            f"(h={band[1] - band[0] + 1:>2})  first-ink={rel[0][0]:>3}  {desc}"
        )

    pitches = [b - a for a, b in zip(starts, starts[1:])]
    if pitches:
        print(f"  row pitch (band starts): {pitches}")


def main():
    for target in TARGETS:
        measure(*target)


if __name__ == "__main__":
    main()
