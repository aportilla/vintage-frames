#!/usr/bin/env python3
"""Extract the bitmap strike from a classic Mac font suitcase (.dfont) as BDF.

    /tmp/fontenv/bin/python3 fonts/dfont-to-bdf.py <suitcase.dfont> ...

Writes  fonts/imported/bdf/<Family>/<line>.bdf  per input — the same
family-dir/line-height layout and conventions as the FontForge exports
import-bdf.py was built against, so the two scripts chain:

    dfont-to-bdf.py Geneva_12.dfont            # -> imported/bdf/Geneva/12.bdf
    import-bdf.py --em 16 --ascent 12 <that>   # -> the pixel-grid woff2

These suitcases package each strike as a bitmap-only sfnt resource — 'bdat' /
'bloc' tables, Apple's original names for what Microsoft later called EBDT /
EBLC (identical formats, which is how fontTools reads them below), plus a
'bhed' in place of 'head' and a 26-byte stub NFNT that just points at the
sfnt. The family name comes from the FOND resource; the strike's line height
is its ppem.

Encodings: the Mac Roman cmap subtable (1,0) provides the classic byte
encodings BDF expects; anything only in the Unicode subtable (re-encoded
symbol slots, if present) is written at its Unicode point, which
import-bdf.py passes through.

Self-verifying: after writing, the BDF is re-parsed with import-bdf.py's own
parser and every glyph's ink cells and advance are bit-compared against the
decoded bdat bitmaps — a BDF that saves is pixel-identical to the suitcase.
"""
import importlib.util
import io
import os
import struct
import sys

from fontTools.misc.macRes import ResourceReader
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.E_B_D_T_ import table_E_B_D_T_
from fontTools.ttLib.tables.E_B_L_C_ import table_E_B_L_C_

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "imported", "bdf")

_spec = importlib.util.spec_from_file_location("import_bdf", os.path.join(HERE, "import-bdf.py"))
import_bdf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(import_bdf)


def load_strike(path):
    """-> (family, ascent, descent, ppem, glyphs: {codepoint: (advance, bearingX,
    bearingY, width, height, rows)}) — rows as '#'/'.' strings, top first."""
    reader = ResourceReader(path)
    family = next((r.name for r in reader.get("FOND", []) if r.name), None)
    family = family or os.path.basename(path).split("_")[0]
    font = TTFont(io.BytesIO(reader["sfnt"][0].data))
    # The bitmap-only sfnt carries a maxp 0.5 fontTools' lazy decompile
    # rejects — preset a synthetic glyph order so it is never consulted.
    num_glyphs = struct.unpack(">H", font.reader["maxp"][4:6])[0]
    font.setGlyphOrder([f"g{i}" for i in range(num_glyphs)])

    eblc = table_E_B_L_C_("EBLC")
    eblc.decompile(font.reader["bloc"], font)
    font.tables["EBLC"] = eblc
    ebdt = table_E_B_D_T_("EBDT")
    ebdt.decompile(font.reader["bdat"], font)

    if len(eblc.strikes) != 1:
        sys.exit(f"{path}: expected one strike, found {len(eblc.strikes)}")
    size = eblc.strikes[0].bitmapSizeTable
    strike = ebdt.strikeData[0]

    # Codepoint -> glyph name: Mac Roman bytes first, then Unicode-only extras.
    cmaps = {(t.platformID, t.platEncID): t.cmap for t in font["cmap"].tables}
    encodings = {}
    for byte, name in cmaps.get((1, 0), {}).items():
        encodings[byte] = name
    claimed = set(encodings.values())
    for uni, name in cmaps.get((3, 1), {}).items():
        if uni > 255 and name not in claimed:
            encodings[uni] = name

    glyphs = {}
    for code, name in sorted(encodings.items()):
        g = strike.get(name)
        if g is None:
            continue
        m = g.metrics
        rows = []
        for r in range(m.height):
            raw = int.from_bytes(g.getRow(r, bitDepth=1, metrics=m), "big")
            total = len(g.getRow(r, bitDepth=1, metrics=m)) * 8
            rows.append("".join("#" if (raw >> (total - 1 - c)) & 1 else "." for c in range(m.width)))
        glyphs[code] = (m.Advance, m.BearingX, m.BearingY, m.width, m.height, rows)

    return family, size.hori.ascender, -size.hori.descender, size.ppemY, glyphs


def write_bdf(path):
    family, asc, desc, ppem, glyphs = load_strike(path)
    if asc + desc != ppem:
        sys.exit(f"{path}: ascent {asc} + descent {desc} != ppem {ppem}")
    out_dir = os.path.join(OUT, family)
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{ppem}.bdf")

    lines = [
        "STARTFONT 2.1",
        f"FONT -vintage-frames-{family}-Regular-R-Normal--{ppem}-{ppem * 10}-72-72-P-72-MacRoman-0",
        f"SIZE {ppem} 72 72",
        f"FONTBOUNDINGBOX {ppem} {ppem} 0 -{desc}",
        "STARTPROPERTIES 6",
        f'COMMENT "extracted by dfont-to-bdf.py from {os.path.basename(path)}"',
        f'FAMILY_NAME "{family}"',
        f'COPYRIGHT ""',
        f"PIXEL_SIZE {ppem}",
        f"FONT_ASCENT {asc}",
        f"FONT_DESCENT {desc}",
        "ENDPROPERTIES",
        f"CHARS {len(glyphs)}",
    ]
    for code, (adv, bx, by, w, h, rows) in glyphs.items():
        # Glyph names carry the Unicode point; ENCODING stays the MacRoman
        # byte (what import-bdf.py maps), so name the decoded character.
        uni = ord(bytes([code]).decode("mac_roman")) if code < 256 else code
        lines += [
            f"STARTCHAR uni{uni:04X}",
            f"ENCODING {code}",
            f"SWIDTH {adv * 1000 // ppem} 0",
            f"DWIDTH {adv} 0",
            f"BBX {w} {h} {bx} {by - h}",
            "BITMAP",
        ]
        span = max(1, (w + 7) // 8)
        for row in rows:
            bits = int(row.replace(".", "0").replace("#", "1") or "0", 2) << (span * 8 - w)
            lines.append(f"{bits:0{span * 2}X}")
        lines.append("ENDCHAR")
    lines.append("ENDFONT")
    with open(out, "w") as f:
        f.write("\n".join(lines) + "\n")

    verify(out, glyphs)
    print(f"{family} {ppem}px ({asc}/{desc}): {len(glyphs)} glyphs -> {os.path.relpath(out)}")
    return out


def verify(bdf_path, glyphs):
    """Re-parse the written BDF with import-bdf.py's own parser and bit-compare
    every glyph's cells and advance against the decoded bdat bitmaps."""
    props, parsed = import_bdf.parse_bdf(bdf_path)
    by_enc = {enc: (name, adv, bbx, rows) for name, enc, adv, bbx, rows in parsed}
    assert len(by_enc) == len(glyphs), "glyph count mismatch after write"
    for code, (adv, bx, by, w, h, rows) in glyphs.items():
        name, p_adv, p_bbx, p_rows = by_enc[code]
        assert p_adv == adv, f"U+{code:04X}: advance {p_adv} != {adv}"
        want = {
            (bx + c, by - h + (h - 1 - r))
            for r, row in enumerate(rows)
            for c, ch in enumerate(row)
            if ch == "#"
        }
        assert import_bdf.ink_cells(p_bbx, p_rows) == want, f"U+{code:04X}: pixel mismatch"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(f"usage: {sys.argv[0]} <suitcase.dfont> ...")
    for p in sys.argv[1:]:
        write_bdf(p)
