// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

// Show evidence (capsule-viewer#83): src/capsule_viewer/static/show_evidence.js,
// run as shipped, over the ResultRoot agent-action-capsule's own Result
// reader builds (buildResultRoot), as the page runtime and the contract
// report hold it.
//
// The golden is drawn from a committed VALID bundle, evidencebook's
// report/testdata/presentation/4-monthly-outcome/bundle.json at 5e35533
// (testdata/show-evidence/monthly-outcome.bundle.json, unchanged). The
// negative cases edit a copy and read it again, or seal this repository's
// Result fixtures with an edit (helpers/sealed-bundle.ts), so the reader,
// not the test, decides what each claim resolves to.
//
// UPDATE_GOLDENS=1 npx vitest run test/show-evidence.test.ts rewrites the
// golden for an intended change; review the diff before committing it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildResultRoot,
  type ResultClaim,
  type ResultRoot,
} from "@action-state-group/agent-action-capsule";
import { withCarriedCapsule } from "./helpers/carried-capsule.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, any>;
interface ShowEvidence {
  WORDS: Record<string, string>;
  resolve(result: ResultRoot, claim: ResultClaim): Obj;
  render(
    model: Obj,
    doc: Document,
    words?: Record<string, string>,
  ): HTMLElement;
}

const SCRIPT = resolvePath(
  process.cwd(),
  "..",
  "src",
  "capsule_viewer",
  "static",
  "show_evidence.js",
);
const testdata = (...parts: string[]): string =>
  resolvePath(process.cwd(), "test", "testdata", ...parts);
const GOLDEN = resolvePath(
  process.cwd(),
  "test",
  "goldens",
  "show-evidence",
  "monthly-outcome.html",
);

let SE: ShowEvidence;

