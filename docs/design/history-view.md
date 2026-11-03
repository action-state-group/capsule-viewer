# History view: one History page for Muse, mesh-llm and Goose (design note)

Status: design for capsule-viewer#247, the component half of
actionstate-muse#334. The TypeScript view shipped in viewer 0.14.0 and the Go
twin, `go/historyview`, in capsule-viewer#253. The three callers move onto it
in their own items (section 9).

## Sources

| Ref | Where | What it fixes |
| --- | --- | --- |
| [334] | actionstate-muse#334 (Steven, 2026-11-03) | the bar: the #203 anatomy on the mesh and Goose History pages, Muse's words where a part means the same, one headline, "How this was checked", the "What this node shares" block, dotted slots, two checkpoints with one "Cut at" second |
| [203] | actionstate-muse#203 | the anatomy: header, hero, chips, rows, the one callout, seal with a second-signature slot that is always present, flat panels; no crypto words above the panels; no script needed for layout |
| [207] | actionstate-muse#207 and its History card mock | the Muse History card: "History · Shared by <name>", hero count, chips, one row per item with its 🔏 proof line, "What this does not show", "Locked as it happened", "Countersigned by: no one yet" |
| [guide] | the report design guide behind actionstate-muse#203, §16 to §19 | reader tiers; scope first, not negatives first; neutral surfaces use neutral names ("Second signature", never "countersign", no grading words); one name per thing |
| [333] | actionstate-muse#333 | a stamp fills only on a check that passed; a failure reads "Didn't verify"; anything else stays dotted "Not checked here" |
| [muse] | actionstate-muse `internal/plugin/history_page.go`, `wording/plugin.json` `history.page.*`, `wording/receipt.json` `stamp.*`, `seal.*` | today's Muse private History page and its words |
| [mesh] | Mesh-LLM/capsules-plugin `crates/evidence-plugin/src/history_page.rs`, `web-ui/src/features/capsules/lib/saved-pages.ts`, `history-verify.ts`, `banned-terms.ts` | today's saved History page: the node's own answer, checked in the page by its own verifier |
| [goose] | evidence-network/loop `scripts/history_cards.py`, `site/watch.py`, `site/watch.js` | today's Goose history cards: streams, witnesses, started date, "no history since" |

## 1. The problem, and what is shared

Three renderers draw one idea, "what this holder's log shows", with three
codebases and three vocabularies: a Go template in Muse (deal rows and
stamps), a TypeScript page in the mesh console (a verifier's audit log), and
a JavaScript ring view in loop. None follows [203], and only Muse's uses a
wording pack.

What they share is the page, not the data. Each caller already owns how it
gets and checks its history (capsulectl's `deal report`, the node's own
`history-page` answer and its in-page verifier, a commitment's stapled
cards). So the shared component **draws; it never fetches and never
verifies**. It takes a view model the caller builds from what it checked,
and it decides the layout, the words and the rule for which slots may fill.
That is the same split the viewer's History modules already use (the module
draws, the runtime or the producer decides).

**Beside the existing History card.** `capsuleviewer.standard-history/v0`
(`docs/design/history-card.md`) draws AAC's `standard_history/1` card from a
sealed bundle and stays as it is; this view does not read bundles. Muse's
History you send stays that card. This view is a viewer contract like
`chart-spec`, owned here; the README's note that the view-model JSON belongs
to the Muse plugin is about the receipt's view model, and the README says so
once this ships.

The items differ by caller, so the view has two row kinds under one anatomy:

- `checkpoint`: one cut of a node's log (mesh, Goose);
- `deal`: one deal in a person's store (Muse).

A page holds one kind. The reader-facing name is "History" for both; spec
names (`history_card/1`, `service_history/1`) appear only under "How this was
checked" ([guide] §19).

## 2. Owner and layer

capsule-viewer owns it: its README keeps "the generic, neutral view of a
record", the History cards included, and the goldens and wording packs
product modules are held to. It ships in the two packages that already
exist, with no new package:

- **TypeScript**, `@action-state-group/capsule-viewer`: `ts/src/history-view.ts`
  builds the page as a small element tree, then serializes it two ways:
  `historyViewHtml(input, overlay?)` returns the HTML text (static pages), and the
  page runtime's global `EvidenceGraph.renderHistoryView(input, container, overlay?)`
  builds the same tree as DOM with `textContent` only (scripted pages). A
  subpath export, `@action-state-group/capsule-viewer/history-view`, has no
  dependencies, so a bundler inlines only this code.
