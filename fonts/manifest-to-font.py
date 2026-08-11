#!/usr/bin/env python3
"""Build the shipped faces from their plaintext glyph manifests.

    /tmp/fontenv/bin/python3 fonts/manifest-to-font.py [manifest.txt ...]

With no arguments, processes both VF-Display.glyphs.txt and VF-Body.glyphs.txt.
The manifests are the source of truth: each font is built FROM SCRATCH from
its file alone — glyphs, metrics, cmap, glyph order, name records and the
font-wide metadata all come from it, and no Apple binary is consulted (the
pristine strikes live outside the repository, in
../vintage-frames-design-reference). Each run writes the manifest's `woff2`
target (fonts/VF-Display.woff2 / fonts/VF-Body.woff2), rewrites
FONT_WOFF2_BASE64 (and the byte-count comment) in the src/styles module its
`module` field names, and reports per face whether anything changed. Finish
with `npm run build` to bundle the updated base64. A malformed manifest —
a field whose rows disagree with their CSV width/height, a duplicate
codepoint or glyph name, metadata that contradicts itself — is refused
before anything is written.

Byte-reproducible: the builder replays the exact construction that made the
shipped binaries — import-bdf.py's FontBuilder recipe (same table set,
constants and call order) and the same rect-run glyph rasterisation (bmp(),
inherited from the retired add-glyphs.py). What that construction computed
from the pristine glyph set at conversion time (x_avg_char_width,
unicode_ranges, win metrics) and the head timestamps are restated from the
manifest's '== font ==' table instead of recomputed — so the build is a
pure function of the manifest: an unchanged manifest re-ships identical
bytes, and a changed base64 always means a real edit.

The build targets carry the kit's names (VF-Display.woff2 / VF-Body.woff2,
matching the family the binary registers), never the source strikes' —
Chicago's and Geneva's names appear nowhere in the kit's own artifacts.
"""

import base64
import csv
import io
import os
import re
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
STYLES = os.path.join(HERE, "..", "src", "styles")
PX = 64  # font units per design pixel


def bmp(bitmap, x0, y0, advance):
    """Rasterise a bitmap to (Glyph, advance) — one CW rect per maximal
    horizontal run of ink, so a loop is ink around an unfilled centre with no
    reverse-winding contour needed. Inherited verbatim from add-glyphs.py
    (the retired authoring script, removed 2026-08-11); import-bdf.py's
    draw() emits the identical geometry, which is what keeps a rebuilt glyph
    byte-identical to one the original conversion compiled."""
    pen = TTGlyphPen(None)
    nrows = len(bitmap)
    for r, row in enumerate(bitmap):
        c = 0
        while c < len(row):
            if row[c] == "#":
                start = c
                while c < len(row) and row[c] == "#":
                    c += 1
                xl, xr = x0 + start * PX, x0 + c * PX
                yb = y0 + (nrows - 1 - r) * PX
                yt = yb + PX
                pen.moveTo((xl, yt))
                pen.lineTo((xr, yt))
                pen.lineTo((xr, yb))
                pen.lineTo((xl, yb))
                pen.closePath()
            else:
                c += 1
    return pen.glyph(), advance


METRIC_HEADER = "codepoint,char,glyph,advance,x0,y0,width,height"
META_KEYS = (
    "family", "woff2", "module", "units_per_em", "units_per_px", "em", "ascent",
    "descent", "line_gap", "win_ascent", "win_descent", "x_avg_char_width",
    "unicode_ranges", "created", "modified", "glyphs", "characters",
)


def fail(path, lineno, msg):
    sys.exit(f"{os.path.basename(path)}:{lineno}: {msg}")


