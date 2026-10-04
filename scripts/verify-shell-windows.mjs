/**
 * Verifies the shell's window manager on its reference page (shell.html):
 *
 *  - ICON: a window opens out of the icon it was opened from and closes back
 *    into it; the icon is drawn open until the closing rects land, and the
 *    closed window is removed.
 *  - CASCADE: each window opens on the first cascade slot no open window
 *    holds; a window closed this session reopens where it was.
 *  - WORK AREA: windows open, and are dragged, below the menu bar, or below
 *    the deeper top a site sets.
 *  - RESIZE: a raster resize re-pins every window and desktop icon, floors a
 *    resizable window at its size limits, and growing back restores every
 *    place exactly.
 *  - ZOOM: a window with a zoom box goes to its zoomed box and back, stays
 *    zoomed across a resize, and unzooms to where its pin puts it.
 *  - CLOSE: a document with unsaved changes asks before it closes, in Note
 *    Pad's own dialog; Cancel and Escape keep it, Don’t Save and Save close
 *    it, and Save files it. The dialog stays held, closed, for the next ask.
 *  - WINDOWS: each ctx.window() is a fresh copy of the application's markup.
 *  - CLOSE ALL: closeAll() asks each of an application's windows front to
 *    back and stops at a Cancel; an Option-click on a close box closes
 *    every window of its application.
 *  - RESTORE: a replace import keeps open the windows whose items it puts
 *    back, and closes the rest.
 *  - DISPOSE: disposing the shell takes an open held dialog down with its
 *    application, and every window with the window manager.
 *  - FOCUS: opening a window moves the focus into it; closing the active one
 *    moves it to the window that becomes active, else to the window's icon.
 *  - FOCUS INTO (a fixture): focusInto() passes over anything whose tabindex
 *    is negative, lands on a radio group's checked radio, and takes a
 *    control marked `autofocus` first.
 *  - FIRST RENDER (a fixture): a palette adopted in an application's init is
 *    placed against the work area below the menu bar.
 *  - SESSION: with saving on, a reload reopens the windows where they were,
 *    deepest first, the active one active; a new desktop pattern is saved
 *    on its own.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:shell-windows
 */
import { check, launch, openShell, report, shellFixture, shellOn } from './harness.mjs'

const browser = await launch()

/** Record every show({ from }) and hide({ to }) the windows are asked for. */
const spyZoom = (page) =>
  page.evaluate(() => {
    const proto = customElements.get('vf-window').prototype
    window.__zoom = []
    for (const op of ['show', 'hide']) {
      const original = proto[op]
      proto[op] = function (options = {}) {
        const box = options.from ?? options.to ?? null
        window.__zoom.push({ op, heading: this.heading, box: box && { left: box.left, top: box.top, right: box.right, bottom: box.bottom } })
        return original.call(this, options)
      }
    }
  })
const zoomLog = (page) => page.evaluate(() => window.__zoom)
/** An icon's cell box, viewport CSS px, by label. */
const cellOf = (page, name) =>
  page.evaluate((n) => {
    const r = [...document.querySelectorAll('vf-icon[data-id]')].find((i) => i.label === n).cellRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }, name)
const sameBox = (a, b) => !!a && !!b && ['left', 'top', 'right', 'bottom'].every((k) => Math.abs(a[k] - b[k]) < 0.01)
/** The centre of a window's close box. */
const closeBox = (page, heading) =>
  page.evaluate((h) => {
    const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === h)
    const r = win.shadowRoot.querySelector('[part=close-box]').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, heading)
/** Where the keyboard focus is: the window holding it and the innermost element. */
const focus = (page) =>
  page.evaluate(() => {
    let el = document.activeElement
    const win = el?.closest('vf-window')?.heading ?? null
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
    return { win, el: el?.localName ?? null, label: document.activeElement?.label ?? null }
  })