- **Go**, `github.com/action-state-group/capsule-viewer/go`: a twin,
  `go/historyview`, `Render(input, overlay) (string, error)`, which writes
  the same bytes as `historyViewHtml(input, overlay)`. Both are held to one set of vectors,
  `vectors/history-view/` (inputs and expected HTML), the way `go/chartspec`
  and `ts/src/chart-*.ts` share `vectors/chart-spec`.
- **Python** has no twin. A Python caller writes the input JSON and embeds
  the page runtime (section 7).

The wording pack is one file, `ts/src/wording/history-view.en.json`, holding
neutral words only; the Go module carries a byte copy, held by a test that fails when they
differ. A product caller passes an overlay pack (section 4).

## 3. The input contract: `history-view/v0`

One JSON object. Unknown members are refused, not ignored, so a caller
cannot pass words or a "filled" flag the view does not decide. Every string a
caller passes is drawn as text, never parsed as HTML.

```json
{
  "view": "history-view/v0",
  "kind": "checkpoint",
  "surface": "neutral",
  "reader": "recipient",
  "holder": { "node": "3f9a…", "stream": "mesh-llm" },
  "audience": { "kind": "anyone" },
  "built_at": "2026-11-03T18:09:41Z",
  "checked": { "where": "page", "by": "capsules-plugin 0.1.13" },
  "outcome": { "kind": "answered" },
  "rows": [
    {
      "kind": "checkpoint",
      "cut_at": "2026-11-03T18:07:12.418Z",
      "log_size": 127,
      "anchor": "9c41…e0",
      "signature": "pass",
      "witness": { "state": "not_checked" },
      "second_signature": { "state": "not_checked" }
    }
  ],
  "checks": [
    { "id": "checkpoint_signatures", "status": "pass" },
    { "id": "checkpoint_chain", "status": "pass" },
    { "id": "envelope_signature", "status": "not_run" }
  ],
  "periods": [{ "from": "2026-10-26", "to": "2026-11-02", "cells": [{ "what": "llama-3.1-8b", "value": "41" }] }],
  "sharing": {
    "standard_history": true,
    "history_segments": "counterparties",
    "record_at_completion": "counterparty",
    "adjudications": "deliver_to_subjects",
    "exchange_corroboration": true,
    "adjudicate_differing_twins": false,
    "witnesses": ["https://witness.example"]
  }
}
```

- `kind`: `checkpoint` or `deal`, the page's one row kind; every row's
  `kind` must equal it, and it picks the headline when there are no rows.
- `surface`: `neutral` or `product`. A `product` page draws with the
  overlay pack its caller passes (section 4); a `neutral` page takes none.
  It never changes what is drawn, only the words.
