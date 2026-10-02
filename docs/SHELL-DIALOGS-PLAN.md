# Shell dialogs plan

**Status (2026-10-01):** steps 0–5 built. Step 0 ships as 0.14.2 and the
rest as 0.15.0; publishing is Adam's. Every decision taken as recommended
(§ Decisions). Three things changed while building, each noted where it
lands: `ctx.release()` and `releaseDialog()` (the Finder lets each alert go),
`vf-button`'s submit proxy now carries its `value` without a `name`, and the
`ask()`-throws check isn't in the suite. Releasing turned up a flaky
CLOSE check: Note Pad's dialog, shown again, walked its bottom-right button
row back into place over frames. That was the kit's `origin` placement
squeezing the row against its parent's edge; it's fixed in its own commit
ahead of 0.15.0. Left: step 6, the sites. Delete this doc when they run on
it, as with the earlier plans.

The ask, from moving SystemOnline onto the shell: _"I'd like to have apps own
their own alerts in general... an alert is just another kind of
window/dialog held by the app"_, and whether that needs the kit: _"can we
mechanically do this now? or does the kit need an update to enable us to
manage our own alerts [on a] per-app basis?"_ The goal under it: applications
are in complete control of their windows and dialogs, and the shell provides
no templated UI for them.

The short version:

- An application's dialogs are its own, like its windows. It authors them,
  as markup in its definition or in code. The window manager holds them under
  it and removes them with it.
- While one is open, the menu bar shows its application's name and menus.
  Nothing else moves.
- The shell composes no UI. `ctx.alert()`, `shell.alert()` and the `caution`
  option go. The stock Finder is an application, so its alerts become its
  own, composed in `finder.ts` with art the site gives it. A site can answer
  any of them with its own dialog.
- `vf-dialog` gains the platform's `returnValue`: a `<form method="dialog">`
  in it closes it with the value of the button that submitted it. This is
  the kit change, with one fix to Return in a form's text field.
- Two fixes go first, as a patch: the composed alert's sizing, and a drop
  bringing the Finder forward.

## Where things stand

**The elements.** `vf-dialog` (`VfModalDialog`, `src/modal-dialog.ts`) is a
native modal in the top layer: centered in the viewport unless placed, focus
moved in and given back, Escape and the opt-in light dismiss routed into one
`vf-close` with its reason. The desktop knows nothing about it: its windows
are its slotted `vf-window`s, so a dialog is not in `stackingOrder` and never
active. There is no alert element, on purpose (SPEC § The alert box;
LAYOUT's recipe): an alert is the plain frame plus the consumer's art.

`vf-dialog` has no `returnValue`, and `vf-close` carries only the reason. A
`<form method="dialog">` inside it does nothing: the browser closes the
`<dialog>` around the form, and `vf-dialog`'s `<dialog>` is in its shadow
root, so the form has none around it.

**The shell.** `ctx.alert(message, options)` and `shell.alert()` call
`showAlert(desktop, …)` (`src/shell/alert.ts`), which composes LAYOUT's recipe
in code, appends it to the desktop, resolves the pressed button's value and
removes it. No application holds it:

- The bar stays on whatever was front. In SystemOnline, a backup dropped on
  the desktop while the Text Viewer is front asks the Finder's Restore
  question under the Text Viewer's name.
- `dispose()` doesn't know it, so an alert open across a hot reload stays up,
  and its answer goes to the disposed application.
- `modalOpen()` is one global test (`vf-dialog[open]` anywhere), which is
  right: a native modal makes the whole page inert.

A site can author a dialog and `show()` it today, as SystemOnline's About box
and every sprite-machine dialog do, but no application holds it either. And
nothing but the composed alert can answer the stock Finder's alerts.

**Who raises dialogs.**

| Where | Dialogs |
| --- | --- |
| Stock Finder (`src/shell/finder.ts`) | Empty Trash's question (832), Storage Unavailable (811), a name too long (694), a name left empty (699), a move storage refused (722), and "… failed" for New Folder, Empty Trash, Paste and a dropped file (317). All composed. |
| Note Pad (`demo/shell.ts:117`) | Save changes before closing, three buttons, composed. |
| SystemOnline, on the shell | Composed, ten: the Restore question (Cancel, Replace, Add), a file that isn't a backup, a backup with no files, a backup with unreadable items, Back Up and Restore failures, Storage Unavailable (all `apps/finder/backup.ts`), Restore Default Files failed (`apps/finder/index.ts`), and a text or suitcase that can't be opened (the two viewers). Authored: the About box in `index.html`, from the Apple menu. It passes `caution`. |
| portill.io, on the shell | None of its own. The stock Finder's, composed. It passes `caution`. |
| sprite-machine, not yet on the shell | Thirteen, all in `index.html`, hand-placed and wired by id. The Sprite Editor's are New (a name field, a template select, a tile size), the name prompt (a field; it resolves a promise), Tile Size, Save Changes, Export 3D Model and Export Sprite Atlas (fields bound live), and Colors, `sm-color-picker`, which renders its `vf-dialog` into its own light DOM. The Finder's are Empty Trash, Paste, Restore and Restore Failed. Storage Unavailable is shared through `deps.showStorage`, and the About box is the page's. Its failures render nothing: `build.setError()` stores a message no one shows. |

So most dialogs are more than a message and buttons, and none of them lives in
its application's directory. Several are raised after an await (a paste's
decode, an import, the name prompt), or by a drop on the page, when another
application may be front. Several carry a file name or an error message, so
their copy has no fixed length. sprite-machine's Save Changes raises its
document window itself before it asks.

