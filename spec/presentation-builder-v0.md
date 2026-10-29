<!-- SPDX-License-Identifier: BSD-3-Clause -->

# Presentation Builder — v0

> **Moved.** This document moved here from agent-action-capsule's
> `spec/presentation-builder-v0.md` at `60a5b119a1a979b1970d22caec8577eac0bb59e8`
> (AAC#379). It changed only by the declared edits that `scripts/check-moved-spec.py` lists
> and checks: repository paths that now name agent-action-capsule, and citations where text
> that stays there was. It is BSD-3-Clause, as it was there (agent-action-capsule's
> `LICENSING.md` section 2; the text is `LICENSE-BSD-3-Clause`), not Apache-2.0 like the rest
> of this repository.

**Status.** Design specification beside `spec/presentation-contract-v0.md`. This document defines
the one builder that turns a verified Evidence Bundle into a page for one audience, and the four
ways it packages that page: one offline `.html` file, a fragment permalink, an element in a host
page, and a static page that runs no script. It also defines how the builder reports that a
packaging is unavailable for a bundle. The reference builder lives in this repository
(`ts/src/presentation-builder.ts`, `ts/src/presentation-mount.ts` and
`ts/src/presentation-fragment.ts`); the Go twin of the offline packaging is
capsule-viewer's `go/emitter/presentation.go`. The static packaging is TypeScript only (section 2.4).

The key words MUST, MUST NOT, SHOULD and MAY are to be interpreted as described in BCP 14
(RFC 2119, RFC 8174) when, and only when, they appear in all capitals.

## Dependency boundary

**Owns:** `buildPresentation`; the four packagings; `availablePackagings` and its reasons; the
fragment payload `aac.presentation-fragment/v0`; the fragment size limits and the default link
budget; the static page and its statement; the share-side scoping step; the hand-back from a
fragment to the offline file; the one wording key the builder reads (`page.title`).

**Depends on, and does not redefine:** bundle verification and `VerifiedBundleContext`
(agent-action-capsule's `ts/src/bundle.ts`); the registry, the manifest, the formats `html` / `fragment` / `embedded`,
the invariants I1 to I6 and the wording pack (`spec/presentation-contract-v0.md`); the emitter
shell, its slots and its per-page Content-Security-Policy (capsule-viewer's `ts/src/emitter.ts`
and `go/emitter/emitter.go`); the Evidence Bundle permalink codec (the "Fragment Codec" section of
`draft-mih-zhang-agent-disclosure-bundle`).

**Out of scope:** hosting a viewer, caching, delivery, and any server. Nothing here needs a host
to verify a bundle, and nothing here creates one.

## 1. The call

```ts
buildPresentation(context, { presentation, audience, format, ...settings })
```

- `context` is a `VerifiedBundleContext`, or a bundle (verified once by the call).
- `presentation` is `"auto"` or the id of the module the caller expects. The builder asks the
  registry (`resolve(context, audience, format)`); it never selects a module itself. An explicit
  id that the registry does not select is an error, and so is an ambiguous match.
- `audience` is an audience token; `"*"` is no particular audience.
- `format` is a packaging target: `html` (offline file), `fragment` (permalink), `embedded`
  (host element) or `static` (no-script page). The first three are the contract's formats; the
  static page is the `html` page rendered at build time, so the registry resolves it, and the
  module renders it, as `html`.
- Settings: `runtime` (the core runtime and, optionally, its pin; required for `html` and
  `fragment`), `modules` (digest-pinned module-slot scripts), `registry` (the resolver; the
  built-ins when omitted), `disclose` (section 3), `depth`, `title`, `themeCss`, `wording` (a
  wording pack's exact text and its `wording_sha256`), `charts` (a list of chart specs, below),
  `maxFragmentLength`, `viewerUrl`.

The steps run in this order: scope (section 3), verify the scoped bundle, resolve, package. Every
packaging carries the same scoped bundle and the same settings.

**A module the page's runtime would refuse.** A module-slot script may be given with its manifest,
which must pin it (`executable.carrier` `module-slot`, `script_sha256` equal to the script's pin).
When the page's runtime would refuse that module (presentation contract section 3.2:
`presentation_api_unsupported` or `runtime_too_old`), or when `presentation` names a module the
registry holds as refused, the builder writes no page in any packaging and fails with
`PresentationModuleRefusedError`, naming the module's id, `presentation_api` and `runtime_min`
and the runtime's declaration (the `presentation_api` values it implements and its version). The
page's runtime is the registry's when the builder resolves with a `PresentationRegistry`, and the
reference runtime otherwise. `availablePackagings` throws the same error: it is an error of the
request, not of one target.

**Module stylesheet pins.** A module-slot script carries the SHA-256 pins of the stylesheets it
inserts at render time (`styleSha256`; Go: `Module.StyleSHA256`), and the builder passes them to
the emitter, which lists each in the page's `style-src` (presentation contract section 5.1). When
the script is given with its manifest, the manifest's `executable.style_sha256` (absent: empty)
MUST equal the script's pins as a set: order and repetition decide nothing. Otherwise the builder
writes no page in any packaging and fails with `PresentationStylePinsError` (Go:
`*StylePinsError`), naming the module's id and both lists as given. The Go offline packaging
(`BuildOfflineHTML`, and so `OfflineHTMLFromFragment`) applies the same check to a `Module` given
with its `Manifest`, after the same check that the manifest pins the script. A page with no
module stylesheets is unchanged byte for byte.

**Chart specs.** `charts` is an ordered list of chart specs, each a Vega-Lite v5 document in the
closed subset of `docs/design/chart-spec.md`, checked against the dataset the bundle's Evidence
Result names (`plan_ref` and `dataset_ref`, agent-action-capsule `spec/evidence-result-v0.md`
§7.3). After resolving, the builder checks every spec against the scoped, verified bundle; when
any spec fails, it writes no page in any packaging and fails with `PresentationBuildError`, naming
each failing spec by its position and its refusal reason. A bundle that did not verify, or whose
root is not a Result naming a disclosed dataset, fails every spec (`chart-no-dataset`). The
`html` and `embedded` packagings carry the specs in the page's render options; the page runtime
checks them again and draws each in L1, or the core's notice in place of a spec that fails. The
`static` page carries the drawn charts and no spec. A `fragment` cannot carry them
(`fragment-has-charts`). The page's "How this page was checked" section states each spec's
SHA-256, over its JCS. An entry with a `view` member is a calendar or by-period view
(`docs/design/report-views.md`), a set of chart specs checked together; it is checked, carried
and stated the same way. With no `charts`, every packaging is unchanged byte for byte. The Go
offline builder (`OfflineOptions.Charts`) checks the specs with `go/chartspec` and carries them
the same way.

**Supported targets.** The builder supports four packaging targets: `html`, `fragment`,
`embedded` and `static`. A target is *supported* for one (bundle, audience) and one set of
settings when the builder can package it; otherwise it is *unavailable*, and the builder says so
(section 1.1). It never hands out a packaging that cannot be used, such as a link too long to
share.

### 1.1 Availability

```ts
availablePackagings(context, { presentation, audience, ...settings })
  // => [{ target, available: true } | { target, available: false, reason }, ...]
```

`availablePackagings` takes the same arguments as `buildPresentation` without `format` and
returns one entry per target, in the order `html`, `fragment`, `embedded`, `static`. It returns
no packaging. An entry is `available: true` exactly when `buildPresentation` succeeds for that
target with the same settings. Otherwise it is `available: false` with a `reason`:

| `reason.code` | Target | Meaning | Other members |
|---|---|---|---|
| `fragment-too-large` | `fragment` | The token, or the whole URL with `viewerUrl`, is over the budget. | `subject` (`"fragment token"` or `"permalink URL"`), `length`, `limit` |
| `fragment-has-charts` | `fragment` | The build has `charts`, which a fragment does not carry. | |
| `runtime-missing` | `html`, `fragment` | No core runtime was given. | |
| `no-document` | `static` | No DOM `document` to render with at build time. | |
| `static-carries-script` | `static` | The rendered page holds a script element or an event-handler attribute. | |
| `static-body-unbuilt` | `static` | A toggle's body could not be built at build time, so it would open empty. | `unbuilt` (each such toggle's summary text, or the tag of a pending body that is not a toggle) |
| `static-too-large` | `static` | The page, with every toggle's body built, is over its size budget. | `bytes`, `limit` |

Every reason also carries a `message` in words. An error of the request itself (no audience, a
bad depth or wording pack, an ambiguous registry, a requested presentation the registry does not
select, scoping a bundle that did not verify, a chart spec that does not match) is not a
packaging question: it is thrown, by both calls, as it is for every target alike.

A direct `buildPresentation` call for an unavailable target throws. A fragment over its budget
throws `FragmentTooLargeError` (with `length`, `maxLength` and `subject`), as it always has; the
other reasons throw `PackagingUnavailableError`, a `PresentationBuildError` carrying the same
`reason`.

## 2. The four packagings

### 2.1 Offline `.html` (`html`)

One self-contained file: the shell, the scoped bundle in `BUNDLE_SLOT`, the core runtime in
`CORE_RUNTIME_SLOT`, any modules in `MODULE_SLOT`, the theme in `THEME_SLOT`, the title in
`TITLE_SLOT`, and a bootstrap that calls `renderEvidenceGraph` with the audience, the format, the
depth, the wording pack and the chart specs. The shell's `<noscript>` line tells a reader with
scripts off that the page needs them and that a copy without scripts is built with
`render-report --format static`. The page carries the emitter's per-page Content-Security-Policy
(`default-src 'none'`, `connect-src 'none'`, and every inline script and style by hash), so it
makes no request and runs no script it was not built with.

The title is the `title` setting, else the wording pack's `page.title` entry, else the shell's
default. The wording pack's bytes MUST hash to its `wording_sha256`, and the pack MUST be an
`aac.wording-pack/v0` object, or the build is refused. Theme, wording, locale and depth are
presentation only (contract I3): changing any of them changes the file's bytes and never an
evidence identifier.

With the default settings (audience `"*"`, no depth, no wording, no charts) the builder writes
exactly the page `emitEvidenceGraphHtml(bundle, runtime)` writes, byte for byte.

### 2.2 Fragment permalink (`fragment`)

The payload travels in the URL fragment, which a browser never sends over the wire, so the link
needs no host to hold the data: `viewer.html#<token>`.

**Codec.** The token is the Evidence Bundle permalink codec applied to the payload: RFC 8785 JCS
text, UTF-8, base64url (RFC 4648 section 5) without padding. This is the model of
capsule-viewer's fragment codec (`src/capsule_viewer/fragment.py`: base64url of the compact JSON,
no padding). For a payload whose JSON text is ASCII, read in JCS member order, the two write the
same token. For non-ASCII text, `fragment.py` writes `\uXXXX` escapes (Python's
`ensure_ascii`) where the bundle codec writes UTF-8; each decoder reads the other's token. The
shared vectors are agent-action-capsule's `vectors/bundle/fragment/vectors.json`. The decoder here is
stricter than `fragment.py` in one way: a character outside the base64url alphabet is an error,
where Python drops it.

**This is not a security mechanism.** The payload is encoded, not encrypted. Anyone who holds
the link can read all of it. What an audience may see is decided before encoding (section 3).

**Payload** (`aac.presentation-fragment/v0`; unknown members are an error):

| Member | Meaning |
|---|---|
| `fragment_version` | The constant `"aac.presentation-fragment/v0"`. |
| `audience` | The audience token. |
| `presentation` | The module id the builder resolved, or `"auto"`. Informational. |
| `depth`, `title`, `theme_css` | Optional settings, as in section 1. |
| `wording` | Optional: `{pack, sha256}`, the pack's exact text and its digest. |
| `core_runtime_sha256` | Lowercase hex SHA-256 of the core runtime the page was built with. |
| `module_sha256` | The pins of the module-slot scripts, in order. |
| `bundle` | The scoped bundle. |

Code travels by pin, never inline: the token stays small and a viewer runs only code it already
holds.

**Size limits.** The longest URL planned for is 1,048,576 characters (1 MiB), the smallest of the
major browsers' documented limits. 2,048 characters are kept for the viewer's address and the
`#`, so the longest token is 1,046,528 characters (`FRAGMENT_TOKEN_MAX_LENGTH`). That is a ceiling,
not a link anyone can share: chat and email cut links far shorter. The builder therefore packages a
fragment within a **budget**, by default 65,536 characters (`FRAGMENT_TOKEN_DEFAULT_BUDGET`), and
a caller MAY lower it or raise it up to the ceiling (`maxFragmentLength`); a budget above the
ceiling is an error. A monthly report of a few hundred kilobytes is over the default budget, and
its fragment is reported unavailable (section 1.1), not packaged as an unusable link. A token over
the budget, or a whole URL over 1 MiB when `viewerUrl` is given, is refused with
`FragmentTooLargeError`, which names the length and the limit. Nothing is ever truncated. The
codec's own encoder and every decoder keep the ceiling as their limit, so any link a caller chose
to make opens; a decoder refuses an over-long token before decoding it. A bundle too large for a
permalink is shared as the offline file or the static page.

**Go.** `BuildPresentationFragment` (go/emitter) packages the same fragment: for the same scoped
bundle, runtime and settings it writes the same token and URL, and refuses the same over-long ones
with `*FragmentTooLargeError`. It takes the module id the caller resolved as `Presentation`
(`"auto"` when empty), and an empty `Title` or `ThemeCSS` is treated as unset. Seeded vectors
generated by the TypeScript builder (`go/emitter/testdata/fragment-vectors.json`) hold the two
together.

**The viewer.** `buildFragmentViewerHtml(runtime)` writes a serverless viewer: an offline page
with the same shell and CSP whose data is its own `location.hash`. It renders the payload as the
`fragment` format. It applies no theme CSS from the fragment, since its CSP admits only the styles
hashed into it; the theme is restored in the offline file. A fragment that cannot be read shows a
fixed statement and nothing else.

**The hand-back.** A hosted permalink is optional transport over the same artifact. Any viewer
holding the runtime and modules the payload pins MUST be able to hand back the exact offline file:
`offlineHtmlFromFragment(token, runtime, modules)` (Go: `OfflineHTMLFromFragment`) rebuilds it,
and its bytes equal what `buildPresentation(..., {format: "html"})` writes for the same bundle,
audience and settings. A runtime or module set that does not match the pins is refused rather
than used to build a different file.

### 2.3 Embedded (`embedded`)

`mount(element)` renders the scoped bundle into a host element with the same audience, depth
and wording, as the `embedded` format, through the caller's registry. The host page owns its own
CSP.

**Snippet.** Given the core runtime, the result also carries `html`: a snippet a host page inlines
where the presentation goes, which makes `mount`'s call with the same options. It holds the core
runtime and each module as inline scripts, an empty `<div data-aac-embedded>`, the scoped bundle as
a `<script type="application/json">` data element, and a bootstrap that reads the bundle with
`JSON.parse` and calls `renderEvidenceGraph` on that element with `mount`'s options (audience,
`format: "embedded"`, depth, wording), written as JCS. The snippet carries no CSP. The result's
`scriptSources` and `styleSources` are the hash sources of its inline scripts and of the stylesheets
the core runtime and the modules insert. A host CSP that allows them, with no `'unsafe-inline'`,
runs it. Title and theme are the host's. Unlike `mount`, the snippet takes no caller registry. It
resolves, as the offline file does, with the default registry the core runtime holds, which its
module scripts register with (`registerPresentation`), so a module that is only in the caller's
registry does not render. Go's `BuildEmbeddedHTML` (go/emitter) writes the same bytes and sources,
held together by seeded vectors that the TypeScript builder generates
(`go/emitter/testdata/embedded-vectors.json`).

