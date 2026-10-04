/**
 * Verifies the shell's Finder on its reference page (shell.html):
 *
 *  - SEED: the page's markup becomes the catalog: its application icon, its
 *    folders and the folder inside one, in order, and the markup leaves the
 *    field.
 *  - FILING: a drop onto a folder icon files into the folder, whose icon
 *    wears `target` under the pointer; a drop into a folder window lands at
 *    the drop point, and a drop out of one lands on the desktop. A folder
 *    never goes into itself or a folder inside it.
 *  - NEW FOLDER: File → New Folder makes an untitled folder in the active
 *    window, or on the desktop, with its rename box open; the rename goes
 *    to the catalog, and a name too long is answered with an alert.
 *  - CLEAN UP: every icon onto its lattice, the desktop's or a window's; and,
 *    when the site turns it on, once a resize settles with icons overlapping.
 *  - GHOST: an icon is drawn open while its window is.
 *  - TRASH: a full Trash wears the full art and its window the trash mark;
 *    Empty Trash asks, in an alert the Finder holds while it is up, then
 *    removes.
 *  - ALERTS: a site's `alertWith` answers one of the Finder's alerts in its
 *    place, with the alert's details, and the Finder acts on its answer.
 *  - COPY: Copy then Paste makes copies, a folder with what it holds, and
 *    selects them; Select All selects the active container's icons.
 *  - DROP: a file dropped on the desktop brings the Finder forward, and a
 *    kind that claims it files it there.
 *  - ALERT: a Finder alert grows to its message, every line above its
 *    buttons.
 *  - FIRST RENDER (a fixture): a shell started before the desktop's first
 *    render places the icons below the menu bar, storage or none, and its
 *    seed reads the work area below it. STORAGE: without storage,
 *    `storageReady()` raises Storage Unavailable.
 *
 *   npm run dev        # in another shell (port 5173)
 *   npm run verify:shell-finder
 */
import { check, launch, openShell, report, SHELL_ART, shellFixture, shellOn } from './harness.mjs'

const browser = await launch()

/** Where `name`'s icon sits on the screen, and where a press on its art lands relative to its origin. */
const grip = (page, name) =>
  page.evaluate((n) => {
    const icon = [...document.querySelectorAll('vf-icon[data-id]')].find((i) => i.label === n)
    const r = icon.getBoundingClientRect()
    const f = icon.shadowRoot.querySelector('.frame').getBoundingClientRect()
    return { x: f.x + f.width / 2, y: f.y + f.height / 2, dx: f.x + f.width / 2 - r.x, dy: f.y + f.height / 2 - r.y }
  }, name)
/** Press on `name`'s art and travel to `to`; `hold` keeps the button down. */
const carry = async (s, name, to, { hold = false } = {}) => {
  const g = await grip(s.page, name)
  await s.page.mouse.move(g.x, g.y)
  await s.page.mouse.down()
  await s.page.mouse.move(to.x, to.y, { steps: 8 })
  if (!hold) await s.page.mouse.up()
  return g
}
const openIcon = async (s, name) => {
  const at = await s.icon(name)
  await s.page.mouse.dblclick(at.x, at.y)
  await s.settle()
}
/** The Finder's icons in a container (null: the desktop), by label, with their places. */
const iconsIn = (page, heading) =>
  page.evaluate((h) => {
    const field = h == null
      ? document.querySelector('vf-desktop > vf-icon-field')
      : [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === h)?.querySelector(':scope > vf-icon-field')
    return [...(field?.querySelectorAll(':scope > vf-icon[data-id]') ?? [])].map((i) => ({ label: i.label, left: i.left, top: i.top }))
  }, heading)
