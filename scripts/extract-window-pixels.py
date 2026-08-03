#!/usr/bin/env python3
"""Trace the window-archetype reference art in `Windows/`.

The window counterpart of `extract-button-pixels.py`, written for the window
archetype work: `vf-dialog frame="plain"`'s double frame and `vf-window
variant="utility"`'s windoid bar are both new chrome, and their metrics come
from these sheets rather than from the HIG's prose (whose Figures 5-1 and 6-1
label the same artwork two different ways — the art is the authority here).

For each sheet this reports the traced geometry and *asserts* the numbers the
CSS encodes, so a re-run catches both a swapped reference file and a drifted
trace:

- `utility-window.png` — the windoid: 1px frame, an 11px bar interior over a
  1px bottom rule (`--vf-titlebar-height-utility: 12px`), a dot-grid dither
  (2x2 tile, dot at the origin, 2px clear above and below), a 7x7 close box
  at left:7px, and a 7x7 zoom box at right:8px carrying a 4x4 nested square
  (the document zoom motif, miniaturized). The left/right box offsets really
  are asymmetric (7 vs 8) in the art. Two places the CSS deliberately
  deviates from this sheet: the dither runs FLUSH to the side borders (the
  close-up reference shows the sheet's 2px side inset is the artist's, not
  the bar's), and the shadow is the kit's shared `--vf-shadow-offset` token
  rather than the sheet's 1px.
- `modal dialog.png` — the dBoxProc frame: 1px outer border, 2px gap, 2px
  inner band, and NO drop shadow. This is the mirror of vf-alert's traced
  alert frame (2px outer, 2px gap, 1px inner rule, with shadow) — the two are
  different System 7 chromes, deliberately not one shared recipe.
- `moveable modal dialog.png` — the striped bar with a close box: 11x11 at
  left:8px spanning the stripe band, byte-identical to vf-window's widget, so
  vf-dialog's `closable` reuses the shared recipe rather than re-tracing. The
  stripes keep a 1px buffer everywhere: one clear px against either frame
  border (vfStripes' side inset) and a 1px white patch ring around the box
  (`--vf-widget-ring`; the windoid's dither clears 2px instead — see above).

Run from the repo root: `npm run extract:windows`.
"""

import importlib.util

spec = importlib.util.spec_from_file_location(
    "extract", "scripts/extract-button-pixels.py"
)
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)

REF = "Classic Macintosh UI Kit Reference/Windows"


def is_dark(px):
    r, g, b, a = px
    return a >= 128 and (r + g + b) // 3 < 64


def ascii_region(pixels, x0, y0, x1, y1):
    for y in range(y0, y1):
        row = "".join("#" if is_dark(pixels[y][x]) else "." for x in range(x0, x1))
        print(f"  y={y:3d} {row}")


def dark_run(pixels, y, x0, x1, min_len=2):
    """First >=min_len run of dark pixels in [x0, x1); returns (start, length).

    min_len skips the 1px dither dots that share the windoid bar's box rows.
    """
    x = x0
    while x < x1:
        while x < x1 and not is_dark(pixels[y][x]):
            x += 1
        start = x
        while x < x1 and is_dark(pixels[y][x]):
            x += 1
        if x - start >= min_len:
            return start, x - start
    return x1, 0