### 2.4 Static page (`static`)

The same presentation model, rendered at build time into HTML that runs no script at all. The
builder renders the scoped bundle exactly as the offline file renders it in the reader's browser
(the same bundle, audience, `html` format, depth, wording pack and registry), and writes the
result into the emitter's shell, with its base stylesheet, title and theme, and nothing else: no
bundle element, no core runtime, no module, no bootstrap.

**Statement.** The page states, before the rendered content, the constant
`STATIC_NOT_SELF_VERIFYING`:

> Not self-verifying; verify the bundle separately.

then the constant `STATIC_BUILD_TIME_STATEMENT`:

> This page runs no code. It shows the verification result computed when it was built and cannot
> re-verify anything in your browser.

then the verification result the builder computed at build time ("verified" or "did not
verify"), which is also on the notice as `data-built-verification` and returned as
`verification`. That result is the one the rendered content shows; the builder refuses to write a
page where the two differ.

**CSP.** `default-src 'none'; script-src 'none'; style-src <hashes>; img-src data:;
connect-src 'none'; base-uri 'none'; form-action 'none'`. Every `<style>` element the page carries
is listed by hash. A rendered element's `style` attribute (a bar's width, for one) is listed by
hash under `'unsafe-hashes'`; no other inline style applies. The page makes no request and runs
nothing. The builder refuses (`static-carries-script`) a rendering that holds a script element or
an event-handler attribute, which the CSP would block anyway.