**The composed alert's sizing bug.** `showAlert` measures its paragraph
after appending the dialog and before `show()`. A closed `vf-dialog` lays out
nothing (its host is `display: contents` and the native `<dialog>` is
`display: none`), so the paragraph reads 0 tall and every alert gets the
minimum box: the art's height, which holds three lines of the display face. A
fourth line runs under the buttons. Measured in SystemOnline on 2026-10-01: a
paragraph in a closed dialog reads 0 tall, and 80 once shown; its four-line
Restore question overlaps its buttons.

**A drop doesn't bring the Finder forward.** A press anywhere in the
desktop's field brings the Finder forward (`finder.ts:671`). A file dropped
from outside the browser fires no press, and the drop handler
(`finder.ts:944`) doesn't bring it forward either. That is most of
SystemOnline's case above: the backup was dropped on the Finder's desktop,
but the Finder never came forward.

## The model

An application's dialog is the application's, like its windows:

- **Authored by the application**: a fragment of dialogs in its definition,
  parsed once like its menus, or a dialog it makes in code.
- **Held by the window manager** under its application, as `adopt()` holds a
  window, and removed with it.
- **Named on the bar** while it is open: its application's name and menus.
- **Answered through the kit**: the dialog closes with a `returnValue`, and
  the application reads it and its own fields.

The shell adds no UI. It registers no elements, writes no styles, ships no
art, and now composes no alerts. Every dialog on screen is an application's
or the page's.

## The kit

### `returnValue`

- `VfModalDialog` gets `returnValue`, as on `<dialog>`. `close(value)` and a
  submit set it. Each open clears it, so a dialog asked again doesn't start
  with its last answer.
- A `<form method="dialog">` inside the dialog closes it on submit, with the
  submitter's `value`. `formmethod="dialog"` on the submitting button counts
  too. The dialog listens for the submit and closes itself.
- `vf-close`'s detail gains `returnValue`: the value this close carried, or
  null for Escape, a light dismiss, `close()` with no value, or removal from
  the DOM.
- `vf-button type="submit"` submits through a native proxy carrying its
  `formmethod` (`vf-button.ts:508`). Built: the proxy carried `value` only
  with a `name`, so it now always carries it. A value without a name adds
  nothing to form data. A button that isn't a submit button doesn't close
  the dialog.
- Constraint validation runs as on any form. A dialog that keeps OK disabled
  until it can answer adds `novalidate`, so the browser's own message never
  shows.

```html
<vf-dialog frame="plain" label="Caution" width="360" height="118">
  <form method="dialog" novalidate>
    …
    <vf-button-group origin="bottom right" left="334" top="92">
      <vf-button type="submit" value="cancel">Cancel</vf-button>
      <vf-button type="submit" value="ok" variant="default">OK</vf-button>
    </vf-button-group>
  </form>
</vf-dialog>
```

The `<form>` is a plain block, so children placed with `top`/`left` still
measure from the dialog's body.

### Return in a text field

Return in a kit text field inside a form runs the form's implicit
submission: it clicks the form's first submit button in tree order
(`text-control.ts:194`), as HTML defines, and takes the key, so the dialog's
own Return rule never sees it. In a Cancel/OK row that first button is
Cancel. The fix: implicit submission clicks the form's `variant="default"`
submit button when it has one, else the first. That is the button with the
ring, and the one the dialog's Return rule presses. It also changes a form
outside a dialog whose ringed button isn't its first (Decision 4).

## The shell

### Applications

