/**
 * Writes app-api.json: the app API, what a built application can use of the
 * kit (docs/APP-FILES.md § The app API), as its two levels and one sorted
 * list of names, each with its type. `npm run analyze` runs it after the
 * element manifest, which it reads. `npm version` compares the list with the
 * last release's (scripts/check-app-api.mjs).
 *
 * The list holds:
 * - each value the three entries an application imports export, by entry:
 *   "vintage-frames/shell defineApp";
 * - each member of every type they export, and of every kit type and class
 *   their values and members reach: "AppContext.ask", "VfWindow#show" (an
 *   instance's), "VfMenu.shadowRootOptions" (the class's own). A member Lit
 *   or the DOM declares has their shape, and private and protected ones
 *   aren't an application's, so neither is listed;
 * - each element's HTML side, from custom-elements.json: its class, and its
 *   attributes, events, slots, parts and states;
 * - the `--vf-*` tokens the SPEC §3 table describes.
 *
 * Names and types only: a constant is listed by its type, not its value, and
 * nothing here records what anything does.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src') + '/'

/** The entries an application imports: all it can reach of the kit. */
const ENTRIES = {
  'vintage-frames': 'src/index.ts',
  'vintage-frames/shell': 'src/shell/index.ts',
  'vintage-frames/shell/pure': 'src/shell/pure.ts',
}

const { config } = ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile)
const { options } = ts.parseJsonConfigFileContent(config, ts.sys, ROOT)
const program = ts.createProgram(Object.values(ENTRIES).map((file) => join(ROOT, file)), options)
const checker = program.getTypeChecker()

const printer = ts.createPrinter({ removeComments: true })
const scratch = ts.createSourceFile('app-api.ts', '', ts.ScriptTarget.Latest)
const text = (node) => printer.printNode(ts.EmitHint.Unspecified, node, scratch)

/** Null and undefined last, as TypeScript puts them; the rest in code-unit order. */
const rank = (s) => (s === 'null' ? 1 : s === 'undefined' ? 2 : 0)
const byText = (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0)

/**
 * `node` with each union's members in one order. TypeScript lists them in
 * the order it made their types, which moves when unrelated code does, and
 * every move would read as a change.
 */
function sortUnions(node) {
  const sort = (context) => (root) => {
    const visit = (n) => {
      const next = ts.visitEachChild(n, visit, context)
      if (!ts.isUnionTypeNode(next)) return next
      const types = next.types.map((t) => [text(t), t]).sort(([a], [b]) => byText(a, b))
      return ts.factory.updateUnionTypeNode(next, ts.factory.createNodeArray(types.map(([, t]) => t)))
    }
    return ts.visitNode(root, visit)
  }
  return ts.transform(node, [sort]).transformed[0]
}

const BUILD = ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.IgnoreErrors
const print = (type, flags = 0) => text(sortUnions(checker.typeToTypeNode(type, undefined, BUILD | flags)))
const printSignature = (signature, kind) => text(sortUnions(checker.signatureToSignatureDeclaration(signature, kind, undefined, BUILD)))
const inKit = (decl) => decl.getSourceFile().fileName.startsWith(SRC)
const isKit = (symbol) => !!symbol?.declarations?.length && symbol.declarations.every(inKit)
/** A shape without a name of its own: an object or type literal, or a function's type. */
const ANONYMOUS = ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.ObjectLiteral | ts.SymbolFlags.Function | ts.SymbolFlags.Method

/** Every name, and its type. */
const surface = new Map()

/** The kit's named types and classes, to list member by member. */
const named = []
const queued = new Set()
function queue(symbol) {
  if (queued.has(symbol)) return
  queued.add(symbol)
  named.push(symbol)
}

