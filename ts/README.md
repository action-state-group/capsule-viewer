# @action-state-group/capsule-viewer

capsule-viewer's page emitter and presentation builder: they turn an
[Agent Action Capsule](https://github.com/action-state-group/agent-action-capsule)
Evidence Bundle into a self-contained HTML page under AAC's presentation
contract (`spec/presentation-contract-v0.md`). The Go twin,
`github.com/action-state-group/capsule-viewer/go/emitter`, emits the same
bytes; both are held to shared goldens in `go/emitter/testdata`.

```ts
import {
  buildPresentation,
  emitEvidenceGraphHtml,
} from "@action-state-group/capsule-viewer";
```

The in-browser renderer (`renderEvidenceGraph`) ships bundled as
`dist/evidence-graph.iife.js`, for a page's core runtime slot, and the Go
module ships the same build as `go/pageruntime`. Bundle verification comes from
`@action-state-group/agent-action-capsule`. Besides `registerPresentation`,
the runtime's global `EvidenceGraph` carries the verifier functions a
presentation module may call: `buildResultRoot`, `disclosureOf`,
`ed25519Available`, `verifiedPayload`, `verifyDisclosureEnvelope` and
`verifyProducerEnvelope`.

The code moved here from agent-action-capsule (agent-action-capsule#281) and
keeps its BSD-3-Clause license (`LICENSE-BSD-3-Clause`); the rest of the
package is Apache-2.0 (`LICENSE`).

## Tuning the contract-report module's words

The contract-report module (`src/contract-report.ts`) resolves on
`contract-report/v1` (agent-action-capsule spec/contract-report-v1.md),
registered in place of `aac.builtin.result-contract-report/v0`. It draws
one of two layouts -- `lines` (the Outcomes report) or `groups` (the EU AI
Act Results) -- each with its own bundled default wording pack
(`src/wording/contract-report-outcomes.en.json`,
`src/wording/contract-report-eu-ai-act.en.json`). A host passes its own
pack as the page's `wording`; its entries replace the default pack's,
entry by entry.

**The module's own keys** sit under `card.*` (shared by both layouts: the
front block, dating, the proofs), `lines.*` (the Outcomes report only) and
`groups.*` (the EU AI Act Results only) -- plus the shared `prov.*`,
`chat.*`, `case.*` and `judge.*` prefixes. These are never contract-report/v1
section 3 keys: a pack cannot use them to set something section 3 owns, and
the module never uses a section 3 prefix for its own concepts. `card.pf.*`
is the per-claim proofs line (`card.pf.assurance`, `card.pf.assurance.line`,
`card.pf.wording`, `card.pf.wording.refused`, ...); `card.wording.refused` is
the visible notice a refused host layer draws.

**The section 3 keys this module reads**, and where each shows:

| Key                                                          | Shows                                                                                                                                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.title`                                               | The card's heading (aliased onto `lines.title` / `groups.kicker`).                                                                                                                |
| `report.summary`                                             | One line under the title, drawn only when set (`reportSummary`, `report-levels.ts`).                                                                                              |
| `group.<segment>.title`                                      | A group's heading -- the part of a row's `requirement_ref` before its first `.` (EU AI Act obligation headings; the Outcomes report's check groups).                              |
| `row.<requirement_ref>.label`                                | A row's name, in place of the producer's label or the id made readable.                                                                                                           |
| `row.<requirement_ref>.detail`                               | A row's explanation, drawn beside its name when set.                                                                                                                              |
| `row.<requirement_ref>.not_evaluable`                        | The note shown when a row's claims are not evaluable, in place of the module's own note.                                                                                          |
| `verdict.met`, `.not_met`, `.not_evaluable`, `.out_of_scope` | Aliased onto the layout's own verdict words (`lines.verdict.*` / `groups.verdict.*`, and the Outcomes proofs' `lines.pf.verdict.*`): every pill and cell that draws that verdict. |
| `tier.recomputed`, `.judged`                                 | Aliased onto the layout's own tier badge words.                                                                                                                                   |
| `grade.self-attested`, `.witnessed`, `.countersigned`        | Each claim's assurance line in its proofs (`assuranceRow`); locked, like `sufficiency.*` and `status.*`.                                                                          |
| `sufficiency.satisfied`, `.gap`, `.insufficient`, `.unknown` | The same assurance line.                                                                                                                                                          |
| `status.<value>`                                             | The same assurance line (the claim's carrier status, lowercased).                                                                                                                 |

A word with no entry, in any layer, is shown as its raw token or
identifier -- nothing is guessed. The default layer always words the
title (`lines.title` / `groups.kicker`, which `report.title` aliases). Until
the default EU pack carries `group.*` and `row.*` words, the EU card names
obligations and tests with the producer's labels, in italics as the
producer's text.

A Result whose claims the card cannot place one by one (a requirement
judged more than once in one conversation, claims under more than one
contract, claims of another type or id shape) is drawn as the generic
Result page, with a note, so no claim is merged or left out.

**The single-contract rule.** `row.*` and `group.*` apply only when every
claim in the Result cites the same `contract_ref` (`citesOneContract`,
contract-report.ts): a pack is written for one contract, and two contracts
can reuse one `requirement_ref` for different requirements. A Result that
cites more than one contract is drawn as the generic Result page (see
above), so the rule is a second guard for callers that draw a card directly.

**The refused-layer rule.** Each wording layer is checked on its own
(digest, shape, then fit against this module's words). A layer that does
not check is refused: it contributes no words, and the card draws with the
default layer alone, a visible `card.wording.refused` line
(`data-wording="refused"`) naming the reason, and a `card.pf.wording.refused`
proofs line naming the refused digest and the base layer that was applied
instead. The presentation builder (`buildPresentation`,
`presentation-builder.ts`) still refuses to _write_ a page whose pack does
not fit -- the graceful degrade above is only the live renderer's behaviour.

Releases follow [RELEASING.md](https://github.com/action-state-group/capsule-viewer/blob/main/RELEASING.md).