const answer = async (s, label) => {
  await s.page.waitForFunction(() => !!document.querySelector('vf-dialog[open] vf-button'))
  const at = await s.page.evaluate((l) => {
    const b = [...document.querySelectorAll('vf-dialog[open] vf-button')].find((x) => x.textContent === l)
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, label)
  await s.page.mouse.click(at.x, at.y)
  await s.page.waitForFunction(() => !document.querySelector('vf-dialog[open]'))
  await s.settle()
}
const overlapping = (icons) =>
  icons.some((a, i) => icons.some((b, j) => j > i && Math.abs(a.left - b.left) < 64 && Math.abs(a.top - b.top) < 64))

// ── SEED, FILING ────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  const items = await page.evaluate(() => {
    const st = window.shell.catalog.get()
    const name = (id) => st.items.find((i) => i.id === id)?.name ?? null
    return st.items.map((i) => `${i.kind}:${i.name}<${name(i.parent) ?? 'desktop'}`)
  })
  check(
    'SEED  the markup becomes the catalog, in order: the application named by its application',
    items.join() === 'trash:Trash<desktop,app:Note Pad<desktop,folder:Documents<desktop,folder:Projects<desktop,folder:Archive<Projects',
    items.join()
  )
  check(
    'SEED  …and the declarations leave the field',
    await page.evaluate(() => !document.querySelector('vf-icon-field > template, vf-icon-field > vf-icon[data-app]'))
  )

  // Onto a folder icon: Note Pad's icon into Documents.
  const docs = await s.icon('Documents')
  await carry(s, 'Note Pad', docs, { hold: true })
  const target = (await s.iconState('Documents')).target
  await page.mouse.up()
  await s.settle()
  const docsId = (await s.item('Documents')).id
  check('FILING  the folder under the pointer wears target', target)
  check(
    'FILING  a drop onto a folder icon files into it',
    (await s.item('Note Pad')).parent === docsId && (await s.iconState('Note Pad')) === null && !(await s.iconState('Documents')).target,
    JSON.stringify(await s.item('Note Pad'))
  )
  await openIcon(s, 'Documents')
  const inside = await iconsIn(page, 'Documents')
  check('FILING  …at the folder’s first free cell', JSON.stringify(inside) === '[{"label":"Note Pad","left":16,"top":16}]', JSON.stringify(inside))

  // Into a folder window, at the drop point: Projects into Documents' window.
  const drop = await s.onPlane('Documents', 200, 120)
  const g = await carry(s, 'Projects', drop)
  await s.settle()
  const projects = await s.item('Projects')
  const want = { left: Math.round(200 - g.dx), top: Math.round(120 - g.dy) }
  check(
    'FILING  a drop into a folder window lands at the drop point',
    projects.parent === docsId && Math.abs(projects.left - want.left) <= 1 && Math.abs(projects.top - want.top) <= 1,
    `${projects.left},${projects.top} for ${want.left},${want.top}`
  )
  check('FILING  …and its icon is there', (await s.iconState('Projects'))?.in === 'Documents')

  // Never into itself: Documents (on the desktop) into its own window, and onto Projects inside it.
  const own = await s.onPlane('Documents', 120, 120)
  await carry(s, 'Documents', own)
  await s.settle()
  const self = await s.item('Documents')
  const projectsAt = await s.icon('Projects')
  await carry(s, 'Documents', projectsAt, { hold: true })
  const lit = (await s.iconState('Projects')).target
  await page.mouse.up()
  await s.settle()
  const still = await s.item('Documents')
  check(
    'FILING  a folder never goes into its own window, nor into a folder inside it',
    self.parent === null && still.parent === null && (await s.iconState('Documents')).in === null && !lit,
    `${JSON.stringify(self.parent)} ${JSON.stringify(still.parent)} target ${lit}`
  )

  // Back out onto the desktop, at the drop point, measured on the screen.
  await carry(s, 'Projects', { x: 500, y: 400 })
  await s.settle()
  const out = await s.item('Projects')
  const g2 = await grip(page, 'Projects')
  const scr = await s.screen()
  check(
    'FILING  a drop out of a window lands on the desktop at the drop point',
    out.parent === null && Math.abs(out.left + g2.dx - (500 - scr.x)) <= 1 && Math.abs(out.top + g2.dy - (400 - scr.y)) <= 1,
    `${out.left},${out.top}`
  )
  await page.close()
}

// ── NEW FOLDER ──────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  await s.pick('File', 'new-folder')
  await page.waitForFunction(() =>
    [...document.querySelectorAll('vf-icon[data-id]')].some((i) => i.label === 'untitled folder' && i.shadowRoot.querySelector('input'))
  )
  const made = await s.item('untitled folder')
  const icon = await s.iconState('untitled folder')
  // The first column, 16 in from the screen's right edge: below Note Pad, Documents and Projects.
  const column = (await s.screen()).width - 80
  check(
    'NEW FOLDER  an untitled folder on the desktop, at the next free cell, its rename box open',
    made?.parent === null && icon.left === column && icon.top === 252 && icon.selected,
    JSON.stringify(icon)
  )
  await page.keyboard.type('Letters')
  await page.keyboard.press('Enter')
  await s.settle()
  check('NEW FOLDER  the rename goes to the catalog', (await s.item('Letters'))?.id === made.id)

  await openIcon(s, 'Projects')
  await s.pick('File', 'new-folder')
  await page.keyboard.press('Escape')
  await s.pick('File', 'new-folder')
  await page.keyboard.press('Escape')
  await s.settle()
  const projectsId = (await s.item('Projects')).id
  const names = await page.evaluate(
    (p) => window.shell.catalog.get().items.filter((i) => i.parent === p).map((i) => i.name),
    projectsId
  )
  check('NEW FOLDER  in the active folder window, counted up', names.join() === 'Archive,untitled folder,untitled folder 2', names.join())

  // A name past the limit: the field refuses it, and an alert says why.
  const letters = await s.icon('Letters')
  await page.mouse.click(letters.x, letters.y)
  await page.keyboard.press('Enter')
  await page.keyboard.type('x'.repeat(40))
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open]'))
  const text = await page.evaluate(() => document.querySelector('vf-dialog[open] vf-paragraph')?.textContent)
  check('NEW FOLDER  a name too long is answered with an alert', /too long.*31 characters/.test(text ?? ''), text)
  await answer(s, 'OK')
  await page.close()
}