/** Resize the viewport and wait until the desktop's screen fills it, bezel aside. Resolves the screen's size. */
const resizeTo = async (page, width, height) => {
  await page.setViewportSize({ width, height })
  await page.waitForFunction(([w, h]) => {
    const d = document.querySelector('vf-desktop')
    return d.width === w - 2 * d.bezel && d.height === h - 2 * d.bezel
  }, [width, height])
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  return page.evaluate(() => {
    const d = document.querySelector('vf-desktop')
    return { width: d.width, height: d.height }
  })
}
/** Every window's box and every desktop icon's place. */
const layout = (page) =>
  page.evaluate(() => ({
    windows: Object.fromEntries(
      [...document.querySelectorAll('vf-desktop > vf-window')]
        .filter((w) => !w.hidden)
        .map((w) => [w.heading, [w.left, w.top, w.width, w.height]])
        .sort(([a], [b]) => a.localeCompare(b))
    ),
    icons: Object.fromEntries(
      [...document.querySelectorAll('vf-desktop > vf-icon-field > vf-icon')].map((i) => [i.label, [i.left, i.top]])
    ),
  }))

// ── ICON ────────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser, { reducedMotion: false })
  const s = shellOn(page)
  await spyZoom(page)
  const from = await cellOf(page, 'Documents')
  const docs = await s.icon('Documents')
  await page.mouse.dblclick(docs.x, docs.y)
  await page.waitForFunction(() => {
    const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === 'Documents')
    return win && !win.matches(':state(opening)')
  })
  let log = await zoomLog(page)
  check(
    'ICON  the window opens out of the icon’s cell',
    log.length === 1 && log[0].op === 'show' && log[0].heading === 'Documents' && sameBox(log[0].box, from),
    JSON.stringify(log)
  )
  check('ICON  …and the icon is drawn open while it is', (await s.iconState('Documents')).open)

  const box = await closeBox(page, 'Documents')
  await page.mouse.click(box.x, box.y)
  log = await zoomLog(page)
  const gone = await s.window('Documents')
  const held = (await s.iconState('Documents')).open
  check(
    'ICON  the close box closes it back into the icon',
    log.length === 2 && log[1].op === 'hide' && sameBox(log[1].box, from),
    JSON.stringify(log[1])
  )
  check('ICON  …and the closed window is removed', gone === null)
  await page.waitForFunction(() => {
    const icon = [...document.querySelectorAll('vf-icon[data-id]')].find((i) => i.label === 'Documents')
    return !icon.open
  })
  check('ICON  the icon stays drawn open until the rects land, then is drawn closed', held && !(await s.iconState('Documents')).open)

  // An application's own window closes into the application's icon.
  await s.pick('Apple', 'note-pad')
  await page.waitForFunction(() => {
    const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === 'Untitled')
    return win && !win.matches(':state(opening)')
  })
  check('ICON  an application’s icon is drawn open while it has a window', (await s.iconState('Note Pad')).open)
  const app = await cellOf(page, 'Note Pad')
  const untitled = await closeBox(page, 'Untitled')
  await page.mouse.click(untitled.x, untitled.y)
  log = await zoomLog(page)
  check(
    'ICON  …and its window closes into that icon',
    log[log.length - 1].op === 'hide' && sameBox(log[log.length - 1].box, app),
    JSON.stringify(log[log.length - 1])
  )
  await page.close()
}

