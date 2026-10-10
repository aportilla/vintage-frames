/**
 * Verifies the shell's front application on its reference page (shell.html):
 *
 *  - BAR: the bar holds the system menu, then the front application's menus,
 *    then the clock; its label is the front application's name. The menus
 *    are the same nodes each time an application comes back to the front.
 *  - PRESS: a press on the bare desktop or on a desktop icon brings the
 *    Finder forward.
 *  - SELECTION: selected icons stay selected through an application switch
 *    and back, so File → Open still has them. A title-bar press brings the
 *    keyboard focus along, out of the window it left.
 *  - KEYS: only the front application's key equivalents fire.
 *  - PALETTE: an application's palette shows only while it is front, and
 *    while the application has not hidden it.
 *  - GATES: a command is disabled while it has nothing to act on, and a
 *    rename's field keeps its own ⌘A.
 *  - DIALOGS: while an application's held dialog is open, the bar shows its
 *    name and menus, from a background application too, and nothing else
 *    changes: the front application, the active window, the palettes. With
 *    two open the bar follows the one opened last, then falls back as each
 *    closes. Key equivalents are dropped while one is open.
 *  - CLOCK: the time in the bar's end slot; a press shows the date.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:shell-front
 */
import { check, launch, openShell, report, shellOn } from './harness.mjs'

const browser = await launch()

/** The rows of a bar menu and whether each is enabled, read with the menu open, as a user sees them. */
const menuRows = async (s, menu) => {
  const title = await s.page.evaluate((m) => {
    const el = [...document.querySelectorAll('vf-menu-bar > vf-menu')].find((x) => x.label === m)
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, menu)
  await s.page.mouse.click(title.x, title.y)
  const rows = await s.page.evaluate((m) => {
    const el = [...document.querySelectorAll('vf-menu-bar > vf-menu')].find((x) => x.label === m)
    return Object.fromEntries(
      [...el.querySelectorAll('vf-menu-item')].map((i) => [i.getAttribute('value'), !i.disabled])
    )
  }, menu)
  await s.page.keyboard.press('Escape')
  return rows
}

/** Count the windows of an application, palettes aside. */
const windowsOf = (s, app) =>
  s.page.evaluate(
    (a) => window.shell.windows.windowsOf(a).filter((w) => !window.shell.windows.isPalette(w)).length,
    app
  )

// ── BAR, PRESS ──────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)

  let bar = await s.bar()
  check(
    'BAR  at boot the Finder is front: its name, then its menus after the system menu',
    (await s.front()) === 'finder' && bar.label === 'Finder' && bar.menus.join() === 'File,Edit,View,Special',
    JSON.stringify(bar)
  )
  await page.evaluate(() => {
    window.__finderFile = document.querySelector('vf-menu-bar > vf-menu[data-menu="file"]')
  })

  // Note Pad's way in from the system menu: a new document, active.
  await s.pick('Apple', 'Note Pad')
  await s.settle()
  bar = await s.bar()
  check(
    'BAR  an application’s window active puts its name and menus on the bar',
    (await s.front()) === 'note-pad' && bar.label === 'Note Pad' && bar.menus.join() === 'File,Window',
    `${await s.front()} ${JSON.stringify(bar)} active=${await s.active()}`
  )
  const slot = await page.evaluate(() => {
    const bar = document.querySelector('vf-menu-bar')
    const end = bar.querySelector(':scope > [slot="end"]')
    return { last: bar.lastElementChild === end, text: end?.textContent ?? '' }
  })
  check('BAR  …the clock stays in the bar’s end slot', slot.last && /\d:\d\d [AP]M$/.test(slot.text), JSON.stringify(slot))

  // A press on the bare desktop: the Finder again, with the same menus.
  await page.mouse.click(400, 400)
  await s.settle()
  bar = await s.bar()
  const same = await page.evaluate(
    () => document.querySelector('vf-menu-bar > vf-menu[data-menu="file"]') === window.__finderFile
  )
  check(
    'PRESS  a press on the bare desktop brings the Finder forward',
    (await s.front()) === 'finder' && bar.label === 'Finder' && (await s.active()) === null,
    `${await s.front()} ${JSON.stringify(bar)}`
  )
  check('BAR  …and its menus come back as the same nodes, state and all', same)

  // A press on a desktop icon does the same.
  await page.mouse.click((await s.titleBar('Untitled')).x, (await s.titleBar('Untitled')).y)
  await s.settle()
  const wasFront = await s.front()
  const docs = await s.icon('Documents')
  await page.mouse.click(docs.x, docs.y)
  await s.settle()
  check(
    'PRESS  a press on a desktop icon brings the Finder forward too',
    wasFront === 'note-pad' && (await s.front()) === 'finder' && (await s.active()) === null,
    `before ${wasFront}, after ${await s.front()}`
  )
  check('PRESS  …and selects the icon', (await s.iconState('Documents')).selected)
  await page.close()
}