```ts
export const notePad = defineApp({
  id: 'note-pad',
  name: 'Note Pad',
  menus,
  dialogs: `
    <vf-dialog data-dialog="save-changes" frame="plain" label="Save Changes" width="360" height="118">
      <form method="dialog" novalidate>
        <vf-img width="32" height="32" left="16" top="16"><img src="/art/caution.png" alt="" /></vf-img>
        <vf-paragraph face="display" width="270" left="64" top="16" data-message></vf-paragraph>
        <vf-button-group origin="bottom right" left="334" top="92">
          <vf-button type="submit" value="discard">Don’t Save</vf-button>
          <vf-button type="submit" value="cancel">Cancel</vf-button>
          <vf-button type="submit" value="save" variant="default">Save</vf-button>
        </vf-button-group>
      </form>
    </vf-dialog>`,
  init(ctx) {
    const saveChanges = ctx.dialog('save-changes')
    async function askToClose(win: VfWindow) {
      saveChanges.querySelector('[data-message]')!.textContent = `Save changes to “${win.heading}” before closing?`
      const answer = await ctx.ask(saveChanges) // 'save' | 'discard' | 'cancel' | null
      // …
    }
  },
})
```

| `AppDefinition` | |
| --- | --- |
| `dialogs` | A fragment of dialogs, each with a `data-dialog` name. Parsed once, appended to the desktop, held under the application, removed with it. |

| `ctx` | |
| --- | --- |
| `dialog(name)` | One of its dialogs. Throws when the markup doesn't have it, as `menu()` does. |
| `hold(dialog)` | Holds a dialog the application made in code: appended to the desktop, held under the application, removed with it. Returns it. |
| `release(dialog)` | Built: lets a held dialog go and removes it. The Finder releases each alert once it is answered. |
| `ask(dialog)` | Shows one of its held dialogs and resolves its `returnValue`, or null when it closed without one. Throws for a dialog it doesn't hold. |

`ctx.alert()` is gone (§ Removed). An application can also `show()` a held
dialog and listen for `vf-close` itself. The bar follows either way.

A dialog with fields answers the same way. `ask()` resolves the button, and
the application reads its own fields: sprite-machine's name prompt resolves
`'ok'`, then reads the name. OK stays disabled while the name is empty.

A dialog declares its whole box, as every modal does
(`VfModalDialog.height`). Copy that varies is sized for its longest, or the
application measures it after `show()` and sets `height`: a closed dialog
lays out nothing, so measuring before `show()` reads 0. A message with no
longest, an error's say, goes in flow, and the dialog's body scrolls it when
it runs past the box.

A held dialog is a `vf-dialog`, or an element that renders one inside
itself, like sprite-machine's `sm-color-picker`. The manager follows the
`open` of the `vf-dialog` at or inside it. `ask()` takes a `vf-dialog`; a
wrapper is shown through its own API.

A dialog of the page's own stays the page's, held by no application: the
About box from the system menu.

### The window manager

| `windows` | |
| --- | --- |
| `holdDialog(dialog, { app })`, `releaseDialog(dialog)` | What `ctx.hold()` and `ctx.release()` call. |
| `appOf(dialog)` | Extended to held dialogs. |
| `dialogsOf(app)` | An application's held dialogs. |
| `asking` | The application of the held dialog opened last and still open, or null. |
| `onDialogs(fn)` | A held dialog opened or closed. Returns the unsubscribe. |

- **The bar.** While a held dialog is open, the bar shows its application's
  name and menus. With several open, it shows the one opened last, and as
  each closes, the next one still open, then the front application. Nothing
  else changes: `front`, `onFront`, the palettes and the active window stay
  where they were (Decision 1). Menu picks and key equivalents are dropped
  while a modal is open, as now, so the menus only say who is asking. An
  application that wants to come forward raises its own window before it
  asks, as sprite-machine's Save Changes does.
- **Following `open`.** The manager watches each held dialog's `open`
  attribute, so `ask()`, `show()` and the attribute all count.
- **Two at once.** A second modal opens over the first, as the top layer
  stacks them, and Escape closes the top one (Decision 2).
