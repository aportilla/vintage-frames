/**
 * Emit the compiled clip-path polygons + profiles as JSON for
 * verify-button-clips.py. Run via `npm run verify:buttons` (which compiles
 * src/pixel-frame.ts to scripts/.tmp first).
 */
import { writeFileSync } from 'node:fs'
import {
  BUTTON_FACE,
  BUTTON_FRAME,
  RING_FRAME,
  RING_HOLE,
  RING_INSET,
  steppedRectClip,
  steppedRingClip,
} from './.tmp/pixel-frame.js'

// Both halves: the compiled `polygon()` strings the browser will actually
// clip with, AND the profiles they were compiled from. The verifier's job is
// to prove the first is a faithful rendering of the second — a claim it can
// only make with both in hand.
const out = {
  frame: steppedRectClip(BUTTON_FRAME),
  face: steppedRectClip(BUTTON_FACE),
  ring: steppedRingClip(RING_FRAME, RING_HOLE),
  ringInset: RING_INSET,
  profiles: {
    frame: BUTTON_FRAME,
    face: BUTTON_FACE,
    ringFrame: RING_FRAME,
    ringHole: RING_HOLE,
  },
}
writeFileSync('scripts/.tmp/clips.json', JSON.stringify(out, null, 2))
console.log('wrote scripts/.tmp/clips.json')
console.log(out.frame)
console.log(out.face)
console.log(out.ring)