- `reader`: `owner` (the holder's own page; header `PRIVATE`) or `recipient`
  (someone shown it). `audience` is `{kind: "private"}`, `{kind: "shared",
  for: "<who>"}` or `{kind: "anyone"}` (a node's answer to any requester).
- `holder`: whose history: a person's `name`, or a node's key id `node`,
  drawn shortened with the full id behind the 🔏 chip. `stream` (optional)
  names the log when a node keeps more than one (Goose keeps one per
  community): one page draws one stream.
- `picked` (optional, deal pages): `true` when the holder picked these deals,
  so the headline puts the scope first ("6 deals Steven picked · steps
  recorded, not outcomes", [guide] §17).
- `checked.where`: `page` (the caller's script checked it when this page
  opened) or `builder` (the caller checked it when it built the page, at
  `built_at`). The page says which, but only when at least one check passed or failed; when every check is `not_run` it draws no such line ("As of {at}" wording, Sherlock2's ruling on #261). `checked.by` names the tool, in the
  panel only.
- `outcome` (checkpoint pages): `answered`, `refused` (with the node's own
  `reason` token, drawn as the node's text) or `unreadable`. Only `answered`
  draws rows; the other two draw their own hero and the panel. A node with no
  checkpoint yet that answers with a signed refusal is `refused`, drawn with
  its reason; "No checkpoints yet" is `answered` with no rows (a Goose stream
  with no checkpoint).
- `rows`: for `checkpoint`, `cut_at` (RFC 3339, any precision), `log_size`,
  `anchor` (hex), `signature` (`pass`, `fail`, `not_run`). For `deal`,
  `asked`, `outcome`, `money` (caller text, optional), `opened_at`,
  `last_at`, `record` (record id). Both kinds carry the two slots. Rows come
  in the caller's order; the view does not sort. Deal rows come newest
  first (the headline says so), so the caller orders them.
- A slot is `{state, by?, at?, through?}` with `state` one of `passed`,
  `failed`, `none` (the checker established there is none), `not_checked`.
  `through` is `{k, n}` for a check that covers part of the steps. A
  `passed` witness slot needs `at` (its `by` is optional: Muse's grade
  carries no witness name); a `passed` second-signature slot needs `by` and
  `at`.
- `checks`: one entry per check the caller ran or did not, each an `id` from
  the closed list in the pack (`readable`, `refusal`, `artifact_digest`,
  `card_digest`, `checkpoint_signatures`, `checkpoint_chain`, `consistency`,
  `anchor`, `period_counts`, `envelope_signature`, `key_is_node`,
  `reply_bound`, `witness`, `second_signature`, `deal_report`), a `status`
  (`pass`, `fail`, `not_run`) and optional `values` for the pack's
  placeholders. An unknown `id` is refused: the words for a check live in
  the pack, not in the caller. The mesh verifier's ids are this list's.
- `periods` (optional, checkpoint pages): the Service History's counts, one
  entry per closed week, each cell a caller-named `what` and its count, or
  `withheld: true` where the node withholds a count under 5 ("fewer than 5").
  Drawn as separate rows, never summed or compared ([guide] §18).
- `sharing` (checkpoint pages, required there): the node's live settings,
  section 5, with the values the node itself uses. Every member is optional;
  one the node does not state is named in one closing sentence, "This node's settings don't say: <a>; <b>.".
  A Goose node may also state `share_deal_half` and `stranger_safe`, each
  drawn as one line when present.
- `signer_directory` (optional, deal pages): the HTTPS address signers are
  looked up at, drawn with Muse's disclosure line.
- `period` (optional): `{from, to}`, drawn in the header.

**Refusal.** An input that breaks any rule in this section (an unknown
member, check id or setting value; a `passed` slot missing what it needs; a
malformed time; an overlay that does not check) draws no history.
`historyViewHtml` and `Render` return an error naming every reason, so a
static caller writes no page; `renderHistoryView` draws one visible refusal
line naming the reasons (`data-history="refused"`), never an empty or
partial page.

The contract is frozen once a release ships it. Additions are new optional
members in `v0`; a change of meaning is `v1`.

## 4. The anatomy, and its words

| Part | Checkpoint page (mesh, Goose) | Deal page (Muse) |
| --- | --- | --- |
| Header | "History · <holder>" · scope · audience badge | "Your History" (owner) or "History · Shared by <name>" · audience badge |
| Hero | one line: "2 checkpoints · 127 entries · last cut 18:07 UTC · every checkpoint signature checks" | "<n> deals" and "newest first" |
| Chips | signatures (all check / n don't verify / not checked here) · witness (time-stamped / not checked here) · started <date> | recorded · time-stamped count · not checked here |
| Rows | cut time to the second, entries, 🔏 anchor; the two slots | asked, outcome and money, opened, last step, 🔏 record; the stamp row |
| Callout | "What this does not show" | "What this does not show" |
| Block | "What this node shares" (section 5) | none |
| Seal | "Locked as it happened", the second-signature slot | the same |
| Panel | "How this was checked": every check, checked and not checked | the same |

The hero's verdict is one verdict for the page ([203] kill list), from
every log check and every row: any `fail` of a check other than `witness`
and `second_signature`, or of a row's `signature`, reads "This history
didn't verify", and the page then draws none of its rows or counts, as the
mesh page does today, but keeps "How this was checked", so the reader sees
which check failed. A failed `witness` or `second_signature` (a check, or a
row's slot) is drawn in its chip or that row's slot only, so one deal's
failed stamp never hides the others; "every checkpoint signature checks" needs
every row `pass` and every check that ran `pass` ("every signature
checks, including the answer's own, by the node's published key" needs `envelope_signature`
and `key_is_node` to pass as well), and names the checks that
did not run under "How this was checked"; otherwise "signatures not checked
here". **No rows** has its own hero, never a vacuous pass: "No checkpoints
yet" (`answered`, no rows), "The node declined to answer" (`refused`, with
its reason), "This page could
not read the answer" (`unreadable`), and Muse's "There are no deals in this
store yet." for an empty deal page.

**One key set, Muse's words.** capsule-viewer is a public, neutral
repository, so its pack holds neutral words only. Where a part means the same
as on the Muse card and Muse's words are neutral, the entry is copied from
Muse's packs, with the source key and the Muse commit recorded in the pack's
provenance:
`history.page.*` from `plugin.json` (title, PRIVATE line, counts,
opened, last step, stamp lines) and `stamp.*`, `seal.*` from `receipt.json`.
Once Muse deletes its `history.page.*` (section 9), the viewer pack is the
source, and its provenance says so. New entries (the checkpoint hero and
rows, the sharing block, the check names, and the words that exist so far
only in the [207] mock: "What this does not show", "Locked as it happened")
are new copy for Sherlock2. One
thing has one name: the witness slot is "time-stamped" everywhere, as
actionstate-muse#333 shipped it, never "postmarked".

**Product overlay.** Product words stay with the product. A `product` caller
passes an overlay pack, keyed to the view's closed key set: Muse keeps its
overlay in actionstate-muse ("Countersigned by", "ask Muse to send it for a
second signature", "Not a rating"). The view checks it like any input: an
unknown key or a placeholder the base entry does not have is refused, so an
overlay changes words, never what fills. The neutral entries are the ones
the mesh console needs inside its banned terms ([guide] §18,
`banned-terms.ts`): "Second signature: none yet", no product name, and "this
is not a judgment of the node". A test draws every vector with `surface:
neutral` and fails on any banned term, including inside other words, and
the T8 History word gate (`docs/design/history-card.md`) runs over every
vector, as it holds Muse's History text today.

**Time.** A static page cannot know the reader's zone, so times are UTC in
Muse's format ("Nov 3, 2026, 18:07 UTC"); rows show seconds. A scripted page
draws the same text, so static and scripted pages match.

## 5. "What this node shares"

Built from `sharing`, with Steven's five lines from [334] as the pack's
entries, in Sherlock2's wording (spec names such as "history card" stay in
the panel):

| Line | Drawn when |
| --- | --- |
| With anyone who asks: a summary of its checkpoints, meaning how much it has recorded and when, and nothing about any exchange | always |
| Only with the other side of an exchange: that exchange's half of the record | `share_deal_half` is `counterparty` (what a Goose node's policy states); nothing when absent |
| With anyone who asks, even a stranger: <items> | `stranger_safe` is stated (a list of short tokens); `history_card/1` is drawn as "the History Card", any other token as it is; when empty, "Nothing else goes to a stranger."; nothing when absent |
| With anyone: the Service History | `standard_history` is true (the product default is on); when false, "The Service History: only the other side of an exchange gets it (off for anyone else on this node)."; when absent, named in the closing "this node's settings don't say" line |
| Only with the other side of an exchange, when they ask: that exchange's record | `history_segments` is `counterparties`; `peers`: "With any node that signs its request: an exchange's record."; `off`: "The other side of an exchange can't ask for its record (off on this node). They still get the sealed record when it completes." (the last sentence only when `record_at_completion` is `counterparty`); when absent, named in the closing "this node's settings don't say" line |
| With any node that asks by an exchange's id: whether this node holds its half (ids and digests only) | `exchange_corroboration` is true; nothing when false; when absent, named in the closing "this node's settings don't say" line |
| Sent on its own: the sealed record when an exchange completes | `record_at_completion` is `counterparty`; when `off`, "The sealed record isn't sent when an exchange completes (off on this node)."; when absent, named in the closing "this node's settings don't say" line |
| If this node judges an exchange, its verdict goes to the node judged | `adjudications` is `deliver_to_subjects`; when `off`, "Verdicts this node reaches aren't sent to the nodes judged (off on this node)."; when absent, named in the closing "this node's settings don't say" line |
| When two copies of a model answer differently, this node sends the question and both answers to a referee | `adjudicate_differing_twins` is true; nothing when false (the default); when absent, named in the closing "this node's settings don't say" line |
| Signed checkpoints go to the witnesses named here: <witnesses> | `witnesses` is not empty; when empty, "No witnesses named in this node's settings now. A row's time-stamp may come from an earlier setting."; when absent, named in the closing "this node's settings don't say" line |
| Never: a record to anyone who doesn't prove who they are | `history_segments` is stated (the rule is the mesh plugin's signed-request rule, which its policy carries); when absent, named in the closing "this node's settings don't say" line, unless `stranger_safe` is stated: that allowlist already says what a stranger gets, so the page does not also say the rule is unstated |

The values are the node's own (`share_policy.rs`: `history_segments` is
`off`, `counterparties` or `peers`; `record_at_completion` is `counterparty`
or `off`; `adjudications` is `deliver_to_subjects` or `off`;
`exchange_corroboration` and `adjudicate_differing_twins` are on/off). Every
member is optional, because a node's advertised policy (`disclosure-policy/0`,
what Goose reads) carries only `share_deal_half` and `stranger_safe`, none of
these members; the five that mesh nodes advertise (`standard_history`,
`history_segments`, `record_at_completion`, `adjudications`,
`exchange_corroboration`) became optional in an additive change to `v0`, after
`adjudicate_differing_twins` and `witnesses` already were. When members are
absent the page draws one closing line for all of them, "This node's settings
don't say: <what the first decides>; <what the second decides>." (the words are
in the pack as `shares.unstated`, `shares.unstated.one` and `shares.unstated.*`; a single missing setting reads "This node's settings don't say <what it decides>.", with no colon; nothing is drawn when
none is absent), and never a default, so no disclosure is left out by omission or invented. A
member that is present keeps its line exactly as in the table; a present
member of the wrong type or outside its list is refused, never drawn as the
nearest line. Two more optional members carry what a Goose
policy does state: `share_deal_half` (`counterparty`, the only value) and
`stranger_safe` (a list of strings), drawn right after the first line; an absent one draws no line, since they
are not settings the page must account for, and a present one of the wrong
type or outside its list is refused. The Goose
vector `goose-policy-share-deal-half-only` states exactly those two and is the live Goose shape. The golden `goose-advertised-policy` is a fixture, not a real Goose policy: it carries the five mesh members a Goose policy does not have, to exercise those lines, so do not quote it as what a Goose node advertises. The block names when the settings were read
(`built_at`), since a static page is a snapshot.

## 6. Slots, and two checkpoints in one second

**Slots.** The view alone decides how a slot looks, from its state: `passed`
fills it, with `at` and, when given, `by` ("<at> · by <witness>", "<signer>
signed this record too · <at>, by their clock"), and `through` adds
"through step k of n";
`failed` reads "Didn't verify"; `none` reads "Not time-stamped yet" or "none
yet"; `not_checked` reads "Not checked here". Only `passed` fills, and a
`passed` slot missing what section 3 requires is refused ([333]). The view
cannot tell a self-countersignature; the caller draws it as `failed`, as
Muse's `stampsOf` does today. The seal's
second-signature slot is always present ([203] item 6). It sums the rows'
slots without filling: when some but not all of the rows that carry a second
signature (`passed` or `failed`) are `failed` it reads
"<k> of <n> didn't verify; see each row", when every such row (or the check
itself, with no failed row) is `failed` it reads "Didn't verify", any
`not_checked` reads "Not checked here", all `none` reads "None yet", and
otherwise it points to each row's slot.

**Same second.** Each checkpoint is its own row, never merged by time. Every
checkpoint row shows its entry count and its 🔏 anchor, so two rows with the
same "Cut at" second are told apart. Where two rows share the displayed
second, the time shows its fraction when `cut_at` carries one. Why the
2026-11-03 export has two checkpoints in one second is a question about the
node's cadence, not the view; the mesh migration item answers it (section 9).

## 7. Static and scripted pages, by caller

| Caller | Page | How it calls the view |
| --- | --- | --- |
| Muse (Go) | static, no script ("Your History", PRIVATE) | `historyview.Render(input, overlay)` from the Go module it already pins; Muse maps `deal report --read-only` and its `grade` to rows and slots, as `stampsOf` does today |
| mesh console (TypeScript) | scripted: the saved page checks itself when it opens | the saved page's inline script imports `renderHistoryView` from the subpath export, runs the node's own verifier as today, maps its verdict to `checks` and rows, then draws; `checked.where` is `page` |
| Goose, loop (Python) | scripted | one page per stream: `site/watch.py` writes the input JSON from each card's own checkpoints (`history_cards.py`'s `card_checkpoints` gives `issued_at` and `log_size`; the anchor is the SHA-256 of the checkpoint statement) and the node's advertised policy for `sharing`; the page embeds the pinned `history-view.iife.js` and calls `HistoryView.renderHistoryView` |

The view also ships alone as `dist/history-view.iife.js` (global
`HistoryView`, with its `.sha256`), with no verifier in it, so a page that
only draws a History does not embed the 1.2 MB page runtime. The view's
stylesheet ships beside the function, in TypeScript and Go
(`historyViewStyles`, held to the same vectors). `renderHistoryView` inserts
no style itself, so a page with a strict CSP lists the hash of the one
stylesheet it embeds.

**Serialization.** TypeScript, Go and the browser write the same bytes
because the HTML is serialized by the HTML fragment serialization rules,
written out in the view itself: in text, escape `&`, `<`, `>` and U+00A0.
Caller text never goes in an attribute (attributes hold only the view's own
tokens, and a test checks that), so attribute escaping cannot differ between
engines. Go writes it with its own serializer, never `html/template`, whose
`&#39;` and `&#34;` differ. The layout follows [203]: one column under 900px,
two above, and print; the first screen shows the header and the hero.

## 8. Tests and goldens

- `vectors/history-view/`: inputs for a mesh node (Service History on, the
  normal case; card only; counterparties on and off; a failed signature; a witness
  `passed`; two checkpoints in one second), a Goose node, and Muse's page
  (no grade, witnessed through part, countersigned, self-countersign drawn
  as failed, one failed stamp among passing deals, picked by the holder,
  empty store), refused and unreadable
  answers, a node with no checkpoint, `peers` and every setting off, a page
  built from an advertised policy alone (twins and witnesses absent), each
  with its expected HTML. Muse's vectors draw with a test
  overlay; the real overlay's goldens live in actionstate-muse. TypeScript and Go both render every
  vector and match the expected bytes.
- Refusals: an unknown member, an unknown check id, a `passed` witness slot
  without `at`, a `passed` second-signature slot without `by` or `at`, an unknown `history_segments` value, an overlay with an
  unknown key or placeholder; each returns an error (static) or draws the
  refusal line (scripted).
- Words: every pack key used is in the pack; every Muse-sourced entry equals
  a snapshot of its source vendored in this repository with its Muse commit
  (actionstate-muse is private, so CI cannot fetch it), dropped once Muse's
  migration makes this pack the source; no banned term on `neutral`; T8 over
  every vector.
- Scripted: the runtime's `renderHistoryView` builds DOM whose `outerHTML`
  equals the static HTML for every vector, under the CSP test pages the
  emitter tests already use.
- Goldens for Steven's gate on [334]: one page per caller, at 390px, 1280px
  and print, rendered from the vectors.

## 9. Release and the callers' items

The view ships in the next viewer release (`ts/vX` and `go/vX`, per
RELEASING.md). The TypeScript view and `history-view.iife.js` ship first,
since the mesh console needs them first; the Go twin may follow in the next
release, held to the same vectors. Each caller then moves in its own item and deletes its own
renderer:

- actionstate-muse: `history page` draws through `historyview.Render`;
  delete the template in `history_page.go` and the `history.page.*` words the
  view now owns.
- Mesh-LLM/capsules-plugin: the saved History page draws through the view;
  the route adds the node's sharing settings; the verifier returns each
  checkpoint's anchor and signature status (today it gives `{size, time}`
  and stops at the first failure); and the "same Cut at second" export is
  explained or fixed.
- evidence-network/loop: the Goose History card draws through the view, one
  page per stream, from each card's checkpoints and the node's advertised
  policy.

None touches the Devcon S08 image (capsules 0.1.10).

## 10. Doors

- The input contract, `history-view/v0`, is frozen once released.
  Engineering's call; Sherlock2 confirms it carries no product meaning and,
  as a neutral viewer contract, stays inside the neutrality boundary.
- The words, Muse-sourced and new, and the neutral forms: Sherlock2, under
  the wording delegation. Product words live in the caller's overlay, never
  in this repository.
- The "What this node shares" lines are Steven's own text from [334]; the
  off-state lines in section 5 are new copy for Sherlock2.
- The look follows the Muse History card ([207] mock). If review changes
  that, Steven sees it before the build.
