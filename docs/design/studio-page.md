# Studio page: one page per pack, the loop diagram, the readiness desk and the term map (design note)

Status: design for capsule-viewer#291 (Terms Pack Studio PRD v5 sections 2, 9, 12 Q8, 13, 15 items 3 to 5). Builds on
`docs/design/history-view.md`, whose shape it follows. **One part is gated on a ruling from Steven (section 7); nothing in
sections 1 to 6 depends on the answer.**

## 1. What is built, and where it lives

capsule-viewer owns it (PRD section 12 Q8: "capsule-viewer, offline"). There is no Studio application. Two kinds of page:

- **Report pages**, one per pack: the existing embedded or html page over a sealed bundle. They carry only the bundle. The
  rule "every page carries its bundle; the page runtime reads only that bundle" applies to these pages. This note reads the
  issue's "every page carries its bundle" that way (Steven asked for it in PRD section 2, which speaks of the report page).
- **The Studio home**, one static page per workspace (`studio-view/v0`, below): the loop diagram (the home), the readiness
  table (the desk) and, on request, a term map of one pack. It is a render of workspace files, which sit in no sealed bundle,
  so it carries its own snapshot of them and says so.

## 2. The input: `studio-view/v0` (a viewer-owned view model)

Like `history-view/v0`, the caller (the `terms` verbs in evidencebook-skills, a Python caller) builds the input from files it
already writes. The view draws; it never fetches and never verifies. Unknown members are refused.

| Member      | Source (evidencebook-skills `scripts/studio/`)                                                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`    | `"studio-view/v0"`                                                                                                                                                                                                                                                                                    |
| `active`    | the pack the page shows (a `pack_id` in `packs`)                                                                                                                                                                                                                                                      |
| `packs[]`   | the switch: `{pack_id, title?, pack_digest, judge?, page, format?, shared}` per pack; `format` is `html` (default) or `embedded`, never `static` (it drops the bundle and is not offered for sending); `page` is a relative path to that pack's report page; `shared` is `{kind, digest}` (section 7) |
| `readiness` | `packs/<id>/readiness.json` verbatim: `{pack_id, pack_version, records, terms[{term, statement, in_pack, status, detail, reads, missing_fields, filled_rate}], counts}` (`readiness.py:148`)                                                                                                          |
| `history[]` | `packs/<id>/history.jsonl` lines: `{digest, version, first_at, last_at, run, rehearsal, published}` (`workspace.py:98`)                                                                                                                                                                               |
| `dataset`   | `workspace.json`'s dataset reference: `{kind, digest}` (optional)                                                                                                                                                                                                                                     |

The five readiness statuses are the PRD section 5 chips (checkable now, needs examples, needs a field, needs the other side,
not this pack's concern); the view maps each to a word from `ts/src/wording/studio-view.en.json` and refuses a status it does not
know, never defaults it.

## 3. The views

- **Loop diagram (home).** The stages are derived only from members the input has: _Terms_ (a `readiness` with a pack digest),
  _Tried on past sales_ (a `history` entry with a `run` and `rehearsal` true), _Switched on_ (an entry with `published`). A stage
  with no evidence reads "not yet"; the diagram never infers a state.
- **Readiness table (desk).** One row per term with its status chip, detail, the fields it reads and the fields it lacks, and the
  counts line (`readiness.counts`).
- **Term map (on request).** A `<details>` per status group, closed by default, listing the terms and the fields each reads: a
  view of one pack, never a second pack beside it.
- **Switch.** One link per pack to its report page. It never draws two packs' verdicts in one page; a link carries the pack id,
  its pack digest and judge, and the shared digest.

## 4. The snapshot is unsealed, and says so

The home page embeds its input in `<script type="application/json">` and prints its SHA-256 beside it, labelled "Workspace
snapshot, not sealed evidence". Rebuilt from that embedded JSON the page is byte-identical (tested). It is not rebuilt from a bare
bundle, because a workspace is not a bundle. The page runs no script to draw (static HTML, no network).

## 5. The history card: card view and stapled form

The card is `standard_history/1` or `/2` (AAC spec/standard-history-v0.md section 4), JCS bytes. A stapled card is those bytes
with their SHA-256 (spec/bindings/evidence-commitment-carriers-v0.md, `history_cards[]`, V3). One function reads the card bytes
and returns the facts (the digest, counted deals, outcomes, roles, how it happened, disputes), and both forms draw from it, so they
cannot differ: the card view shows the facts in full; the stapled form shows one compact line with the same numbers and the same
digest. A card whose members or tallies do not satisfy section 4's partition rules is refused, drawn as a refusal in both forms.

## 6. Tests

- Page reads only its bundle: the built page runtime, run in jsdom with `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` and
  `localStorage` replaced by functions that fail the test, draws an embedded page; and the runtime source is checked for those
  names. A `static` page is not offered for sending (builder test).
- Byte-identical rebuild (report page from its bundle and settings; Studio home from its embedded JSON).
- An "anyone" page built as an `html` file, loaded in jsdom with no keys and no network, shows its checks passed (acceptance 4).
- Card and stapled parity on vectors.
- Studio-view vectors (accepted and refused), a golden page.

No Go twin and no DOM renderer: the page is static HTML, written by `studioViewDocument` in the npm package from the JSON the `terms` verb writes; a Go twin is added with its first Go caller.

## 7. Gated on Steven: two Results under one bundle digest

Issue acceptance 2: "Two report packs over one bundle draw as two pages that cite the same bundle digest, each citing its own
pack digest and judge."

- A bundle has one `root` and its digest covers it (draft-mih-zhang-agent-disclosure-bundle-03.md:225, :1452).
- AAC's TypeScript `buildResultRoot` refuses any bundle with a second Result v0 anywhere (agent-action-capsule
  `ts/src/result-root.ts:1713-1733`, `ts/docs/result-root.md:183`, rule dated 2026-09-28); the spec has no such rule.
- Options (ruling thread: buzz://message?channel=0d760ea3-529d-4dec-b309-24184967f8e0&id=f6c54ed8d280b078cc99f20c60fcd38ef3a41e6fd12601e5682ede6554f1dac1&thread=f6c54ed8d280b078cc99f20c60fcd38ef3a41e6fd12601e5682ede6554f1dac1):
  (i) relax the library rule and select the Result by a page parameter; (ii) one Result per bundle, the pages sharing the
  Result's `dataset_ref` (Result spec section 7.3).

Built here so either answer fits: `packs[].shared` is `{kind: "bundle_digest" | "dataset_ref", digest}` and the switch prints
the kind with the digest. Under (ii) every page is an ordinary single-Result page and nothing else changes; under (i) the report
page gains a Result selector in a follow-up PR. This PR does not change AAC and does not claim acceptance 2.

## 8. Doors and wording

- `studio-view/v0` is a viewer-owned input like `history-view/v0` and `chart-spec`: an additive reference format with no new
  product meaning. It adds no AAC member and no record type.
- Wording is the neutral pack `studio-view.en.json` (the five status words and section labels); it is public text, so Sherlock2
  reviews it.
