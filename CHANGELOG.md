<!-- SPDX-License-Identifier: Apache-2.0 -->
# Changelog

All notable changes to capsule-viewer's published packages, the npm package
`@action-state-group/capsule-viewer` (`ts/`) and the Go module
`github.com/action-state-group/capsule-viewer/go` (`go/`), are documented
here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/) once it reaches 1.0.

## Unreleased

### Breaking

- Python `capsule_viewer.ledger`: the page is drawn over an evidence file the
  ledger's producer wrote, such as `capsule-emit bundle LEDGER --all`; the
  viewer no longer builds one. `ledger_bundle()` is removed,
  `check_and_render(bundle, *, source, depth)` takes that bundle instead of
  the ledger's records, and `python -m capsule_viewer.ledger BUNDLE.json`
  reads a bundle file instead of a JSONL ledger. Requires capsule-emit 0.12
  (`capsule-emit>=0.12,<0.13` in the `evidence` and `dev` extras), which
  removes the `permalink.build_bundle` this used (capsule-emit#338).

### Fixed

- The outcome report counts the criteria each conversation was judged on
  instead of always saying "nine", and fits a 390px viewport: the header
  stacks at narrow widths, and the day calendar keeps each date on one line.
  Ported from agent-action-capsule#323. The Go emitter's CSP hash for
  `OUTCOME_REPORT_CSS` (`go/emitter/runtime-style-hashes.txt`) follows, so a
  page whose runtime carries the new stylesheet is not blocked.

## ts 0.1.0 and go 0.1.0 (2026-10-16)

The first release of the npm package and of the Go module (tag `go/v0.1.0`).

### Added

- The page emitter and presentation builder, moved from agent-action-capsule
  (agent-action-capsule#281) and still pinned to the same Go/TypeScript
  byte-parity goldens and CSP hashes:
  - Go: package `github.com/action-state-group/capsule-viewer/go/emitter`,
    the former `github.com/action-state-group/agent-action-capsule/go/emitter`,
    with the same API. It depends on agent-action-capsule's Go module v0.8.0.
  - TypeScript: `emitEvidenceGraphHtml`, `buildPresentation`,
    `offlineHtmlFromFragment` and the rest of agent-action-capsule's
    `emitter.ts` and `presentation-builder.ts` exports, from the package
    root. The in-browser renderer (`renderEvidenceGraph`) ships bundled as
    `dist/evidence-graph.iife.js`. Bundle verification comes from
    `@action-state-group/agent-action-capsule` 0.1.1, now a dependency, along
    with `@action-state-group/cll`, which that version needs to load.
- The moved files keep their BSD-3-Clause license (`ts/LICENSE-BSD-3-Clause`,
  `go/emitter/LICENSE`).

## ts 0.0.0

A placeholder, published by hand so npm could take a trusted publisher. It
holds no code; see RELEASING.md, "Registry configuration".
