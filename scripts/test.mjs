/**
 * The suite runner — `npm test`.
 *
 * The kit's tests are the `verify:*` scripts: Playwright drivers that assert
 * rendered pixels and computed accessibility trees in a real browser, against
 * the real module graph. They are the right shape for a library whose whole
 * claim is about pixels (jsdom can resolve none of it, and an in-page runner
 * can't produce the trusted input `:focus-visible` needs) — what they lacked
 * was a way to run them all and a single answer to "is it green".
 *
 * This runs every `verify:*` script in package.json, in parallel, and reports
 * one table. It drives them through `npm run` rather than by importing the
 * files, so the two with a compile step (`verify:buttons`, `verify:zoom`) keep
 * it, and so a script's own name stays the way you run it by hand.
 *
 * The dev server is the runner's job. Most scripts need one on 5173 and every
 * one of them used to assume you had started it yourself; this starts it,
 * waits for it, and stops it. A server already listening is left alone — it's
 * yours, and killing a dev server someone is working in is not a test
 * runner's business.
 *
 *   npm test                  # everything
 *   npm test -- focus button  # only scripts whose name matches
 *   npm test -- --workers=2   # narrow the parallelism (default: cores/2, max 6)
 *   npm test -- --bail        # stop after the first failing script
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = process.env.VF_ORIGIN ?? 'http://localhost:5173/'
/** A whole browser per script, so one slow suite can't stall the rest. */
const DEFAULT_WORKERS = Math.max(1, Math.min(6, Math.floor(cpus().length / 2)))
/** Generous: verify:grid and verify:snap each drive three device densities. */
const TIMEOUT_MS = Number(process.env.VF_TEST_TIMEOUT ?? 10 * 60 * 1000)

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const workers = Number(flag('workers', DEFAULT_WORKERS))
const bail = argv.includes('--bail')
const filters = argv.filter((a) => !a.startsWith('--'))

// ── the suite is whatever package.json calls verify:* ──────────────────────
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const all = Object.keys(pkg.scripts).filter((s) => s.startsWith('verify:')).sort()
const suite = filters.length
  ? all.filter((s) => filters.some((f) => s.includes(f)))
  : all

if (!suite.length) {
  console.error(
    `No verify script matches ${filters.map((f) => JSON.stringify(f)).join(', ')}.\n` +
      `Available: ${all.map((s) => s.replace('verify:', '')).join(', ')}`
  )
  process.exit(1)
}

// ── the dev server, if nobody else is already running one ──────────────────
const serverUp = async () => {
  try {
    const res = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

let server = null
async function startServer() {
  if (await serverUp()) {
    console.log(`• reusing the dev server already on ${ORIGIN}\n`)
    return
  }
  // --port/--strictPort, not a bare `npm run dev`: Vite silently moves to the
  // next free port when its default is taken, and a runner polling the origin
  // it was told about would then wait out the timeout against a server that
  // did start, one port over.
  const port = new URL(ORIGIN).port || '5173'
  console.log(`• starting the dev server on :${port}…`)
  server = spawn('npm', ['run', '--silent', 'dev', '--', '--port', port, '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  })
  server.on('error', (error) => {
    console.error(`could not start the dev server: ${error.message}`)
    process.exit(1)
  })
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (await serverUp()) {
      console.log(`• dev server up on ${ORIGIN}\n`)
      return
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  console.error(`the dev server never answered on ${ORIGIN}`)
  stopServer()
  process.exit(1)
}
function stopServer() {
  if (!server) return
  server.kill('SIGTERM')
  server = null
}
// A killed runner must not leave a server behind.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopServer()
    process.exit(130)
  })
}
process.on('exit', stopServer)

// ── running one script ─────────────────────────────────────────────────────
/**
 * The tally a script prints for itself. Most end with "N/M checks passed";
 * the three page-level ones (blog, grid, snap) report per-line instead, so
 * their `ok`/`FAIL` lines are counted directly. Either way the exit code is
 * what decides pass or fail — this is for the summary column only.
 */
function tally(output) {
  const summary = output.match(/(\d+)\/(\d+) checks passed/)
  if (summary) return { passed: Number(summary[1]), total: Number(summary[2]) }
  const lines = output.split('\n')
  const passed = lines.filter((l) => /^\s*(ok|PASS)\b/.test(l)).length
  const failed = lines.filter((l) => /^\s*(FAIL|not ok|✗)\b/.test(l)).length
  return passed + failed ? { passed, total: passed + failed } : null
}

function run(name) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn('npm', ['run', '--silent', name], {
      cwd: ROOT,
      env: { ...process.env, VF_ORIGIN: ORIGIN, FORCE_COLOR: '0' },
    })
    let output = ''
    child.stdout.on('data', (d) => (output += d))
    child.stderr.on('data', (d) => (output += d))
    const timer = setTimeout(() => {
      output += `\n[runner] timed out after ${TIMEOUT_MS / 1000}s`
      child.kill('SIGKILL')
    }, TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(timer)
      // A script may exit 0 having deliberately checked nothing — verify:buttons
      // needs the reference sheet, which is local design material a clean
      // checkout does not carry. It says so with a SKIP line, and that gets its
      // own column rather than being counted as a pass.
      const skipped = code === 0 && /^SKIP: /m.test(output)
      resolve({
        name,
        ok: code === 0,
        skipped,
        skipReason: skipped ? output.match(/^SKIP: (.*)$/m)[1] : null,
        code,
        output,
        ms: Date.now() - started,
        counts: skipped ? null : tally(output),
      })
    })
  })
}

