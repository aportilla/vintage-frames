#!/usr/bin/env python3
"""Rasterize the generated clip-path polygons and check the button silhouettes
are sound — the shapes the browser will actually paint, from the profiles
`src/pixel-frame.ts` declares.

Reads scripts/.tmp/clips.json (written by emit-clips.mjs), substitutes
--vf-scale = 1 and 100% = box size, and rasterizes each polygon with the same
fill rule the browser will use. Then, without reference to anything outside the
repo:

- each compiled polygon is a faithful rendering of its declared profile — the
  per-row inset the trace states, mirrored to all four corners
- ...at several box sizes, which is the 9-slice claim: straight runs stretch,
  traced corners never distort
- the frame minus the face is a *closed 1px outline* and nothing else, which is
  the QuickDraw difference-of-silhouettes the kit draws its border with
- the ring is a 3px band with a genuine hole (the evenodd keyhole really does
  cancel), holding a 1px transparent gap to the button box
- every profile's corner insets step strictly outward, the invariant
  SteppedProfile documents and nothing else enforced

WHAT THIS NO LONGER DOES, deliberately: it used to diff these masks against the
1x reference sheet the traces were read off. That comparison was scaffolding
for *deriving* the numbers, and the numbers have been committed constants for a
long time — the sheet is local design material the repo does not carry, so the
check could only ever run on one machine. The design is what it is; what needs
defending now is that the compiler still renders it faithfully.

  npm run verify:buttons
"""

import json
import re
import sys

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


def profile_mask(prof, w, h):
    """The silhouette a SteppedProfile *declares*, built straight from the
    trace: `start` blank rows, then one row per corner inset, then the straight
    edge — mirrored top to bottom, and left to right within each row."""
    corner, edge, start = prof["corner"], prof["edge"], prof["start"]
    mask = [[False] * w for _ in range(h)]
    for y in range(h):
        depth = min(y - start, (h - 1 - start) - y)
        if depth < 0:
            continue
        inset = corner[depth] if depth < len(corner) else edge
        for x in range(inset, w - inset):
            mask[y][x] = True
    return mask


def neighbors(x, y, w, h):
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yield x + dx, y + dy


ok = True


def check(name, bad, detail=""):
    """`bad` is a list of offending coordinates — empty means the check holds."""
    global ok
    if bad:
        ok = False
        shown = bad[:10] if isinstance(bad, list) else bad
        print(f"FAIL {name}: {len(bad)} bad, first 10: {shown}")
    else:
        print(f"ok   {name}{'  (' + detail + ')' if detail else ''}")


def mask_diff(got, want, w, h):
    return [(x, y) for y in range(h) for x in range(w) if got[y][x] != want[y][x]]


# ── every compiled polygon renders its declared profile, at any box size ────
# Several sizes because that IS the 9-slice claim: one polygon fits any width
# and height, the straight runs stretching while the traced corners hold.
SIZES = ((80, 20), (80, 16), (64, 20), (200, 40), (120, 22))

for key, profile_key in (("frame", "frame"), ("face", "face")):
    prof = clips["profiles"][profile_key]
    for w, h in SIZES:
        check(
            f"{key}: polygon == declared profile at {w}x{h}",
            mask_diff(rasterize(clips[key], w, h), profile_mask(prof, w, h), w, h),
        )

# ── the corner traces step outward, monotonically ───────────────────────────
# SteppedProfile documents "must be non-increasing (each row steps outward)";
# nothing enforced it, and a profile that broke it would compile into a
# self-intersecting polygon rather than an error.
for name, prof in clips["profiles"].items():
    corner = prof["corner"]
    check(
        f"{name}: corner insets step outward",
        [i for i in range(1, len(corner)) if corner[i] > corner[i - 1]],
        f"{corner} → edge {prof['edge']}",
    )

# ── the border is the difference of silhouettes: a closed 1px outline ───────
# Not a stroke. The frame painted black with the face painted over it leaves
# exactly the frame's boundary layer — every frame pixel that touches
# non-frame, and no others. That is what makes the corner steps come out 2px
# wide on the diagonal without anything special-casing them.
for w, h in SIZES:
    frame = rasterize(clips["frame"], w, h)
    face = rasterize(clips["face"], w, h)
    border = [[frame[y][x] and not face[y][x] for x in range(w)] for y in range(h)]

    check(
        f"face is strictly inside the frame at {w}x{h}",
        [(x, y) for y in range(h) for x in range(w) if face[y][x] and not frame[y][x]],
    )

    boundary = []
    for y in range(h):
        for x in range(w):
            if not frame[y][x]:
                continue
            touches_outside = any(
                not (0 <= nx < w and 0 <= ny < h) or not frame[ny][nx]
                for nx, ny in neighbors(x, y, w, h)
            )
            if touches_outside != border[y][x]:
                boundary.append((x, y))
    check(f"border == the frame's own 1px boundary at {w}x{h}", boundary)

# ── the ring: a 3px band, a real hole, and a 1px gap to the button ──────────
RING_W, RING_H = 88, 28
ins = clips["ringInset"]
ring = rasterize(clips["ring"], RING_W, RING_H)
outer = profile_mask(clips["profiles"]["ringFrame"], RING_W, RING_H)
hole = profile_mask(clips["profiles"]["ringHole"], RING_W, RING_H)

check(
    "ring == outer silhouette minus hole (the evenodd keyhole cancels)",
    mask_diff(
        ring,
        [[outer[y][x] and not hole[y][x] for x in range(RING_W)] for y in range(RING_H)],
        RING_W,
        RING_H,
    ),
)

# The band is 3px thick down the straight edges — measured on the mid row and
# mid column, clear of the corner staircases.
mid_y = RING_H // 2
left_run = 0
while left_run < RING_W and ring[mid_y][left_run]:
    left_run += 1
mid_x = RING_W // 2
top_run = 0
while top_run < RING_H and ring[top_run][mid_x]:
    top_run += 1
check(
    "the band is 3 system px thick on both axes",
    [] if left_run == 3 and top_run == 3 else [("left", left_run), ("top", top_run)],
    f"left {left_run}, top {top_run}",
)

# The hole has to clear the inner button box by exactly one transparent row:
# the ring box is the button box outset by ringInset on every side, and the
# band stops ringInset-1 px short of it. That 1px is the classic gap.
gap = ins - clips["profiles"]["ringHole"]["edge"]
check(
    "a 1 system px transparent gap separates the band from the button box",
    [] if gap == 1 else [("gap", gap)],
    f"ring inset {ins} − hole edge {clips['profiles']['ringHole']['edge']} = {gap}",
)

# Nothing of the ring may intrude on the button box itself.
check(
    "the ring never paints inside the button box",
    [
        (x, y)
        for y in range(RING_H)
        for x in range(RING_W)
        if ring[y][x] and ins <= x < RING_W - ins and ins <= y < RING_H - ins
    ],
)

print("\nALL CHECKS PASSED" if ok else "\nFAILURES — see above")
sys.exit(0 if ok else 1)