/** Queue each kit type `type` names, through unions, type arguments, members of anonymous shapes and signatures. */
const walked = new Set()
function reach(type) {
  if (!type || walked.has(type)) return
  walked.add(type)
  for (const symbol of [type.aliasSymbol, type.getSymbol()]) {
    if (isKit(symbol) && !(symbol.flags & ANONYMOUS)) queue(symbol)
  }
  for (const arg of type.aliasTypeArguments ?? []) reach(arg)
  if (type.isUnionOrIntersection()) for (const t of type.types) reach(t)
  if (!(type.flags & ts.TypeFlags.Object)) return
  if (type.objectFlags & ts.ObjectFlags.Reference) for (const arg of checker.getTypeArguments(type)) reach(arg)
  const symbol = type.getSymbol()
  if (!symbol || symbol.flags & ANONYMOUS) {
    for (const property of type.getProperties()) {
      const decl = property.valueDeclaration ?? property.declarations?.[0]
      if (decl) reach(checker.getTypeOfSymbolAtLocation(property, decl))
    }
  }
  for (const kind of [ts.SignatureKind.Call, ts.SignatureKind.Construct]) {
    for (const signature of checker.getSignaturesOfType(type, kind)) {
      for (const parameter of signature.getParameters()) {
        const decl = parameter.valueDeclaration ?? parameter.declarations?.[0]
        if (decl) reach(checker.getTypeOfSymbolAtLocation(parameter, decl))
      }
      reach(signature.getReturnType())
    }
  }
}

const hidden = (decl) =>
  !!(ts.getCombinedModifierFlags(decl) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) ||
  (!!decl.name && ts.isPrivateIdentifier(decl.name))

/** The custom element callbacks and statics: the browser calls and reads them, so their shape is the platform's. */
const PLATFORM = new Set([
  'connectedCallback',
  'disconnectedCallback',
  'adoptedCallback',
  'connectedMoveCallback',
  'attributeChangedCallback',
  'formAssociatedCallback',
  'formDisabledCallback',
  'formResetCallback',
  'formStateRestoreCallback',
  'observedAttributes',
  'formAssociated',
  'disabledFeatures',
])

/** List the members of `type` the kit declares, `prefix` before each name, leaving out what any of `theirs` declares outside the kit. */
function members(type, prefix, theirs = []) {
  for (const property of checker.getPropertiesOfType(type)) {
    if (property.name === 'prototype' || PLATFORM.has(property.name)) continue
    const decls = (property.declarations ?? []).filter(inKit)
    if (!decls.length || decls.some(hidden)) continue
    if (theirs.some((base) => base.getProperty(property.name)?.declarations?.some((d) => !inKit(d)))) continue
    const t = checker.getTypeOfSymbolAtLocation(property, decls[0])
    const optional = property.flags & ts.SymbolFlags.Optional ? '?' : ''
    const readonly = decls.some((d) => ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Readonly) ? 'readonly ' : ''
    surface.set(`${prefix}${property.name}${optional}`, readonly + print(t))
    reach(t)
  }
  for (const info of checker.getIndexInfosOfType(type)) {
    surface.set(`${prefix}[${print(info.keyType)}]`, print(info.type))
    reach(info.type)
  }
}

/**
 * The classes outside the kit up a class's chain, LitElement and its bases,
 * followed through each `extends` and through a mixin to the class it was
 * given: VfShadowRoleControl in `VfPositioned(VfShadowRoleControl)`.
 */
function theirClasses(symbol) {
  const out = []
  for (let decl = symbol.valueDeclaration; decl && ts.isClassLike(decl); ) {
    let expr = decl.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword)?.types[0].expression
    while (expr && ts.isCallExpression(expr) && expr.arguments.length) expr = expr.arguments[0]
    let base = expr && checker.getSymbolAtLocation(expr)
    if (base && base.flags & ts.SymbolFlags.Alias) base = checker.getAliasedSymbol(base)
    if (!base) break
    if (!isKit(base)) out.push(base)
    decl = base.valueDeclaration
  }
  return out
}

function listClass(symbol) {
  const name = symbol.getName()
  const statics = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration)
  const instance = checker.getDeclaredTypeOfSymbol(symbol)
  for (const signature of statics.getConstructSignatures()) {
    surface.set(`${name} constructor`, printSignature(signature, ts.SyntaxKind.ConstructorType))
    for (const parameter of signature.getParameters()) {
      reach(checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration ?? symbol.valueDeclaration))
    }
  }
  const theirs = theirClasses(symbol)
  members(instance, `${name}#`, theirs.map((s) => checker.getDeclaredTypeOfSymbol(s)))
  members(statics, `${name}.`, theirs.filter((s) => s.valueDeclaration).map((s) => checker.getTypeOfSymbolAtLocation(s, s.valueDeclaration)))
}