// ── CLEAN UP, GHOST ─────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  await carry(s, 'Documents', { x: 700, y: 300 })
  await carry(s, 'Note Pad', { x: 300, y: 500 })
  await s.settle()
  await s.pick('Special', 'clean-up')
  // The desktop's lattice: columns 80 apart from 16 in at the right, rows 72 apart from 16 below the bar.
  await page.waitForFunction(() => {
    const d = document.querySelector('vf-desktop')
    const icons = [...d.querySelectorAll(':scope > vf-icon-field > vf-icon')]
    return icons.every((i) => (d.width - 80 - i.left) % 80 === 0 && (i.top - 36) % 72 === 0)
  })
  const desk = await iconsIn(page, null)
  const saved = await page.evaluate(() =>
    window.shell.catalog
      .get()
      .items.filter((i) => i.parent === null)
      .map((i) => ({ label: i.name, left: i.left, top: i.top }))
  )
  check('CLEAN UP  every desktop icon on its own lattice cell', !overlapping(desk), JSON.stringify(desk))
  check(
    'CLEAN UP  …and the places go onto the items',
    desk.every((d) => saved.some((x) => x.label === d.label && x.left === d.left && x.top === d.top)),
    JSON.stringify(saved)
  )

  await openIcon(s, 'Projects')
  check('GHOST  the folder’s icon is drawn open while its window is', (await s.iconState('Projects')).open)
  const archive = await s.onPlane('Projects', 48, 32)
  await carry(s, 'Archive', { x: archive.x + 130, y: archive.y + 50 })
  await s.settle()
  const label = await page.evaluate(
    () => [...document.querySelectorAll('vf-menu-bar vf-menu-item')].find((i) => i.getAttribute('value') === 'clean-up')?.textContent
  )
  const off = await s.iconState('Archive')
  await s.pick('Special', 'clean-up')
  // Onto the cell nearest where it was: the folder's lattice, 16 in, 80 by 72.
  await page.waitForFunction(() => {
    const icon = [...document.querySelectorAll('vf-icon[data-id]')].find((i) => i.label === 'Archive')
    return (icon.left - 16) % 80 === 0 && (icon.top - 16) % 72 === 0
  })
  const on = await s.iconState('Archive')
  check(
    'CLEAN UP  Clean Up Window tidies the active folder window',
    label === 'Clean Up Window' && Math.abs(on.left - off.left) < 80 && Math.abs(on.top - off.top) < 72,
    `${label}: ${off.left},${off.top} → ${on.left},${on.top}`
  )
  await page.keyboard.press('Control+w')
  await s.settle()
  check('GHOST  …and drawn closed once it closes', !(await s.iconState('Projects')).open)
  await page.close()
}

{
  const page = await openShell(browser, { query: '?cleanup=1' })
  const s = shellOn(page)
  await page.setViewportSize({ width: 1100, height: 300 })
  await page.waitForFunction(() => {
    const d = document.querySelector('vf-desktop')
    const icons = [...d.querySelectorAll(':scope > vf-icon-field > vf-icon')]
    return (
      d.height === 300 - 2 * d.bezel &&
      icons.every((a, i) => icons.every((b, j) => j <= i || Math.abs(a.left - b.left) >= 64 || Math.abs(a.top - b.top) >= 64))
    )
  })
  const desk = await iconsIn(page, null)
  const column = (await s.screen()).width - 80
  check(
    'CLEAN UP  with the option on, a resize that crowds the icons is cleaned up once it settles',
    !overlapping(desk) && desk.every((i) => (column - i.left) % 80 === 0 && (i.top - 36) % 72 === 0),
    JSON.stringify(desk)
  )
  await page.close()
}

