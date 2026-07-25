#!/usr/bin/env python3
"""Measure OUR rendered menu/popup ink, for comparison with the art.

`extract-menu-pixels.py` reduces the reference sheets to ink offsets. This
does the same reduction on a screenshot of menu-test.html (pinned to
`--vf-scale: 1`, so one CSS px is one system px), reusing that script's
`find_panel`/`report_box` so both sides are measured identically.

That equivalence is the whole point: the reference numbers are *ink*
positions while our CSS is expressed as *layout* padding, and the difference
between them is the font's left side bearing. Measuring our own render the
same way makes the two directly comparable without having to model the
bearing at all.

Usage: npm run shot:menus && npm run measure:menus
"""

import importlib.util
import sys

spec = importlib.util.spec_from_file_location(
    "art", "scripts/extract-menu-pixels.py"
)
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)

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
    width, height, pixels = art.extract.read_png(path)
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
            panel = art.find_panel(pixels, box, min_run=int((x1 - x0 + 1) * 0.8))
        except SystemExit:
            print("  (no panel border -- bare text island, skipped)")
            continue
        px0, py0, px1, py1 = panel
        print(
            f"  border box: x {px0}..{px1} (w={px1 - px0 + 1})  "
            f"y {py0}..{py1} (h={py1 - py0 + 1})"
        )
        art.report_box(pixels, panel)


if __name__ == "__main__":
    main()
