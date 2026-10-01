// The shell's saved session (src/shell/state.ts): parsing a stored blob, the
// order a boot reopens windows in, and what a write keeps.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { frameOf, pinOf } from '../scripts/.tmp/unit/shell/geometry.js'
import { mergeSession, openWindowsOf, readSession } from '../scripts/.tmp/unit/shell/state.js'

const pin = pinOf({ left: 40, top: 40, width: 300, height: 200 }, { width: 1000, height: 800 }, frameOf(20))

test('read: a foreign or garbled blob reads as none; bad entries drop; the extras come through', () => {
  assert.equal(readSession(null), null)
  assert.equal(readSession('x'), null)
  assert.equal(readSession({ v: 99 }), null)
  const st = readSession({
    v: 1,
    windows: {
      'f1': { app: 'finder', pin, z: 1 },
      'f2': { app: 'finder', pin: { x: [] } },
      'f3': { pin, z: 0 },
      'f4': { app: 'viewer', pin, z: 1.5 },
    },
    active: '',
    pattern: '  ',
    extra: { greet: false },
  })
  assert.deepEqual(Object.keys(st.windows), ['f1', 'f4'])
  assert.equal(st.windows.f4.z, undefined, 'a depth that is not a whole number is a box alone')
  assert.equal(st.active, null)
  assert.equal(st.pattern, null)
  assert.deepEqual(st.extra, { greet: false })
  assert.deepEqual(readSession({ v: 1, extra: [1] }).extra, {})
})

test('open windows: deepest first; a box alone never reopens', () => {
  const st = readSession({
    v: 1,
    windows: {
      top: { app: 'viewer', pin, z: 2 },
      palette: { app: 'editor', pin },
      bottom: { app: 'finder', pin, z: 0 },
    },
  })
  assert.deepEqual(
    openWindowsOf(st).map((w) => `${w.app}:${w.item}`),
    ['finder:bottom', 'viewer:top']
  )
  assert.deepEqual(openWindowsOf(null), [])
})

test('merge: a known window keeps its box and loses its depth; the snapshot’s go over them', () => {
  const known = { a: { app: 'finder', pin, z: 3 }, b: { app: 'viewer', pin, z: 1 } }
  const session = mergeSession(
    known,
    { windows: { b: { app: 'viewer', pin, z: 0 }, c: { app: 'editor', pin } }, active: 'b', pattern: 'bricks' },
    { greet: true }
  )
  assert.deepEqual(session.windows.a, { app: 'finder', pin })
  assert.equal(session.windows.b.z, 0)
  assert.deepEqual(session.windows.c, { app: 'editor', pin })
  assert.equal(session.active, 'b')
  assert.equal(session.pattern, 'bricks')
  assert.deepEqual(session.extra, { greet: true })
  assert.deepEqual(readSession(JSON.parse(JSON.stringify(session))), session, 'what it writes reads back')
})
