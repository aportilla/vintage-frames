#!/usr/bin/env python3
"""Measure OUR rendered menu/popup ink.

Reduces a screenshot of menu-test.html (pinned to `--vf-scale: 1`, so one CSS
px is one system px) to ink offsets, via the shared `find_panel`/`report_box`
in scripts/bitmap.py.

Why ink and not layout: our CSS is expressed as *layout* padding, and the
difference between that and where the ink lands is the font's left side
bearing. Measuring the render itself sidesteps having to model the bearing at
all — which is what made this comparable to the traced numbers when they were
being derived, and what still makes it the way to check a menu metric by hand.

Usage: npm run shot:menus && npm run measure:menus
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import bitmap  # noqa: E402  (path set above so this runs from the repo root)

MIN_ISLAND = 12  # ignore specks; every specimen is far larger


def is_bg(px):
    r, g, b, a = px
    return a < 128 or (r > 200 and g < 64 and b > 200)


def islands(width, height, pixels):
    """4-connected runs of non-background pixels, as bounding boxes."""
    seen = [[False] * width for _ in range(height)]
    out = []
    for y in range(height):
        for x in range(width):
            if seen[y][x] or is_bg(pixels[y][x]):
                continue
            stack = [(x, y)]
            seen[y][x] = True
            x0 = x1 = x
            y0 = y1 = y
            while stack:
                cx, cy = stack.pop()
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for nx, ny in (
                    (cx - 1, cy),
                    (cx + 1, cy),
                    (cx, cy - 1),
                    (cx, cy + 1),
                ):
                    if 0 <= nx < width and 0 <= ny < height:
                        if not seen[ny][nx] and not is_bg(pixels[ny][nx]):
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            if x1 - x0 + 1 >= MIN_ISLAND and y1 - y0 + 1 >= MIN_ISLAND:
                out.append((x0, y0, x1, y1))
    return sorted(out, key=lambda b: (b[1], b[0]))


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: measure-menu-render.py <screenshot.png>")
    path = sys.argv[1]
    width, height, pixels = bitmap.read_png(path)
    print(f"screenshot: {width}x{height}")

    for box in islands(width, height, pixels):
        x0, y0, x1, y1 = box
        print(
            f"\n=== island ({x0},{y0})..({x1},{y1})  "
            f"{x1 - x0 + 1}x{y1 - y0 + 1} ==="
        )
        # Require the border to span most of the island, so a vf-menu's bar
        # label can't be mistaken for the panel that hangs below it.
        try:
            panel = bitmap.find_panel(pixels, box, min_run=int((x1 - x0 + 1) * 0.8))
        except SystemExit:
            print("  (no panel border -- bare text island, skipped)")
            continue
        px0, py0, px1, py1 = panel
        print(
            f"  border box: x {px0}..{px1} (w={px1 - px0 + 1})  "
            f"y {py0}..{py1} (h={py1 - py0 + 1})"
        )
        bitmap.report_box(pixels, panel)


if __name__ == "__main__":
    main()
