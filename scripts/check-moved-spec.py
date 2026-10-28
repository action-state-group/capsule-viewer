#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
"""Check that the spec text moved from agent-action-capsule changed only as declared.

spec/presentation-contract-v0.md, spec/contract-report-module-v1.md and
spec/presentation-builder-v0.md moved here from agent-action-capsule (AAC#379).
For each, this script reads the AAC source at the pinned revision AAC_REV,
applies the declared edits below, and checks that what results equals this
repository's file paragraph by paragraph, byte for byte. It prints, for each
paragraph, its AAC lines and its lines here, so a reviewer checks the declared
edits instead of every word.

The declared edits, per file, are the only differences allowed:

- INSERTS: new paragraphs (the licence line and the move note) after an AAC line.
- REMOVALS: AAC line ranges that stay in agent-action-capsule, each replaced by
  a citation.
- REWRITES: (old, new) pairs. Each old string occurs exactly once in the text
  that is kept, and is replaced by the new one. They are repository paths and
  "this repository" phrasing that now must name agent-action-capsule, and the
  clauses kept from a paragraph whose other parts stay there.
- AMENDMENTS: (old, new) pairs made after the move, in this repository, each
  naming the change that made it. They are not part of the move.

Usage:
    python3 scripts/check-moved-spec.py [--aac PATH]
    python3 scripts/check-moved-spec.py --rev    # print AAC_REV

PATH (or the AAC_CHECKOUT environment variable) is a clone of
agent-action-capsule that holds AAC_REV. Without one the check is skipped with
a message, and exits 0; CI always gives one.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

AAC_REV = "60a5b119a1a979b1970d22caec8577eac0bb59e8"
REPO = Path(__file__).resolve().parent.parent

# Citations to text that stays in agent-action-capsule: its
# spec/verification-display-v0.md, which keeps the presentation contract's
# section numbers, and its REGISTRY.md section 14 deprecation table (AAC#379).
def vd(section: str) -> str:
    return f"agent-action-capsule's `spec/verification-display-v0.md` {section}"


DEPRECATION = "agent-action-capsule's `spec/REGISTRY.md` §14"
LICENCE_LINE = "<!-- SPDX-License-Identifier: BSD-3-Clause -->"


def move_note(source: str) -> str:
    return (
        "> **Moved.** This document moved here from agent-action-capsule's\n"
        f"> `{source}` at `{AAC_REV}`\n"
        "> (AAC#379). It changed only by the declared edits that `scripts/check-moved-spec.py` lists\n"
        "> and checks: repository paths that now name agent-action-capsule, and citations where text\n"
        "> that stays there was. It is BSD-3-Clause, as it was there (agent-action-capsule's\n"
        "> `LICENSING.md` section 2; the text is `LICENSE-BSD-3-Clause`), not Apache-2.0 like the rest\n"
        "> of this repository."
    )


@dataclass
class Move:
    source: str
    target: str
    inserts: list = field(default_factory=list)  # (after AAC line, text)
    removals: list = field(default_factory=list)  # (first AAC line, last AAC line, citation)
    rewrites: list = field(default_factory=list)  # (old, new)
    amendments: list = field(default_factory=list)  # (old, new, the change that made it)


CONTRACT = Move(
    source="spec/presentation-contract-v0.md",
    target="spec/presentation-contract-v0.md",
    inserts=[
        (0, LICENCE_LINE),
        (1, move_note("spec/presentation-contract-v0.md")),
    ],
    removals=[
        # Section 4.2: the deprecation table goes to AAC REGISTRY section 14.
        (
            325,
            333,
            "  The deprecated aliases `outcome-report/v1` and `eu-ai-act-compliance/v1`, and the releases\n"
            f"  that deprecate and remove them, are in {DEPRECATION}.",
        ),
        # Section 6.1: the check lists, their words and the word rules.
        (
            542,
            576,
            "The verification page's check lists, their words and the word rules for the verification\n"
            f"page's own text are in {vd('§6.1')}.",
        ),
        # Section 6.2: the banner's purpose, its states and the states table.
        (
            586,
            602,
            "The verification banner, its states, its line for each state and the details line under it\n"
            f"are in {vd('§6.2')}. The rules below bind a module.",
        ),
        # Section 7.1: evidentiary words.
        (
            633,
            659,
            "Evidentiary words, the three mechanisms that bind them and the placements that are forbidden\n"
            f"are in {vd('§7.1')}.",
        ),
        # Section 7.2: the sha256-jcs-nonce256 construction.
        (
            663,
            683,
            f"The `sha256-jcs-nonce256` construction is in\n{vd('§7.2')}.",
        ),
    ],
    rewrites=[
        # Status: AAC paths.
        (
            "beside `spec/evidence-result-v0.md` and\n`spec/evidence-plan-ir-v0.md`",
            "beside agent-action-capsule's `spec/evidence-result-v0.md` and\n`spec/evidence-plan-ir-v0.md`",
        ),
        # Dependency boundary: AAC paths.
        ("(`ts/src/bundle.ts`)", "(agent-action-capsule's `ts/src/bundle.ts`)"),
        (
            "(`spec/REGISTRY.md` sections 13 and 14)",
            "(agent-action-capsule's `spec/REGISTRY.md` sections 13 and 14)",
        ),
        (
            "(`spec/evidence-result-v0.md` section 8): header chrome",
            "(agent-action-capsule's `spec/evidence-result-v0.md` section 8): header chrome",
        ),
        # Section 1: "Verified" is defined in AAC.
        (
            "- **Verified**: the bundle passed the viewer's verification gate (graph closure, interval\n"
            "  coverage, per-record membership proven or unbound, every record's identity, every disclosure\n"
            "  a match or withheld). Today this is `bundleVerified` in `ts/src/presentation-registry.ts`.",
            "- **Verified**: the bundle passed the viewer's verification gate, defined in\n"
            f"  {vd('§1').replace(chr(10), chr(10) + '  ')}.",
        ),
        # Section 4.2: the block is AAC's.
        (
            "- `contract-report/v1` (`spec/contract-report-v1.md`)",
            "- `contract-report/v1` (agent-action-capsule's `spec/contract-report-v1.md`)",
        ),
        # Section 6: AAC path.
        (
            "Generalized from `spec/evidence-result-v0.md` section 8",
            "Generalized from agent-action-capsule's `spec/evidence-result-v0.md` section 8",
        ),
        # Section 6.2: keep the module clause of the states' bullet list.
        (
            "- **checking** is drawn as soon as rendering starts and stays until the checks finish. No\n"
            "  record, module region or verdict is drawn while it is shown.\n"
            "- **verified** is drawn only for a `valid` verdict: every one of the bundle's own checks ran on\n"
            "  this page and passed. A runtime that cannot run one of them (for example, one that cannot\n"
            "  authenticate the checkpoint) draws **incomplete** instead.\n"
            "- **failed** is drawn whenever one of the bundle's own checks failed, whether or not the\n"
            "  records are still shown.\n"
            "- **unable to verify** means the runtime could not run the checks at all. It is never drawn\n"
            "  as failed.\n"
            "- \"Records shown\" is what the checks allow. A presentation refusal",
            "- A presentation refusal",
        ),
        # Section 6.2: keep the module clause of the fixed-text paragraph.
        (
            "The banner's line for each state, and the details line under it naming the checks behind an\n"
            "incomplete or failed verdict, are the core's own fixed text, like the lists of section 6.1.\n"
            "No module, wording pack or bundle supplies, selects or alters them, and a viewer discards a\n"
            "module that changes, moves or hides the banner or its details line while it renders, as it\n"
            "discards one whose `render` fails. The banner line names no\n"
            "internal token. The details line carries the labels the bundle draft requires, such as\n"
            "`checkpoint_unverified`. `vectors/viewer-core-text/core-text.json` holds the exact\n"
            "fixed words of each state and of each check-list line, and a viewer's words MUST equal it.",
            "A viewer discards a module that changes, moves or hides the banner or its details line while\n"
            "it renders, as it discards one whose `render` fails.",
        ),
        # I1: the refusal's words are AAC's.
        (
            "The refusal's text is the core's:\n"
            "  \"This bundle did not verify. Its records, rows and payloads are not shown; the verification\n"
            "  page below lists which checks failed.\" An ambiguity error",
            f"The refusal's text is the core's, in\n  {vd('section 8, I1').replace(chr(10), chr(10) + '  ')}.\n  An ambiguity error",
        ),
        # I3: the evidence-identifier clause is AAC's.
        (
            "- **I3. Theme, wording, locale and depth never change evidence identifiers.** The bundle\n"
            "  digest, every `capsule_id`, every disclosure digest, `composed_digest` and every identifier\n"
            "  inside a payload are the same whatever theme, wording pack, locale or depth renders them.\n"
            "  None of those four is ever inside a digest-committed payload of the evidence.",
            "- **I3. Theme, wording, locale and depth never change evidence identifiers.** Stated in\n"
            f"  {vd('section 8, I3').replace(chr(10), chr(10) + '  ')}.",
        ),
        # Section 10: conformance also needs the AAC document.
        (
            "- A viewer conforms when it satisfies section 8.",
            "- A viewer conforms when it satisfies section 8 and the rules in\n"
            f"  {vd('§1, §6.1, §6.2, §7.1, §7.2, I1 and I3').replace(chr(10), chr(10) + '  ')}.",
        ),
        # Appendix A: the view is in this repository.
        (
            "(`ts/src/evidence-graph-view.ts`, now in capsule-viewer,\n`action-state-group/capsule-viewer`)",
            "(`ts/src/evidence-graph-view.ts`)",
        ),
        (
            "five page shapes and one floor. `spec/contract-report-v1.md` added",
            "five page shapes and one floor. agent-action-capsule's `spec/contract-report-v1.md` added",
        ),
        # Appendix C: AAC paths.
        (
            "1. `spec/evidence-result-v0.md` section 8 names",
            "1. agent-action-capsule's `spec/evidence-result-v0.md` section 8 names",
        ),
        (
            "   `ts/src/presentation.ts` reads",
            "   agent-action-capsule's `ts/src/presentation.ts` reads",
        ),
        (
            "not a row of\n   `spec/REGISTRY.md` section 14.",
            "not a row of\n   agent-action-capsule's `spec/REGISTRY.md` section 14.",
        ),
    ],
    amendments=[
        # Section 7.4: the reserved core. key prefix, from Steven Mih's closed
        # agent-action-capsule PR #356, with the schema rule, its negative and
        # its mutant. #356's renderer refusal and its words are not carried.
        (
            "neither ever comes from the bundle, and the manifest still carries no title (section 4.1).",
            "neither ever comes from the bundle, and the manifest still carries no title (section 4.1).\n\n"
            "**Reserved prefix.** Every key that begins `core.` is reserved for the core's own text, which\n"
            "no pack supplies. A pack MUST NOT carry such a key, and the schema rejects one\n"
            "(`neg-wording-pack-core-key.json`).",
            "agent-action-capsule#356, carried with the moved schema (AAC#379)",
        ),
        # Section 9.1: the core strip opens L0 on a Result page
        # (capsule-viewer#81).
        (
            "| L0 | what matters | The module's headline over verified content: one screen, no scrolling at a phone's width, every figure on it traceable to L1. | The module. |",
            "| L0 | what matters | On a bundle that carries an Evidence Result, the core strip first; then the module's headline over verified content: one screen, no scrolling at a phone's width, every figure on it traceable to L1. | The core (the strip), then the module. |",
            "capsule-viewer#81: the core strip",
        ),
        (
            "The core's part of L2 is always present and always comes before any module detail in L2.",
            "On a verified bundle whose root is an Evidence Result, L0 opens with the **core strip**, drawn by\n"
            "the core and never by a module: the mock-judge mark when a cited report names a mock judge, then\n"
            "the Result's sealed `aggregate` as it is, coverage first and then each bucket's count beside its\n"
            "denominator, the evaluated population (agent-action-capsule's `spec/evidence-result-v0.md`\n"
            "section 3). The strip shows no percentage and no single figure, and it is the same in every\n"
            "format, with scripts off and in print. Nothing a module, a section or a composed layout supplies\n"
            "goes above it: a module that puts any node before the strip or between the banner and L0, or that\n"
            "changes, moves or hides the strip, is discarded for the refusal like one whose `render` throws\n"
            "(section 4.3). A bundle with no Result draws no strip, and a module that draws the core's marks\n"
            "of a Result's counts on such a page (the strip, a bucket tally, a count-mismatch marker or the\n"
            "Result's coverage line) is discarded the same way. A module's own figures in L0 follow the strip\n"
            "and stay traceable to L1.\n\n"
            "The core's part of L2 is always present and always comes before any module detail in L2.",
            "capsule-viewer#81: the core strip",
        ),
    ],
)

CONTRACT_REPORT_MODULE = Move(
    source="spec/contract-report-v1.md",
    target="spec/contract-report-module-v1.md",
    inserts=[
        (0, LICENCE_LINE),
        (1, move_note("spec/contract-report-v1.md")),
    ],
    removals=[
        # Section 1: the block stays in AAC.
        (
            28,
            38,
            "The block is defined in agent-action-capsule's `spec/contract-report-v1.md` §1 (AAC#379).",
        ),
        # Section 5: the earlier kinds stay in AAC.
        (
            164,
            169,
            "The earlier kinds are in agent-action-capsule's `spec/contract-report-v1.md` §5, and their\n"
            f"deprecation in {DEPRECATION}.",
        ),
    ],
    amendments=[
        # Section 2: a requirement the run did not cover (capsule-viewer#96,
        # from agent-action-capsule#355) is drawn as a not-run row.
        (
            "- **Copied facts are labelled as copied.**",
            '- **Requirements not covered** (ER §3, `requirements_covered`). When the Result lists what it covered\n' +
            '  and a cited contract record names other requirements, a module that draws the rules (the Outcomes\n' +
            '  card) MAY show each of those in a group of its own as a row marked not covered. Such a row has no\n' +
            '  claims and no tally, and counts in no conversation, bucket, summary or sentence: the run never\n' +
            "  judged it. The word is the pack's own key (§3), not a core one.\n" +
            "- **Copied facts are labelled as copied.**",
            "capsule-viewer#96: rows for requirements the run did not cover",
        ),
        # Section 2: the core strip draws the sealed aggregate (capsule-viewer#81).
        (
            "- **Summary first.** It shows the Result's sealed `aggregate` as it is: coverage, then the",
            "- **Summary first.** The core strip shows the Result's sealed `aggregate` first in L0\n"
            "  (presentation contract §9.1), before anything the module draws; the module adds no second copy\n"
            "  of it. The strip shows it as it is: coverage, then the",
            "capsule-viewer#81: the core strip",
        ),
        (
            "and the buckets list claims; the module labels",
            "and the buckets list claims; the strip labels",
            "capsule-viewer#81: the core strip",
        ),
    ],
    rewrites=[
        ("# The contract-report/v1 Extension — v1", "# The contract-report/v1 Module — v1"),
        (
            "**Status.** Informational, kept in this repository. It changes no Internet-Draft. It defines one\n"
            "Evidence Bundle extension kind, `contract-report/v1`, registered in `REGISTRY.md` §14. The block",
            "**Status.** Informational. It changes no Internet-Draft. It defines how a presentation module\n"
            "draws the Evidence Bundle extension kind `contract-report/v1`, which agent-action-capsule's\n"
            "`spec/contract-report-v1.md` §1 defines and its `spec/REGISTRY.md` §14 registers. The block",
        ),
        (
            "Its companion schema is\n`schemas/contract-report-v1.json`.",
            "The block's schema is\nagent-action-capsule's `schemas/contract-report-v1.json`.",
        ),
        # The block and its schema are agent-action-capsule's; this document governs only how a
        # module draws it.
        (
            "Where the schema and this document disagree, this document\ngoverns.",
            "agent-action-capsule's `spec/contract-report-v1.md` governs the block and its\n"
            "schema; this document governs only how a module draws it.",
        ),
        (
            "**Owns:** the block (§1), how a contract-report module reads the Result (§2), the wording keys the\n"
            "kind defines (§3), and the manifest a contract-report module registers with (§4).",
            "**Owns:** how a contract-report module reads the Result (§2), the wording keys the\n"
            "kind defines (§3), and the manifest a contract-report module registers with (§4). The block (§1)\n"
            "and the earlier kinds (§5) are agent-action-capsule's `spec/contract-report-v1.md`.",
        ),
        (
            "| ER | `spec/evidence-result-v0.md` |",
            "| ER | agent-action-capsule's `spec/evidence-result-v0.md` |",
        ),
        (
            "(PC §4.2's deprecation table)",
            f"({DEPRECATION})",
        ),
    ],
)

BUILDER = Move(
    source="spec/presentation-builder-v0.md",
    target="spec/presentation-builder-v0.md",
    inserts=[
        (0, LICENCE_LINE),
        (1, move_note("spec/presentation-builder-v0.md")),
    ],
    rewrites=[
        (
            "The reference builder lives in capsule-viewer\n"
            "(`ts/src/presentation-builder.ts` and `ts/src/presentation-mount.ts` there, with this\n"
            "repository's `ts/src/presentation-fragment.ts`)",
            "The reference builder lives in this repository\n"
            "(`ts/src/presentation-builder.ts`, `ts/src/presentation-mount.ts` and\n"
            "`ts/src/presentation-fragment.ts`)",
        ),
        ("(`ts/src/bundle.ts`)", "(agent-action-capsule's `ts/src/bundle.ts`)"),
        (
            "shared vectors are `ts/test/testdata/presentation-fragment-vectors.json`",
            "shared vectors are agent-action-capsule's `vectors/bundle/fragment/vectors.json`",
        ),
    ],
    amendments=[
        # Section 1.1 and section 2's static page: every toggle's body is
        # built, and the page's size is reported and checked against a
        # budget (capsule-viewer#67).
        (
            "| `static-carries-script` | `static` | The rendered page holds a script element or an event-handler attribute. | |",
            "| `static-carries-script` | `static` | The rendered page holds a script element or an event-handler attribute. | |\n"
            "| `static-body-unbuilt` | `static` | A toggle's body could not be built at build time, so it would open empty. | `unbuilt` (each such toggle's summary text, or the tag of a pending body that is not a toggle) |\n"
            "| `static-too-large` | `static` | The page, with every toggle's body built, is over its size budget. | `bytes`, `limit` |",
            "capsule-viewer#67",
        ),
        (
            "an event-handler attribute, which the CSP would block anyway.",
            "an event-handler attribute, which the CSP would block anyway.\n"
            "\n"
            "**Every body is built.** Where script runs, a toggle's body is built the first time it opens.\n"
            "The static page runs none, so before it is written the builder builds every body still pending,\n"
            "with the same builders the toggles run, and leaves every toggle open or closed as the depth left\n"
            "it: a reader who opens any toggle sees what the offline file shows there. Each conversation is\n"
            "kept once, in the core's records section, and the cards link to it. A body the builder cannot\n"
            "build is refused (`static-body-unbuilt`), never written as an empty toggle.\n"
            "\n"
            "**Size.** The result returns the page's size in UTF-8 bytes (`bytes`) and the budget it was\n"
            "checked against (`limit`). The budget is 16 MiB by default (`STATIC_PAGE_DEFAULT_BUDGET`); a\n"
            "caller MAY lower or raise it (`maxStaticBytes`, a positive integer). A page over it is refused\n"
            "(`static-too-large`, naming the size and the budget), never written with bodies left out. A\n"
            "monthly report is a few megabytes: the 451-record outcome fixture builds to about 6.0 MB and\n"
            "the 80-session compliance fixture to about 2.2 MB, the same at every depth.",
            "capsule-viewer#67",
        ),
        # Section 2.2 and 2.3: the Go fragment encoder and the embedded
        # snippet, in TypeScript and Go (action-state-group/capsule-cli#254).
        (
            "permalink is shared as the offline file or the static page.",
            "permalink is shared as the offline file or the static page.\n"
            "\n"
            "**Go.** `BuildPresentationFragment` (go/emitter) packages the same fragment: for the same scoped\n"
            "bundle, runtime and settings it writes the same token and URL, and refuses the same over-long ones\n"
            "with `*FragmentTooLargeError`. It takes the module id the caller resolved as `Presentation`\n"
            "(`\"auto\"` when empty), and an empty `Title` or `ThemeCSS` is treated as unset. Seeded vectors\n"
            "generated by the TypeScript builder (`go/emitter/testdata/fragment-vectors.json`) hold the two\n"
            "together.",
            "action-state-group/capsule-cli#254",
        ),
        (
            "The host page owns its own\nCSP.",
            "The host page owns its own\n"
            "CSP.\n"
            "\n"
            "**Snippet.** Given the core runtime, the result also carries `html`: a snippet a host page inlines\n"
            "where the presentation goes, which makes `mount`'s call with the same options. It holds the core\n"
            "runtime and each module as inline scripts, an empty `<div data-aac-embedded>`, the scoped bundle as\n"
            "a `<script type=\"application/json\">` data element, and a bootstrap that reads the bundle with\n"
            "`JSON.parse` and calls `renderEvidenceGraph` on that element with `mount`'s options (audience,\n"
            "`format: \"embedded\"`, depth, wording), written as JCS. The snippet carries no CSP. The result's\n"
            "`scriptSources` and `styleSources` are the hash sources of its inline scripts and of the stylesheets\n"
            "the core runtime and the modules insert. A host CSP that allows them, with no `'unsafe-inline'`,\n"
            "runs it. Title and theme are the host's. Unlike `mount`, the snippet takes no caller registry. It\n"
            "resolves, as the offline file does, with the default registry the core runtime holds, which its\n"
            "module scripts register with (`registerPresentation`), so a module that is only in the caller's\n"
            "registry does not render. Go's `BuildEmbeddedHTML` (go/emitter) writes the same bytes and sources,\n"
            "held together by seeded vectors that the TypeScript builder generates\n"
            "(`go/emitter/testdata/embedded-vectors.json`).",
            "action-state-group/capsule-cli#254",
        ),
    ],
)

MOVES = [CONTRACT, CONTRACT_REPORT_MODULE, BUILDER]


@dataclass
class Block:
    first: int  # 1-based line numbers in the file it came from
    last: int
    text: str


def blocks(text: str) -> list:
    """Split Markdown into paragraphs at blank lines, keeping fenced code whole."""
    out = []
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    current: list = []
    first = 0
    fenced = False
    for number, line in enumerate(lines, start=1):
        if line.lstrip().startswith("```"):
            fenced = not fenced
        if line == "" and not fenced:
            if current:
                out.append(Block(first, number - 1, "\n".join(current)))
                current = []
            continue
        if not current:
            first = number
        current.append(line)
    if current:
        out.append(Block(first, len(lines), "\n".join(current)))
    return out


@dataclass
class Expected:
    text: str
    origin: str  # what the reviewer sees: AAC lines and how it came here


def expected_blocks(move: Move, source: str, problems: list) -> list:
    old = blocks(source)
    if "\n\n".join(b.text for b in old) + "\n" != source:
        problems.append(f"{move.source}: the AAC file has blank-line runs this split cannot reproduce")
    removed = {}
    replacement_after = {}
    for first, last, replacement in move.removals:
        covered = [i for i, b in enumerate(old) if b.first >= first and b.last <= last]
        straddling = [b for b in old if b.first < first <= b.last or b.first <= last < b.last]
        if not covered or old[covered[0]].first != first or old[covered[-1]].last != last or straddling:
            problems.append(f"{move.source}: removal L{first}-{last} does not cover whole paragraphs")
            continue
        for i in covered:
            removed[i] = (first, last)
        replacement_after[covered[-1]] = (first, last, replacement)
    texts = {i: b.text for i, b in enumerate(old) if i not in removed}
    kinds = {i: "unchanged" for i in texts}
    for pairs, kind in ((move.rewrites, "rewritten"), (move.amendments, "amended")):
        for pair in pairs:
            old_text, new_text = pair[0], pair[1]
            hits = [i for i, t in texts.items() if old_text in t]
            count = sum(texts[i].count(old_text) for i in hits)
            if count != 1:
                problems.append(f"{move.target}: {kind} text occurs {count} times, not once: {old_text[:60]!r}")
                continue
            texts[hits[0]] = texts[hits[0]].replace(old_text, new_text)
            kinds[hits[0]] = kind if kinds[hits[0]] == "unchanged" else f"{kinds[hits[0]]}+{kind}"
    inserts = {}
    for after, text in move.inserts:
        inserts.setdefault(after, []).append(text)

    out = [Expected(t, "inserted at the top") for t in inserts.get(0, [])]
    for i, b in enumerate(old):
        if i in texts:
            for part in [p.text for p in blocks(texts[i])]:
                out.append(Expected(part, f"AAC L{b.first}-{b.last} {kinds[i]}"))
        if i in replacement_after:
            first, last, citation = replacement_after[i]
            for part in [p.text for p in blocks(citation)]:
                out.append(Expected(part, f"AAC L{first}-{last} removed; citation"))
        for text in inserts.get(b.last, []):
            out.append(Expected(text, f"inserted after AAC L{b.last}"))
    return out


def check(move: Move, aac: Path) -> bool:
    problems: list = []
    try:
        source = subprocess.run(
            ["git", "-C", str(aac), "show", f"{AAC_REV}:{move.source}"],
            check=True,
            capture_output=True,
        ).stdout.decode("utf-8")
    except subprocess.CalledProcessError as exc:
        print(f"FAIL {move.source}: cannot read it at {AAC_REV}: {exc.stderr.decode().strip()}")
        return False
    target_path = REPO / move.target
    if not target_path.is_file():
        print(f"FAIL {move.target}: missing")
        return False
    target = target_path.read_text(encoding="utf-8")
    expected = expected_blocks(move, source, problems)
    actual = blocks(target)

    print(f"\n== AAC {move.source} -> {move.target}")
    for n, e in enumerate(expected):
        a = actual[n] if n < len(actual) else None
        where = f"L{a.first}-{a.last}" if a else "(missing)"
        same = a is not None and a.text == e.text
        print(f"{'  ' if same else 'XX'} {e.origin:<48} -> here {where}")
        if not same:
            problems.append(
                f"{move.target} {where}: differs from {e.origin}\n      expected: {e.text[:200]!r}\n"
                f"      found:    {(a.text if a else '')[:200]!r}"
            )
    for a in actual[len(expected):]:
        problems.append(f"{move.target} L{a.first}-{a.last}: a paragraph no declared edit accounts for")
    if not problems and "\n\n".join(e.text for e in expected) + "\n" != target:
        problems.append(f"{move.target}: paragraphs match but the blank lines between them do not")
    for p in problems:
        print(f"FAIL {p}")
    return not problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--aac", help="agent-action-capsule clone holding AAC_REV (default: $AAC_CHECKOUT)")
    parser.add_argument("--rev", action="store_true", help="print AAC_REV and exit (CI fetches it)")
    args = parser.parse_args()
    if args.rev:
        print(AAC_REV)
        return 0
    aac = args.aac or os.environ.get("AAC_CHECKOUT")
    if not aac:
        print(
            "SKIP: no agent-action-capsule checkout given (--aac PATH or AAC_CHECKOUT); "
            f"the moved spec text was not compared with AAC at {AAC_REV}."
        )
        return 0
    ok = all([check(move, Path(aac)) for move in MOVES])
    print(f"\n{'OK' if ok else 'FAILED'}: moved spec text against agent-action-capsule {AAC_REV}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