// ── CASCADE, WORK AREA ──────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  const open = async (name) => {
    const at = await s.icon(name)
    await page.mouse.dblclick(at.x, at.y)
    await s.settle()
  }
  await open('Documents')
  await open('Projects')
  const a = await s.window('Documents')
  const b = await s.window('Projects')
  check(
    'CASCADE  the first window opens 40, 20 into the area below the bar; the next one step on',
    a.left === 40 && a.top === 40 && b.left === 64 && b.top === 64,
    `${a.left},${a.top} then ${b.left},${b.top}`
  )
  // Documents closes; Archive takes the slot it freed.
  await page.mouse.click((await s.titleBar('Documents')).x, (await s.titleBar('Documents')).y)
  await page.keyboard.press('Control+w')
  await s.settle()
  const archive = await s.onPlane('Projects', 16 + 32, 16 + 16)
  await page.mouse.dblclick(archive.x, archive.y)
  await s.settle()
  const c = await s.window('Archive')
  check('CASCADE  a slot a closed window freed is taken again', c?.left === 40 && c?.top === 40, JSON.stringify(c))

  // Moved, closed and opened again: where it was, not a cascade slot.
  const bar = await s.titleBar('Archive')
  await s.drag(bar, { x: bar.x + 200, y: bar.y + 150 })
  await s.settle()
  const moved = await s.window('Archive')
  await page.keyboard.press('Control+w')
  await s.settle()
  const archiveAgain = await s.onPlane('Projects', 16 + 32, 16 + 16)
  await page.mouse.dblclick(archiveAgain.x, archiveAgain.y)
  await s.settle()
  const back = await s.window('Archive')
  check(
    'CASCADE  a window closed this session opens where it was',
    moved.left === 240 && moved.top === 190 && back.left === moved.left && back.top === moved.top,
    `moved to ${moved.left},${moved.top}, reopened at ${back.left},${back.top}`
  )

  // A window dragged up stops below the bar.
  const up = await s.titleBar('Archive')
  await s.drag(up, { x: up.x, y: up.y - 400 })
  await s.settle()
  check('WORK AREA  a window dragged up stops below the menu bar', (await s.window('Archive')).top === 20, `${(await s.window('Archive')).top}`)

  // A deeper window area: opens and drags below it.
  await page.evaluate(() => {
    document.querySelector('vf-desktop').windowTop = 56
  })
  await page.keyboard.press('Control+w')
  await s.settle()
  await open('Documents')
  const deep = await s.window('Documents')
  const top = await s.titleBar('Documents')
  await s.drag(top, { x: top.x, y: top.y - 400 })
  await s.settle()
  const dragged = await s.window('Documents')
  check(
    'WORK AREA  with a deeper window area, windows open 20 below it and drag no higher',
    deep.top === 76 && dragged.top === 56,
    `opened at ${deep.top}, dragged to ${dragged.top}`
  )
  await page.close()
}

// ── RESIZE ──────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  for (const name of ['Documents', 'Projects']) {
    const at = await s.icon(name)
    await page.mouse.dblclick(at.x, at.y)
    await s.settle()
  }
  const home = await layout(page)
  const screen = await resizeTo(page, 640, 480)
  const small = await layout(page)
  // The Trash keeps its corner: 16 in from the right and bottom edges, its 64 cell inside them.
  check(
    'RESIZE  a smaller screen re-pins the windows and the desktop icons',
    JSON.stringify(small.windows) !== JSON.stringify(home.windows) &&
      small.icons.Trash[0] === screen.width - 80 && small.icons.Trash[1] === screen.height - 80,
    `${JSON.stringify(screen)} ${JSON.stringify(small)}`
  )
  await resizeTo(page, 260, 160)
  const tiny = await layout(page)
  const floored = Object.values(tiny.windows).every(([, , w, h]) => w >= 80 && h >= 54)
  check('RESIZE  a resizable window is floored at its size limits', floored, JSON.stringify(tiny.windows))
  await resizeTo(page, 1100, 760)
  const again = await layout(page)
  check(
    'RESIZE  growing back restores every window and icon exactly',
    JSON.stringify(again) === JSON.stringify(home),
    `${JSON.stringify(home)} → ${JSON.stringify(again)}`
  )
  await page.close()
}