def parse(path):
    """-> (meta dict, [(codepoint, glyphname, advance, x0, y0, rows)] in file order)."""
    lines = open(path).read().split("\n")
    meta, entries, seen, seen_names = {}, [], set(), set()
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        if line == "== font ==":
            if lines[i + 1] != "key,value":
                fail(path, i + 2, "the '== font ==' table must start with 'key,value'")
            i += 2
            while i < n and lines[i].strip():
                k, v = next(csv.reader([lines[i]]))
                meta[k] = v
                i += 1
        elif line.startswith("== U+"):
            head = re.match(r"^== U\+([0-9A-Fa-f]{4,6}) ", line)
            if not head or lines[i + 1] != METRIC_HEADER or lines[i + 3] != "":
                fail(path, i + 1, "malformed entry: heading, CSV header, CSV row, blank")
            row = next(csv.reader([lines[i + 2]]))
            if len(row) != 8:
                fail(path, i + 3, f"expected 8 CSV fields, got {len(row)}")
            cp_s, _ch, name, adv, x0, y0, w, h = row
            u = int(cp_s[2:], 16)
            if u != int(head.group(1), 16):
                fail(path, i + 3, f"heading says U+{head.group(1)}, CSV says {cp_s}")
            if u in seen:
                fail(path, i + 1, f"duplicate entry for {cp_s}")
            seen.add(u)
            if not name or re.search(r"\s", name):
                fail(path, i + 3, f"bad glyph name {name!r}")
            if name in seen_names:
                fail(path, i + 3, f"duplicate glyph name {name!r}")
            seen_names.add(name)
            i += 4
            rows = []
            while i < n and lines[i].strip():
                rows.append(lines[i])
                i += 1
            if rows == ["(no ink)"]:
                rows = []
            elif any(set(r) - set("#.") for r in rows) or len({len(r) for r in rows}) != 1:
                fail(path, i, f"{cp_s}: field rows must be equal-length '#'/'.' strings")
            elif (int(w), int(h)) != (len(rows[0]), len(rows)):
                fail(path, i, f"{cp_s}: field is {len(rows[0])}x{len(rows)}, CSV says {w}x{h}")
            entries.append((u, name, int(adv), int(x0 or 0), int(y0 or 0), rows))
        i += 1
    for key in META_KEYS:
        if key not in meta:
            fail(path, 1, f"'== font ==' table is missing {key}")
    if len(entries) != int(meta["characters"]):
        fail(path, 1, f"{len(entries)} entries but characters says {meta['characters']}")
    if len(entries) + 1 != int(meta["glyphs"]):
        fail(path, 1, f"{len(entries)} entries + .notdef != glyphs {meta['glyphs']}")
    return meta, entries


