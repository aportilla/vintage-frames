# Publishing — soup to nuts

First-time guide for getting this library onto npm, keeping GitHub in sync,
and cutting versions properly. Steps that only ever happen once are marked;
the [release routine](#the-release-routine) at the bottom is the part you'll
come back to.

## Where things stand (checked 2026-07-30)

- **`vintage-frames` is unclaimed on npm** — the name is yours to take.
- **The GitHub repo exists and is public** (`github.com/aportilla/vintage-frames`),
  but local `main` is ahead of it — pushing is part of the flow below.
- **The publish gate is already in place**: `prepack` rebuilds `dist/` and runs
  `verify:manifest` before any tarball is cut, so a publish can't ship a stale
  or missing build. `npm publish --dry-run` exercises the identical path.
- **This machine is logged into nothing** — neither `npm` nor the `gh` CLI.
  SSH push to GitHub works regardless (the remote is `git@github.com:…`).

## Gaps to close before the first publish

Four things, none of them build system:

**1. A `LICENSE` file.** `package.json` says `"license": "MIT"`, but the field
is just metadata — the actual grant is the file, and GitHub/npm both look for
it. Create `LICENSE` at the repo root with the standard MIT text and
`Copyright (c) 2026 Adam Portilla`.

**2. The package.json pointer fields.** npm uses these to link the package
page to the repo, and provenance (later) requires `repository` to match:

```jsonc
"author": "Adam Portilla",
"repository": { "type": "git", "url": "git+https://github.com/aportilla/vintage-frames.git" },
"homepage": "https://github.com/aportilla/vintage-frames#readme",
"bugs": "https://github.com/aportilla/vintage-frames/issues"
```

(An email in `author` is optional and becomes public — leave it out unless you
want it out.)

**3. Font credit.** The package embeds two bitmap faces as base64, and both
are **genuine Apple strikes** — Chicago and Geneva, converted from the
original bitmaps via the `fonts/` pipeline (Apple's artwork, not lookalikes).
`fonts/README.md` documents the pipeline and provenance but not a license,
because there isn't one to point at: the rasters are Apple IP, and embedding
them in a public npm package is a deliberate distribution decision to make
before shipping to the world (the retired ChiKareGo and FindersKeepers
lookalikes survive in git history as the fallback plan).

**Settled 2026-08-08 — the naming half only.** The faces now ship as
`VF Display` and `VF Body`, stamped into the woff2 binaries by the build
(`fonts/manifest-to-font.py` since 2026-08-11, `fonts/add-glyphs.py` before
it) rather than merely declared in TS; before this they
registered as `'Chicago'`/`'Geneva'` and the binaries said `Chicago 15`/
`Geneva 12`. So the package no longer puts Apple's face names in a consumer's
`font-family` stack or in the shipped files. See fonts/README.md § Naming.
**This does not settle the distribution question** — the artwork is still
Apple's, and whether to embed it in a public package is unchanged and still
open. Renaming narrows the exposure; it is not a license. (The 32×32
System 7 caution icon no longer ships in the package — the kit carries no
raster art since `vf-alert` was cut; the artwork survives only as a demo
asset, `demo/icons/alert.png`, and `demo/` is outside `files`. The provenance
question now attaches to the repo and any hosted demo pages, not to npm.)

**4. The untracked docs.** ~~`ACCESSIBILITY-REVIEW.md` and `VF-STACK-PLAN.md`
are working notes sitting untracked in the repo root.~~ **Settled 2026-08-06:**
committed. The set is `ACCESSIBILITY-REVIEW.md`, `MOVABLE-CONTRACT-PLAN.md` and
this file (`VF-STACK-PLAN.md` is long gone — that work shipped). None of them
ship to npm; `files` controls that.

## One-time: the npm account

1. **Sign up at [npmjs.com](https://www.npmjs.com/signup).** Username is
   public and permanent-ish; the email gets a verification link — click it,
   npm won't let an unverified account publish.
2. **Turn on 2FA immediately** (Account Settings → Two-Factor Authentication,
   "Authorization and writes"). Use an authenticator app or passkey. npm
   requires 2FA for publishing in most flows now, and a hijacked package is
   the attack this prevents — it's not optional in spirit.
3. **Log in from this machine:**

   ```sh
   npm login
   ```

   It opens a browser to authenticate (2FA included) and drops a token in
   `~/.npmrc`. `npm whoami` confirms it took.

## The first publish

```sh
git push origin main
```

Then rehearse — this runs the full `prepack` gate (build + manifest
verification) and prints exactly what would ship, without shipping:

```sh
npm publish --dry-run
```

Read the file list. It should be `dist/`, `editor/`, `custom-elements.json`,
`SPEC.md`, `README.md`, `LICENSE`, `package.json` — about 140 files, ~320 KB
packed, no `src/`, no demos. If that looks right:

```sh
npm publish
```

You'll be prompted for a 2FA code. That's it — `vintage-frames@0.1.0` is live
and the name is claimed. An unscoped package like this is public by default
(no `--access` flag needed).

**Verify like a stranger would.** The npm page
(`npmjs.com/package/vintage-frames`) should render the README with the
repo link in the sidebar. Then prove a cold install actually works:

```sh
mkdir /tmp/vf-smoke && cd /tmp/vf-smoke && npm init -y && npm i vintage-frames lit
node -e "console.log(require.resolve('vintage-frames/vf-button.js'))"
```

**If 0.1.0 ships broken**: you have 72 hours to `npm unpublish
vintage-frames@0.1.0` while the package is new — but the boring fix is almost
always better: fix it, bump to 0.1.1, publish again. Versions are cheap;
treat every published one as immutable.

## Versioning — the rules of the road

npm versions are [semver](https://semver.org): `MAJOR.MINOR.PATCH`. A
published version can never be reused, and consumers' `^` ranges auto-accept
anything that doesn't signal breakage — that's the whole contract.

**You're pre-1.0, which has its own convention.** `^0.x.y` ranges only accept
*patch* updates, so while the version starts with 0:

| Change | Bump | Example |
| --- | --- | --- |
| Bug fix, docs, internal refactor | patch | 0.1.0 → 0.1.1 |
| New component, new attribute — additive | patch (or minor if it feels big) | 0.1.1 → 0.1.2 |
| Breaking: renamed attribute, removed export, changed default | **minor** | 0.1.2 → 0.2.0 |

Ship `1.0.0` when the API is a promise you intend to keep — from then on,
breaking changes cost a major. Given how deliberately the surface here has
been cut down (three export entries, `place` not `align`), 1.0 is a decision
about confidence, not readiness.

## The release routine

Every release, three commands:

```sh
npm version patch        # or minor / major — see the table above
git push --follow-tags
npm publish
```

`npm version` does more than edit a number: it commits the bump and creates a
git tag (`v0.1.1`) in one atomic step, so every published version has a
commit you can check out. `--follow-tags` pushes the tag with the branch.
`npm publish` runs the `prepack` gate as always.

**Release notes** — a `vX.Y.Z` tag on GitHub can carry them
([github.com/aportilla/vintage-frames/releases](https://github.com/aportilla/vintage-frames/releases)
→ "Draft a new release" → pick the tag, write what changed). Do this from the
web UI, or `gh release create vX.Y.Z --notes "…"` once you've run
`gh auth login`. For a solo project this beats maintaining a CHANGELOG.md —
the notes live where the tags live, and you can always generate a CHANGELOG
from them later.

## Later, when it earns its keep

Skip all of this for 0.1.0. Worth knowing it exists:

- **Trusted publishing (CI publishes, no tokens).** npm supports OIDC
  "trusted publisher" config: you register the GitHub Actions workflow on the
  package's npm settings page, and that workflow can then publish with no
  long-lived token anywhere — plus a provenance badge on the npm page proving
  the tarball came from a public build of your repo. The right move once
  releases are frequent enough that laptop publishing chafes.
- ~~**GitHub Pages for the demos.**~~ **Done 2026-08-08:**
  `vite.pages.config.ts` builds the three pages with the project-site base
  path, and `.github/workflows/pages.yml` deploys them on every push to `main`.
  What it publishes is the thing to know: the embedded Apple strikes, the
  System 7 icon crops, and — since `fonts/imported/` was un-gitignored the same
  day, so the Character Set window works on the deployed site — the whole
  80-strike collection under its own Apple family names, copied in by
  `scripts/copy-strikes.mjs`. That is the distribution question below arriving
  in hosted form, at collection scale.
- **Branch protection on `main`** — matters when a second contributor shows
  up, noise before then.
- **`npm dist-tags`** — `npm publish --tag next` publishes without moving
  `latest`, for release candidates. Irrelevant until you have users who'd be
  hurt by a bad `latest`.

## Pre-flight checklist

- [ ] `LICENSE` file (MIT text, your name)
- [ ] `author` / `repository` / `homepage` / `bugs` in package.json
- [ ] Apple-strike **distribution** decision made (both embedded faces) — the naming half is done (2026-08-08: they ship as `VF Display`/`VF Body`), the embed-Apple-artwork-at-all question is not; demo caution-icon provenance noted (repo/demo pages only — it doesn't ship). Scope grew 2026-08-08: `fonts/imported/` is now tracked and served from the demo site, so the repo distributes ~80 strikes under their original names — still outside the npm tarball, but public
- [x] Working notes committed rather than left ambient (2026-08-06)
- [ ] npm account, email verified, 2FA on, `npm login` done
- [ ] `git push origin main`
- [ ] `npm publish --dry-run` — read the file list
- [ ] `npm publish`
- [ ] npm page renders; cold `npm i vintage-frames` resolves in `/tmp`
