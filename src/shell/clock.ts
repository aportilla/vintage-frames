/**
 * The menu bar's clock: a label in the bar's `end` slot showing the time,
 * updated on the minute. A press shows the date for a few seconds; a second
 * press returns to the time early.
 */

/** How long a press shows the date, ms. */
export const DATE_HOLD_MS = 3000

const pad2 = (n: number) => String(n).padStart(2, '0')

/** "7:27 PM": 12-hour local time. */
export function formatTime(d: Date): string {
  const h = d.getHours()
  return `${h % 12 || 12}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}

/** "9/27/26": M/D/YY local date. */
export function formatDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${pad2(d.getFullYear() % 100)}`
}

/** Render the clock into `label` now and on every minute boundary. Returns the stop function. */
export function startClock(
  label: HTMLElement,
  { now = Date.now, holdMs = DATE_HOLD_MS }: { now?: () => number; holdMs?: number } = {}
): () => void {
  let showingDate = false
  let holdTimer = 0
  let tickTimer = 0

  const render = () => {
    const d = new Date(now())
    label.textContent = showingDate ? formatDate(d) : formatTime(d)
  }
  // Just past each minute boundary. The epoch remainder is local time's in
  // any whole-minute offset.
  const scheduleTick = () => {
    tickTimer = window.setTimeout(() => {
      render()
      scheduleTick()
    }, 60_000 - (now() % 60_000) + 20)
  }
  const showTime = () => {
    clearTimeout(holdTimer)
    holdTimer = 0
    showingDate = false
    render()
  }
  const onPress = (e: PointerEvent) => {
    if (e.button !== 0) return
    // No text selection from a drag across the bar, and the focus stays put.
    e.preventDefault()
    if (showingDate) {
      showTime()
      return
    }
    showingDate = true
    render()
    holdTimer = window.setTimeout(showTime, holdMs)
  }
  // A background tab throttles timers: catch up when it is shown again.
  const onVisibility = () => {
    if (!document.hidden) render()
  }

  render()
  scheduleTick()
  label.addEventListener('pointerdown', onPress)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    clearTimeout(tickTimer)
    clearTimeout(holdTimer)
    label.removeEventListener('pointerdown', onPress)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