def trace_utility():
    w, h, pix = extract.read_png(f"{REF}/utility-window.png")
    print(f"utility-window.png {w}x{h}")
    print("bar (left corner incl. close box / right corner incl. zoom box):")
    ascii_region(pix, 0, 0, 40, 14)
    ascii_region(pix, 156, 0, 196, 14)

    # Frame: 1px border; the sheet's shadow is 1px (right col w-1 from y1,
    # bottom row h-1 from x1) — reported, not encoded (shared token instead).
    assert all(is_dark(pix[0][x]) for x in range(0, w - 1)), "top border"
    assert all(is_dark(pix[y][0]) for y in range(0, h - 2)), "left border"
    assert not is_dark(pix[0][w - 1]) and is_dark(pix[1][w - 1]), "1px shadow"

    # Bar: interior rows y1..11 (11px), full-width bottom rule at y12.
    assert all(is_dark(pix[12][x]) for x in range(w - 1)), "bar bottom rule"
    interior = 12 - 1
    print(f"bar interior: {interior}px + 1px rule -> titlebar-height-utility 12px")
    assert interior == 11

    # Dither: dots on odd columns of odd rows — a 2x2 tile with the dot at
    # the tile origin — zone inset 2px from the padding box (x3..w-5, y3..9).
    for y, x in ((3, 3), (5, 5), (9, w - 5)):
        assert is_dark(pix[y][x]), f"dither dot at ({x},{y})"
    for y, x in ((4, 3), (3, 4), (1, 3), (11, 3), (3, 1)):
        assert not is_dark(pix[y][x]), f"dither clear at ({x},{y})"

    # Close box: 7x7 at x8..14, y3..9 -> left:7px from the padding edge.
    cx, clen = dark_run(pix, 3, 6, 20)
    assert (cx, clen) == (8, 7), f"close box run {(cx, clen)}"
    assert is_dark(pix[9][8]) and not is_dark(pix[10][8]), "close box 7px tall"
    print("close box: 7x7 at left:7px top:2px")

    # Zoom box: 7x7 at x179..185 -> right:8px, with the 4x4 nested square
    # sharing its top/left borders (vertical at col 3, horizontal at row 3).
    zx, zlen = dark_run(pix, 3, 176, 190)
    assert (zx, zlen) == (179, 7), f"zoom box run {(zx, zlen)}"
    assert is_dark(pix[4][182]) and is_dark(pix[6][180]), "nested square"
    assert not is_dark(pix[7][182]), "nested square ends at row 3"
    print("zoom box: 7x7 at right:8px, 4x4 nested square (offsets ARE 7 vs 8)")


def trace_modal():
    w, h, pix = extract.read_png(f"{REF}/modal dialog.png")
    print(f"\nmodal dialog.png {w}x{h}")
    print("frame (top-left corner):")
    ascii_region(pix, 0, 0, 16, 8)

    # 1px outer border, 2px gap, 2px inner band; no shadow anywhere.
    assert all(is_dark(pix[0][x]) for x in range(w)), "outer border"
    assert not is_dark(pix[1][1]) and not is_dark(pix[2][2]), "2px gap"
    assert is_dark(pix[3][3]) and is_dark(pix[4][4]), "2px inner band"
    assert not is_dark(pix[5][5]), "content starts at 5"
    assert not is_dark(pix[1][w - 1]) or is_dark(pix[0][w - 1]), "no shadow col"
    print("frame: 1px outer + 2px gap + 2px inner band, no shadow")
    print("(mirror of vf-alert's 2px outer + 2px gap + 1px inner — not shared)")


def trace_moveable_modal():
    w, h, pix = extract.read_png(f"{REF}/moveable modal dialog.png")
    print(f"\nmoveable modal dialog.png {w}x{h}")
    print("bar (left corner incl. close box):")
    ascii_region(pix, 0, 0, 24, 19)

    # Standard 17px bar interior (rule at y18), 6 stripes at 2px pitch from
    # y4, close box 11x11 at x9..19 -> left:8px — vf-window's widget exactly.
    assert all(is_dark(pix[18][x]) for x in range(w - 1)), "bar bottom rule"
    bx, blen = dark_run(pix, 4, 8, 24)
    assert (bx, blen) == (9, 11), f"close box run {(bx, blen)}"
    assert is_dark(pix[14][9]) and not is_dark(pix[15][9]), "close box 11px tall"
    print("close box: 11x11 at left:8px — shared with vf-window by construction")

    # The stripes' side buffers are 1px everywhere: clear of the left border
    # at x1 (stripes start x2), a 1px patch either side of the box (x8 / x20),
    # and clear of the right border at w-3 (stripes end w-4; the border sits
    # at w-2 with the sheet's 1px shadow in the last column).
    assert not is_dark(pix[4][1]) and is_dark(pix[4][2]), "1px left buffer"
    assert not is_dark(pix[4][8]) and not is_dark(pix[4][20]), "1px patch ring"
    assert is_dark(pix[4][21]), "stripes resume past the ring"
    assert is_dark(pix[4][w - 4]) and not is_dark(pix[4][w - 3]), "1px right buffer"
    print("stripes: 1px clear of the frame edges, 1px patch ring at the box")


if __name__ == "__main__":
    trace_utility()
    trace_modal()
    trace_moveable_modal()
    print("\nall window-archetype traces hold")