// ── ZOOM ────────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  await s.pick('Apple', 'note-pad')
  await s.settle()
  const home = await s.window('Untitled')
  /** Note Pad's zoomed box on the live window area: its full height, at the window's left and width. */
  const zoomed = () =>
    page.evaluate(() => {
      const a = window.shell.windows.area
      const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === 'Untitled')
      return { left: win.left, top: a.top, width: win.width, height: a.height }
    })
  const zoomBox = await page.evaluate(() => {
    const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === 'Untitled')
    const r = win.shadowRoot.querySelector('[part=zoom-box]').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  const same = (w, b) => w.left === b.left && w.top === b.top && w.width === b.width && w.height === b.height
  await page.mouse.click(zoomBox.x, zoomBox.y)
  await s.settle()
  let at = await s.window('Untitled')
  let want = await zoomed()
  check('ZOOM  the zoom box takes a window to its zoomed box', same(at, want), `${JSON.stringify(at)} for ${JSON.stringify(want)}`)
  await page.evaluate(() => window.shell.windows.zoom(window.shell.windows.windowsOf('note-pad').find((w) => w.heading === 'Untitled')))
  at = await s.window('Untitled')
  check('ZOOM  …and back to the box it had', same(at, home), `${JSON.stringify(at)} for ${JSON.stringify(home)}`)

  const zoom = () => page.evaluate(() => window.shell.windows.zoom(window.shell.windows.windowsOf('note-pad').find((w) => w.heading === 'Untitled')))
  await zoom()
  await resizeTo(page, 800, 560)
  at = await s.window('Untitled')
  want = await zoomed()
  check('ZOOM  a zoomed window stays zoomed across a screen resize', same(at, want), `${JSON.stringify(at)} for ${JSON.stringify(want)}`)
  await zoom()
  at = await s.window('Untitled')
  // Its box is in the screen's top-left band, so the pin keeps it where it was.
  check('ZOOM  …and unzooms to where its pin puts it on the new screen', same(at, home), `${JSON.stringify(at)} for ${JSON.stringify(home)}`)
  await page.close()
}

// ── CLOSE ───────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  const alertText = () => page.evaluate(() => document.querySelector('vf-dialog[open] vf-paragraph')?.textContent ?? null)
  const answer = async (label) => {
    await page.waitForFunction(() => !!document.querySelector('vf-dialog[open] vf-button'))
    const at = await page.evaluate((l) => {
      const button = [...document.querySelectorAll('vf-dialog[open] vf-button')].find((b) => b.textContent === l)
      const r = button.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, label)
    await page.mouse.click(at.x, at.y)
    await page.waitForFunction(() => !document.querySelector('vf-dialog[open]'))
    await s.settle()
  }

  await s.pick('Apple', 'note-pad')
  await s.settle()
  await page.keyboard.type('Draft')
  let box = await closeBox(page, 'Untitled')
  await page.mouse.click(box.x, box.y)
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open]'))
  const asked = await alertText()
  check('CLOSE  a document with unsaved changes asks before it closes', asked === 'Save changes to “Untitled” before closing?', asked)
  check(
    'CLOSE  …in Note Pad’s own dialog, held by it',
    await page.evaluate(() => {
      const dialog = document.querySelector('vf-dialog[open]')
      return dialog?.dataset.dialog === 'save-changes' && window.shell.windows.appOf(dialog) === 'note-pad'
    })
  )
  await answer('Cancel')
  check('CLOSE  Cancel keeps it open', (await s.window('Untitled')) !== null)
  check(
    'CLOSE  …and the dialog stays held, closed',
    await page.evaluate(() => {
      const dialog = document.querySelector('vf-dialog[data-dialog="save-changes"]')
      return !!dialog && !dialog.open && window.shell.windows.dialogsOf('note-pad').includes(dialog)
    })
  )

  box = await closeBox(page, 'Untitled')
  await page.mouse.click(box.x, box.y)
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open]'))
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('vf-dialog[open]'))
  await s.settle()
  check('CLOSE  Escape keeps it open too', (await s.window('Untitled')) !== null)

  box = await closeBox(page, 'Untitled')
  await page.mouse.click(box.x, box.y)
  await answer('Don’t Save')
  check('CLOSE  Don’t Save closes it, and nothing is filed', (await s.window('Untitled')) === null && (await s.item('Untitled')) === null)

  // With its last window closed Note Pad is no longer front: the system menu, again.
  await s.pick('Apple', 'note-pad')
  await s.settle()
  await page.keyboard.type('Kept')
  await page.keyboard.press('Control+w')
  await answer('Save')
  const note = await s.item('Untitled 2')
  check(
    'CLOSE  Save files it on the desktop, then closes it',
    (await s.window('Untitled 2')) === null && note?.kind === 'note' && note?.parent === null && note?.data?.text === 'Kept',
    JSON.stringify(note)
  )
  check('CLOSE  …and its icon is on the desktop', (await s.iconState('Untitled 2'))?.in === null)
  await page.close()
}

