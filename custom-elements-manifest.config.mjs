import { customElementVsCodePlugin } from 'custom-element-vs-code-integration'
import { customElementJetBrainsPlugin } from 'custom-element-jet-brains-integration'

/**
 * Teaches the analyzer the kit's own registration decorator.
 *
 * The analyzer detects Lit elements by looking for a decorator literally named
 * `customElement`. Every component here uses `@vfElement` instead — same
 * signature, but registering through the guarded `defineElement` (src/define.ts)
 * so a duplicated copy of the library warns rather than throwing. Without this
 * the analyzer finds the classes but no tag names, and the manifest comes out
 * with zero custom elements.
 *
 * It only has to emit the `custom-element-definition` export; the analyzer's own
 * post-processing links that to the class and marks it a custom element. Written
 * against the TypeScript AST the plugin API already hands us rather than the
 * analyzer's internal helpers, so it doesn't reach past the plugin contract.
 *
 * Every `@vfElement` in this repo decorates a class declared in the same file,
 * which is why the declaration reference can just be this module's own path.
 */
function vfElementPlugin() {
  return {
    name: 'vintage-frames/vf-element-decorator',
    analyzePhase({ ts, node, moduleDoc }) {
      if (!ts.isClassDeclaration(node)) return

      const decorators = ts.getDecorators?.(node) ?? []
      for (const dec of decorators) {
        const call = dec.expression
        if (!ts.isCallExpression(call)) continue
        if (!ts.isIdentifier(call.expression) || call.expression.text !== 'vfElement') continue

        const arg = call.arguments[0]
        if (!arg || !ts.isStringLiteral(arg)) continue

        moduleDoc.exports = [
          ...(moduleDoc.exports ?? []),
          {
            kind: 'custom-element-definition',
            name: arg.text,
            declaration: { name: node.name.text, module: moduleDoc.path },
          },
        ]
      }
    },
  }
}

export default {
  /**
   * The elements, plus the base classes and mixins they extend — those are in
   * scope so inherited members (VfFormControl's `disabled`/`name`/`value`,
   * VfTextControlBase's field plumbing, VfPositioned's `top`/`left`) resolve
   * instead of dangling. The style recipes, glyph geometry and embedded font
   * data are deliberately out: they are not API surface, and the base64 faces
   * would dwarf the manifest.
   */
  globs: [
    'src/components/*.ts',
    'src/form-control.ts',
    'src/text-control.ts',
    'src/toggle-control.ts',
    'src/modal-dialog.ts',
    'src/position.ts',
    'src/size.ts',
  ],
  outdir: '.',
  litelement: true,
  plugins: [
    vfElementPlugin(),

    // Editor data is the point of the manifest for this kit: the integration
    // story is plain HTML in an ordinary page (blog.html), where a consumer has
    // no TypeScript to lean on and gets no completion at all today.
    customElementVsCodePlugin({
      outdir: 'editor',
      htmlFileName: 'vscode.html-custom-data.json',
      // Each element's own knobs now carry @cssprop tags, so the hover lists
      // them. The CSS *data* file stays off: it powers `--vf-` completion in a
      // stylesheet, where you mostly want the kit-wide palette — and those are
      // deliberately not tagged per element (see scripts/verify-manifest.mjs),
      // so the file would offer the 45 specific knobs and none of the 17 common
      // ones. SPEC §3 is the whole table.
      cssFileName: null,
      // Nothing in a tag tooltip can call a method — this data is for someone
      // writing `<vf-dialog …>` in markup. The JS API stays in the manifest
      // (and SPEC.md); listing it here only buries the attributes under the
      // UA's own form callbacks, which is most of what the classes expose.
      hideMethodDocs: true,
      hideLogs: true,
    }),

    customElementJetBrainsPlugin({
      outdir: 'editor',
      webTypesFileName: 'web-types.json',
      excludeCss: true,
      // Leave package.json alone — the reference is checked in by hand below.
      packageJson: false,
      hideMethodDocs: true,
      hideLogs: true,
    }),
  ],
}
