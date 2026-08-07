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
- the focused button: the 1px dashed focus rule under the label — 1px on, 1px
  off, on row 15 with a blank row between it and the glyph ink, and nothing
  painted outside the silhouette (the indicator is not a ring)
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import bitmap  # noqa: E402  (path set above so this runs from the repo root)

# Profiles — keep in sync with src/pixel-frame.ts (verified by verify:buttons)
BUTTON_FRAME = ([3, 1, 1], 0, 0)
BUTTON_FACE = ([3, 2], 1, 1)
RING_FRAME = ([5, 3, 2, 1, 1], 0, 0)
RING_HOLE = ([6, 4, 4], 3, 3)
RING_INSET = 4

# Rendered heights, in system px (pixel-test.html pins --vf-scale: 1).
# --vf-button-height, measured off both 1x sheets as an 80×20 face — the
# default ring's inner box is exactly that. --vf-control-height-small stays 16.
BUTTON_H = 20
SMALL_H = 16

# Row of the 20px face carrying the keyboard-focus rule: the label's baseline
# sits on row 14 (the 12/4 em centered in the face), and the rule is 1px below
# it. See vfFocusUnderline in src/styles/base.ts.
FOCUS_ROW = 15


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
    width, height, px = bitmap.read_png(path)
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
    # Keep only button-sized islands: the page's on-grid marker square is the
    # other non-magenta thing on it.
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

    def check_button(bx0, by0, bx1, by1, name):
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
                else:
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
        check(f"{name}: corner notches transparent", not bad_outside, str(bad_outside[:5]))

    def black_runs(x_from, x_to, y):
        """Black runs along one scanline, as (start, length) pairs."""
        out = []
        x = x_from
        while x <= x_to:
            if all(c < 32 for c in px[y][x][:3]):
                start = x
                while x <= x_to and all(c < 32 for c in px[y][x][:3]):
                    x += 1
                out.append((start, x - start))
            else:
                x += 1
        return out

    # The dragged test window lives right of x=250; the button column left of
    # it. Split before ordering.
    window_islands = [i for i in islands if i[1] >= 250]
    islands = [i for i in islands if i[1] < 250]

    def contains(a, b):
        return a[0] < b[0] and a[1] < b[1] and a[2] > b[2] and a[3] > b[3]

    # The default ring's inner button is its own island (the 1px gap separates
    # them); it is verified as "default inner", so drop it here.
    islands = [
        b
        for b in islands
        if not any(contains(a, b) for a in islands if a != b)
    ]

    # island order: plain, default(ring), disabled, focused, small
    if len(islands) < 5:
        sys.exit(f"expected 5 button islands, found {len(islands)}: {islands}")

    (y0, x0, x1, y1) = islands[0]
    check(
        f"plain: height {BUTTON_H}",
        y1 - y0 + 1 == BUTTON_H,
        f"got {y1 - y0 + 1}",
    )
    check_button(x0, y0, x1, y1, "plain")

    (ry0, rx0, rx1, ry1) = islands[1]
    # ring island: outer box; inner button at +RING_INSET
    rw = rx1 - rx0 + 1
    rh = ry1 - ry0 + 1
    check(
        f"default: height {BUTTON_H} + 2*ring inset",
        rh == BUTTON_H + 2 * RING_INSET,
        f"got {rh}",
    )
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

    # focused button: the indicator lives INSIDE the face — a dashed rule under
    # the label, so the island is just the button box (check_button's "corner
    # notches transparent" is the assertion that no ring escaped it). Row 15 of
    # the 20px face is the rule; row 14 is the blank row under the glyph ink.
    (y0, x0, x1, y1) = islands[3]
    check_button(x0, y0, x1, y1, "focused")
    dashes = black_runs(x0 + 1, x1 - 1, y0 + FOCUS_ROW)
    gaps = [dashes[i + 1][0] - (dashes[i][0] + dashes[i][1]) for i in range(len(dashes) - 1)]
    check(
        f"focused: dashed rule on row {FOCUS_ROW}, 1px on / 1px off",
        len(dashes) >= 8
        and all(n == 1 for _, n in dashes)
        and all(g == 1 for g in gaps),
        f"{len(dashes)} dashes, widths={sorted({n for _, n in dashes})}, gaps={sorted(set(gaps))}",
    )
    check(
        "focused: a blank row separates the rule from the glyph ink",
        not black_runs(dashes[0][0], dashes[-1][0], y0 + FOCUS_ROW - 1) if dashes else False,
    )
    check(
        "focused: the rule is centered under the label",
        bool(dashes)
        and abs((dashes[0][0] - x0) - (x1 - (dashes[-1][0] + dashes[-1][1] - 1))) <= 2,
        f"left={dashes[0][0] - x0} right={x1 - (dashes[-1][0] + dashes[-1][1] - 1)}" if dashes else "",
    )
    # …and an unfocused button has no rule at all.
    (py0, pxx0, pxx1, py1) = islands[0]
    check(
        "plain: no focus rule when unfocused",
        not black_runs(pxx0 + 1, pxx1 - 1, py0 + FOCUS_ROW),
    )

    # small variant: 16px tall, same traced corners
    (y0, x0, x1, y1) = islands[4]
    check(f"small: height {SMALL_H}", y1 - y0 + 1 == SMALL_H, f"got {y1 - y0 + 1}")
    check_button(x0, y0, x1, y1, "small")

    # dragged window: after fractional-position + fractional-drag repro, the
    # snapped window must rasterize entirely in pure black/white (its border,
    # stripes, Chicago title, shadow, and the button inside) — a single
    # off-grid coordinate would fringe hundreds of pixels gray.
    check("window: dragged test window present", len(window_islands) == 1,
          f"got {len(window_islands)}")
    if window_islands:
        (y0, x0, x1, y1) = window_islands[0]
        impure = [
            (x, y, px[y][x])
            for y in range(y0, y1 + 1)
            for x in range(x0, x1 + 1)
            if not (
                is_bg(px[y][x])
                or (px[y][x][0], px[y][x][1], px[y][x][2]) in ((0, 0, 0), (255, 255, 255))
            )
        ]
        check("window: zero fringing (pure black/white only)", not impure,
              f"{len(impure)} impure, first 10: {impure[:10]}")

    # the page script turns the marker lime only when the window's inline
    # top/left landed on whole device pixels
    marker = px[18][width - 18]
    check(
        "window: JS coordinates snapped to device grid (marker lime)",
        marker[0] < 64 and marker[1] > 192 and marker[2] < 64,
        f"marker pixel = {marker}",
    )

    print("\nALL SCREENSHOT CHECKS PASSED" if ok else "\nFAILURES — see above")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