/** A worker pool: `workers` scripts in flight, next one starts as a slot frees. */
async function runAll(names) {
  const queue = [...names]
  const done = []
  let stopped = false
  const worker = async () => {
    while (queue.length && !stopped) {
      const name = queue.shift()
      const result = await run(name)
      done.push(result)
      const label = result.skipped ? 'SKIP' : result.ok ? 'ok  ' : 'FAIL'
      const count = result.counts
        ? ` ${result.counts.passed}/${result.counts.total}`
        : result.skipped
          ? ` — ${result.skipReason}`
          : ''
      console.log(
        `${label} ${result.name.replace('verify:', '').padEnd(18)}` +
          `${String((result.ms / 1000).toFixed(1) + 's').padStart(7)}${count}`
      )
      if (!result.ok && bail) stopped = true
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, names.length) }, worker))
  return done
}

// ── go ─────────────────────────────────────────────────────────────────────
await startServer()
console.log(`• ${suite.length} script${suite.length === 1 ? '' : 's'}, ${workers} at a time\n`)

const results = await runAll(suite)
stopServer()

results.sort((a, b) => a.name.localeCompare(b.name))
const failures = results.filter((r) => !r.ok)

for (const failure of failures) {
  console.log(`\n${'─'.repeat(72)}\n${failure.name} — exit ${failure.code}\n${'─'.repeat(72)}`)
  // The tail is where the tally and the failing checks are; the headers above
  // it are prose.
  const lines = failure.output.split('\n')
  console.log(lines.slice(Math.max(0, lines.length - 40)).join('\n').trimEnd())
}

const checks = results.reduce(
  (sum, r) => ({
    passed: sum.passed + (r.counts?.passed ?? 0),
    total: sum.total + (r.counts?.total ?? 0),
  }),
  { passed: 0, total: 0 }
)
const skips = results.filter((r) => r.skipped)
const notRun = suite.length - results.length

console.log(
  `\n${results.length - failures.length - skips.length}/${results.length} scripts passed` +
    (checks.total ? `, ${checks.passed}/${checks.total} checks` : '') +
    (skips.length ? `, ${skips.length} skipped` : '') +
    (notRun ? `, ${notRun} not run (--bail)` : '')
)
if (skips.length) {
  console.log(
    `skipped: ${skips.map((s) => s.name.replace('verify:', '')).join(', ')} ` +
      `— asserted nothing, so this run does not cover ${
        skips.length === 1 ? 'it' : 'them'
      }`
  )
}
if (failures.length) {
  console.log(`failing: ${failures.map((f) => f.name.replace('verify:', '')).join(', ')}`)
}
process.exit(failures.length ? 1 : 0)
