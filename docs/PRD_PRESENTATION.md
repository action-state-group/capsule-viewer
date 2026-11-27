# PRD: Evidence presentation (receipts, History, Results, ad hoc answers) · v1.3 · 2026-11-27

**What this is.** The product requirements for every human- and machine-readable view of an
Evidence Bundle, for any host: a chat agent, a desktop agent, a mesh node, the command line. It
is v1.3 of PRD_VIEWER_PRESENTATION. Its product-neutral sections (v1.2 §3, §4, §6, §7, §11, §14
and §15) move here, so the people who build the viewer can read them. Host-specific requirements
(one host's measurements and its own profiles) stay in that host's private PRD.

**What it is not.** It is not a spec. The mechanics are already specified, and this document
cites them instead of restating them:

| Spec | What it fixes |
|---|---|
| [`spec/presentation-contract-v0.md`](../spec/presentation-contract-v0.md) | Pipeline (§2), module interface and immutable context (§3), manifest and resolution (§4), trust classes (§5), chrome rule and the one check list (§6), text binding and wording packs (§7), invariants (§8), L0/L1/L2 (§9) |
| [`spec/presentation-builder-v0.md`](../spec/presentation-builder-v0.md) | The four packagings and audience scoping (§3), which only removes |
| [`spec/contract-report-module-v1.md`](../spec/contract-report-module-v1.md) | Obligation and outcome reports over an Evidence Result |
| agent-action-capsule `spec/verification-display-v0.md` | What "verified" may mean on a page (§6.1), the banner and the refusal (§6.2) |
| agent-action-capsule `spec/evidence-result-v0.md` | Results: claims, tiers, grades, disclosure carriers |
| [`docs/design/`](design/) | One note per profile: `receipt-view-model.md`, `receipt-presentation.md`, `history-card.md`, `history-view.md`, `contract-report-layout.md`, `report-views.md`, `adjudications.md` |

**Rule for changes.** A new requirement extends a section here. A design note cites the section it
serves. A second document with the same job needs a written reason and the item that retires the
first.

---

## 1. One sentence

> The unit of extensibility is a **verified presentation of an Evidence Bundle for a particular
> relying party**, from six lines for a consumer to twenty pages for an auditor, on one substrate.

## 2. The model

```
sealed records ─▶ Evidence Bundle (+ audience scoping: builder only, removes only)
                     │
                     ▼
                 verify core ─▶ VerifiedBundleContext            (one check, one vocabulary)
                     │
                 registry.resolve(context, audience, format)     (the manifest picks the profile)
                     │
                 buildModel(context) ─▶ VIEW MODEL (JSON)         (derived, never sealed;
                     │                                            every field has a source)
                     ▼
     render ─▶ L0 what matters · L1 why · L2 verify  ─▶ html | fragment | embedded | static
                     │
                     └─▶ projections: chat card · image · text   (presentation, never proof)
```

**Invariants** (carried from v1.2 §3; the contract's §8 is normative):

- R2 An ambiguous manifest match is an error, never first-wins. Priority ranks a specific module
  above a fallback only.
- R3 A failed verification collapses to the refusal ("did not verify … not shown"), never to L0.
  Depth selects among verified content only.
- R4 One (bundle, audience) pair gives the same semantic content and verification state in every
  supported packaging. A packaging that is unavailable for a bundle (for example a fragment
  permalink over its size budget) is reported with its reason, never shipped partial.
- The `VerifiedBundleContext` is effectively immutable. A module cannot change what a later module
  sees.
- R6 Every page carries its own CSP (`default-src 'none'; connect-src 'none'; img-src data:;
  script-src 'sha256-…'`). The script hash is the pin.
- R7 Evidentiary words bind through a registered mechanism. Presentation words never seal (§6).
- Theme, wording, locale and default depth never change an evidence identifier.

## 3. Human-readable and machine-readable: one pair, one source

Every report is **two artifacts from one view model**:

| Artifact | For | What it is |
|---|---|---|
| **The bundle**, embedded in the page and downloadable | a checker, a counterparty's agent, `capsulectl verify --bundle` | The proof. Sealed, signed records. |
| **The view model JSON** | any agent answering questions about the report | `buildModel`'s output. Derived, never sealed, so it adds nothing a checker must trust. Each field is `{value, src}`, where `src` is a record id plus a JSON pointer, or a bundle pointer (`receipt-view-model.md` §2). Words come from wording keys. |
| **The page** and its projections | a person | Drawn from the same view model. |

Requirements:

- **H1 Same reading everywhere.** A host's chat answer, the page, the image and the text form read
  the same view model, so they cannot disagree. A host never reads the bundle to answer a question.
  For anything the view model does not hold, it points to the page instead of guessing.
- **H2 One owner.** The view model for the neutral profiles (receipt, History, Results) is
  capsule-viewer's `buildModel` (u476 as amended by u562, 2026-11-27). A host runs that code and
  emits its JSON. No host keeps its own receipt or History reading.
- **H3 Every host can get the JSON.** Whatever writes the page can also write the view model JSON
  beside it, from the same run, for every neutral profile, as `<page base>.view-model.json`, never
  overwriting (the file rule of actionstate-muse `docs/design/view-model-json.md`, #182, which is
  reused here). Today only the receipt note specifies the `{value, src}` shape; History and Results
  follow it (see §10). That Muse note also has a second producer (Go, with a parity test against the
  page's `buildModel`); under H2 it becomes a host that emits capsule-viewer's model, and the Go
  derivation retires.
- **H4 Projections say they are partial.** A chat card, image or text may leave things out and must
  say so ("The full list is on the page."). None may contradict the page.

## 4. Who a copy is for (relying parties and disclosure)

Who the file is for decides what is in it. The **builder** decides, before encoding, never the
viewer by hiding fields (builder §3). A collapsed toggle never removes embedded bytes.

- **Audiences.** `keep` is the owner's copy and may carry private evidence. A recipient preset
  (`counterparty` for receipts, Standard for History) is privacy-protected. `adjudicator` is a
  capability for disputes. An `audit` copy (evidencebook#1058) removes every PII-classed member and
  shows parties as role plus short key ("Seller · 13sffh34"), with the full key at L2. The keys
  stay in the signed records, so an auditor can still link one party across copies. Unlinkable
  keys are out of scope.
- **Custom** is a request path, not a second open preset. Field-level release happens only where
  the profile or record supports it.
- **The builder's inputs** are `(source_bundle, report_type, audience, disclosure_profile,
  recipient_scope, explicit_openings)`. Only the recipient's bundle reaches presentation. The
  builder lists what is selectable, states what each copy withholds, runs a no-private-bytes test,
  verifies its output and refuses when a field cannot be isolated safely. A "share prepared" record
  is not evidence of delivery.
- **Four disclosure states** are drawn distinctly: DISCLOSED · COMMITTED (opening not supplied) ·
  WITHHELD · NOT PRESENT.
- **Manifests are disjoint.** Two specific modules never both match one bundle. `forbids` separates
  them, never priority. Each role × composition case has a fixture.

## 5. Common requirements (every report, every host)

C1–C10 carry v1.2 and the specs. C11–C18 were added from the 2026-11-27 deal receipt review.

| # | Requirement | Source |
|---|---|---|
| C1 | Verification happens once, in the core, before a module is chosen. No module verifies or changes the outcome. | contract §2, I5, I7 |
| C2 | A failed bundle gets only the banner, the refusal and the core's checks. | contract I1; R3 |
| C3 | Three levels. L0 is one phone screen, and every figure on it traces to L1. L1 gives the reasons. L2 opens with the core's part, then the module's detail. | contract §9 |
| C4 | Wording comes only from the module's wording pack (pinned by `wording_sha256`) and the core's fixed text. Depth comes only from the host. Neither comes from the bundle. | contract §6, §7.4 |
| C5 | A value shown as evidence is bound to a record. Producer notes are labeled and never appear in L0. | contract §7; verification display §7.1 |
| C6 | Disclosure happens in the builder and only removes (§4). | builder §3 |
| C7 | Same semantics in every packaging (R4). | contract I4 |
| C8 | Projections are presentation only (H4). | §3 |
| C9 | Consumer pages: flat sibling panels with one level of `<details>`, never nested. No workflow controls in the HTML: no approve, share, export, chat or acting link. The agent or CLI does those, and the page says in words how. Passes the five-second comprehension test (§7). | v1.2 §15.1 |
| C10 | Offline: no network, inline CSS, system fonts or embedded fonts with redistribution rights (no external font import), a CSP per page. A page that can't run its check says "unable to verify", never "did not verify". | v1.2 §15.1(4–5) |
| C11 | **Every visible string has a source:** a wording key, or a value reached through a pointer into a signed field. A test renders each fixture and fails on any other string (the anti-hardcode test). | receipt review; `receipt-view-model.md` §5 |
| C12 | **One check vocabulary per page.** The header count, the consumer line and L2 name the same checks from the one verification-display §6.1 list. A module cites a check and never re-lists it under other names. | receipt review |
| C13 | **A badge fills only from evidence in the file.** A time-stamp, countersign or witness badge is green only if the page checked a receipt the file carries. Otherwise it reads "reported by <tool>, receipt not in this file". | `history-view.md`; receipt review |
| C14 | **Withheld is explicit.** Each copy says in L0 or L1 what it leaves out and who holds it ("the seller's delivery record is not in your copy"). | evidence-result §2; receipt review |
| C15 | **Your own copy is complete for you.** The `keep` copy carries what you are entitled to (counterparty name, item, quantity, price, the ruling), so L0 can say who, what and how many. | u561; receipt review |
| C16 | **What a step relies on is drawn as a step.** A ruling, delivery or countersign the bundle carries, even inside an extension's `relied_on`, is a step in L1 and reachable in L2. No step body is ever a bare "-". | receipt review |
| C17 | **Generic L2 text appears once per page.** The proof ladder, the signature explainer and "what this does not prove" are drawn once and referenced. Wording from another profile never shows outside it. | receipt review |
| C18 | **One unit and one clock per figure.** An amount is shown in the unit the parties recorded, never converted. An event shows its sealed time. The page's own creation time is labeled as such and never shown as the event time. | receipt review |

## 6. Profiles (what is specific to a use case)

A profile is a **manifest + `buildModel` + wording pack**. Everything in §2–§5 applies to each.
Only these rows differ.

| Profile | L0 answers | L0 holds | L1 holds | Where its rules come from | Audiences | Profile-only rules |
|---|---|---|---|---|---|---|
| **Receipt** (deal) | What did I agree to, what happened, where does it stand? | counterparty, item, quantity, amount, outcome or ruling, who ruled and when | one step per record (agree, pay, deliver, dispute, ruling, statements) with signer and sealed time; each term with its status and who it waits on | the deal's sealed terms and the terms pack pinned in the deal | keep · counterparty · adjudicator · audit | amounts only from signed fields; a simulated payment rail is stated once |
| **History** | What does this holder present, over what period? | count, period, outcome mix, "what this does not show", second-signature slot | one row per deal with its proof line | the History profile's selection rules | Standard · keep | never a score, rank or reputation; never implies the holder made the deals |
| **Ad hoc answer** (Evidence Request) | Here is what you asked for, and what isn't included | what was asked, what is answered, what is refused or withheld | each answered item and its record | the request itself | the requester | the answer covers the request only; anything unanswered is listed |
| **Obligations** | Which requirements were evaluated, which apply, which are unresolved? | coverage first, then buckets | per obligation: claim, tier (recomputed / judged), grade (self-attested / witnessed / countersigned), cited evidence | the sealed contract version the Result cites | sponsor · auditor | no single score above the fold; out-of-scope and not-yet-in-force shown apart; a Result never carries payload bytes |
| **Outcomes** | How did the service do against its terms over the period? | coverage strip, period, population | rule by rule, day by day, adjudications | the sealed outcome contract | sponsor · provider | "not run", never zero; a mock judge is marked; a percentage only beside its k and n |

**Different rules need no new code.** The rules live in the sealed contract or terms pack the bundle
cites. A new regulation, service contract or deal terms pack is a new pack file plus wording entries
for its terms. If it needs renderer code, the profile is leaking the use case into the renderer.

## 7. Layout and comprehension (consumer profiles)

- **Always visible:** title and audience, the central conclusion, up to three salient facts, the
  period and what was or wasn't assessed, the actual verifier state, and the disclosure scope.
- **Four verifier states, always distinct:** checking · verified integrity · failed · unable to
  verify. "Unable to verify" never means the bundle is bad.
- **Proof vs presentation.** A page with the verifier runtime checks on open that nothing in it
  changed; a full signature check is one more step (`capsulectl verify --bundle`). A page without
  the runtime says "This page checks nothing itself. Verify the bundle with `capsulectl verify
  --bundle`." An image, a text summary and a link preview are never proof.
- **Five-second test:** on an opened phone page, a person can say what happened, what is supported
  and what was shared, without expanding anything. It tests comprehension, not a decision.
- **The look (u558, u559; capsule-viewer#382, #384):** receipt and History share one visual
  language: header and tags, a plain top line, the **seal**, three cards, the **stamp row**, the step
  timeline beside the proof panel, "what this does not prove", and the footer. The technical depth
  (ladder, provenance, producer envelope) stays under "For checkers" and "Technical details".
  - **The seal** is an original drawn mascot that carries the outcome. "Done" only when settled,
    every term agreed with its value met and the holder's settle record held; "Didn't go as
    agreed" on a final not-met ruling; no seal otherwise (silence is not agreement).
  - **Stamps are round graphical stamps**: RECORDED (checkpointed), TIME-STAMPED, COUNTERSIGNED
    on a receipt and on Your History rows, and the round SHARED stamp on a shared History. A stamp is
    drawn filled only when its check passed on this page (C13), as an **empty outline** when not
    present ("Not checked here", "Not time-stamped yet"), and partial as "… through step k of n",
    never filled. The round form is in actionstate-muse's History module (`history.css`
    `[data-history="stamp"]`, golden `docs/design/golden/history-v0/`); capsule-viewer's receipt
    draws stamps as dashed rectangles today, which this requirement changes.
- **Showing it to someone else:** the page says in words how a copy for another party is made, and
  gives the verify site as a working link where the host allows links. It has no button that acts.

## 8. Building a Terms Pack with its report (developer path)

A developer who writes a Terms Pack must get a working report, human and machine readable, without
writing viewer code.

**What exists today** (read 2026-11-27 at each repo's `main`):

| Step | Where | State |
|---|---|---|
| Write the pack: one `pack-source.yaml` with checks, criteria and a tier per row | evidencebook-skills `docs/quickstart.md` §3, `schemas/pack-source.schema.json`, `packs/*` | shipped |
| Compile it: `pack_compile.py` gives `compiled.json` (the contract), `judge-prompt.md` and `presentation.json` (the report's words), byte-identical per source | evidencebook-skills `scripts/pack_compile.py` | shipped |
| Seal a Result and render it: `scripts/report.sh` (claims → `book result build` → bundle → `book report build`); in Go, `Book.EvaluatePack`, `Book.SealResult`, `report.Build` with an `aac.wording-pack/v0` layer and the compiled contract | quickstart §4, `OUTCOME-REPORT-QUICKSTART.md`; evidencebook `docs/GUIDE.md` Paths 1–2 | shipped |
| Pack authoring verbs (`init`, `lint`, `test`, `publish`, `run`, `compare`) | evidencebook-skills#56 | **open** |
| A deal terms pack (`coffee-beans-sale`, `sticker-sale`, `inference-deals`) to a receipt that names its rows in the pack's words | capsulectl `CHANGELOG-deal.md` (#158) | shipped in code; **no guide** |
| The view model JSON beside each report | `receipt-view-model.md` (receipt only) | **receipt only** |

**Requirements:**

- **T1 One source.** The pack source is the only place its terms and their report words are
  written. Compiling it yields the contract and its wording; the viewer reads both by digest.
- **T2 No viewer code.** A new pack renders through an existing profile (Receipt, Obligations,
  Outcomes) with a wording diff only. Acceptance: copy a shipped pack, change a rule and a label,
  and get both artifacts of §3 with zero changes outside the pack directory.
- **T3 One guide per profile, run top to bottom.** Obligations and outcomes have one. Deal terms
  packs to a receipt need one, in the same shape.
- **T4 Both artifacts.** Each guide ends with the page and the view model JSON, and shows an agent
  answering a question from the JSON.

## 9. Acceptance

- Every profile passes C11's test and contract §6's three-render test (presentation settings
  supplied, removed, altered → identical regions).
- **Fixtures:** for each profile, one clean case, one adverse case (a ruled dispute, a not-met
  obligation, a failed outcome) and one shared copy, at 390 px and 1280 px, in print, and as view
  model JSON, with the same semantics in all (C7, C8). Add an unknown-extension bundle ("Integrity
  verified; meaning not interpreted by this viewer"), a wrong signer, a missing runtime, absent or
  hidden sensitive bytes, and a forwarded owner file. Both sides' receipt with and without the
  counterparty's half; agreement is never shown as independently established truth.
- T2 passes for one obligations pack, one outcomes pack and one deal terms pack.
- If anyone needs a second renderer for a report type, the abstraction has failed.

## 10. Open

1. **H3 for History and Results:** the receipt note fixes the `{value, src}` shape; History
   (#474 PR 8) and Results need the same, and every page writer needs a way to write the JSON.
2. **T3:** a guide for a deal terms pack to a receipt.
3. **T2's authoring verbs:** evidencebook-skills#56.
4. **Round stamps in capsule-viewer:** the receipt and History modules draw the stamp row as round
   stamps with an empty outline when not present (§7), before the Muse modules retire.

## Change log

- **v1.3 (2026-11-27):** product-neutral sections moved here from PRD_VIEWER_PRESENTATION v1.2.
  Added §3 (the human/machine pair), C11–C18, the profiles table, §8 (Terms Pack to report) and the
  view-model owner (u476 amended by u562), the seal and round stamps (§7).