// ── TRASH ───────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  const empty = (await s.iconState('Trash')).art
  await carry(s, 'Projects', await s.icon('Trash'))
  await s.settle()
  const full = (await s.iconState('Trash')).art
  check('TRASH  a folder filed into the Trash fills it', /\/trash\.png$/.test(empty) && /\/trash-full\.png$/.test(full), `${empty} → ${full}`)
  await openIcon(s, 'Trash')
  const header = await page.evaluate(() => {
    const win = [...document.querySelectorAll('vf-desktop > vf-window')].find((w) => w.heading === 'Trash')
    return {
      count: win.querySelector('[data-count]')?.textContent,
      mark: !!win.querySelector('[slot="header"] > vf-img[data-trash-mark]'),
    }
  })
  check('TRASH  its window counts what it holds, behind the trash mark', header.count === '1 item' && header.mark, JSON.stringify(header))
  check('TRASH  nothing is made in it: New Folder is off', (await s.enabled('File', 'new-folder')) === false)

  await s.pick('Special', 'empty-trash')
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open] vf-paragraph'))
  const asked = await page.evaluate(() => document.querySelector('vf-dialog[open] vf-paragraph').textContent)
  const holder = await page.evaluate(() => window.shell.windows.asking)
  await answer(s, 'OK')
  const gone = await page.evaluate(() => window.shell.catalog.get().items.map((i) => i.name))
  check(
    'TRASH  Empty Trash asks, with the count, then removes the folder and what it held',
    asked.startsWith('The Trash contains 1 item') && !gone.includes('Projects') && !gone.includes('Archive'),
    `${asked} → [${gone}]`
  )
  check(
    'TRASH  …in the Finder’s own alert, held by it while it is up',
    holder === 'finder' && (await page.evaluate(() => window.shell.windows.dialogsOf('finder').length)) === 0,
    `asking ${holder}`
  )
  check('TRASH  …and the Trash is empty again', /\/trash\.png$/.test((await s.iconState('Trash')).art))

  // The site answers Empty Trash itself.
  await page.evaluate(() => {
    window.__asked = []
    window.__answer = 'cancel'
    window.shell.apps.finder.alertWith('empty-trash', (details) => {
      window.__asked.push(details)
      return window.__answer
    })
  })
  await carry(s, 'Documents', await s.icon('Trash'))
  await s.settle()
  await s.pick('Special', 'empty-trash')
  await s.settle()
  const kept = await s.item('Documents')
  const shown = await page.evaluate(() => !!document.querySelector('vf-dialog[open]'))
  await page.evaluate(() => (window.__answer = 'ok'))
  await s.pick('Special', 'empty-trash')
  await page.waitForFunction(() => !window.shell.catalog.get().items.some((i) => i.name === 'Documents'))
  const details = await page.evaluate(() => window.__asked)
  check(
    'ALERTS  alertWith answers Empty Trash in the Finder’s place, with its details',
    !shown && details.length === 2 && details[0].count === 1 && typeof details[0].bytes === 'number',
    JSON.stringify(details)
  )
  check('ALERTS  …its answer acts: cancel keeps the Trash, ok empties it', kept?.parent === 'trash', JSON.stringify(kept))
  await page.close()
}

// ── COPY ────────────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  const projects = await s.icon('Projects')
  await page.mouse.click(projects.x, projects.y)
  await page.keyboard.press('Meta+c')
  await page.mouse.click(400, 400)
  await page.keyboard.press('Meta+v')
  await page.waitForFunction(() => window.shell.catalog.get().items.some((i) => i.name === 'Projects copy'))
  await s.settle()
  const copy = await s.item('Projects copy')
  const inner = await page.evaluate(
    (id) => window.shell.catalog.get().items.filter((i) => i.parent === id).map((i) => i.name),
    copy.id
  )
  check(
    'COPY  Paste makes a copy, a folder with what it holds, selected',
    copy.parent === null && inner.join() === 'Archive' && (await s.iconState('Projects copy')).selected,
    `${JSON.stringify(copy)} holding [${inner}]`
  )
  await page.keyboard.press('Meta+a')
  await s.settle()
  const lit = await page.evaluate(() =>
    [...document.querySelectorAll('vf-desktop > vf-icon-field > vf-icon')].every((i) => i.selected)
  )
  check('COPY  Select All selects every icon on the desktop', lit)
  await page.close()
}

