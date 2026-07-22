#!/usr/bin/env python3
"""Follow-up to extract-button-pixels.py: exact colors at specific pixels.

Answers the questions the component-level pass left open: disabled border and
label colors per row, the 3-pixel corner step orientation, and right-edge
mirrors of the face corner.
"""

import importlib.util
import sys

spec = importlib.util.spec_from_file_location(
    "extract", "scripts/extract-button-pixels.py"
)
mod = importlib.util.module_from_spec(spec)
# Import read_png without running main()
mod.__name__ = "extract"
spec.loader.exec_module(mod)

width, height, pixels = mod.read_png(mod.PATH)


def show(label, x, y):
    print(f"{label}: ({x},{y}) = {pixels[y][x]}")


print("== row 1 (standard 80x20): rest at (24,20), pressed (118,20), disabled (208,20) ==")
show("rest top edge", 60, 20)
show("rest left edge", 24, 30)
show("rest label 'B' stem", 43, 28)
show("rest face", 90, 30)
show("pressed label (should be white)", 138, 27)
show("disabled top edge", 240, 20)
show("disabled left edge", 208, 30)
show("disabled label 'B' stem", 227, 28)
show("disabled face", 280, 30)

print("\n== corner step orientation: rest button TL 2x2 at (25,21)..(26,22) ==")
for y in (21, 22):
    for x in (25, 26):
        show(f"corner ({x - 24},{y - 20}) rel", x, y)

print("\n== rest button TR face corner mirror (button spans x=24..103) ==")
# row y=21 (rel y1): expect border at rel x 77,78 (abs 101,102), face to x 100
for x in (99, 100, 101, 102, 103):
    show(f"TR row rel-y1, rel-x {x - 24}", x, 21)
for x in (100, 101, 102, 103):
    show(f"TR row rel-y2, rel-x {x - 24}", x, 22)

print("\n== row 2 (default 88x28): rest (20,67), pressed (114,67), disabled (208,67) ==")
show("rest ring top", 60, 67)
show("rest ring left", 20, 80)
show("rest gap (rel x3)", 23, 80)
show("rest inner border (rel x4)", 24, 80)
show("disabled ring top", 250, 67)
show("disabled ring left", 208, 80)
show("disabled gap", 211, 80)
show("disabled inner border", 212, 80)
show("disabled inner top edge", 250, 71)
show("disabled label stem", 231, 78)
show("disabled face", 285, 80)
show("pressed ring left", 114, 80)
show("pressed gap", 117, 80)
show("pressed inner border", 118, 80)
show("pressed face", 190, 80)

print("\n== row 3 (small 80x16): rest (24,128), pressed (118,128), disabled (208,128) ==")
show("rest top edge", 60, 128)
show("rest label stem", 51, 135)
show("disabled top edge", 240, 128)
show("disabled left edge", 208, 135)
show("disabled label stem", 235, 135)
show("pressed label", 146, 135)

print("\n== gap transparency around default ring (rest): between ring and button ==")
# ring box (20,67)..(107,94); straight-edge rows: ring x20..22, gap x23, border x24
for x in range(20, 30):
    show(f"row2 rest scanline rel-x {x - 20}", x, 81)