def build(path):
    """Build one manifest and ship it; returns True if anything changed."""
    meta, entries = parse(path)
    family = meta["family"]
    upm, em = int(meta["units_per_em"]), int(meta["em"])
    asc, desc, gap = int(meta["ascent"]), int(meta["descent"]), int(meta["line_gap"])
    assert int(meta["units_per_px"]) == PX, "units_per_px contradicts the pipeline's PX"
    if em * PX != upm or asc + desc != em:
        sys.exit(
            f"{os.path.basename(path)}: inconsistent em box — ascent {asc} + "
            f"descent {desc} must equal em {em}, and em × {PX} must equal "
            f"units_per_em {upm}"
        )
    ranges = [int(v) for v in meta["unicode_ranges"].split()]
    assert len(ranges) == 4, "unicode_ranges wants the four OS/2 bitfields"

    order, cmap = [".notdef"], {}
    glyphs = {".notdef": bmp([], 0, 0, 0)[0]}
    metrics = {".notdef": (0, 0)}
    for u, name, adv, x0, y0, rows in entries:
        glyph, advance = bmp(rows, x0 * PX, y0 * PX, adv * PX)
        order.append(name)
        glyphs[name] = glyph
        ink_cols = [c for r in rows for c, ch in enumerate(r) if ch == "#"]
        metrics[name] = (advance, (x0 + min(ink_cols)) * PX if ink_cols else 0)
        cmap[u] = name

    # import-bdf.py's build recipe, with the conversion-time computed values
    # restated from the metadata rather than recomputed over today's glyph set.
    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=asc * PX, descent=-desc * PX, lineGap=gap * PX)
    fb.setupOS2(
        version=4,  # fsSelection's USE_TYPO_METRICS bit is defined from v4
        xAvgCharWidth=int(meta["x_avg_char_width"]),
        sTypoAscender=asc * PX,
        sTypoDescender=-desc * PX,
        sTypoLineGap=gap * PX,
        usWinAscent=int(meta["win_ascent"]) * PX,
        usWinDescent=int(meta["win_descent"]) * PX,
        ulUnicodeRange1=ranges[0],
        ulUnicodeRange2=ranges[1],
        ulUnicodeRange3=ranges[2],
        ulUnicodeRange4=ranges[3],
        # usFirstCharIndex/usLastCharIndex are NOT restated: OS/2 compile
        # recomputes them from the cmap unconditionally. (The pre-manifest
        # builds carried a stale pristine-era usLastCharIndex because
        # add-glyphs.py never recompiled OS/2; this builder's is correct.)
        fsSelection=0x40 | 0x80,  # REGULAR | USE_TYPO_METRICS
        achVendID="NONE",
    )
    fb.setupNameTable(
        {
            "familyName": family,
            "styleName": "Regular",
            "uniqueFontIdentifier": f"vintage-frames: {family}",
            "fullName": family,
            "psName": family.replace(" ", "-"),
            "version": "Version 1.000",
        }
    )
    fb.setupPost()
    fb.font["head"].created = int(meta["created"])
    fb.font["head"].modified = int(meta["modified"])
    fb.font.recalcTimestamp = False
    fb.font.flavor = "woff2"
    buf = io.BytesIO()
    fb.font.save(buf)
    data = buf.getvalue()

    # Sanity-check what was written, not the object that wrote it, before any
    # shipped file is touched.
    saved = TTFont(io.BytesIO(data))
    check = saved.getBestCmap()
    missing = [f"U+{u:04X}" for u, *_ in entries if u not in check]
    assert not missing, f"{family}: glyphs missing after save: {missing}"
    stale = sorted(
        {r.toUnicode() for r in saved["name"].names if r.nameID in (1, 4, 16)} - {family}
    )
    assert not stale, f"{family}: name records still say {stale}"

    assert meta["woff2"].endswith(".woff2"), f"unexpected woff2 target {meta['woff2']}"
    shipped = os.path.join(HERE, meta["woff2"])
    changed = not (os.path.exists(shipped) and open(shipped, "rb").read() == data)
    open(shipped, "wb").write(data)
    print(
        f"{family}: {len(entries)} characters built from scratch -> "
        f"fonts/{meta['woff2']} ({len(data)} bytes) — "
        f"{'updated' if changed else 'unchanged'}"
    )
    embed_ts(meta, data)
    return changed


def embed_ts(meta, data):
    """Rewrite the TS module's embedded base64."""
    ts = os.path.join(STYLES, meta["module"])
    text = open(ts).read()
    b64 = base64.b64encode(data).decode()
    text, n = re.subn(
        r"const FONT_WOFF2_BASE64 =\s*\n?\s*'[^']*'",
        f"const FONT_WOFF2_BASE64 =\n  '{b64}'",
        text,
        count=1,
    )
    assert n == 1, f"{meta['module']}: FONT_WOFF2_BASE64 not found"
    text, n = re.subn(r"\(\d+ bytes\)", f"({len(data)} bytes)", text, count=1)
    assert n == 1, f"{meta['module']}: byte-count comment not found"
    open(ts, "w").write(text)
    print(f"  re-embedded src/styles/{meta['module']}")


if __name__ == "__main__":
    paths = sys.argv[1:] or [
        os.path.join(HERE, "VF-Display.glyphs.txt"),
        os.path.join(HERE, "VF-Body.glyphs.txt"),
    ]
    changed = [build(p) for p in paths]
    if any(changed):
        print("done — rebuild the library (npm run build) to bundle the updated fonts")
    else:
        print("no changes — the embedded fonts already match the manifests")
