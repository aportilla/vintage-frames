# Kit review — follow-ups from the `vf-button` pass

Written 2026-08-07, at the end of the session that reworked `vf-button`'s form
and accessibility contract. That component was reviewed in depth; what follows
is the work that **generalizes past it**, re-measured across the kit.

Every claim below was verified against the source, the generated manifest, or a
live test run in this session. Written to be picked up cold.

> **All four steps shipped 2026-08-07**, in the order argued for below (3 → 1 →
> 2 → 4). The suite went 1401 → **1413** (manifest +1, names +3, toggle +8).
> Each step keeps its plan text, with a `Shipped` note recording where the
> implementation diverged — the divergences are the interesting part, and two of
> them made the work materially smaller than planned. The deferred items and the
> platform-limits section below are still open.

## Before you start

```sh
npm test          # 32 scripts, 1413 checks, ~35s — the baseline to match
npm run typecheck
```

**1413/1413 is the regression signal.** Any refactor here should land on exactly
that number again, or a deliberately higher one. Confirmed by running it.

The `vf-button` work is the reference implementation for most of what follows —
`src/components/vf-button.ts`, `scripts/verify-button.mjs`, and SPEC §vf-button
show the shape a fixed control takes.

---

## The pattern

`VfFormControl` (`src/form-control.ts`) hands out capability by inheritance, but
each capability only works if the *component* wires it into its own `render()`.
Nothing checks that it did. So a control can advertise API — in its type
signature, in the manifest, in editor autocomplete — that silently does nothing,
and it looks completely normal from the outside.

That is what `vf-button` did with `aria-label` and `description` until this
session, and the same shape is still live elsewhere.

**Nine components extend `VfFormControl` or a subclass:** `vf-button`,
`vf-checkbox`, `vf-number-field`, `vf-radio-group`, `vf-select`, `vf-slider`,
`vf-swatch`, `vf-text-area`, `vf-text-field`. (`vf-radio` and `vf-progress-bar`
appear alongside them in accessibility tables but extend `LitElement` — they
inherit none of this.)

All nine inherit `description` from `VfFormControl`; the manifest confirms it on
all nine with `inheritedFrom: VfFormControl`. **Five wire it into `render()`** —
button, select, text-field, text-area, number-field. **Four do not** — checkbox,
radio-group, slider, swatch.

Steps 1, 3 and 4 close that gap and stop it reopening. Step 2 is a separate,
independent defect of the same "the base handed it out, the component didn't
finish it" family.

**Do step 3 first, despite it being the hardest.** Removing an inherited
`@property()` from three tags is a breaking change to the public type surface,
and PUBLISHING.md's own table prices a pre-1.0 breaking change at a minor bump.
Nothing is published yet — `vintage-frames` is still unclaimed on npm — so step
3 costs nothing today and acquires a cost the moment 0.1.0 ships. Step 1 falls
out of the same mixin extraction. Steps 2 and 4 are order-independent, except
that step 4 only goes green once step 3 has resolved.

---

## Step 1 — `vf-swatch`: bridge the description

`vf-swatch` bridges the **name** but not the description. Its role sits on a
shadow-internal `<button>`, so a host-level `aria-describedby` has nothing to
reach — unlike checkbox / radio-group / slider, whose role is on the host and
which therefore still have a working native channel. **`vf-swatch` is the only
one of the four with no fallback**, which is why it is unconditional and first.

`src/components/vf-swatch.ts`, `render()` at :194 — the inner `<button>` (:206)
already carries `aria-label=${this.label || this.hostLabel || …}` at :211 but no
`aria-describedby`, and the template never calls `renderDescription()`.

Copy the two lines from `vf-button.render()` (`vf-button.ts:359` and `:365`):

- `aria-describedby=${this.describedBy}` on the inner `<button>`
- `${this.renderDescription()}` after the closing `</button>`

Both members are inherited and already correct — `describedBy` at
`form-control.ts:181`, `renderDescription()` at `:191`. Nothing else changes.

