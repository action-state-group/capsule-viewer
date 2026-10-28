// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

// Show evidence (capsule-viewer#83): src/capsule_viewer/static/show_evidence.js,
// run as shipped, over contexts agent-action-capsule's own verifier builds
// (buildVerifiedBundleContext), with its disclosureOf, the function the page
// runtime hands modules on EvidenceGraph.
//
// The golden is drawn from a committed VALID bundle, evidencebook's
// report/testdata/presentation/4-monthly-outcome/bundle.json at 5e35533
// (testdata/show-evidence/monthly-outcome.bundle.json, unchanged). The
// negative cases edit a copy and verify it again, or hand resolve a claim the
// bundle does not back.
//
// UPDATE_GOLDENS=1 npx vitest run test/show-evidence.test.ts rewrites the
// golden for an intended change; review the diff before committing it.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildVerifiedBundleContext,
  disclosureOf,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";

type Obj = Record<string, any>;
interface ShowEvidence {
  WORDS: Record<string, string>;
  claimsOf(context: unknown, read?: typeof disclosureOf): Obj[];
  resolve(context: unknown, claim: unknown, read?: typeof disclosureOf): Obj;
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
const FIXTURE = resolvePath(
  process.cwd(),
  "test",
  "testdata",
  "show-evidence",
  "monthly-outcome.bundle.json",
);
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
  SE = (globalThis as Obj).CapsuleViewerShowEvidence as ShowEvidence;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Obj).EvidenceGraph;
});

const bundle = (): Obj => JSON.parse(readFileSync(FIXTURE, "utf8")) as Obj;
const verify = (b: Obj): Promise<VerifiedBundleContext> =>
  buildVerifiedBundleContext(b);

function draw(context: VerifiedBundleContext, claim: Obj): HTMLElement {
  return SE.render(SE.resolve(context, claim, disclosureOf), document);
}

const firstOf = (claims: Obj[], verdict: string): Obj =>
  claims.find((c) => c.verdict === verdict)!;

describe("show evidence over the committed VALID bundle", () => {
  it("draws the golden: one met and every not-met claim", async () => {
    const context = await verify(bundle());
    expect(context.verification.graphClosure.status).toBe("pass");
    const claims = SE.claimsOf(context, disclosureOf);
    expect(claims).toHaveLength(32);
    const picked = [
      firstOf(claims, "met"),
      ...claims.filter((c) => c.verdict === "not_met"),
    ];
    expect(picked).toHaveLength(6);
    const html =
      picked.map((c) => draw(context, c).outerHTML).join("\n") + "\n";
    if (process.env.UPDATE_GOLDENS) {
      mkdirSync(resolvePath(GOLDEN, ".."), { recursive: true });
      writeFileSync(GOLDEN, html);
    }
    expect(html).toBe(readFileSync(GOLDEN, "utf8"));
  });

  it("resolves every claim's evidence to a disclosed record, and never fetches", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const context = await verify(bundle());
    for (const claim of SE.claimsOf(context, disclosureOf)) {
      const model = SE.resolve(context, claim, disclosureOf);
      expect(model.evidence.map((e: Obj) => e.state)).toEqual(["disclosed"]);
      expect(model.evidence[0].kind).toBe("evaluation-report/v1");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the page runtime's disclosureOf when none is passed", async () => {
    const context = await verify(bundle());
    (globalThis as Obj).EvidenceGraph = { disclosureOf };
    const claim = SE.claimsOf(context)[0]!;
    expect(SE.resolve(context, claim).evidence[0].state).toBe("disclosed");
  });

  it("draws the criterion and the judge's words from the cited report, the judge's words as producer text", async () => {
    const b = bundle();
    const context = await verify(b);
    const claim = firstOf(SE.claimsOf(context, disclosureOf), "not_met");
    const digest = claim.evidence[0].digest as string;
    const report = b.disclosures[digest].agent_input as Obj;
    const node = draw(context, claim);
    const criterion = node.querySelector('[data-side="criterion"] blockquote')!;
    expect(criterion.textContent).toContain(report.clause_claim);
    const producer = node.querySelectorAll('[data-source="producer"]');
    expect(producer).toHaveLength(1);
    expect(producer[0]!.closest('[data-side="verdict"]')).not.toBeNull();
    expect(producer[0]!.querySelector("i")!.textContent).toBe(
      `“${report.rationale}”`,
    );
    expect(producer[0]!.textContent).toContain(SE.WORDS["side.producer_said"]);
    expect(producer[0]!.textContent).toContain("example-judge@1");
    // The judge's words appear only there: not in the payload box, not as a field.
    const payload = node.querySelector('[data-source="payload"]')!;
    expect(payload.textContent).not.toContain(report.rationale);
    expect(payload.querySelector('[data-member="rationale"]')).toBeNull();
    expect(payload.querySelector('[data-member="clause_claim"]')).toBeNull();
    expect(
      payload.querySelector('[data-member="case_id"]')!.textContent,
    ).toContain(report.case_id);
    expect(
      node.querySelector('[data-side="verdict"] .cv-side-verdict')!.textContent,
    ).toBe("Not met");
  });

  it("is read-only and for the deepest level only", async () => {
    const context = await verify(bundle());
    for (const claim of SE.claimsOf(context, disclosureOf)) {
      const node = draw(context, claim);
      expect(node.dataset.level).toBe("L2");
      expect(
        node.querySelectorAll(
          "button, input, select, textarea, form, a, [onclick], [contenteditable]",
        ),
      ).toHaveLength(0);
    }
  });
});

