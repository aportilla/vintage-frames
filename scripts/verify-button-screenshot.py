#!/usr/bin/env python3
"""Diff a real browser screenshot of pixel-test.html against the traced
profiles — the end-to-end check that the browser rasterizes the stepped
clip-paths bit-exact (no antialiasing, no evenodd keyhole seam).

Usage: python3 scripts/verify-button-screenshot.py shots/buttons.png

The screenshot must be taken at deviceScaleFactor 1 (pixel-test.html pins
--vf-scale to 1). Buttons are located as non-magenta islands on the #f0f
page background. For each island the black/white pixel classes are compared
against masks synthesized from the same profiles the component uses.

Checks per button:
- island size matches the expected frame box (+ ring for variant=default)
- every silhouette pixel is EXACTLY black or white (any other value =
  antialiasing leaked in)
- frame-minus-face pixels are black; face border-adjacent ring is white
  (label pixels vary, so only the outline band is asserted)
- the default ring: ring band exactly black, hole gap row shows pure page
  magenta (transparent → background), no seam pixels at the 50% keyhole
"""

import sys
import importlib.util

spec = importlib.util.spec_from_file_location(
    "extract", "scripts/extract-button-pixels.py"
)
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)

# Profiles — keep in sync with src/pixel-frame.ts (verified by verify:buttons)
BUTTON_FRAME = ([3, 1, 1], 0, 0)
BUTTON_FACE = ([3, 2], 1, 1)
RING_FRAME = ([5, 3, 2, 1, 1], 0, 0)
RING_HOLE = ([6, 4, 4], 3, 3)
RING_INSET = 4


def inset_at(profile, row, h):
    corner, edge, start = profile
    if row < start or row >= h - start:
        return None  # outside the silhouette
    mirrored = h - 1 - row
    for probe in (row, mirrored):
        k = probe - start
        if 0 <= k < len(corner):
            return corner[k]
    return edge