**Every body is built.** Where script runs, a toggle's body is built the first time it opens.
The static page runs none, so before it is written the builder builds every body still pending,
with the same builders the toggles run, and leaves every toggle open or closed as the depth left
it: a reader who opens any toggle sees what the offline file shows there. Each conversation is
kept once, in the core's records section, and the cards link to it. A body the builder cannot
build is refused (`static-body-unbuilt`), never written as an empty toggle.

**Size.** The result returns the page's size in UTF-8 bytes (`bytes`) and the budget it was
checked against (`limit`). The budget is 16 MiB by default (`STATIC_PAGE_DEFAULT_BUDGET`); a
caller MAY lower or raise it (`maxStaticBytes`, a positive integer). A page over it is refused
(`static-too-large`, naming the size and the budget), never written with bodies left out. A
monthly report is a few megabytes: the 451-record outcome fixture builds to about 6.0 MB and
the 80-session compliance fixture to about 2.2 MB, the same at every depth.

**What it does not do.** It does not carry the bundle: the reader verifies the bundle, shared
separately, with a verifier they trust. Controls that the scripted page answers on click (a row's
detail, a claim's detail, a cited record) are written but do nothing; native `<details>`
disclosure still opens. It needs a DOM `document` at build time; in Node that is a jsdom
document set as `globalThis.document`, and without one the target is unavailable
(`no-document`). There is no Go twin: the presentation model is rendered by the TypeScript
modules only.

**Use.** A copy for a reader who should not run code from the sender, and a copy whose every byte
is data that a share-side check can read whole, with no vendored script to exempt.

## 3. Scoping

Scoping decides what one audience may see. It happens in the share builder, before anything is
encoded or packaged, and never in a viewer: a viewer shows the bundle it was given.

`disclose` is an allow-list from `capsule_id` to the members (`agent_input`, `agent_output`) the
audience may see. Every other disclosure is removed from the bundle, so the recipient's verifier
reads it as withheld; the records, certificates, checkpoints and proofs are untouched, so the
scoped bundle verifies wherever the input did. Without `disclose`, the disclosures are packaged as
they are. Scoping only removes; it never adds, rewrites or reorders.

The builder refuses to scope a bundle that did not verify: removing a disclosure could turn a
mismatch into a withheld member and hide the failure.

Like the codec, scoping is not a security mechanism. It decides what is put in the artifact;
whoever holds the artifact can read everything in it.

## 4. Acceptance

Acceptance is over (bundle, audience) pairs (contract I4). **Identical semantics across SUPPORTED
packagings:** for one bundle and one audience, every packaging that is available (section 1.1)
MUST select the same module and show the same verified content, the same verification state and
the same evidence identifiers. A packaging that is unavailable is reported, never approximated.
The rendered markup is compared as HTML parsing reads it: a static page is parsed, and parsing
adds the elements HTML implies (a table row's `tbody`), which a page drawn by script may omit.

capsule-viewer's `ts/test/presentation-builder.test.ts` checks this over the fixtures for each built-in page shape
and a bundle that does not verify, for three audiences, in all four targets, by rendering each
packaging and comparing what it shows, and checks that `availablePackagings` reports exactly the
targets that built; the only unavailability the fixtures meet is a fragment over its budget. Two
monthly-scale compliance bundles, derived deterministically from the committed two-session
fixture (capsule-viewer's `ts/test/helpers/monthly-fixtures.ts`: 40 sessions, about 490 KB, and 80 sessions, about
1 MB), assert that the fragment is reported unavailable with its length and limit, at the default
budget and, for the larger, at the ceiling, while the other three targets show the same thing.
Every static page in the table is checked for no script, its CSP and its statement. The same file
checks that theme, wording, locale and depth leave every evidence identifier unchanged, and
its `ts/test/presentation-builder-browser.test.ts` opens the offline file, the fragment URL and the
static page in a CSP-enforcing browser and finds no request beyond the document itself, no CSP
violation, and the static page showing what the offline file shows.

The Go and TypeScript offline outputs match byte for byte for the same inputs
(capsule-viewer's `go/emitter/testdata/expected-offline.html` and `offline-fragment.txt`).

## 5. Known gaps

1. The built-in modules do not read wording packs yet. The pack is checked, carried in the page
   and used for the title; the modules keep the core's own labels.
2. The viewer does not check its own runtime against `core_runtime_sha256`: it renders with the
   runtime it holds. The hand-back does check.
3. The countersigner list of the caller's context does not travel in any packaging; a page names
   no independent countersigner unless its host supplies a list.
4. The offline file's `<html lang>` stays `en` whatever the wording pack's locale. So does the
   static page's.
5. The static page's click-driven controls are inert (section 2.4); what they would reveal is
   not on the page.
6. The fragment's `module_sha256` pins module scripts only. A module's stylesheet pins are not
   in the fragment: the hand-back takes them from the modules it is given, and checks them
   against a manifest given with a module.