describe("show evidence, negative cases", () => {
  it("draws a digest the bundle does not carry as not in this bundle, and fetches nothing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const context = await verify(bundle());
    const claim = {
      ...SE.claimsOf(context, disclosureOf)[0]!,
      evidence: [{ digest_alg: "SHA-256", digest: "f".repeat(64) }],
    };
    const node = draw(context, claim);
    const record = node.querySelector(
      '[data-evidence="' + "f".repeat(64) + '"]',
    )!;
    expect(record.getAttribute("data-state")).toBe("not_in_bundle");
    expect(record.textContent).toContain(SE.WORDS["side.not_in_bundle"]);
    expect(node.querySelector('[data-source="payload"]')).toBeNull();
    expect(node.querySelector('[data-source="producer"]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never calls a digest not in this bundle when a book record may carry it", async () => {
    const context = await verify(bundle());
    const claims = SE.claimsOf(context, disclosureOf);
    // A stand-in for a book bundle: the verifier's own disclosureOf, except
    // that one record's content reads as a disclosed book header.
    const book = claims[1]!.evidence[0].digest as string;
    const read: typeof disclosureOf = (c, id, member) =>
      id === book && member === "agent_input"
        ? { state: "disclosed", payload: { record_type: "published_capsule" } }
        : disclosureOf(c, id, member);
    const claim = {
      ...claims[0]!,
      evidence: [{ digest_alg: "SHA-256", digest: "e".repeat(64) }],
    };
    const node = SE.render(SE.resolve(context, claim, read), document);
    const record = node.querySelector(`[data-evidence="${"e".repeat(64)}"]`)!;
    expect(record.getAttribute("data-state")).toBe("carried_not_opened");
    expect(record.textContent).toContain(SE.WORDS["side.carried_not_opened"]);
    expect(record.textContent).not.toContain(SE.WORDS["side.not_in_bundle"]);
  });

  it("draws a cited record the bundle does not disclose as withheld, with no content", async () => {
    const b = bundle();
    const first = SE.claimsOf(await verify(b), disclosureOf)[0]!;
    const digest = first.evidence[0].digest as string;
    delete b.disclosures[digest];
    const context = await verify(b);
    const node = draw(context, first);
    const record = node.querySelector(`[data-evidence="${digest}"]`)!;
    expect(record.getAttribute("data-state")).toBe("withheld");
    expect(record.textContent).toContain(SE.WORDS["carrier.withheld"]);
    expect(node.querySelector('[data-source="payload"]')).toBeNull();
    expect(node.querySelector('[data-source="producer"]')).toBeNull();
  });

  it("draws a disclosure that does not match its digest as a mismatch, never its content", async () => {
    const b = bundle();
    const first = SE.claimsOf(await verify(b), disclosureOf)[0]!;
    const digest = first.evidence[0].digest as string;
    b.disclosures[digest].agent_input.rationale = "edited after sealing";
    const context = await verify(b);
    const node = draw(context, first);
    expect(
      node
        .querySelector(`[data-evidence="${digest}"]`)!
        .getAttribute("data-state"),
    ).toBe("disclosure_mismatch");
    expect(node.textContent).not.toContain("edited after sealing");
    expect(node.querySelector('[data-source="payload"]')).toBeNull();
  });

  for (const [kind, member] of [
    ["analysis", "summary"],
    ["story", "narrative"],
  ] as const) {
    it(`draws a ${kind} carrier's text as the producer's, and no record content`, async () => {
      const context = await verify(bundle());
      const first = SE.claimsOf(context, disclosureOf)[0]!;
      const text = `The ${kind} text <img src=x onerror=alert(1)>`;
      const claim = {
        ...first,
        presentation: { kind, status: "WITHHELD", [member]: text },
      };
      const node = draw(context, claim);
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
    const context = await verify(bundle());
    const first = SE.claimsOf(context, disclosureOf)[0]!;
    const claim = {
      ...first,
      presentation: { ...first.presentation, status: "NOT_COMMITTED" },
    };
    const node = draw(context, claim);
    expect(node.querySelector('[data-source="payload"]')).toBeNull();
    expect(node.querySelector('[data-source="producer"]')).toBeNull();
  });

  it("draws a claim that cites no evidence as such", async () => {
    const context = await verify(bundle());
    const claim = { ...SE.claimsOf(context, disclosureOf)[0]!, evidence: [] };
    expect(
      draw(context, claim).querySelector('[data-state="no_evidence"]')!
        .textContent,
    ).toBe(SE.WORDS["side.no_evidence"]);
  });

  it("layers a host's words over its own, and shows an unknown key as itself", async () => {
    const context = await verify(bundle());
    const claim = { ...SE.claimsOf(context, disclosureOf)[0]!, verdict: "met" };
    const node = SE.render(SE.resolve(context, claim, disclosureOf), document, {
      "side.criterion": "Criterio",
    });
    expect(node.querySelector('[data-side="criterion"] h5')!.textContent).toBe(
      "Criterio",
    );
    expect(node.querySelector('[data-side="verdict"] h5')!.textContent).toBe(
      SE.WORDS["side.verdict"],
    );
    const odd = SE.render(
      SE.resolve(context, { ...claim, verdict: "maybe" }, disclosureOf),
      document,
    );
    expect(odd.querySelector(".cv-side-verdict")!.textContent).toBe(
      "verdict.maybe",
    );
  });

  it("draws no claims when the root Result is not disclosed", async () => {
    const b = bundle();
    delete b.disclosures[b.root];
    expect(SE.claimsOf(await verify(b), disclosureOf)).toEqual([]);
  });
});