// ── SELECTION, KEYS ─────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)

  // A folder window of the Finder's, then a selection on the desktop.
  const projects = await s.icon('Projects')
  await page.mouse.dblclick(projects.x, projects.y)
  await s.settle()
  const docs = await s.icon('Documents')
  await page.mouse.click(docs.x, docs.y)
  await s.settle()

  await s.pick('Apple', 'Note Pad')
  await s.settle()
  check(
    'SELECTION  the icon stays selected while another application is front',
    (await s.front()) === 'note-pad' && (await s.iconState('Documents')).selected,
    `front ${await s.front()}, ${JSON.stringify(await s.iconState('Documents'))}`
  )

  // ⌘O is the Finder's; with Note Pad front it opens nothing.
  await page.keyboard.press('Meta+o')
  await s.settle()
  check('KEYS  a background application’s key equivalent does not fire', (await s.window('Documents')) === null)
  // ⌃N is Note Pad's, and Note Pad is front.
  await page.keyboard.press('Control+n')
  await s.settle()
  check('KEYS  the front application’s does', (await windowsOf(s, 'note-pad')) === 2, `${await windowsOf(s, 'note-pad')} windows`)

  // Back to the Finder through its folder window's title bar.
  const bar = await s.titleBar('Projects')
  await page.mouse.click(bar.x, bar.y)
  await s.settle()
  check(
    'SELECTION  …and when the Finder comes back',
    (await s.front()) === 'finder' && (await s.iconState('Documents')).selected,
    `front ${await s.front()}`
  )
  const focus = await page.evaluate(() => document.activeElement?.closest('vf-window')?.heading ?? null)
  check('FOCUS  the title-bar press brought the keyboard focus out of Note Pad’s window', focus === 'Projects', `focus in ${focus}`)
  await page.keyboard.press('Control+n')
  await s.settle()
  check('KEYS  Note Pad’s ⌃N is off the bar now', (await windowsOf(s, 'note-pad')) === 2)
  await s.pick('File', 'open')
  await s.settle()
  const opened = await s.window('Documents')
  check('SELECTION  File → Open opens the selection that survived the switches', opened !== null && opened.active)
  await page.close()
}

// ── PALETTE ─────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  const info = async () => (await s.window('Info'))?.hidden
  check('PALETTE  hidden while the Finder is front', (await info()) === true)
  await s.pick('Apple', 'Note Pad')
  await s.settle()
  const shown = await s.window('Info')
  check('PALETTE  shown while its application is front', shown.hidden === false)
  check('PALETTE  …drawn active, beside the active document window', shown.active === true && (await s.active()) === 'Untitled')
  await page.mouse.click(400, 400)
  await s.settle()
  check('PALETTE  hidden again when the Finder comes forward, and not closed', (await info()) === true)

  const untitled = await s.titleBar('Untitled')
  await page.mouse.click(untitled.x, untitled.y)
  await s.settle()
  await s.pick('Window', 'info')
  await s.settle()
  const label = await page.evaluate(
    () => document.querySelector('vf-menu-bar vf-menu-item[value="info"]').textContent
  )
  check('PALETTE  the application can hide it while it is front', (await info()) === true, `item reads “${label}”`)
  await s.pick('Window', 'info')
  await s.settle()
  check('PALETTE  …and show it again', (await info()) === false)
  await page.close()
}

// ── GATES ───────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)

  let file = await menuRows(s, 'File')
  let special = await menuRows(s, 'Special')
  check(
    'GATES  nothing selected: Open off; no folder window: Close off; New Folder on',
    file.open === false && file.close === false && file['new-folder'] === true,
    JSON.stringify(file)
  )
  check('GATES  the Trash empty: Empty Trash off; Clean Up always on', special['empty-trash'] === false && special['clean-up'] === true, JSON.stringify(special))

  const docs = await s.icon('Documents')
  await page.mouse.dblclick(docs.x, docs.y)
  await s.settle()
  file = await menuRows(s, 'File')
  const edit = await menuRows(s, 'Edit')
  check(
    'GATES  a selection and a folder window: Open, Copy and Close on',
    file.open === true && file.close === true && edit.copy === true,
    JSON.stringify({ file, edit })
  )

  // The rename field keeps its own ⌘A: the Finder's Select All is off while it has focus.
  await page.mouse.click(400, 400)
  const projects = await s.icon('Projects')
  await page.mouse.click(projects.x, projects.y)
  await page.keyboard.press('Enter')
  await s.settle()
  const editing = await page.evaluate(() => {
    const icon = [...document.querySelectorAll('vf-icon[data-id]')].find((i) => i.label === 'Projects')
    return !!icon.shadowRoot.querySelector('input')
  })
  await page.keyboard.press('Meta+a')
  await s.settle()
  const lit = await page.evaluate(() =>
    [...document.querySelectorAll('vf-icon[data-id]')].filter((i) => i.selected).map((i) => i.label)
  )
  check(
    'GATES  ⌘A in a rename field selects its text, not every icon',
    editing && lit.join() === 'Projects',
    `editing ${editing}, selected [${lit}]`
  )
  await page.keyboard.press('Escape')

  // Typed before the menu is opened: a press on a menu title takes the focus.
  await s.pick('Apple', 'Note Pad')
  await s.settle()
  check('GATES  Note Pad’s Save is off with nothing to save', (await s.enabled('File', 'save')) === false)
  await page.keyboard.type('Hello')
  const notes = await menuRows(s, 'File')
  check('GATES  …and on once there is', notes.save === true, JSON.stringify(notes))
  await page.close()
}