**Test:** `scripts/verify-names.mjs`, the §6.2 DESCRIPTION group. Add a
`vf-swatch` case matching the existing field cases: the `description` property
and a host-level `aria-describedby` each reach the inner button's computed AX
description, and nothing is left behind when both are empty. The harness helper
is `axFor(cdp, hostId, partName)` (`scripts/harness.mjs:239`), which resolves by
`part=` — `axFor(cdp, 'sw', 'button')` — read with `axDescription`.

> **Shipped as planned.** Two lines in `vf-swatch.render()`, three checks in
> `verify:names` (38 → 41), no surprises. Fell out of step 3's extraction, since
> `vf-swatch` is one of the six that kept the bridge.

---

## Step 2 — the toggles must honour `preventDefault()`

`vf-checkbox` and `vf-radio` change state even when a consumer cancels the
click. A native checkbox does not.

```js
const cb = document.querySelector('vf-checkbox')
cb.addEventListener('click', (e) => e.preventDefault())
cb.click()
await cb.updateComplete
cb.checked // → true. Native would still be false.
```

**Where it lives.** `src/toggle-control.ts`: the mixin registers its click
listener on the **host** in the constructor (:135), and `#handleClick` (:173)
calls `#interact()` (:168) which calls `activate()` immediately. There is no
`defaultPrevented` check anywhere in the file.

Two things make it fail. The listener is registered at construction time, so it
is first in the host's own listener list and runs before any consumer listener
on the host or above it. And even a capture-phase cancel would not help, because
nothing ever reads `defaultPrevented`.

(`vf-icon` gets this right — `vf-icon.ts:1174` checks `event.defaultPrevented`
before acting, which is why a `selectable` icon cancels correctly.)

**The fix.** HTML runs a control's activation behavior *after* the click
finishes propagating, which is what makes `preventDefault()` anywhere on the
path cancel it. Port `vf-button.ts:385–405` into the mixin's `#handleClick`:

- add a `click` listener to the window *during* dispatch — each node's listener
  list is read as that node is reached, so a listener added mid-flight still
  runs when the event gets there, and by then `defaultPrevented` is final;
- fall back to `setTimeout(…, 0)` for the `stopPropagation()` case (a task, never
  a microtask — microtasks interleave *between* the listeners of a trusted
  dispatch, which would put the action back before the path is done);
- check `event.defaultPrevented` before calling `#interact()`.

Leave the disabled gate in `#interact()` where it is. Fixing the mixin covers
both toggles at once.

**Also fix the menus — two sites, not one.** `vf-menu-item.#onClick` (:397) and
`vf-menu.#onLabelClick` (:549) have the identical shape: swallow-latch, then
act, no `defaultPrevented` check.

An earlier draft called `vf-menu-item` "the odd one out in its own subsystem"
on the strength of `vf-menu.ts:310` and `vf-menu-bar.ts:318`. Those two lines do
check `defaultPrevented`, but both are `#onDocKeydown` — the *keyboard* path.
Neither is a click handler, so neither is the comparison. The menu subsystem has
no click-cancellation anywhere; the two sites above are a matched pair.

**Explicitly out of scope.** `vf-select.handleHostClick` (:895) and
`vf-list.#onClick` (:328) have the same shape, but native `<select>` and native
listboxes have no clear cancellation contract, so those are design calls rather
than bugs. Decide them separately or not at all. Note that `vf-list-item` and
`vf-option` own no click handler — delegation lives on the container, so any
follow-up belongs there.

`vf-label.#handleClick` (:339) is the third member of the family and also a
design call. It forwards focus to the `for` target with no `defaultPrevented`
check; a native `<label>`'s forwarded activation *is* cancellable, but the kit
forwards focus rather than a synthesised click, so it is not the same behavior
being left uncancellable. Listed so the sweep is on the record as complete.

**Watch:** `#handleKeydown` (:177) synthesises a click for Space, so it routes
through the same handler and inherits the same semantics — which is correct,
native does the same. Re-check `vf-radio`'s `externallyCoordinated` path
(`toggle-control.ts:102`): the group is the source of truth for a grouped
radio's selection, and the deferral must not change when the group adopts.

