#!/usr/bin/env python3
"""Rasterize the generated clip-path polygons and diff them against the
reference sheet, pixel for pixel.

Reads scripts/.tmp/clips.json (written by emit-clips.mjs), substitutes
--vf-scale = 1 and 100% = box size, rasterizes each polygon with the same
fill rule the browser will use, and compares:

- button frame silhouette == every non-transparent pixel of a rest button
- predicted border (frame minus face) == exactly the black border pixels
- every white face pixel falls inside the predicted face
- ring mask == the default button's black pixels outside the inner button box
- the ring's gap + hole pixels are alpha-0 in the reference

Checked at 80x20 (row 1) and 80x16 (row 3) to prove height independence.
"""

import json
import re
import sys
import importlib.util

spec = importlib.util.spec_from_file_location(
    "extract", "scripts/extract-button-pixels.py"
)
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)

WIDTH, HEIGHT, PIXELS = extract.read_png(extract.PATH)

with open("scripts/.tmp/clips.json") as f:
    clips = json.load(f)

COORD = re.compile(
    r"calc\(100% - var\(--vf-scale, 1\) \* (\d+)px\)"
    r"|calc\(var\(--vf-scale, 1\) \* (\d+)px\)"
    r"|(\d+(?:\.\d+)?)%"
    r"|(\d+)"
)


def coord(token, size):
    m = COORD.fullmatch(token.strip())
    assert m, f"unparsed coordinate: {token!r}"
    if m.group(1) is not None:
        return size - int(m.group(1))
    if m.group(2) is not None:
        return int(m.group(2))
    if m.group(3) is not None:
        return size * float(m.group(3)) / 100.0
    return int(m.group(4))


def parse_polygon(css, w, h):
    inner = css[len("polygon(") : -1]
    fill = "nonzero"
    if inner.startswith("evenodd,"):
        fill = "evenodd"
        inner = inner[len("evenodd,") :]
    pts = []
    # split on commas not inside parens
    depth = 0
    cur = ""
    parts = []
    for ch in inner:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    for part in parts:
        # each part is "<x-expr> <y-expr>"; exprs may contain spaces, so split
        # at the boundary between the two top-level tokens
        toks = []
        depth = 0
        cur = ""
        for ch in part.strip():
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            if ch == " " and depth == 0:
                if cur:
                    toks.append(cur)
                cur = ""
            else:
                cur += ch
        if cur:
            toks.append(cur)
        # tokens like ['calc(...)'] pieces are already whole thanks to depth
        assert len(toks) == 2, f"bad point: {part!r} -> {toks}"
        pts.append((coord(toks[0], w), coord(toks[1], h)))
    return fill, pts


def rasterize(css, w, h):
    fill, pts = parse_polygon(css, w, h)
    mask = [[False] * w for _ in range(h)]
    n = len(pts)
    for py in range(h):
        yc = py + 0.5
        for px_ in range(w):
            xc = px_ + 0.5
            crossings = 0
            winding = 0
            for i in range(n):
                x1, y1 = pts[i]
                x2, y2 = pts[(i + 1) % n]
                if (y1 <= yc < y2) or (y2 <= yc < y1):
                    xint = x1 + (yc - y1) * (x2 - x1) / (y2 - y1)
                    if xint > xc:
                        crossings += 1
                        winding += 1 if y2 > y1 else -1
            inside = (crossings % 2 == 1) if fill == "evenodd" else (winding != 0)
            mask[py][px_] = inside
    return mask


def ref_mask(x0, y0, w, h, predicate):
    return [
        [predicate(PIXELS[y0 + y][x0 + x]) for x in range(w)] for y in range(h)
    ]


def diff(name, got, want, w, h):
    bad = [
        (x, y)
        for y in range(h)
        for x in range(w)
        if got[y][x] != want[y][x]
    ]
    if bad:
        print(f"FAIL {name}: {len(bad)} mismatching pixels, first 10: {bad[:10]}")
        return False
    print(f"ok   {name}")
    return True


def is_black(p):
    return p[3] >= 128 and p[0] < 64 and p[1] < 64 and p[2] < 64


def is_white(p):
    return p[3] >= 128 and p[0] > 224 and p[1] > 224 and p[2] > 224


def is_opaque(p):
    return p[3] >= 128


ok = True

# --- standard rest button at (24,20), 80x20; small rest at (24,128), 80x16 ---
for (bx, by, bw, bh, label) in (
    (24, 20, 80, 20, "std-80x20"),
    (24, 128, 80, 16, "small-80x16"),
):
    frame = rasterize(clips["frame"], bw, bh)
    face = rasterize(clips["face"], bw, bh)
    silhouette_ref = ref_mask(bx, by, bw, bh, is_opaque)
    ok &= diff(f"{label} silhouette == opaque pixels", frame, silhouette_ref, bw, bh)

    border_pred = [
        [frame[y][x] and not face[y][x] for x in range(bw)] for y in range(bh)
    ]
    # every predicted border pixel must be black in the reference
    bad = [
        (x, y)
        for y in range(bh)
        for x in range(bw)
        if border_pred[y][x] and not is_black(PIXELS[by + y][bx + x])
    ]
    # every white pixel must be inside the predicted face
    bad2 = [
        (x, y)
        for y in range(bh)
        for x in range(bw)
        if is_white(PIXELS[by + y][bx + x]) and not face[y][x]
    ]
    # border must be exactly silhouette minus face; also check no black
    # border-adjacent pixel was claimed by the face along the outline: every
    # black pixel touching transparent space must be border
    bad3 = []
    for y in range(bh):
        for x in range(bw):
            if not is_black(PIXELS[by + y][bx + x]):
                continue
            edge = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < bw and 0 <= ny < bh):
                    edge = True
                elif not is_opaque(PIXELS[by + ny][bx + nx]):
                    edge = True
            if edge and not border_pred[y][x]:
                bad3.append((x, y))
    for name, b in (
        (f"{label} border pixels all black", bad),
        (f"{label} white face covered", bad2),
        (f"{label} outline pixels all border", bad3),
    ):
        if b:
            print(f"FAIL {name}: {len(b)} bad, first 10: {b[:10]}")
            ok = False
        else:
            print(f"ok   {name}")

# --- default ring: rest at (20,67), box 88x28, inner button at +4,+4 80x20 ---
rx, ry, rw, rh = 20, 67, 88, 28
ins = clips["ringInset"]
ring = rasterize(clips["ring"], rw, rh)


def in_inner_box(x, y):
    return ins <= x < rw - ins and ins <= y < rh - ins


ring_ref = [
    [
        is_black(PIXELS[ry + y][rx + x]) and not in_inner_box(x, y)
        for x in range(rw)
    ]
    for y in range(rh)
]
ok &= diff("ring mask == black minus inner box", ring, ring_ref, rw, rh)

# gap/hole transparency: every pixel outside the ring mask and outside the
# inner button box must be alpha-0 in the reference
bad = [
    (x, y)
    for y in range(rh)
    for x in range(rw)
    if not ring[y][x]
    and not in_inner_box(x, y)
    and PIXELS[ry + y][rx + x][3] != 0
]
if bad:
    print(f"FAIL ring hole transparency: {len(bad)} bad, first 10: {bad[:10]}")
    ok = False
else:
    print("ok   ring hole transparency")

print("\nALL CHECKS PASSED" if ok else "\nFAILURES — see above")
sys.exit(0 if ok else 1)