def mask(profile, w, h):
    m = [[False] * w for _ in range(h)]
    for y in range(h):
        i = inset_at(profile, y, h)
        if i is None:
            continue
        for x in range(i, w - i):
            m[y][x] = True
    return m


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: verify-button-screenshot.py <screenshot.png>")
    path = sys.argv[1]
    width, height, px = extract.read_png(path)
    print(f"screenshot: {width}x{height}")

    def is_bg(p):
        return p[0] > 200 and p[1] < 64 and p[2] > 200

    # find islands (connected non-background regions), 4-connected
    seen = [[False] * width for _ in range(height)]
    islands = []
    for y in range(height):
        for x in range(width):
            if seen[y][x] or is_bg(px[y][x]):
                continue
            stack = [(x, y)]
            seen[y][x] = True
            x0 = x1 = x
            y0 = y1 = y
            while stack:
                cx, cy = stack.pop()
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        if not seen[ny][nx] and not is_bg(px[ny][nx]):
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            islands.append((y0, x0, x1, y1))
    # The dotted focus outline renders as dozens of disconnected 1px dot
    # islands — keep only button-sized islands (the dots are checked
    # separately around the focused button's box).
    islands = [
        (y0, x0, x1, y1)
        for (y0, x0, x1, y1) in islands
        if x1 - x0 + 1 >= 40 and y1 - y0 + 1 >= 12
    ]
    islands.sort()
    print(f"found {len(islands)} button-sized islands (top to bottom)")

    ok = True

    def check(name, cond, detail=""):
        nonlocal ok
        if cond:
            print(f"ok   {name}")
        else:
            print(f"FAIL {name} {detail}")
            ok = False

    def check_button(bx0, by0, bx1, by1, name, expect_focus_ring=False):
        nonlocal ok
        w = bx1 - bx0 + 1
        h = by1 - by0 + 1
        frame = mask(BUTTON_FRAME, w, h)
        face = mask(BUTTON_FACE, w, h)
        bad_alias = []
        bad_border = []
        bad_face = []
        bad_outside = []
        for y in range(h):
            for x in range(w):
                p = px[by0 + y][bx0 + x]
                in_frame = frame[y][x]
                in_face = face[y][x]
                if in_frame:
                    pure = (p[0], p[1], p[2]) in ((0, 0, 0), (255, 255, 255)) or (
                        # disabled label gray is legal inside the face
                        in_face
                        and p[0] == p[1] == p[2]
                    )
                    if not pure:
                        bad_alias.append((x, y, p))
                    if not in_face and not (p[0] < 32 and p[1] < 32 and p[2] < 32):
                        bad_border.append((x, y, p))
                elif not expect_focus_ring:
                    # outside silhouette must be page background (transparent
                    # host) — the corner notches must show magenta
                    if not is_bg(p):
                        bad_outside.append((x, y, p))
        # face outline band (1px just inside the border) must be white
        for y in range(h):
            for x in range(w):
                if not face[y][x]:
                    continue
                edge = False
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not face[ny][nx]:
                        edge = True
                if edge:
                    p = px[by0 + y][bx0 + x]
                    if not (p[0] > 224 and p[1] > 224 and p[2] > 224):
                        bad_face.append((x, y, p))
        check(f"{name}: no antialiased silhouette pixels", not bad_alias, str(bad_alias[:5]))
        check(f"{name}: border band pure black", not bad_border, str(bad_border[:5]))
        check(f"{name}: face outline band pure white", not bad_face, str(bad_face[:5]))
        if not expect_focus_ring:
            check(f"{name}: corner notches transparent", not bad_outside, str(bad_outside[:5]))

    # The focus outline may render as one connected ring island whose bbox
    # contains the focused button's — pull it out before ordering buttons.
    # The default-button ring ALSO contains its inner button, but at exactly
    # RING_INSET margins on all sides; the outline sits at offset 2 + 1px = 3.
    def contains(a, b):
        return a[0] < b[0] and a[1] < b[1] and a[2] > b[2] and a[3] > b[3]

    def margin_set(a, b):
        return {b[0] - a[0], b[1] - a[1], a[2] - b[2], a[3] - b[3]}

    outlines = [
        a
        for a in islands
        if any(
            contains(a, b) and margin_set(a, b) != {RING_INSET}
            for b in islands
            if b != a
        )
    ]
    islands = [a for a in islands if a not in outlines]
    # ...and the ring's inner button is its own island too (the 1px gap
    # separates them); it is verified as "default inner", so drop it here.
    islands = [
        b
        for b in islands
        if not any(contains(a, b) for a in islands if a != b)
    ]

    # island order: plain, default(ring), disabled, focused, small
    if len(islands) < 5:
        sys.exit(f"expected 5 button islands, found {len(islands)}: {islands}")

    (y0, x0, x1, y1) = islands[0]
    check("plain: height 22", y1 - y0 + 1 == 22, f"got {y1 - y0 + 1}")
    check_button(x0, y0, x1, y1, "plain")

    (ry0, rx0, rx1, ry1) = islands[1]
    # ring island: outer box; inner button at +RING_INSET
    rw = rx1 - rx0 + 1
    rh = ry1 - ry0 + 1
    check("default: height 22 + 2*ring inset", rh == 22 + 2 * RING_INSET, f"got {rh}")
    ring_outer = mask(RING_FRAME, rw, rh)
    ring_hole = mask(RING_HOLE, rw, rh)
    bad_ring = []
    bad_gap = []
    for y in range(rh):
        for x in range(rw):
            p = px[ry0 + y][rx0 + x]
            in_band = ring_outer[y][x] and not ring_hole[y][x]
            in_inner = (
                RING_INSET <= x < rw - RING_INSET and RING_INSET <= y < rh - RING_INSET
            )
            if in_band:
                if not (p[0] < 32 and p[1] < 32 and p[2] < 32):
                    bad_ring.append((x, y, p))
            elif not in_inner:
                # hole minus inner button = the 1px gap + notches: must be
                # pure page magenta (no keyhole seam, no antialiasing)
                if ring_outer[y][x] and not is_bg(p):
                    bad_gap.append((x, y, p))
    check("default: ring band pure black (evenodd donut)", not bad_ring, str(bad_ring[:5]))
    check("default: ring gap pure background (no seam)", not bad_gap, str(bad_gap[:5]))
    check_button(
        rx0 + RING_INSET, ry0 + RING_INSET, rx1 - RING_INSET, ry1 - RING_INSET,
        "default inner",
    )

    (y0, x0, x1, y1) = islands[2]
    check_button(x0, y0, x1, y1, "disabled")

    # focused button: the island is the button box itself (the dotted
    # outline's dots are separate specks filtered out above). Check the
    # button renders like the plain one, then look for outline dots in the
    # band 1..4px around the box (outline-offset is 2).
    (y0, x0, x1, y1) = islands[3]
    check_button(x0, y0, x1, y1, "focused", expect_focus_ring=True)
    ring_found = any(contains(o, islands[3]) for o in outlines)
    dots = 0
    if not ring_found:
        # dotted outlines can also break into disconnected specks — scan the
        # band 1..4px around the box (outline-offset is 2)
        for band in range(1, 5):
            for x in range(x0 - band, x1 + 1 + band):
                for y in (y0 - band, y1 + band):
                    if 0 <= y < height and 0 <= x < width and px[y][x][0] < 32:
                        dots += 1
            for y in range(y0 - band, y1 + 1 + band):
                for x in (x0 - band, x1 + band):
                    if 0 <= y < height and 0 <= x < width and px[y][x][0] < 32:
                        dots += 1
    check(
        "focused: focus outline visible outside silhouette",
        ring_found or dots > 0,
    )

    # small variant: 16px tall, same traced corners
    (y0, x0, x1, y1) = islands[4]
    check("small: height 16", y1 - y0 + 1 == 16, f"got {y1 - y0 + 1}")
    check_button(x0, y0, x1, y1, "small")

    print("\nALL SCREENSHOT CHECKS PASSED" if ok else "\nFAILURES — see above")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