**Test:** `scripts/verify-toggle.mjs` (52 checks today, SKELETON group). Add:
bubble-phase `preventDefault()` on the host cancels; capture-phase cancels;
`stopPropagation()` still activates (HTML cancels nothing on that path); a
disabled control still never activates; Space follows click. Assert on both
controls — the file's stated purpose is that the two behave identically where
they are supposed to.

**SPEC:** add the cancellation line to the toggle sections, mirroring the
`vf-button` wording at `SPEC.md:954`.

> **Shipped, factored one level up.** Four sites would have carried the same
> subtle 14 lines, so the deferral is now `deferActivation(host, event, action)`
> in `src/events.ts`, and `vf-button`'s inline copy was collapsed onto it —
> four copies became one implementation with one place to document the
> microtask trap. Callers keep their own guards (`vf-button`'s `#activating`
> re-entrancy latch and `type="button"` early-out, the menus' gesture latches,
> the toggle's disabled gate).
>
> **Two things the plan missed.** The synthesised Space click was built
> `cancelable: false` by default, so `preventDefault()` on it was a no-op and
> Space would have stayed the one modality nobody could cancel — it now
> declares `cancelable: true`, matching the browser's own keyboard-synthesised
> click. And deferring the action means the *disabled* gate is now read at the
> end of the path, so a control disabled mid-propagation correctly no longer
> acts; that is new behavior and has its own check.
>
> `verify:toggle` 52 → 60, as a CANCELLATION group. The eight were run against
> the pre-fix mixin first: the six cancellation checks fail and the two controls
> (`stopPropagation()` still activates, uncancelled still activates) stay green,
> so the group discriminates rather than merely passing.

---

## Step 3 — decide `description`'s fate on checkbox, radio-group, slider

The property is inherited, typed and in the manifest on all three, and renders
nothing. Unlike `vf-swatch`, all three have their role **on the host**, so a
consumer's host-level `aria-describedby` already works natively.

**The property is redundant on `vf-slider`. On the other two it is not quite
that simple**, and an earlier draft of this doc said "redundant, not broken" for
all three. `descriptionText` (`form-control.ts:167`) carries *two* things — the
description and a failing constraint's `validationMessage` — and `vf-checkbox`
and `vf-radio-group` both override `valueMissing`/`valueMissingMessage`
(`vf-checkbox.ts:102`/`:107`, `vf-radio-group.ts:67`/`:72`), so `required`
genuinely fires on them. With no `renderDescription()` call, that message has
nowhere to land: AT gets `aria-invalid="true"` and no text, while the fields get
the sentence. `verify-names.mjs:257` asserts the message reaches AX for a text
field; the checkbox case at `:323–344` asserts only the API surface, never the
description. So the gap is real and untested.

**It is still not worth implementing.** The two-lines-each shape of step 1 does
not transfer, because *role placement is exactly what makes it not transfer*. On
the six shadow-role controls the inner element's `aria-describedby="description"`
resolves inside the shadow root where the span lives. On a host-role control the
IDREF resolves in the **document**, where there is no such id — so delivering
the message would need `internals.ariaDescribedByElements`, ARIA *element*
reflection. The kit uses only string reflection through internals today
(`ariaLabel`, `ariaChecked`, `ariaRequired`, …; `rg 'internals\.aria'` is the
inventory) — this would be its first element-reflection dependency, re-wired on
every update because the span renders conditionally, to deliver something a
native checkbox does not do either. Native delivers a failing constraint's
message through the browser's validation bubble, not through AccName.

So: parity with native is the right target here, and SPEC already describes that
correctly (`:162–163` scopes the bridge to the shadow-role controls; `:172–173`
scopes validation's AT wiring to `aria-required`/`aria-invalid` "plus internals
mirrors for host-role controls"). It is README that over-claims — see the doc
updates below.

Two defensible resolutions:

**Implement** — *not* two lines each, per the above: `renderDescription()` plus
an `internals.ariaDescribedByElements` wiring maintained across updates, on
three controls, to duplicate a platform channel that already works on them and
to exceed native on the validation half. Priced here so the option is on the
record, not because it is close.

**Remove** — matches the kit's own principle of documenting what components
*do*. This is the recommended answer, but it is not free: **you cannot remove an
inherited `@property()` from a subclass**, not in TypeScript and not at runtime.
Removal requires moving the name/description members out of `VfFormControl` into
a mixin that only the six shadow-role controls apply:

- `hostLabel`, `hostAriaLabel`, `description`, `descriptionText`, `describedBy`,
  `renderDescription` — `form-control.ts:98–194`
- plus the bridge plumbing they depend on: `bridgedAriaAttributes`,
  the `observedAttributes` override and `attributeChangedCallback` — `:71–88`

Applied by six components: `vf-button`, `vf-select`, `vf-swatch`, and — via
`VfTextControlBase` — `vf-text-field`, `vf-text-area`, `vf-number-field`.

**Cost to price in:** mixins in this repo need a hand-maintained
`declare abstract class` twin because TypeScript cannot name the anonymous class
a mixin returns (TS4094). `src/toggle-control.ts:19` documents the shape and the
reason. That is one twin to keep in sync, for one mixin — not a general
decomposition of the base class.

`required` rides along with this decision. It is equally inert on `vf-swatch` and
`vf-slider` (neither has required semantics; `valueMissing` defaults to `false`
at `form-control.ts:323`, which is what makes a bare `required` do nothing). If
you do the mixin, consider splitting value+validity at the same time
(`syncFormValue`, `required`, `valueMissing`, `syncValidity`, `latchFormDefault`,
`applyFormState`). If you don't, leave `required` alone — it is inert, not wrong.

**Doc updates either way:** SPEC §4's name/description bridge paragraph
(`SPEC.md:146–163`) lists which controls carry this and is already correct.
README's platform-form-vocabulary paragraph is not: "A `description` (or the
validation error, while there is one) reaches assistive tech alongside the name"
(`README.md:309`) reads kit-wide and is true only of the six shadow-role
controls. That sentence needs SPEC's scoping whichever way this goes. Re-run
`npm run analyze` so the manifest drops the member from the three tags.

> **Shipped: Remove — and the mixin turned out to be unnecessary.** The whole
> "cost to price in" above evaporates. A mixin is only needed when the applying
> classes sit on *different* bases; all six of these sit on `VfFormControl`
> (three directly, three via `VfTextControlBase`). So the split is a plain
> intermediate subclass — **`VfShadowRoleControl extends VfFormControl`**,
> holding the bridge — and the six repoint at it. No anonymous class, no
> TS4094, no `declare abstract class` twin to keep in sync.
>
> The class name states the membership rule, which is the point: *role sits on
> a shadow-internal node*. That is the one fact that decides whether a control
> needs the bridge, and having it in the name makes "why isn't `vf-checkbox` on
> this?" answer itself.
>
> Manifest: `description` went from 9 tags to 6, all now
> `inheritedFrom: VfShadowRoleControl`.
>
> **`required` was left alone, deliberately.** It cannot ride this split: it is
> live on the fields, `vf-select`, `vf-checkbox` and `vf-radio-group` — which
> spans *both* branches — and inert on `vf-swatch` and `vf-slider`, one on each
> side. Splitting value+validity would need a third axis that cuts across this
> one, for two inert flags. Inert, not wrong; leave it.
>
> Docs updated: SPEC §4's bridge paragraph names the class and records why the
> host-role controls are out; SPEC's `vf-checkbox`/`vf-radio` sections take the
> cancellation line; README's platform-form-vocabulary paragraph is scoped.

---

## Step 4 — add the check that would have caught all of it

**Do this after step 3** — whichever way step 3 goes, the rule is the same, but
it only goes green once step 3 has resolved.

`scripts/verify-manifest.mjs` is the right home: it is static (no browser, no dev
server), it already parses `custom-elements.json` (:40–43), and it already reads
every source file and maps tag → source (:199–209). It exists precisely to hold
generated/documented claims to the source.

**The rule:** every element whose manifest members include `description` must
call `renderDescription()` in its own source file. Reuse the existing
`componentDir` loop for the tag → source map; report offenders as
`tag:member`, the same shape as the `@csspart` / `@slot` / `@fires` orphan
checks above it.

Two notes on the rule as phrased. "In its own source file" is deliberate but
narrow — it would false-positive on a future component that inherits a base
class's `render()` rather than writing its own. Today no component does, so
encode it as stated and let the first exception argue for widening it to the
base. And the check has to read the *manifest* member list, not the class
hierarchy: reading the hierarchy is what the manifest already did wrong.

Expect `verify:manifest` to go from 10 checks to 11. The suite total will *not*
be 1402 — step 2 adds its own cases to `verify:toggle` and step 1 to
`verify:names`. 1401 is the floor to stay above, not the number to land on.

> **Shipped as planned**, as check 3b, "every inherited member that needs a
> render-time call gets one". Reads the manifest's member list against a
> tag → source map, reporting `tag:member`. Generalised one notch beyond
> `description` via a `RENDER_BACKED` table of `[member, call]` pairs, so the
> next inherited member with a render-time requirement is one row.
>
> **Proven against the defect it exists for.** Pointing its exact logic at the
> pre-change manifest (`git show HEAD:custom-elements.json`) reports precisely
> `vf-checkbox:description, vf-radio-group:description, vf-slider:description,
> vf-swatch:description` — the four, and nothing else. A guard that has never
> been shown to fire is not a guard.
>
> `verify:manifest` 10 → 11; suite 1401 → 1413.

**Why not `verify:names`.** That is a browser driver asserting computed AX for
the cases someone thought to write. This catches the case nobody thought to
write, statically, for free — and generalises to any future inherited member
that requires a render-time call to work.

---

## Deferred — not part of this pass

**Token naming.** `--vf-button-height` (SPEC:278) and
`--vf-control-height-small` (SPEC:289) are one component's two heights on two
different schemes, and `--vf-control-height-small` is read only by `vf-button`
(`vf-button.ts:231`). Renaming is a breaking token change — before 1.0 or not at
all.

**Disabled-styling consistency.** Three mechanisms in play for one idea, no
known visible break:

- `vf-select` and `vf-number-field` are both **doubly-specified** — each pairs a
  `classMap`/JS path keyed on the resolved `isDisabled` getter with a
  `:host([disabled])` rule keyed on the reflected attribute
  (`vf-select.ts:231` + `:1211`; `vf-number-field.ts:133` + `:312`).
- `vf-menu-item`, `vf-option`, `vf-list`, `vf-list-item` use the attribute only —
  correct, because they are not form-associated and have no second source.

`vf-button` was the only site rendering *wrong* and is fixed (the default ring
now keys on `:state(form-disabled)` too). Standardising on the resolved getter
is worth one cosmetic pass whenever.

---

## Platform limits — SPEC lines, not fixes

- **`willValidate` is `true` even for `vf-button type="button"`**, where a native
  button is barred from constraint validation. A form-associated custom element
  cannot be barred. Record it in SPEC §4.
- **`event.submitter` can never be a `vf-button`** — the platform rejects a
  form-associated custom element as a submitter. It is an internal proxy;
  `event.submitter.closest('vf-button')` is the supported way back. Already
  documented in README.

---

## Methodology note — why this class of bug hides

A broken name/description bridge **does not look broken from outside**. The host
still carries the `aria-label` attribute, so the accessibility tree still
contains *a* node with that name — a `generic` one, which no assistive technology
will announce as a control. Asking "is there a node with this name?" returns yes
for both the working and the broken case.

The question that separates them is "does a node with a **meaningful role** carry
this name?" `verify:names` gets this right by asserting against specific shadow
parts; any new check in this area should do the same.
