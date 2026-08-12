#!/usr/bin/env python3
"""Extract a plaintext glyph manifest from each shipped face's binary.

    /tmp/fontenv/bin/python3 fonts/glyph-manifest.py

Writes fonts/VF-Display.glyphs.txt and fonts/VF-Body.glyphs.txt: a font-wide
metadata table, then every character the face carries as a small CSV table of
its metrics over its ink as a '#'/'.' pixel field.

THE MANIFESTS ARE THE SOURCE OF TRUTH — this script is the bootstrap/resync
direction only (shipped binary -> text), and rerunning it overwrites hand
edits with whatever the shipped VF-*.woff2 says. Editing happens in the
manifests; fonts/manifest-to-font.py builds the VF-*.woff2 binaries and the
TS base64 embeds from them alone, from scratch, no Apple binary involved. The metadata table
therefore carries everything below glyph level that isn't derivable: the
head timestamps and the OS/2 fields computed when the faces were first
built (x_avg_char_width, unicode_ranges, the win metrics).

The manifest carries the font's glyph order too — entries are ordered by
glyph ID rather than codepoint (the two agree for the classic character
set; the kit's additions trail in the order they were appended).

Every glyph in these fonts is axis-aligned pixel-run rectangles on the
64-unit grid (bmp() in manifest-to-font.py rasterises that way), so the
contours decompile losslessly back into pixel cells.
Anything else (a composite, an off-grid point) is a hard error, not a best
effort.
"""

import csv
import io
import os

from fontTools.ttLib import TTFont

PX = 64  # font units per design pixel
HERE = os.path.dirname(os.path.abspath(__file__))

FACES = [
    (
        "VF-Display.woff2",
        "VF-Display.glyphs.txt",
        "VF Display",
        "the chrome face — a re-drawn strike in Chicago 12pt's style, plus the kit's backfill",
        "display-font.ts",
    ),
    (
        "VF-Body.woff2",
        "VF-Body.glyphs.txt",
        "VF Body",
        "the body face — a re-drawn strike in Geneva 9pt's style, plus the kit's backfill",
        "body-font.ts",
    ),
]

METRIC_COLS = ["codepoint", "char", "glyph", "advance", "x0", "y0", "width", "height"]


