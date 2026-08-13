# Publishing

Guide to publishing this library on npm, keeping GitHub in sync, and versioning. One-time steps are marked; the [release routine](#the-release-routine) at the bottom is the recurring part.

## Where things stand (published 2026-08-11)

- **`vintage-frames@0.1.0` is live** — [npmjs.com/package/vintage-frames](https://www.npmjs.com/package/vintage-frames), published 2026-08-11 by `aportilla`, dist-tag `latest`. The shipped tarball matched the dry-run rehearsal exactly (163 files, ~530 KB packed), and a cold `npm i vintage-frames` in a scratch project resolves the root export, `vintage-frames/vf-button.js`, and `lit`.
- **The GitHub repo is public and `main` is in sync with it**; the Pages demo site is live at [aportilla.github.io/vintage-frames](https://aportilla.github.io/vintage-frames/).
- **The publish gate is in place and passing**: `prepack` rebuilds `dist/` and runs `verify:manifest` before any tarball is cut; it ran as part of the 0.1.0 publish.
- **This machine is logged into npm** (`aportilla`) but not the `gh` CLI. SSH push to GitHub works regardless (the remote is `git@github.com:…`).

## Gaps closed before the first publish

Four items, none of them build-system work:

**1. A `LICENSE` file.** ~~Create `LICENSE` at the repo root.~~ **Settled 2026-08-11:** standard MIT text, `Copyright (c) 2026 Adam Portilla`. The `package.json` field was always just metadata — the file is the grant, and GitHub/npm both look for it.

**2. The package.json pointer fields.** ~~Add them.~~ **Settled 2026-08-11:** `author`, `repository`, `homepage` and `bugs` are in. npm uses these to link the package page to the repo, provenance (later) requires `repository` to match, and npm rewrites the README's relative links against it. No email in `author` — it would be public.

**3. Font credit.** The package embeds two bitmap faces as base64 — `VF Display` and `VF Body`, the kit's own re-drawn strikes, authored glyph by glyph in `fonts/VF-*.glyphs.txt` and built from those manifests alone (no Apple binary goes into the build or is tracked in the repo). They reproduce the appearance of Chicago 12pt and Geneva 9pt, the classic Macintosh faces designed by **Susan Kare** for Apple — credit her and Apple as the original design authors wherever the faces are described. `fonts/README.md` keeps the pipeline and the design lineage.

**Settled for the embedded faces.** The naming half closed 2026-08-08: the faces ship as `VF Display`/`VF Body`, stamped into the woff2 binaries by the build (`fonts/manifest-to-font.py`) rather than merely declared in TS, so the package puts no Apple face name in a consumer's `font-family` stack or in the shipped files (see fonts/README.md § Naming). The artwork half closed 2026-08-11, when the plaintext glyph manifests became the source of truth and the Apple reference binaries moved out of the repository (`../vintage-frames-design-reference`): what ships is the kit's own artifact, sharing the classic faces' appearance rather than their files. **The `fonts/imported/` half closed 2026-08-11 too**, by subtraction: the ~80-strike collection of genuine Apple artwork left this repository with the faux desktop that browsed it, and now lives in [aportilla/system7web](https://github.com/aportilla/system7web). Nothing in `fonts/` is Apple's artwork any more — the directory is the kit's own manifests and the builder that compiles them. The distribution question did not go away; it moved to a repo whose subject *is* the classic system, and where it is no longer entangled with what a consumer installs from npm. (The 32×32 System 7 caution icon no longer ships in the package — the kit carries no raster art since `vf-alert` was cut; the artwork survives only as a demo asset, `demo/icons/alert.png`, and `demo/` is outside `files`. That question, too, attaches to the repo and any hosted demo pages, not to npm.)

**4. The untracked docs.** ~~`ACCESSIBILITY-REVIEW.md` and `VF-STACK-PLAN.md` are working notes sitting untracked in the repo root.~~ **Settled 2026-08-06:** committed. The set is `ACCESSIBILITY-REVIEW.md`, `MOVABLE-CONTRACT-PLAN.md` and this file (`VF-STACK-PLAN.md` is long gone — that work shipped). None of them ship to npm; `files` controls that.

## One README, shared

npm renders whatever `README.md` is in the tarball, so GitHub and npm show the same file — the consumer storefront: install, the components table, condensed sizing/layout, absolute links everywhere (they work on both sites). The depth lives in `docs/` — SPEC, DESIGN-TOKENS, SIZING, LAYOUT, FONTS, ICONS, CURSOR, ACCESSIBILITY, TOOLKIT, DEVELOPING, and this file — of which only `docs/SPEC.md` ships to npm. A pack-time README-swap scheme existed briefly (2026-08-11, same day) and was unwound in favor of this: one file, no machinery, `docs/` for the manual.

## One-time: the npm account

**Done 2026-08-11** — account `aportilla`, 2FA on, this machine logged in.

1. **Sign up at [npmjs.com](https://www.npmjs.com/signup).** Username is public and permanent-ish; the email gets a verification link — click it, npm won't let an unverified account publish.
2. **Turn on 2FA immediately** (Account Settings → Two-Factor Authentication, "Authorization and writes"). Use an authenticator app or passkey. npm requires 2FA for publishing in most flows, and it protects against package hijacking.
3. **Log in from this machine:**

   ```sh
   npm login
   ```

   It opens a browser to authenticate (2FA included) and drops a token in `~/.npmrc`. `npm whoami` confirms the login.

## The first publish

**Done 2026-08-11** — 0.1.0 went out exactly as described below; the dry run and the shipped tarball agreed (163 files, same shasum). Kept for the record.

```sh
git push origin main
```

Then do a dry run — it runs the full `prepack` gate (build + manifest verification) and prints exactly what would ship, without shipping:

```sh
npm publish --dry-run
```

Read the file list. It should be `dist/`, `editor/`, `custom-elements.json`, `docs/SPEC.md`, `README.md`, `LICENSE`, `package.json` — 163 files, ~530 KB packed (2026-08-11 rehearsal), no `src/`, no demos, and of `docs/` only the spec. If that looks right:

```sh
npm publish
```

You'll be prompted for a 2FA code. After that, `vintage-frames@0.1.0` is live and the name is claimed. An unscoped package like this is public by default (no `--access` flag needed).

**Verify the published package.** The npm page (`npmjs.com/package/vintage-frames`) should render the README with the repo link in the sidebar. Then check a cold install works:

```sh
mkdir /tmp/vf-smoke && cd /tmp/vf-smoke && npm init -y && npm i vintage-frames
node --input-type=module -e "console.log(import.meta.resolve('vintage-frames/vf-button.js'))"
```

(`import.meta.resolve`, not `require.resolve` — the exports map declares only the `import` condition, so CJS resolution correctly refuses it. No separate `npm i lit` either; `lit` is a dependency and comes along.)

**If 0.1.0 ships broken**: you have 72 hours to `npm unpublish vintage-frames@0.1.0` while the package is new, but the simpler fix is usually better: fix it, bump to 0.1.1, publish again. Treat every published version as immutable.

## Versioning

npm versions are [semver](https://semver.org): `MAJOR.MINOR.PATCH`. A published version can never be reused, and consumers' `^` ranges auto-accept anything that doesn't signal breakage — that is the contract.

**You're pre-1.0, which has its own convention.** `^0.x.y` ranges only accept *patch* updates, so while the version starts with 0:

| Change | Bump | Example |
| --- | --- | --- |
| Bug fix, docs, internal refactor | patch | 0.1.0 → 0.1.1 |
| New component, new attribute — additive | patch (or minor for a large addition) | 0.1.1 → 0.1.2 |
| Breaking: renamed attribute, removed export, changed default | **minor** | 0.1.2 → 0.2.0 |

Ship `1.0.0` when you intend to keep the API stable — from then on, breaking changes cost a major version.

## The release routine

Every release, three commands:

```sh
npm version patch        # or minor / major — see the table above
git push --follow-tags
npm publish
```

`npm version` does more than edit a number: it commits the bump and creates a git tag (`v0.1.1`) in one atomic step, so every published version has a commit you can check out. `--follow-tags` pushes the tag with the branch. `npm publish` runs the `prepack` gate as always.

**Release notes** — a `vX.Y.Z` tag on GitHub can carry them ([github.com/aportilla/vintage-frames/releases](https://github.com/aportilla/vintage-frames/releases) → "Draft a new release" → pick the tag, write what changed). Do this from the web UI, or `gh release create vX.Y.Z --notes "…"` once you've run `gh auth login`. For a solo project this is simpler than maintaining a CHANGELOG.md — the notes live with the tags, and a CHANGELOG can be generated from them later.

## Later

Skip all of this for 0.1.0:

- **Trusted publishing (CI publishes, no tokens).** npm supports OIDC "trusted publisher" config: you register the GitHub Actions workflow on the package's npm settings page, and that workflow can then publish with no long-lived token anywhere — plus a provenance badge on the npm page proving the tarball came from a public build of your repo. Worth setting up once releases are frequent.
- ~~**GitHub Pages for the demos.**~~ **Done 2026-08-08:** `vite.pages.config.ts` builds the demo pages with the project-site base path, and `.github/workflows/pages.yml` deploys them on every push to `main`. That is one page now — the component reference at the site root — and what it publishes is the System 7 icon crops plus the kit's own re-drawn faces. The 80-strike Apple collection it used to serve went to the system7web repo with the Character Set window that browsed it, so `scripts/copy-strikes.mjs` is gone and the deploy has no Apple artwork left to carry.
- **Branch protection on `main`** — matters when a second contributor shows up, noise before then.
- **`npm dist-tags`** — `npm publish --tag next` publishes without moving `latest`, for release candidates. Irrelevant until you have users who'd be hurt by a bad `latest`.

## Pre-flight checklist

- [x] `LICENSE` file (MIT text, your name) — 2026-08-11
- [x] `author` / `repository` / `homepage` / `bugs` in package.json — 2026-08-11
- [x] consumer-facing README shared by GitHub and npm; the manual split into `docs/` — 2026-08-11
- [x] Apple-artwork **distribution** decision — 2026-08-11. Closed for the two embedded faces: the kit ships its own re-drawn strikes as `VF Display`/`VF Body` (naming 2026-08-08, manifest-authored artwork 2026-08-11), crediting Susan Kare and Apple as the original designers. Closed for the collection by moving it out: `fonts/imported/`'s ~80 genuine Apple strikes went to the system7web repo along with the desktop that browsed them, so this repository distributes no Apple artwork at all. Demo caution-icon provenance noted (repo/demo pages only — it doesn't ship)
- [x] Working notes committed rather than left ambient (2026-08-06)
- [x] npm account, email verified, 2FA on, `npm login` done — 2026-08-11
- [x] `git push origin main` — already in sync 2026-08-11
- [x] `npm publish --dry-run` — 163 files, 530.3 kB, file list as expected — 2026-08-11
- [x] `npm publish` — 0.1.0 live 2026-08-11
- [x] cold `npm i vintage-frames` resolves from a scratch project (root, `vf-button.js`, `lit`) — 2026-08-11; registry metadata confirmed via `npm view`. The npm page's README render is a browser eyeball (automated fetches get a 403)