function listNamed(symbol) {
  const name = symbol.getName()
  if (symbol.flags & ts.SymbolFlags.Class) return listClass(symbol)
  const type = checker.getDeclaredTypeOfSymbol(symbol)
  const shape = type.flags & ts.TypeFlags.Object && !type.getCallSignatures().length && type.getProperties().length
  if (symbol.flags & ts.SymbolFlags.Interface || (symbol.flags & ts.SymbolFlags.TypeAlias && shape)) {
    members(type, `${name}.`)
    for (const signature of type.getCallSignatures()) {
      surface.set(`${name}()`, printSignature(signature, ts.SyntaxKind.FunctionType))
      reach(signature.getReturnType())
      for (const p of signature.getParameters()) reach(checker.getTypeOfSymbolAtLocation(p, p.valueDeclaration))
    }
    return
  }
  surface.set(name, print(type, ts.NodeBuilderFlags.InTypeAlias))
  reach(type)
}

// The values each entry exports, and every type.
for (const [entry, file] of Object.entries(ENTRIES)) {
  const module = checker.getSymbolAtLocation(program.getSourceFile(join(ROOT, file)))
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    if (!(symbol.flags & ts.SymbolFlags.Value)) {
      if (isKit(symbol)) queue(symbol)
      continue
    }
    if (symbol.flags & ts.SymbolFlags.Class) {
      surface.set(`${entry} ${exported.getName()}`, 'class')
      queue(symbol)
      continue
    }
    const decl = symbol.valueDeclaration
    let type = checker.getTypeOfSymbolAtLocation(symbol, decl)
    // A constant by its type: its value is behavior.
    if (ts.isVariableDeclaration(decl) && !decl.type) type = checker.getBaseTypeOfLiteralType(type)
    surface.set(`${entry} ${exported.getName()}`, print(type))
    reach(type)
  }
}
for (let i = 0; i < named.length; i++) listNamed(named[i])

// A type alias of an inferred shape (WindowManager is ReturnType<…>) prints as the whole shape: put its name back.
for (const symbol of queued) {
  if (!(symbol.flags & ts.SymbolFlags.TypeAlias)) continue
  const type = checker.getDeclaredTypeOfSymbol(symbol)
  if (!(type.flags & ts.TypeFlags.Object) || type.aliasSymbol === symbol) continue
  const shape = print(type)
  if (!shape.startsWith('{')) continue
  for (const [key, value] of surface) if (value.includes(shape)) surface.set(key, value.split(shape).join(symbol.getName()))
}

// The elements' HTML side.
const manifest = JSON.parse(readFileSync(join(ROOT, 'custom-elements.json'), 'utf8'))
for (const element of manifest.modules.flatMap((m) => m.declarations ?? []).filter((d) => d.customElement && d.tagName)) {
  const tag = `<${element.tagName}>`
  surface.set(tag, element.name)
  for (const a of element.attributes ?? []) surface.set(`${tag} attribute ${a.name}`, a.type?.text ?? '')
  for (const e of element.events ?? []) surface.set(`${tag} event ${e.name}`, e.type?.text ?? '')
  for (const s of element.slots ?? []) surface.set(`${tag} slot ${s.name || '(default)'}`, '')
  for (const p of element.cssParts ?? []) surface.set(`${tag} part ${p.name}`, '')
  for (const s of element.cssStates ?? []) surface.set(`${tag} state ${s.name}`, '')
}

// The tokens.
for (const line of readFileSync(join(ROOT, 'docs/SPEC.md'), 'utf8').split('\n')) {
  const token = line.match(/^\| `(--vf-[a-z0-9-]+)` \|/)?.[1]
  if (token) surface.set(token, '')
}

/** One of the levels src/shell/app-file.ts states. */
function level(name) {
  const module = checker.getSymbolAtLocation(program.getSourceFile(join(ROOT, 'src/shell/app-file.ts')))
  const symbol = checker.getExportsOfModule(module).find((s) => s.getName() === name)
  const type = symbol && checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration)
  if (!type?.isNumberLiteral()) throw new Error(`src/shell/app-file.ts: no ${name} to read`)
  return type.value
}

const books = {
  api: level('APP_API'),
  oldest: level('APP_API_OLDEST'),
  surface: Object.fromEntries([...surface].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
}
writeFileSync(join(ROOT, 'app-api.json'), JSON.stringify(books, null, 2) + '\n')
console.log(`app-api.json: app API ${books.api}, oldest ${books.oldest}, ${surface.size} names`)