// ── CLOSE ALL ───────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  const answer = async (label) => {
    await page.waitForFunction(() => !!document.querySelector('vf-dialog[open] vf-button'))
    const at = await page.evaluate((l) => {
      const r = [...document.querySelectorAll('vf-dialog[open] vf-button')].find((b) => b.textContent === l).getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, label)
    await page.mouse.click(at.x, at.y)
  }
  const docs = () => page.evaluate(() => window.shell.windows.windowsOf('note-pad').filter((w) => !window.shell.windows.isPalette(w)).length)
  await s.pick('Apple', 'note-pad')
  await s.settle()
  await s.pick('File', 'new')
  await s.settle()
  const copies = await page.evaluate(() => {
    const wins = [...document.querySelectorAll('vf-desktop > vf-window[data-window="document"]')]
    return wins.map((w) => `${w.heading}:${w.width}x${w.height}:${!!w.querySelector('vf-text-area')}`)
  })
  check(
    'WINDOWS  two opens make two windows from Note Pad’s markup, each its own copy',
    copies.join() === 'Untitled:260x140:true,Untitled 2:260x140:true',
    copies.join()
  )
  await page.keyboard.type('Draft')
  let closing = page.evaluate(() => window.shell.windows.closeAll('note-pad'))
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open]'))
  const asked = await page.evaluate(() => document.querySelector('vf-dialog[open] vf-paragraph')?.textContent)
  await answer('Cancel')
  const cancelled = await closing
  check(
    'CLOSE ALL  asks about the front document first; Cancel resolves false and every window stays',
    asked === 'Save changes to “Untitled 2” before closing?' && cancelled === false && (await docs()) === 2,
    `${asked} → ${cancelled}, ${await docs()} open`
  )
  closing = page.evaluate(() => window.shell.windows.closeAll('note-pad'))
  await answer('Don’t Save')
  const closed = await closing
  check('CLOSE ALL  …Don’t Save closes it and the rest, and resolves true', closed === true && (await docs()) === 0, `${closed}, ${await docs()} open`)

  for (const name of ['Documents', 'Projects']) {
    const at = await s.icon(name)
    await page.mouse.dblclick(at.x, at.y)
    await s.settle()
  }
  const box = await closeBox(page, 'Documents')
  await page.keyboard.down('Alt')
  await page.mouse.click(box.x, box.y)
  await page.keyboard.up('Alt')
  await s.settle()
  check(
    'CLOSE ALL  an Option-click on a folder window’s close box closes every folder window',
    (await s.window('Documents')) === null && (await s.window('Projects')) === null
  )
  await page.close()
}