beforeAll(() => {
  // Loaded once, as a page's script tag would run it.
  (0, eval)(readFileSync(SCRIPT, "utf8"));
  const loaded = (globalThis as Obj).CapsuleViewerShowEvidence as ShowEvidence;
  // Every render in this file is checked for source tags.
  SE = {
    ...loaded,
    render: (model, doc, words) => {
      const node = loaded.render(model, doc, words);
      expectTagged(node);
      return node;
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const SOURCES = new Set(["pack", "field", "payload", "producer"]);

/**
 * Steven's WordSources rule: every drawn string (a text node with a letter
 * or digit; separators carry none) sits inside an element whose data-source
 * names one of the sources, and no element names another.
 */
function expectTagged(node: HTMLElement): void {
  for (const tagged of node.querySelectorAll("[data-source]"))
    expect(SOURCES).toContain(tagged.getAttribute("data-source"));
  const walker = node.ownerDocument.createTreeWalker(
    node,
    NodeFilter.SHOW_TEXT,
  );
  for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
    if (!/[\p{L}\p{N}]/u.test(text.textContent ?? "")) continue;
    const source = text.parentElement?.closest("[data-source]");
    expect(source, `untagged text: ${text.textContent}`).not.toBeNull();
  }
}

const read = (path: string): Obj =>
  JSON.parse(readFileSync(path, "utf8")) as Obj;
const monthly = (): Obj =>
  read(testdata("show-evidence", "monthly-outcome.bundle.json"));

function draw(result: ResultRoot, claim: ResultClaim): HTMLElement {
  return SE.render(SE.resolve(result, claim), document);
}

const firstOf = (result: ResultRoot, verdict: string): ResultClaim =>
  result.claims.find((c) => c.verdict === verdict)!;

describe("show evidence over the committed VALID bundle", () => {
  it("draws the golden: one met and every not-met claim", async () => {
    const result = await buildResultRoot(monthly());
    expect(result.claims).toHaveLength(32);
    const picked = [
      firstOf(result, "met"),
      ...result.claims.filter((c) => c.verdict === "not_met"),
    ];
    expect(picked).toHaveLength(6);
    const html = picked.map((c) => draw(result, c).outerHTML).join("\n") + "\n";
    if (process.env.UPDATE_GOLDENS) {
      mkdirSync(resolvePath(GOLDEN, ".."), { recursive: true });
      writeFileSync(GOLDEN, html);
    }
    expect(html).toBe(readFileSync(GOLDEN, "utf8"));
  });

  it("resolves every claim's evidence to a disclosed record, draws every verdict, and never fetches", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await buildResultRoot(monthly());
    for (const claim of result.claims) {
      const model = SE.resolve(result, claim);
      expect(model.evidence.map((e: Obj) => e.state)).toEqual(["disclosed"]);
      expect(model.evidence[0].kind).toBe("evaluation-report/v1");
      expect(model.verdict_drawn).toBe("drawn");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("draws the criterion and the judge's words from the cited report, the judge's words as producer text", async () => {
    const b = monthly();
    const result = await buildResultRoot(b);
    const claim = firstOf(result, "not_met");
    const report = b.disclosures[claim.evidence[0]!.digest].agent_input as Obj;
    const node = draw(result, claim);
    const criterion = node.querySelector('[data-side="criterion"] blockquote')!;
    expect(criterion.textContent).toContain(report.clause_claim);
    const producer = node.querySelectorAll('[data-source="producer"]');
    expect(producer).toHaveLength(1);
    expect(producer[0]!.closest('[data-side="verdict"]')).not.toBeNull();
    expect(producer[0]!.querySelector("i")!.textContent).toBe(
      `“${report.rationale}”`,
    );
    expect(producer[0]!.textContent).toContain(SE.WORDS["side.producer_said"]);
    // The judge's words appear only there: not in the payload box.
    const payload = node.querySelector('[data-source="payload"]')!;
    expect(payload.textContent).not.toContain(report.rationale);
    expect(payload.querySelector('[data-member="rationale"]')).toBeNull();
    expect(payload.querySelector('[data-member="clause_claim"]')).toBeNull();
    expect(
      payload.querySelector('[data-member="case_id"]')!.textContent,
    ).toContain(report.case_id);
    expect(node.querySelector(".cv-side-verdict")!.textContent).toBe("Not met");
    expect(node.querySelector('[data-side="verdict"] h5')!.textContent).toBe(
      "The verdict, as the Result states it",
    );
  });

  it("is read-only and for the deepest level only", async () => {
    const result = await buildResultRoot(monthly());
    for (const claim of result.claims) {
      const node = draw(result, claim);
      expect(node.dataset.level).toBe("L2");
      expect(
        node.querySelectorAll(
          "button, input, select, textarea, form, a, [onclick], [contenteditable]",
        ),
      ).toHaveLength(0);
    }
  });
});

const GAPS_GOLDEN = resolvePath(GOLDEN, "..", "book-and-gaps.html");

/**
 * The cases the page must never draw as met or as present, from Results
 * sealed here (helpers/sealed-bundle.ts) and read by buildResultRoot:
 * (a) a met claim whose only evidence is not in the bundle; (b) in a book
 * bundle, one claim citing a capsule a book record carries and one citing a
 * digest no record has; (c) every claim of a book-form Result root.
 */
async function gapCases(): Promise<{ label: string; html: string }[]> {
  const absent = "f".repeat(64);
  const out: { label: string; html: string }[] = [];

  const unsupported = read(testdata("result-root-bundle.json"));
  const met = unsupported.disclosures.result.agent_input.claims[0];
  met.evidence = [{ digest_alg: "SHA-256", digest: absent }];
  met.presentation.evidence = [{ digest_alg: "SHA-256", digest: absent }];
  const a = await buildResultRoot(
    (await sealEvidenceBundle(unsupported)).bundle,
  );
  out.push({ label: "a", html: draw(a, a.claims[0]!).outerHTML });

  const book = read(testdata("result-root-bundle.json"));
  const { carriedId } = await withCarriedCapsule(book, {
    turns: ["Please cancel EHGLP3."],
  });
  const second = book.disclosures.result.agent_input.claims[1];
  second.evidence = [{ digest_alg: "SHA-256", digest: absent }];
  second.presentation.evidence = [{ digest_alg: "SHA-256", digest: absent }];
  const b = await buildResultRoot((await sealEvidenceBundle(book)).bundle);
  const carrying = b.claims.find((c) =>
    c.evidence.some((e) => e.digest === carriedId),
  )!;
  out.push({ label: "b-carried", html: draw(b, carrying).outerHTML });
  out.push({ label: "b-absent", html: draw(b, b.claims[1]!).outerHTML });

  const c = await buildResultRoot(
    (await sealEvidenceBundle(read(testdata("result-root-book-bundle.json"))))
      .bundle,
  );
  for (const claim of c.claims)
    out.push({ label: "c", html: draw(c, claim).outerHTML });
  return out;
}

describe("show evidence, the gaps golden", () => {
  it("draws (a) an unsupported met claim, (b) a book bundle's carried and absent evidence, (c) a book-form root", async () => {
    const cases = await gapCases();
    const html =
      cases.map((one) => `<!-- ${one.label} -->\n${one.html}`).join("\n") +
      "\n";
    if (process.env.UPDATE_GOLDENS) writeFileSync(GAPS_GOLDEN, html);
    expect(html).toBe(readFileSync(GAPS_GOLDEN, "utf8"));
    const doc = new DOMParser().parseFromString(html, "text/html");
    const verdicts = [...doc.querySelectorAll("section")].map((section) => ({
      drawn: section
        .querySelector(".cv-side-verdict")!
        .getAttribute("data-verdict-drawn"),
      states: [...section.querySelectorAll("[data-evidence][data-state]")].map(
        (e) => e.getAttribute("data-state"),
      ),
    }));
    // (a) no verdict word, and the digest not in the bundle
    expect(verdicts[0]).toEqual({
      drawn: "unsupported",
      states: ["not_in_bundle"],
    });
    // (b) the carried capsule is drawn; the absent digest is not in this bundle
    expect(verdicts[1]!.states).toContain("disclosed");
    expect(verdicts[2]).toEqual({
      drawn: "unsupported",
      states: ["not_in_bundle"],
    });
    // (c) a book-form root's claims all draw, none missing
    for (const one of verdicts.slice(3))
      expect(one.states).not.toContain("not_in_bundle");
    expect(verdicts.length).toBeGreaterThan(3);
  });
});

describe("show evidence, negative cases", () => {
  it("draws a cited record the bundle does not disclose as withheld, with no content", async () => {
    const b = monthly();
    const digest = (await buildResultRoot(b)).claims[0]!.evidence[0]!.digest;
    delete b.disclosures[digest];
    const result = await buildResultRoot(b);
    const node = draw(result, result.claims[0]!);
    const record = node.querySelector(`[data-evidence="${digest}"]`)!;
    expect(record.getAttribute("data-state")).toBe("withheld");
    expect(record.textContent).toContain(SE.WORDS["carrier.withheld"]);
    expect(node.querySelector('[data-source="payload"]')).toBeNull();
    expect(node.querySelector('[data-source="producer"]')).toBeNull();
  });

  it("draws a disclosure that does not match its digest as a mismatch, never its content", async () => {
    const b = monthly();
    const digest = (await buildResultRoot(b)).claims[0]!.evidence[0]!.digest;
    b.disclosures[digest].agent_input.rationale = "edited after sealing";
    const result = await buildResultRoot(b);
    const node = draw(result, result.claims[0]!);
    expect(
      node
        .querySelector(`[data-evidence="${digest}"]`)!
        .getAttribute("data-state"),
    ).toBe("disclosure_mismatch");
    expect(node.textContent).not.toContain("edited after sealing");
    expect(node.querySelector('[data-source="payload"]')).toBeNull();
  });

  it("draws a met claim whose evidence is not in the bundle with no verdict word, and fetches nothing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const source = read(testdata("result-root-bundle.json"));
    const absent = "f".repeat(64);
    const claim = source.disclosures.result.agent_input.claims[0];
    expect(claim.verdict).toBe("met");
    claim.evidence = [{ digest_alg: "SHA-256", digest: absent }];
    claim.presentation.evidence = [{ digest_alg: "SHA-256", digest: absent }];
    const { bundle } = await sealEvidenceBundle(source);
    const result = await buildResultRoot(bundle);
    const read0 = result.claims[0]!;
    expect(read0.support).toBe("unsupported");
    const node = draw(result, read0);
    const record = node.querySelector(`[data-evidence="${absent}"]`)!;
    expect(record.getAttribute("data-state")).toBe("not_in_bundle");
    expect(record.textContent).toContain(SE.WORDS["side.not_in_bundle"]);
    const verdict = node.querySelector(".cv-side-verdict")!;
    expect(verdict.textContent).toBe(SE.WORDS["side.unsupported"]);
    expect(node.textContent).not.toContain(SE.WORDS["verdict.met"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("draws a payload member named like an inherited property", async () => {
    const result = await buildResultRoot(monthly());
    const claim = result.claims[0]!;
    const model = SE.resolve(result, claim);
    model.evidence[0].payload = {
      ...model.evidence[0].payload,
      constructor: "kept",
      toString: "kept too",
    };
    const box = SE.render(model, document).querySelector(
      '[data-source="payload"]',
    )!;
    expect(
      box.querySelector('[data-member="constructor"]')!.textContent,
    ).toContain("kept");
    expect(
      box.querySelector('[data-member="toString"]')!.textContent,
    ).toContain("kept too");
  });

  it("never draws two close states alike, and shows an asserted state that differs from the recomputed one", async () => {
    const result = await buildResultRoot(monthly());
    const base = { ...result.claims[0]!, type: "close" };
    const close = (state: string, asserted = state) =>
      draw(result, { ...base, close: { state, asserted } } as never);
    const unilateral = close("UNILATERAL");
    const agreed = close("AGREED");
    expect(unilateral.outerHTML).not.toBe(agreed.outerHTML);
    expect(
      unilateral.querySelector("[data-close-state]")!.textContent,
    ).toContain("UNILATERAL");
    const mismatch = close("UNILATERAL", "AGREED");
    expect(mismatch.querySelector("[data-close-state]")!.textContent).toContain(
      "close.asserted: AGREED",
    );
  });

  it("marks a later claim's verdict as readiness only", async () => {
    const result = await buildResultRoot(monthly());
    const claim = { ...firstOf(result, "met"), later: true };
    const verdict = draw(result, claim).querySelector(".cv-side-verdict")!;
    expect(verdict.getAttribute("data-later")).toBe("true");
    expect(verdict.textContent).toBe(
      `${SE.WORDS["verdict.met"]} ${SE.WORDS["side.later"]}`,
    );
  });

  it("draws a producer-asserted close state apart from a recomputed one", async () => {
    const result = await buildResultRoot(monthly());
    const agreed = (derivation: string) =>
      draw(result, {
        ...result.claims[0]!,
        type: "close",
        close: { state: "AGREED", asserted: "AGREED", derivation },
      } as never).querySelector("[data-close-state]")!;
    const asserted = agreed("producer-asserted");
    const recomputed = agreed("recomputed");
    expect(asserted.textContent).toContain("close.state: AGREED");
    expect(asserted.textContent).toContain(
      "close.derivation: producer-asserted",
    );
    expect(recomputed.textContent).toContain("close.derivation: recomputed");
    expect(asserted.outerHTML).not.toBe(recomputed.outerHTML);
  });

  it("draws each reconcile tally as its own field", async () => {
    const result = await buildResultRoot(monthly());
    const claim = {
      ...result.claims[0]!,
      type: "reconcile",
      reconcile: {
        tallies: { matched: 3, a_only: 1, b_only: 2, conflicting: 0 },
        stateOfRecord: "A",
      },
    } as never;
    const line = draw(result, claim).querySelector("[data-reconcile]")!;
    expect(line.textContent).toContain("reconcile.a_only: 1");
    expect(line.textContent).toContain("reconcile.b_only: 2");
    expect(line.textContent).toContain("reconcile.conflicting: 0");
    expect(line.textContent).toContain("reconcile.state_of_record: A");
  });

  it("draws a claim of a type the reader does not recognize with no verdict word", async () => {
    const result = await buildResultRoot(monthly());
    const claim = {
      ...result.claims[0]!,
      type: "x-future",
      recognized: false,
    };
    const node = draw(result, claim);
    expect(node.querySelector(".cv-side-verdict")!.textContent).toBe(
      SE.WORDS["side.unrecognized"],
    );
    expect(node.textContent).toContain("type: x-future");
  });

  it("draws a failed claim with no verdict word", async () => {
    const result = await buildResultRoot(monthly());
    const claim = { ...result.claims[0]!, failed: true };
    const verdict = draw(result, claim).querySelector(".cv-side-verdict")!;
    expect(verdict.getAttribute("data-verdict-drawn")).toBe("failed");
    expect(verdict.textContent).toBe(SE.WORDS["side.failed"]);
    // Nothing else in the column says what the verdict would have been.
    const column = verdict.closest('[data-side="verdict"]')!;
    expect(column.textContent).not.toContain("sufficiency");
    expect(column.querySelector('[data-source="producer"]')).toBeNull();
  });

  it("draws a book-form Result root's claims", async () => {
    const { bundle } = await sealEvidenceBundle(
      read(testdata("result-root-book-bundle.json")),
    );
    const result = await buildResultRoot(bundle);
    expect(result.claims.length).toBeGreaterThan(0);
    for (const claim of result.claims) {
      const model = SE.resolve(result, claim);
      expect(model.requirement_ref).toBe(claim.requirementRef);
      expect(
        model.evidence.every((e: Obj) => e.state !== "not_in_bundle"),
      ).toBe(true);
    }
  });

  it("draws a capsule a book record carries, cited by its own id, from its carried input", async () => {
    const source = read(testdata("result-root-bundle.json"));
    const conversation = { turns: ["Please cancel EHGLP3."] };
    const { carriedId } = await withCarriedCapsule(source, conversation);
    const { bundle } = await sealEvidenceBundle(source);
    const result = await buildResultRoot(bundle);
    const claim = result.claims.find((c) =>
      c.evidence.some((e) => e.digest === carriedId),
    )!;
    const node = draw(result, claim);
    const record = node.querySelector(`[data-evidence="${carriedId}"]`)!;
    expect(record.getAttribute("data-state")).toBe("disclosed");
    expect(record.textContent).toContain("Please cancel EHGLP3.");
  });

  for (const [kind, member] of [
    ["analysis", "summary"],
    ["story", "narrative"],
  ] as const) {
    it(`draws a ${kind} carrier's text as the producer's, and no record content`, async () => {
      const result = await buildResultRoot(monthly());
      const text = `The ${kind} text <img src=x onerror=alert(1)>`;
      const claim = {
        ...result.claims[0]!,
        presentation: { kind, status: "WITHHELD", [member]: text },
      } as ResultClaim;
      const node = draw(result, claim);
      expect(node.querySelector('[data-source="payload"]')).toBeNull();
      expect(
        node.querySelector('[data-side="criterion"] blockquote'),
      ).toBeNull();
      const producer = node.querySelectorAll('[data-source="producer"]');
      expect(producer).toHaveLength(1);
      expect(producer[0]!.querySelector("i")!.textContent).toBe(`“${text}”`);
      expect(node.querySelector("img")).toBeNull();
      expect(node.querySelector(`[data-carrier="${kind}"]`)!.textContent).toBe(
        SE.WORDS[`side.${kind}`],
      );
    });
  }

  it("draws no content under a disclosure carrier whose status is withheld", async () => {
    const result = await buildResultRoot(monthly());
    const first = result.claims[0]!;
    const claim = {
      ...first,
      presentation: { ...first.presentation, status: "NOT_COMMITTED" },
    } as ResultClaim;
    const node = draw(result, claim);
    expect(node.querySelector('[data-source="payload"]')).toBeNull();
    expect(node.querySelector('[data-source="producer"]')).toBeNull();
  });

  it("draws a claim that cites no evidence as such", async () => {
    const result = await buildResultRoot(monthly());
    const claim = { ...result.claims[0]!, evidence: [] };
    expect(
      draw(result, claim).querySelector('[data-state="no_evidence"]')!
        .textContent,
    ).toBe(SE.WORDS["side.no_evidence"]);
  });

  it("layers a host's words over its own, and shows an unknown key as itself", async () => {
    const result = await buildResultRoot(monthly());
    const claim = result.claims[0]!;
    const node = SE.render(SE.resolve(result, claim), document, {
      "side.criterion": "Criterio",
    });
    expect(node.querySelector('[data-side="criterion"] h5')!.textContent).toBe(
      "Criterio",
    );
    expect(node.querySelector('[data-side="verdict"] h5')!.textContent).toBe(
      SE.WORDS["side.verdict"],
    );
    const odd = SE.render(
      SE.resolve(result, { ...claim, verdict: "maybe" } as never),
      document,
    );
    expect(odd.querySelector(".cv-side-verdict")!.textContent).toBe(
      "verdict.maybe",
    );
  });
});
