/**
 * Element registration, guarded against a second copy of the library.
 *
 * `customElements.define()` throws `NotSupportedError` if the name is taken,
 * and an uncaught throw during module evaluation takes the whole import graph
 * with it — one duplicated dependency and the consumer's page is blank. That is
 * a plausible thing to happen by accident: a bundle that loads the kit
 * alongside a micro-frontend that also bundles it, an app pinned to two
 * versions through a nested dependency, a `<script type="module">` on a page
 * whose framework already imported the package.
 *
 * So registration checks first and warns instead. The first copy wins — it owns
 * the tag and the elements already upgraded against it — and the page keeps
 * working. The warning matters as much as the guard, because a duplicated copy
 * is not benign even once the page survives it: the scaling, grid-snapping and
 * focus-modality registries are all module-scoped singletons, so the second
 * copy's schedulers reach none of the first copy's components and the two
 * disagree silently. Better to say so than to let it look fine.
 */

/**
 * Register `ctor` under `tagName` unless the name is already taken.
 *
 * Re-registering the identical constructor (the same module evaluated twice) is
 * a silent no-op; a *different* constructor warns and leaves the incumbent in
 * place. Use it directly when you define a control without the decorator:
 *
 * ```ts
 * defineElement('my-control', MyControl)
 * ```
 */
export const defineElement = (tagName: string, ctor: CustomElementConstructor): void => {
  const registered = customElements.get(tagName)

  if (registered === ctor) return

  if (registered !== undefined) {
    console.warn(
      `[vintage-frames] <${tagName}> is already registered on this page, so this ` +
        `second registration was skipped and the first one kept. Two copies of the ` +
        `library also mean two of every module-scoped singleton — the grid-snap ` +
        `scheduler, applyScale() and the focus-modality tracker each only reach the ` +
        `components built from their own copy. Dedupe vintage-frames to a single version.`,
    )
    return
  }

  customElements.define(tagName, ctor)
}

/**
 * The kit's replacement for Lit's `@customElement`, registering through
 * {@link defineElement} so a duplicated copy warns rather than throwing.
 * Identical to use:
 *
 * ```ts
 * @vfElement('my-control')
 * export class MyControl extends LitElement {}
 * ```
 *
 * Handles both decorator dialects the way Lit's own does, so it keeps working
 * if the project moves off `experimentalDecorators`.
 */
export const vfElement =
  (tagName: string) =>
  <T extends CustomElementConstructor>(
    classOrTarget: T,
    context?: ClassDecoratorContext<T>,
  ): T => {
    if (context !== undefined) {
      context.addInitializer(() => {
        defineElement(tagName, classOrTarget)
      })
    } else {
      defineElement(tagName, classOrTarget)
    }
    return classOrTarget
  }