// ── RESTORE ─────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  for (const name of ['Documents', 'Projects']) {
    const at = await s.icon(name)
    await page.mouse.dblclick(at.x, at.y)
    await s.settle()
  }
  const stored = await page.evaluate(async () => (await window.shell.catalog.import(window.shell.catalog.dump(), { mode: 'replace' })).size)
  await s.settle()
  check(
    'RESTORE  a replace import keeps open the windows whose items it puts back',
    stored > 0 && (await s.window('Documents')) !== null && (await s.window('Projects')) !== null,
    `${stored} stored`
  )
  await page.evaluate(() => {
    const { catalog } = window.shell
    return catalog.import({ items: catalog.dump().items.filter((i) => i.name !== 'Documents') }, { mode: 'replace' })
  })
  await s.settle()
  check(
    'RESTORE  …and closes one whose item the archive leaves out',
    (await s.window('Documents')) === null && (await s.window('Projects')) !== null
  )
  await page.close()
}

// ── DISPOSE ─────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  await s.pick('Apple', 'note-pad')
  await s.settle()
  await page.keyboard.type('Draft')
  const box = await closeBox(page, 'Untitled')
  await page.mouse.click(box.x, box.y)
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open]'))
  await page.evaluate(() => window.shell.dispose())
  await s.settle()
  const left = await page.evaluate(() => document.querySelectorAll('vf-dialog').length)
  check('DISPOSE  an open held dialog comes down with its application', left === 0 && errors.length === 0, `${left} dialogs, ${errors.join('; ')}`)
  const windows = await page.evaluate(() => document.querySelectorAll('vf-window').length)
  check('DISPOSE  …and every window the window manager held, palettes included', windows === 0, `${windows} windows`)
  check('DISPOSE  …its question unanswered: nothing was filed', (await s.item('Untitled')) === null)
  await page.close()
}

// ── FOCUS ───────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  await s.pick('Apple', 'note-pad')
  await s.settle()
  let f = await focus(page)
  check('FOCUS  opening a window moves the focus into it', f.win === 'Untitled' && f.el === 'textarea', JSON.stringify(f))
  const projects = await s.icon('Projects')
  await page.mouse.dblclick(projects.x, projects.y)
  await s.settle()
  f = await focus(page)
  check('FOCUS  …a folder window’s to its first icon', f.win === 'Projects' && f.label === 'Archive', JSON.stringify(f))
  await page.keyboard.press('Control+w')
  await s.settle()
  f = await focus(page)
  check('FOCUS  closing the active window moves it to the window that becomes active', f.win === 'Untitled' && f.el === 'textarea', JSON.stringify(f))
  await page.keyboard.press('Control+w')
  await s.settle()
  f = await focus(page)
  check('FOCUS  …and with none left, to the closed window’s icon', f.win === null && f.label === 'Note Pad', JSON.stringify(f))
  await page.close()
}

// ── FOCUS INTO ──────────────────────────────────────────────────────────────
{
  const page = await shellFixture(browser)
  /** focusInto() a window holding `body`; the id of the element the focus lands on. */
  const into = (body, autofocus = null) =>
    page.evaluate(
      async ([html, stated]) => {
        document.body.innerHTML = `<vf-desktop width="600" height="400"><vf-window heading="W" width="300" height="200">${html}</vf-window></vf-desktop>`
        // Stated after the insert, so the browser's own autofocus never runs.
        if (stated) document.getElementById(stated).setAttribute('autofocus', '')
        const moved = await window.vfShell.focusInto(document.querySelector('vf-window'))
        return { moved, at: document.activeElement?.id || null }
      },
      [body, autofocus]
    )
  const cells = ['c1', 'c2', 'c3']
    .map((id, i) => `<vf-container id="${id}" tabindex="${id === 'c3' ? 0 : -1}" left="${8 + 24 * i}" top="8" width="16" height="16"></vf-container>`)
    .join('')
  let f = await into(cells)
  check('FOCUS INTO  roving cells: the focus lands on the tab stop, not a cell parked at -1', f.moved && f.at === 'c3', JSON.stringify(f))
  f = await into('<vf-checkbox id="off" disabled left="8" top="8">Off</vf-checkbox><vf-button id="ok" left="8" top="40">OK</vf-button>')
  check('FOCUS INTO  …past a disabled control', f.moved && f.at === 'ok', JSON.stringify(f))
  f = await into(
    '<vf-radio-group label="Size" value="b" left="8" top="8"><vf-radio id="ra" value="a">A</vf-radio><vf-radio id="rb" value="b">B</vf-radio></vf-radio-group>'
  )
  check('FOCUS INTO  …onto a radio group’s checked radio', f.moved && f.at === 'rb', JSON.stringify(f))
  f = await into('<vf-button id="first" left="8" top="8">First</vf-button><vf-text-field id="named" label="Name" left="8" top="40"></vf-text-field>', 'named')
  check('FOCUS INTO  a control marked autofocus takes it first', f.moved && f.at === 'named', JSON.stringify(f))
  await page.close()
}

