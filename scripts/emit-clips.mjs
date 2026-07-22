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

const out = {
  frame: steppedRectClip(BUTTON_FRAME),
  face: steppedRectClip(BUTTON_FACE),
  ring: steppedRingClip(RING_FRAME, RING_HOLE),
  ringInset: RING_INSET,
}
writeFileSync('scripts/.tmp/clips.json', JSON.stringify(out, null, 2))
console.log('wrote scripts/.tmp/clips.json')
console.log(out.frame)
console.log(out.face)
console.log(out.ring)