- **Teardown.** Held dialogs are removed with their application. Removing an
  open one closes it and fires `vf-close` (`VfModalDialog`'s removal path),
  so a pending `ask()` resolves null.
- **Key equivalents.** `modalOpen()` stays global, for the reason above.

### The stock Finder

- **Its alerts are its own.** `finder.ts` composes them from kit elements
  (today's `alert.ts`, now internal): a dialog-method form with a submit
  button per answer, held with `ctx.hold()`, asked with `ctx.ask()`, then
  removed. They size to their message (step 0's fix).
- **Its art.** `FinderArt.caution`, 32×32, optional; without it the alerts
  have no art. It replaces the shell's `caution`.
- **A drop brings it forward**, as a press does. A file dropped on the
  desktop clears the active window, and one dropped in a folder window brings
  that window to the front. Then the storage check and the claim run (step
  0).

A site can answer any of its alerts with its own dialog, held by the Finder,
from `extend`:

```ts
finder({
  // …
  dialogs: emptyTrashHtml, // held by the Finder, like an application's own
  extend(finder, ctx) {
    const dialog = ctx.dialog('empty-trash')
    finder.alertWith('empty-trash', ({ count, bytes }) => {
      dialog.querySelector('[data-message]')!.textContent = trashMessage(count, bytes)
      return ctx.ask(dialog)
    })
  },
})
```

| Alert | When | Details | Answer it acts on |
| --- | --- | --- | --- |
| `empty-trash` | Special → Empty Trash… | `{ count, bytes }` | `'ok'` empties the Trash |
| `storage-unavailable` | New Folder, Paste or a dropped file, without storage | none | none |
| `name-too-long` | a rename past the limit (`vf-name-too-long`) | `{ limit }` | none |
| `name-rejected` | a rename to nothing (`vf-name-rejected`) | none | none |
| `move-failed` | a filing storage refused | `{ error }` | none |
| `failed` | New Folder, Empty Trash, Paste or a dropped file failed | `{ action, error }`, `action` one of `'new-folder'`, `'empty-trash'`, `'paste'`, `'add-file'` | none |

An alert with no handler is the Finder's own, with the text it has today.

| `FinderOptions` | |
| --- | --- |
| `dialogs` | The site's dialogs for the Finder, held by it. |
| `art.caution` | The 32×32 art its alerts show. |

| `FinderApi` | |
| --- | --- |
| `alertWith(id, handler)` | Answer one of the Finder's alerts. The handler gets its details and resolves its answer. Call it from `extend`. |

### Removed

| | |
| --- | --- |
| `ctx.alert()`, `shell.alert()` | An application authors its alerts (§ Applications). |
| `ShellOptions.caution` | The Finder's `art.caution`. |
| `showAlert`, `AlertButton`, `AlertOptions` | Internal to the Finder. |

## Tests

- `verify:dialog`: a dialog-method submit closes the dialog with the
  submitter's `value`, and so does `formmethod="dialog"`. `vf-close` carries
  the `returnValue`, and null on Escape and on `close()` with none.
  `returnValue` clears on open. A `type="button"` button doesn't close.
  Return in a text field submits through the ringed button, in a dialog and
  in a plain form (`verify:button` too, where it checks implicit submission).
- `verify:shell-front`: a held dialog puts its application's name and menus
  on the bar while it is open, from a background application too, and
  `front`, `onFront` and the palettes don't change. With two open, the bar
  shows the one opened last, then the next as each closes, then the front
  application. Key equivalents are dropped while one is open. Driven from
  `window.shell`.
- `verify:shell-windows`: `ask()` resolves the submitted value, and null on
  Escape. Disposing removes held dialogs, and an open one's `ask()` resolves
  null. Note Pad's Save Changes answers through its form. The CLOSE group's
  waits become `vf-dialog[open]`, since a held dialog stays in the DOM.
  Built without the check that `ask()` throws for a dialog the application
  doesn't hold: the reference page has no handle on an application's `ctx`,
  and adding one only for the test would put a test hook in the page.
- `verify:shell-finder`: a text file dropped on the desktop while Note Pad
  is front brings the Finder forward. A Finder alert with a five-line
  message ends its paragraph above its buttons (a New Folder whose
  `catalog.create` the test makes fail with a long error).
  `alertWith('empty-trash')` replaces the Empty Trash question, and its
  answer empties the Trash or doesn't. An alert with no handler is still the
  Finder's own.

Nothing new is pure, so no unit tests.

## Steps

Each release is a published kit version, and publishing is Adam's.

0. **Two fixes**, released as a patch. The composed alert shows, then
   measures. A drop on the desktop or in a Finder folder window brings the
   Finder forward, and Note Pad's note kind gains `claim` for text files so
   the reference page takes drops. SystemOnline's Restore question stops
   overlapping its buttons and comes up under the Finder's name, with no
   change there. `verify:shell-finder`.
1. **The kit**: `returnValue`, the dialog-method submit, `vf-close`'s
   `returnValue`, and implicit submission's ringed button. `verify:dialog`,
   `verify:button`. Rerun `npm run analyze` and commit the regenerated files
   with it.
2. **The window manager holds dialogs**: `holdDialog`, `appOf`,
   `dialogsOf`, `asking` and `onDialogs`, removal with the application, and
   the bar following `asking`. `verify:shell-front`.
3. **Applications**: `dialogs` in the definition, and `ctx.dialog`,
   `ctx.hold` and `ctx.ask`. `ctx.alert`, `shell.alert` and `caution` are
   removed. Note Pad's Save Changes becomes its own dialog, authored in
   `dialogs` and asked with `ctx.ask()`. `verify:shell-windows`.
4. **The stock Finder**: its own alerts, held by it, `FinderArt.caution`,
   `FinderOptions.dialogs`, `FinderApi.alertWith` and the alert ids.
   `showAlert` leaves the exports. `verify:shell-finder`.
5. **Docs**:
   - SPEC: § `vf-dialog` gains `returnValue` and the dialog-method form, and
     § The alert box its submit buttons. LAYOUT's alert recipe and the
     reference page's alert follow.
   - SHELL.md: § Setup loses `caution`; § Applications gains `dialogs` and
     the `ctx` rows and loses `alert`; § Windows gains the held dialogs and
     the bar; § The Finder gains its alerts, `art.caution` and `alertWith`;
     § Pieces on their own loses `showAlert`.
   - FINDER.md, the from-scratch path, is unchanged.
6. **Release**, then the sites:
   - SystemOnline: its ten composed alerts become authored dialogs. The
     Finder's (the Restore question, the backup ones, Restore Default Files)
     go in `FinderOptions.dialogs` and are asked from `extend`. The viewers'
     go in their own `dialogs`. A message with a file name or an error goes
     in flow. `caution` moves to the Finder's `art.caution`. Its About box
     stays the page's.
   - portill.io: `caution` moves to the Finder's `art.caution`. Nothing
     else.
   - sprite-machine, as it moves onto the shell: its dialogs leave
     `index.html` for their applications' `dialogs`, each a dialog-method
     form: the Sprite Editor's seven, `sm-color-picker` held as the Sprite
     Editor's, and the Finder's four through `alertWith` or `extend`. Each
     application authors its own Storage Unavailable. Its silent failures
     get authored alerts.

## Decisions

All taken as recommended on 2026-10-01, when Adam asked for the build.

1. **What the bar follows.** Recommended: the bar alone shows the asking
   application while its dialog is open; `front`, `onFront`, the palettes and
   the active window stay. One alternative also moves `front`, which swaps
   palettes behind the modal and fires `onFront` twice for both
   applications. The other brings the asking application forward to stay,
   which needs a window to activate, so an application with none can't.
2. **Two dialogs at once.** Recommended: they stack in the top layer, and
   the bar follows the one opened last. The alternative: the shell holds a
   second held dialog back until the first closes.
3. **The composed alert.** Recommended: internal to the Finder, with
   `ctx.alert()`, `shell.alert()`, `caution` and the `showAlert` export
   removed. The alternative keeps `showAlert` exported, as a helper an
   application may call and hold itself: still a template, but one the
   application picks up rather than one the shell hands it.
4. **Return in a text field.** Recommended: implicit submission clicks the
   ringed submit button first. The alternative leaves HTML's rule, and every
   dialog with a field makes Cancel a `type="button"` that calls
   `close('cancel')`.
5. **Authored dialogs.** Recommended: markup in the definition (`dialogs`),
   parsed like `menus`, with `ctx.hold()` for dialogs made in code. The
   alternative is `hold()` alone.
6. **The Finder's alerts.** Recommended: one handler per alert, with typed
   details, through `alertWith`. The alternative is one hook for every
   alert, which can restyle them all but not reword them.
7. **The release.** Step 0 is a patch. The rest is a minor: it removes
   `ctx.alert()`, `shell.alert()`, `caution` and `showAlert`, and changes
   which button Return clicks in a form (Decision 4). The shell is
   experimental, so its breaking changes go out together.

## Not in this plan

- **Announcing an alert as an alert.** `alertdialog`, with its message as the
  description, is a later `vf-dialog` change: a role, and the element that
  describes it. ARIA element reflection lets the shadow `<dialog>` point at a
  slotted paragraph, so the shadow boundary doesn't block it.
- **A mark in the menu bar** for a background application that wants
  attention, in place of asking at once.
- **Three defects found in SystemOnline's move** are in KNOWN-BUGS.md (#4–#6):
  icons placed against the menu bar, `focusInto()` and roving tab stops, and
  the desktop pattern's save.