def cells_of(glyph, glyf, name):
    """Decompile a compiled glyph back into its set of (x, y) pixel cells."""
    assert not glyph.isComposite(), f"{name}: composite glyph"
    cells = set()
    if glyph.numberOfContours > 0:
        coords, ends, _ = glyph.getCoordinates(glyf)
        prev = 0
        for end in ends:
            pts = coords[prev : end + 1]
            prev = end + 1
            assert len(pts) == 4, f"{name}: non-rect contour"
            xs = sorted({p[0] for p in pts})
            ys = sorted({p[1] for p in pts})
            assert all(v % PX == 0 for v in xs + ys), f"{name}: off-grid contour"
            for x in range(xs[0] // PX, xs[1] // PX):
                for y in range(ys[0] // PX, ys[1] // PX):
                    cells.add((x, y))
    return cells


def field(cells):
    """Cells -> (x0, y0, w, h, rows): tight bbox in px + '#'/'.' rows, top first."""
    xs = sorted(x for x, _ in cells)
    ys = sorted(y for _, y in cells)
    x0, y0 = xs[0], ys[0]
    w, h = xs[-1] - x0 + 1, ys[-1] - y0 + 1
    rows = [
        "".join("#" if (x0 + c, y0 + h - 1 - r) in cells else "." for c in range(w))
        for r in range(h)
    ]
    return x0, y0, w, h, rows


def csv_lines(rows):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerows(rows)
    return buf.getvalue().rstrip("\n")


def emit(src, out, family, blurb, module):
    font = TTFont(os.path.join(HERE, src))
    named = {r.toUnicode() for r in font["name"].names if r.nameID in (1, 16)}
    assert named == {family}, f"{src}: names say {sorted(named)}, expected {family}"
    head, hhea, os2 = font["head"], font["hhea"], font["OS/2"]
    upm = head.unitsPerEm
    asc, desc, gap = hhea.ascent // PX, -hhea.descent // PX, hhea.lineGap // PX
    # The builder restates OS/2 typo metrics from the hhea ones — hold that.
    assert (os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap) == (
        hhea.ascent,
        hhea.descent,
        hhea.lineGap,
    ), f"{src}: OS/2 typo metrics diverge from hhea"
    assert os2.usWinAscent % PX == 0 and os2.usWinDescent % PX == 0, f"{src}: win metrics off-grid"
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = font.getGlyphOrder()
    gid = {name: i for i, name in enumerate(order)}
    cmap = font.getBestCmap()

    entries = []
    for u in sorted(cmap, key=lambda u: (gid[cmap[u]], u)):
        name = cmap[u]
        adv, lsb = hmtx[name]
        assert adv % PX == 0, f"{name}: fractional-px advance {adv}"
        cells = cells_of(glyf[name], glyf, name)
        ink = field(cells) if cells else None
        if ink:
            assert lsb == ink[0] * PX, f"{name}: lsb {lsb} != ink x0 {ink[0] * PX}"
        row = (
            [f"U+{u:04X}", chr(u), name, adv // PX] + list(ink[:4])
            if ink
            else [f"U+{u:04X}", chr(u), name, adv // PX, "", "", 0, 0]
        )
        lines = [f"== U+{u:04X} {chr(u)} ==", csv_lines([METRIC_COLS, row]), ""]
        lines += ink[4] if ink else ["(no ink)"]
        entries.append("\n".join(lines))

    meta = csv_lines(
        [
            ["key", "value"],
            ["family", family],
            ["woff2", src],
            ["module", module],
            ["units_per_em", upm],
            ["units_per_px", PX],
            ["em", upm // PX],
            ["ascent", asc],
            ["descent", desc],
            ["line_gap", gap],
            ["win_ascent", os2.usWinAscent // PX],
            ["win_descent", os2.usWinDescent // PX],
            ["x_avg_char_width", os2.xAvgCharWidth],
            [
                "unicode_ranges",
                f"{os2.ulUnicodeRange1} {os2.ulUnicodeRange2} "
                f"{os2.ulUnicodeRange3} {os2.ulUnicodeRange4}",
            ],
            ["created", head.created],
            ["modified", head.modified],
            ["glyphs", len(order)],
            ["characters", len(entries)],
        ]
    )

    header = (
        f"{family} glyph manifest\n"
        f"{'=' * (len(family) + 15)}\n"
        "\n"
        f"THE SOURCE OF TRUTH for '{family}'. fonts/manifest-to-font.py builds\n"
        f"fonts/{src} and the base64 embed in src/styles/{module}\n"
        "from this file alone, from scratch. Edit here and build\n"
        "forward, then npm run build. The classic Apple strikes whose\n"
        "appearance this face re-draws live outside the repository in\n"
        "../vintage-frames-design-reference, as design reference only;\n"
        "fonts/README.md keeps the design lineage. (fonts/glyph-manifest.py\n"
        "generated this file FROM the shipped binary — that is the\n"
        "bootstrap/resync direction, and rerunning it overwrites hand edits.)\n"
        "\n"
        f"Face: '{family}', {blurb}.\n"
        "\n"
        "The '== font ==' table is the font-wide metadata. family is stamped\n"
        "into the binary's name records; woff2 and module are the build targets.\n"
        "Fields are whole design px except: x_avg_char_width (font units) and\n"
        "unicode_ranges (the four OS/2 coverage bitfields) — both computed\n"
        "when the face was first built and restated here verbatim — and\n"
        "created/modified (seconds since 1904, the sfnt epoch: the first\n"
        "build's own timestamps, carried so a rebuild is byte-reproducible).\n"
        "glyphs counts the full glyph table (characters + .notdef); bump it\n"
        "and characters together when adding an entry.\n"
        "\n"
        f"Grid: {upm} units/em at {PX} units per design pixel — a {upm // PX}px em box\n"
        f"split ascent {asc} / descent {desc}. One design px is one system px.\n"
        "\n"
        "Each character is one entry: a heading, a CSV table of its metrics, and\n"
        "its ink as a pixel field ('#' = ink, '.' = blank, top row first). All\n"
        "metrics are whole design px. advance is the pen advance; x0/y0 place\n"
        "the field's left/bottom edge relative to the pen origin, with the\n"
        "baseline at y = 0 and y growing upward; width/height are the field's\n"
        "size. Fields are written tight to the ink — x0 doubles as the left\n"
        "side bearing — but the builder recomputes the bearing from the ink\n"
        "itself, so an edited field may carry blank edge rows or columns\n"
        "harmlessly. A glyph that is an advance with no ink (the spaces) says\n"
        "\"(no ink)\".\n"
        "\n"
        "Entries are in the font's glyph order — the classic character set\n"
        "sorted by codepoint, then the kit's additions in the order they were\n"
        "added. A new glyph appends at the end. Glyph names and codepoints\n"
        "must both be unique; the name is the glyph's label in the font's own\n"
        "tables.\n"
    )
    path = os.path.join(HERE, out)
    with open(path, "w") as f:
        f.write(header + "\n== font ==\n" + meta + "\n\n" + "\n\n".join(entries) + "\n")
    inked = sum(1 for e in entries if "(no ink)" not in e)
    print(f"{family}: {len(entries)} characters ({inked} inked) -> fonts/{out}")


if __name__ == "__main__":
    for face in FACES:
        emit(*face)