// ── DIALOGS ─────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  await s.pick('Apple', 'Note Pad')
  await s.settle()
  /** Make a dialog, hold it under `app` and open it. */
  const ask = (app, name) =>
    page.evaluate(
      async ([a, n]) => {
        const dialog = document.createElement('vf-dialog')
        dialog.id = n
        dialog.frame = 'plain'
        dialog.label = n
        dialog.width = 240
        dialog.height = 80
        dialog.innerHTML = '<vf-button variant="default">OK</vf-button>'
        window.shell.windows.holdDialog(dialog, { app: a })
        await dialog.updateComplete
        dialog.show()
      },
      [app, name]
    )
  const close = (name) => page.evaluate((n) => document.getElementById(n).close(), name)
  const state = async () => ({
    ...(await s.bar()),
    front: await s.front(),
    asking: await page.evaluate(() => window.shell.windows.asking),
    active: await s.active(),
    info: (await s.window('Info')).hidden === false,
  })
  await page.evaluate(() => {
    window.__fronts = []
    window.shell.windows.onFront((app) => window.__fronts.push(app))
  })

  // The Finder asks while Note Pad is front.
  await ask('finder', 'finder-asks')
  await s.settle()
  let st = await state()
  check(
    'DIALOGS  a background application’s open dialog puts its name and menus on the bar',
    st.label === 'Finder' && st.menus.join() === 'File,Edit,View,Special' && st.asking === 'finder',
    JSON.stringify(st)
  )
  check(
    'DIALOGS  …and nothing else changes: the front application, the active window, the palette',
    st.front === 'note-pad' && st.active === 'Untitled' && st.info && (await page.evaluate(() => window.__fronts.length)) === 0,
    `${JSON.stringify(st)} fronts ${await page.evaluate(() => window.__fronts)}`
  )

  // Note Pad asks over it, then each closes.
  await ask('note-pad', 'note-pad-asks')
  await s.settle()
  st = await state()
  check('DIALOGS  a second dialog over it: the bar follows the one opened last', st.label === 'Note Pad' && st.asking === 'note-pad', JSON.stringify(st))
  const windows = () => page.evaluate(() => window.shell.windows.windowsOf('note-pad').filter((w) => !window.shell.windows.isPalette(w)).length)
  await page.keyboard.press('Control+n')
  await s.settle()
  check('DIALOGS  key equivalents are dropped while one is open', (await windows()) === 1, `${await windows()} windows`)
  await close('note-pad-asks')
  await s.settle()
  st = await state()
  check('DIALOGS  as it closes, the bar goes back to the one still open', st.label === 'Finder' && st.asking === 'finder', JSON.stringify(st))
  await close('finder-asks')
  await s.settle()
  st = await state()
  check(
    'DIALOGS  …then to the front application',
    st.label === 'Note Pad' && st.menus.join() === 'File,Window' && st.asking === null && st.front === 'note-pad',
    JSON.stringify(st)
  )
  await page.close()
}

// ── CLOCK ───────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const clock = () => page.evaluate(() => document.querySelector('vf-menu-bar > [slot="end"]').textContent)
  const time = await clock()
  const box = await page.evaluate(() => {
    const r = document.querySelector('vf-menu-bar > [slot="end"]').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.click(box.x, box.y)
  const date = await clock()
  await page.mouse.click(box.x, box.y)
  const back = await clock()
  check(
    'CLOCK  the time; a press shows the date, a second the time again',
    /^\d{1,2}:\d\d [AP]M$/.test(time) && /^\d{1,2}\/\d{1,2}\/\d\d$/.test(date) && /^\d{1,2}:\d\d [AP]M$/.test(back),
    `${time} → ${date} → ${back}`
  )
  await page.close()
}

await report(browser)