// ── DROP, ALERT ─────────────────────────────────────────────────────────────
{
  const page = await openShell(browser)
  const s = shellOn(page)
  await s.pick('Apple', 'note-pad')
  await s.settle()
  const before = await s.front()
  // A text file from outside the page, dropped on the bare desktop: no press reaches the page.
  await page.evaluate(() => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File(['Dear Sir'], 'Letter.txt', { type: 'text/plain' }))
    const at = { clientX: 700, clientY: 500 }
    const target = document.elementFromPoint(at.clientX, at.clientY)
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { ...at, bubbles: true, cancelable: true, composed: true, dataTransfer }))
    }
  })
  await page.waitForFunction(() => window.shell.catalog.get().items.some((i) => i.name === 'Letter'))
  await s.settle()
  check(
    'DROP  a file dropped on the desktop brings the Finder forward',
    before === 'note-pad' && (await s.front()) === 'finder' && (await s.active()) === null,
    `${before} → ${await s.front()}, active ${await s.active()}`
  )
  const letter = await s.item('Letter')
  check(
    'DROP  …and the kind that claims it files it there',
    letter?.kind === 'note' && letter.parent === null && letter.data?.text === 'Dear Sir',
    JSON.stringify(letter)
  )

  // A failure long enough for five lines.
  await page.evaluate(() => {
    const why = `the disk refused the write ${'and tried again '.repeat(10)}then gave up`
    window.shell.catalog.create = () => Promise.reject(new Error(why))
  })
  await s.pick('File', 'new-folder')
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open] vf-paragraph'))
  await s.settle()
  const box = await page.evaluate(() => {
    const dialog = document.querySelector('vf-dialog[open]')
    const text = dialog.querySelector('vf-paragraph').getBoundingClientRect()
    const buttons = dialog.querySelector('vf-button-group').getBoundingClientRect()
    return { lines: text.height / 16, text: text.bottom, buttons: buttons.top }
  })
  check('ALERT  a five-line message ends above the alert’s buttons', box.lines >= 5 && box.text <= box.buttons, JSON.stringify(box))
  await answer(s, 'OK')
  await page.close()
}

// ── FIRST RENDER ────────────────────────────────────────────────────────────
{
  /** A shell started in the task that writes its desktop, as a page's module starts it. */
  const boot = (page, storage) =>
    page.evaluate(
      ([art, withStorage]) => {
        document.body.innerHTML =
          '<vf-desktop bezel="10"><vf-menu-bar><vf-menu label="Apple"></vf-menu></vf-menu-bar></vf-desktop>'
        const desktop = document.querySelector('vf-desktop')
        const { createShell, finder, memoryStorage } = window.vfShell
        window.seedTop = null
        window.shell = createShell(desktop, {
          apps: [
            finder({
              storage: withStorage ? memoryStorage() : null,
              volumes: { disk: 'Macintosh HD' },
              art,
              seed: async (catalog) => {
                window.seedTop = desktop.workArea.top
                await catalog.create({ name: 'Read Me' })
              },
            }),
          ],
          fit: 'viewport',
        })
        return window.shell.ready
      },
      [SHELL_ART, storage]
    )
  const read = (page) =>
    page.evaluate(() => {
      const desktop = document.querySelector('vf-desktop')
      const icon = [...desktop.querySelectorAll('vf-icon[data-id]')].find((i) => i.label === 'Macintosh HD')
      return { disk: icon && { left: icon.left, top: icon.top }, area: desktop.workArea, seedTop: window.seedTop }
    })

  let page = await shellFixture(browser)
  await boot(page, false)
  let at = await read(page)
  check(
    'FIRST RENDER  without storage, the disk’s icon sits 16 below the menu bar',
    at.area.top > 0 && at.disk?.top === at.area.top + 16,
    JSON.stringify(at)
  )
  const ready = await page.evaluate(() => window.shell.apps.finder.storageReady())
  await page.waitForFunction(() => !!document.querySelector('vf-dialog[open] vf-paragraph'))
  const said = await page.evaluate(() => document.querySelector('vf-dialog[open] vf-paragraph').textContent)
  check(
    'STORAGE  without storage, storageReady() answers false and raises Storage Unavailable',
    ready === false && /can’t be saved/.test(said),
    `${ready}: ${said}`
  )
  await page.close()

  page = await shellFixture(browser)
  await boot(page, true)
  at = await read(page)
  check(
    'FIRST RENDER  …and a seed reads the work area below the menu bar',
    at.area.top > 0 && at.seedTop === at.area.top && at.disk?.top === at.area.top + 16,
    JSON.stringify(at)
  )
  await page.close()
}

await report(browser)
