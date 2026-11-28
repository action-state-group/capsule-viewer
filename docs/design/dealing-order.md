<!-- SPDX-License-Identifier: Apache-2.0 -->
# One layer order and one set of status words for every deal surface (design note)

Status: capsule-viewer#448. The words were ruled by Sherlock2 under the wording delegation on
2026-11-28; two cases are still pending (below). Source: Steven's request of 2026-11-26 on #448.

**What it is for.** A deal is shown in three places: the receipt (`go/receipt`), the History view
(`ts/src/history-view.ts`) and the Mesh plugin's Evidence rows (Mesh-LLM/capsules-plugin). Each
keeps its own styling. All three share one order and one set of words, so someone who has read one
receipt recognises the others.

**The contract** is one wording pack, `ts/src/wording/dealing.en.json`
(`capsuleviewer.dealing.wording/v0`). The npm package publishes it in two forms: as
`@action-state-group/capsule-viewer/dealing-wording` (the pack plus `dealingSay`) and as the raw
`/wording/dealing.en.json`. Words live there and nowhere else. A surface pack that still holds one
of these words loses it when that surface moves to the order. The pack holds words and layer ids
only, never verdict, tier or grade words. It sits beside the package's other wording packs because
the plugin already depends on this package; `docs/design/one-viewer.md` keeps each surface's own
words in its own pack, and this pack takes only the shared ones out of them.

## The order (`layers`)

1. **Verdict**: one sentence that includes the amount, in the largest text. Warnings appear only
   here. A trust answer in its not-met form also raises a warning here.
2. **Facts**: who, to whom, what, how much and when, by friendly name. The owner's own copy shows
   the exact amount; a copy made for others shows the value band. A receipt also gives the
   dispute window.
3. **Trust**: one line that answers the four questions (`trust`) in the same order everywhere,
   then one panel, "What this does not show".
4. **Technical details**: one collapsed disclosure, the outermost label on every surface. Its
   parts always come in this order (`technical`): content, then payment steps, then checks (ids,
   hashes). The receipt's "For checkers" stays a labelled section inside it.

## The trust line

| Question | Met | Not met |
|---|---|---|
| Rewritten? | Sealed; with a witness, "Sealed · Time-stamped {at}" | Changed after sealing |
| Same story on both sides? | Confirmed by them | They recorded something different; Their copy not checked |
| As offered? | As offered | Not as offered; No offer in this copy |
| Who stands behind it? | Countersigned by {name} ("{role} · {key}" until a sealed record names the signer, evidencebook#1031) | Only your own signature (owner's copy); Only the holder's signature (copies for others) |

Time-stamped rides on the first answer; it is not a fifth slot. One word per idea does not make
different evidence equal. Each surface answers from its own check and keeps its existing states:
partial, open, not checked, failed, and the attributed form "as capsulectl verify reported"
wherever the page did not run the check itself. A deal is a "Deal" on every surface, the Mesh rows
included.

## Pending

These keys sit in the pack's `pending` member, never in `entries`, and no surface draws them
until Sherlock2 answers:

- `trust.rewritten.not_checkpointed`: what the first answer says for a record that is signed but
  not yet checkpointed.
- `trust.stands_behind.not_independent`: whether the sentence saying the signer's directory entry
  does not list it as independent of the parties stays beside "Countersigned by {name}".

## Surfaces

- Receipt: its v1 surface moves to this order in its own PR. `go generate` composes this pack
  with `go/receipt/wording-en.json` in a fixed order, refuses a key present in both, and names
  both packs (id and sha256) on the page. The frozen Python twin is unchanged.
- History view: moves to this order in its own PR, on top of its presentation module (#490).
- Mesh Evidence rows: tracked in Mesh-LLM/capsules-plugin, pinning this package by version.