// ── FIRST RENDER ────────────────────────────────────────────────────────────
{
  const page = await shellFixture(browser)
  const at = await page.evaluate(async () => {
    document.body.innerHTML = '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
    const desktop = document.querySelector('vf-desktop')
    const { createShell, defineApp } = window.vfShell
    let palette
    const paint = defineApp({
      id: 'paint',
      name: 'Paint',
      init(ctx) {
        palette = document.createElement('vf-window')
        palette.variant = 'utility'
        palette.heading = 'Tools'
        palette.width = 60
        palette.height = 100
        ctx.desktop.append(palette)
        ctx.windows.adopt(palette, { app: 'paint', palette: true, place: (a) => ({ left: a.left + 8, top: a.top + 8 }) })
      },
    })
    const shell = createShell(desktop, { apps: [paint], defaultApp: 'paint', fit: 'viewport' })
    await shell.ready
    return { top: palette.top, areaTop: desktop.windowArea.top }
  })
  check(
    'FIRST RENDER  a palette adopted in init is placed below the menu bar, once the bar has rendered',
    at.areaTop > 0 && at.top === at.areaTop + 8,
    JSON.stringify(at)
  )
  await page.close()
}

// ── SESSION ─────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser, { query: '?save=1' })
  const s = shellOn(page)
  for (const name of ['Documents', 'Projects']) {
    const at = await s.icon(name)
    await page.mouse.dblclick(at.x, at.y)
    await s.settle()
  }
  const bar = await s.titleBar('Documents')
  await s.drag(bar, { x: bar.x + 120, y: bar.y + 300 })
  await s.settle()
  const before = await layout(page)
  // Leaving the page writes at once.
  await page.reload()
  await page.evaluate(() => window.shell.ready)
  await s.settle()
  const after = await layout(page)
  const order = await page.evaluate(() =>
    document.querySelector('vf-desktop').stackingOrder.filter((w) => !w.hidden).map((w) => w.heading)
  )
  check(
    'SESSION  a reload reopens the windows where they were',
    JSON.stringify(after.windows) === JSON.stringify(before.windows),
    `${JSON.stringify(before.windows)} → ${JSON.stringify(after.windows)}`
  )
  check(
    'SESSION  …deepest first, the active one active',
    order.join() === 'Projects,Documents' && (await s.active()) === 'Documents',
    `${order} active ${await s.active()}`
  )
  check('SESSION  …and the catalog kept its places', JSON.stringify(after.icons) === JSON.stringify(before.icons), JSON.stringify(after.icons))
  // No other change follows it, and the page stays: the pattern is written by itself.
  await page.evaluate(() => {
    document.querySelector('vf-desktop').pattern = 'bricks'
  })
  const saved = await page
    .waitForFunction(() => JSON.parse(localStorage.getItem('vf-shell-reference') ?? 'null')?.pattern === 'bricks', null, { timeout: 5000 })
    .then(() => true, () => false)
  check('SESSION  a new desktop pattern is saved on its own', saved)
  await page.close()
}

await report(browser)
