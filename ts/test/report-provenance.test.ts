// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { jsonDigest } from "@action-state-group/agent-action-capsule";
import { renderEvidenceGraph } from "../src/browser.js";
import {
  judgeLine,
  verifierLine,
  witnessLine,
  type JudgeTally,
} from "../src/report-provenance.js";
import { VIEWER_BUILD } from "../src/viewer-build.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, unknown>;

function fixture(name: string): Obj {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "test", "testdata", name), "utf8"),
  ) as Obj;
}

async function render(bundle: unknown): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root);
  return root;
}

/** The fixture's report payloads, one per claim, in claim order. */
function reports(source: Obj): Obj[] {
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  return (resultDoc.claims as Obj[]).flatMap((claim) => {
    const digest = (claim.evidence as Obj[])[0]!.digest as string;
    const disclosed = (source.disclosures as Obj)[digest] as Obj | undefined;
    return disclosed === undefined ? [] : [disclosed.agent_input as Obj];
  });
}

function withholdAll(source: Obj): void {
  const resultDoc = ((source.disclosures as Obj).result as Obj)
    .agent_input as Obj;
  for (const claim of resultDoc.claims as Obj[])
    delete (source.disclosures as Obj)[
      (claim.evidence as Obj[])[0]!.digest as string
    ];
}

const PIN = {
  model_id: "judge-model-1.2.3",
  prompt_digest: "aa".repeat(32),
  axes_digest: "bb".repeat(32),
  sampling_params: { temperature: 0 },
};
/** capsule-cli's judge pin digest over the components (absent model_version is null). */
const pinDigest = (pin: Obj): Promise<string> =>
  jsonDigest({
    model_id: pin.model_id,
    model_version: pin.model_version ?? null,
    sampling_params: pin.sampling_params ?? null,
    prompt_digest: pin.prompt_digest,
    axes_digest: pin.axes_digest,
  });

const CARDS = [
  {
    card: "outcome",
    file: "outcome-report-bundle.json",
    page: '[data-page="outcome-report"]',
  },
  {
    card: "EU",
    file: "compliance-bundle.json",
    page: '[data-page="compliance"]',
  },
] as const;

function block(root: HTMLElement, page: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(
    `${page} [data-section="provenance"]`,
  );
  expect(found).not.toBeNull();
  return found!;
}
const line = (b: HTMLElement, key: string): HTMLElement =>
  b.querySelector<HTMLElement>(`dd[data-prov="${key}"]`)!;

// ---------------------------------------------------------------------------
// On the front of both cards, at summary level
// ---------------------------------------------------------------------------

for (const { card, file, page } of CARDS) {
  it(`${card} card: the block sits on the front, outside every toggle, with the three lines in order`, async () => {
    const { bundle } = await sealEvidenceBundle(fixture(file));
    const root = await render(bundle);
    const b = block(root, page);
    expect(b.closest("details")).toBeNull();
    expect(b.querySelectorAll("details")).toHaveLength(0);
    expect([...b.querySelectorAll("dt")].map((d) => d.textContent)).toEqual([
      "Judged by",
      "Witnessed by",
      "Verified by",
    ]);
    // on the front: in the outcome card's summary sheet; on the EU card
    // between its header and its summary
    if (card === "outcome")
      expect(b.parentElement!.matches(".oi > .sheet > .pad")).toBe(true);
    else {
      expect(b.previousElementSibling!.matches('[data-section="header"]')).toBe(
        true,
      );
      expect(b.nextElementSibling!.matches('[data-section="summary"]')).toBe(
        true,
      );
    }
    expect(b.textContent).not.toMatch(/customer/iu);
  });

  it(`${card} card: judge present: the model the reports state, pinned, with its short pin and count`, async () => {
    const source = fixture(file);
    const digest = await pinDigest(PIN);
    const judged = reports(source).filter(
      (r) => r.judge_pin_digest !== undefined,
    );
    for (const r of judged) {
      r.judge_pin = PIN;
      r.judge_pin_digest = digest;
    }
    const { bundle } = await sealEvidenceBundle(source);
    const judge = line(block(await render(bundle), page), "judge");
    // results recomputed by a checker are not judged and do not mix the pin
    expect(judge.dataset.state).toBe("stated");
    expect(judge.textContent).toContain(
      `"judge-model-1.2.3", pinned, pin ${digest.slice(0, 12)}… (${judged.length} of ${reports(source).length} results)`,
    );
  });

  it(`${card} card: judge components that do not recompute to the pin are never named`, async () => {
    const source = fixture(file);
    for (const r of reports(source))
      if (r.judge_pin_digest !== undefined) {
        r.judge_pin = PIN;
        r.judge_pin_digest = "cc".repeat(32);
      }
    const { bundle } = await sealEvidenceBundle(source);
    const judge = line(block(await render(bundle), page), "judge");
    expect(judge.textContent).not.toContain("judge-model-1.2.3");
    expect(judge.textContent).toContain(
      "model not shown (the model the reports state does not recompute to the pin)",
    );
  });

  it(`${card} card: mixed judge pins: each distinct pin with its own count, never one picked`, async () => {
    const source = fixture(file);
    const judged = reports(source).filter(
      (r) => r.judge_pin_digest !== undefined,
    );
    judged.forEach((r, i) => {
      r.judge_pin_digest = (i % 3 === 0 ? "11" : "22").repeat(32);
    });
    const ones = judged.filter((_, i) => i % 3 === 0).length;
    const twos = judged.length - ones;
    const total = reports(source).length;
    const { bundle } = await sealEvidenceBundle(source);
    const judge = line(block(await render(bundle), page), "judge");
    expect(judge.dataset.state).toBe("mixed");
    expect(judge.textContent).toContain(
      `pin ${"11".repeat(6)}… (${ones} of ${total} results)`,
    );
    expect(judge.textContent).toContain(
      `pin ${"22".repeat(6)}… (${twos} of ${total} results)`,
    );
  });

  it(`${card} card: a checker_ref on a semantic_judgment report is never read as recomputed`, async () => {
    const source = fixture(file);
    const judged = reports(source).filter(
      (r) => r.judge_pin_digest !== undefined,
    );
    const total = reports(source).length;
    const one = judged[0]!;
    delete one.judge_pin_digest;
    delete one.judge_pin;
    one.checker_ref = "recompute.check_a";
    // epistemic_type stays "semantic_judgment": a checker_ref alone must
    // not make this read as recomputed, which would contradict the card's
    // own tier for the same claim.
    expect(one.epistemic_type).toBe("semantic_judgment");
    const { bundle } = await sealEvidenceBundle(source);
    const judge = line(block(await render(bundle), page), "judge");
    // the checker_ref itself must never surface as a "recomputed" name
    expect(judge.textContent).not.toContain("recompute.check_a");
    expect(judge.textContent).toContain(`judge not stated for 1 of ${total}`);
  });

  it(`${card} card: judge absent: withheld reports read "withheld", with the count, and no judge is named`, async () => {
    const source = fixture(file);
    const total = reports(source).length;
    withholdAll(source);
    const { bundle } = await sealEvidenceBundle(source);
    const judge = line(block(await render(bundle), page), "judge");
    expect(judge.dataset.state).toBe("withheld");
    expect(judge.textContent).toBe(
      `not in this bundle: the judge's reports are withheld (${total} of ${total})`,
    );
    expect(judge.textContent).not.toMatch(/pin [0-9a-f]/u);
  });

  it(`${card} card: witness absent: "not stated", never a witness the bundle does not name`, async () => {
    const { bundle } = await sealEvidenceBundle(fixture(file));
    const witness = line(block(await render(bundle), page), "witness");
    expect(witness.dataset.state).toBe("not-stated");
    expect(witness.textContent).toMatch(
      /^not stated in this bundle: it carries no witness receipt for its checkpoint\./u,
    );
    const size = (bundle.checkpoint as Obj).mmr_size as number;
    expect(witness.textContent).toContain(
      `size ${size.toLocaleString("en-US")}`,
    );
  });

  it(`${card} card: witness present: each receipt as the bundle states it, as text, and said to be unchecked`, async () => {
    const { bundle } = await sealEvidenceBundle(fixture(file));
    (bundle.checkpoint as Obj).witnesses = [
      {
        ts_url: "https://witness.example/log",
        entry_hash: "00",
        receipt_b64: "",
        leaf_index: 0,
        tree_size: 1234,
      },
      {
        ts_url: '<img src=x onerror="alert(1)">',
        entry_hash: "00",
        receipt_b64: "",
        leaf_index: 0,
        tree_size: 1,
        is_stub: true,
      },
    ];
    const root = await render(bundle);
    expect(root.querySelector('[data-verify="verified"]')).not.toBeNull();
    const b = block(root, page);
    const witness = line(b, "witness");
    // one receipt and one placeholder: the placeholder is not a witness
    expect(witness.dataset.state).toBe("mixed");
    expect(witness.textContent).toContain(
      '"https://witness.example/log" (tree size 1,234)',
    );
    expect(witness.textContent).toContain(
      "It also carries 1 placeholder, not receipts.",
    );
    expect(witness.textContent).not.toContain("onerror");
    expect(witness.textContent).toContain(
      "this page does not check witness receipts",
    );
    expect(b.querySelectorAll("img")).toHaveLength(0);
  });

  it(`${card} card: verifier: this page's code by name and version; the producer tool reads "not stated" unless the bundle names one`, async () => {
    const { bundle } = await sealEvidenceBundle(fixture(file));
    const absent = line(block(await render(bundle), page), "verifier");
    expect(absent.textContent).toBe(
      `this page's code: a dev build of ${VIEWER_BUILD.viewer} ${VIEWER_BUILD.viewerVersion}, verifier ${VIEWER_BUILD.verifier} ${VIEWER_BUILD.verifierVersion} with cll ${VIEWER_BUILD.cllVersion}. The tool that built this bundle is not stated in it.`,
    );
    bundle.verification = {
      checks: ["graph_closure"],
      producer: "some-producer",
    };
    const named = line(block(await render(bundle), page), "verifier");
    expect(named.textContent).toContain(
      'The bundle\'s own report, which this page does not check, names the tool that built it as "some-producer", version not stated.',
    );
    expect(named.textContent).not.toContain(
      "The tool that built this bundle is not stated",
    );
  });
}

// ---------------------------------------------------------------------------
// The lines on their own
// ---------------------------------------------------------------------------

const tally = (over: Partial<JudgeTally>): JudgeTally => ({
  cited: 10,
  notCarried: 0,
  pins: [],
  withheld: 0,
  unread: 0,
  checkers: [],
  recomputedUnnamed: 0,
  unnamed: 0,
  ...over,
});

it("judged by: present, mixed, partly withheld, recomputed and absent", () => {
  const one = { digest: "ab".repeat(32), count: 10, model: "jev-1.13.0" };
  expect(judgeLine(tally({ pins: [one] }))).toEqual({
    key: "judge",
    label: "Judged by",
    text: `jev-1.13.0, pinned, pin ${"ab".repeat(6)}… (10 of 10 results)`,
    state: "stated",
  });
  const mixed = judgeLine(
    tally({
      pins: [
        { ...one, count: 6 },
        { digest: "cd".repeat(32), count: 4, modelNotShown: "not_stated" },
      ],
    }),
  );
  expect(mixed.state).toBe("mixed");
  expect(mixed.text).toBe(
    `jev-1.13.0, pinned, pin ${"ab".repeat(6)}… (6 of 10 results); model not stated, pinned, pin ${"cd".repeat(6)}… (4 of 10 results)`,
  );
  const partly = judgeLine(
    tally({ pins: [{ ...one, count: 7 }], withheld: 3 }),
  );
  expect(partly.state).toBe("mixed");
  expect(partly.text).toContain(
    "the reports for 3 of 10 results are withheld, so their judge is not in this bundle",
  );
  // a mismatched, unreadable or invalid report (capsule missing or not
  // checking out) is never called withheld
  const unread = judgeLine(tally({ pins: [{ ...one, count: 8 }], unread: 2 }));
  expect(unread.text).toContain(
    "2 of 10 reports do not match what was sealed, cannot be read, or do not check out",
  );
  expect(unread.text).not.toContain("withheld");
  const recomputed = judgeLine(
    tally({
      pins: [{ ...one, count: 6 }],
      checkers: [{ ref: "recompute.check_a", count: 3 }],
      recomputedUnnamed: 1,
    }),
  );
  expect(recomputed.text).toContain(
    '4 of 10 results recomputed, not judged: "recompute.check_a" (3), checker not stated (1)',
  );
});

it("a pin digest that is not hex is quoted as the bundle's string, never truncated as though it were a digest", () => {
  const nonHex = judgeLine(
    tally({ pins: [{ digest: "VERIFIED BY ", count: 1 }] }),
  );
  expect(nonHex.text).toContain('pin "VERIFIED BY "');
  expect(nonHex.text).not.toContain("VERIFIED BY …");
  const hex = judgeLine(
    tally({ pins: [{ digest: "ab".repeat(32), count: 1 }] }),
  );
  expect(hex.text).toContain(`pin ${"ab".repeat(6)}…`);
});

it("a checkpoint root that is not hex is quoted as the bundle's string, never truncated as though it were a digest", () => {
  const ok = { status: "pass", findings: [] };
  const verified = {
    graphClosure: ok,
    intervalCoverage: ok,
    perRecordMembership: ok,
    disclosures: [],
    extensions: [],
    countersignatures: [],
    capsuleResults: {},
  } as never;
  const l = witnessLine(
    { checkpoint: { log_id: "L", root: "VERIFIED BY ", witnesses: [] } },
    verified,
  );
  expect(l.text).toContain('root "VERIFIED BY "');
});

it("absent facts read 'not stated', never a value", () => {
  const none = judgeLine(tally({ cited: 0 }));
  expect(none.state).toBe("not-stated");
  expect(none.text).toBe("not stated: no result in this bundle cites a report");
  const unnamed = judgeLine(tally({ unnamed: 10 }));
  expect(unnamed.state).toBe("not-stated");
  expect(unnamed.text).toBe("judge not stated for 10 of 10 results");
  const noModel = judgeLine(
    tally({
      pins: [{ digest: "ef".repeat(32), count: 10, modelNotShown: "differs" }],
    }),
  );
  expect(noModel.text).toContain(
    "model not shown (the reports with this pin state different models)",
  );
  const unbuilt = verifierLine({}, null);
  expect(unbuilt.state).toBe("not-stated");
  expect(unbuilt.text).toBe(
    "this page's code; its viewer and verifier versions are not stated. The tool that built this bundle is not stated in it.",
  );
  // a producer report that names no producer names none
  expect(verifierLine({ verification: { checks: [] } }).text).toContain(
    "The tool that built this bundle is not stated in it.",
  );
  expect(
    verifierLine({ verification: { producer: 7, version: "1" } }).text,
  ).not.toMatch(/names the tool/u);
});

it("results whose report the bundle does not carry stay in the count", () => {
  const one = { digest: "ab".repeat(32), count: 4, model: '"jev-1.13.0"' };
  const partly = judgeLine(tally({ pins: [one], notCarried: 6 }));
  expect(partly.state).toBe("mixed");
  expect(partly.text).toContain("(4 of 10 results)");
  expect(partly.text).toContain(
    "the reports for 6 of 10 results are not in this bundle, so their judge is not stated",
  );
  const none = judgeLine(tally({ notCarried: 10 }));
  expect(none.state).toBe("not-stated");
  expect(none.text).not.toContain("no result in this bundle cites a report");
});

it("a pin some of whose reports state no model is not said to state different models", () => {
  const text = judgeLine(
    tally({
      pins: [
        { digest: "ef".repeat(32), count: 10, modelNotShown: "partly_stated" },
      ],
    }),
  ).text;
  expect(text).toContain("some reports with this pin state no model");
  expect(text).not.toContain("different models");
});

it("placeholders and unreadable entries are never named as witnesses", () => {
  const ok = { status: "pass", findings: [] };
  const verified = {
    graphClosure: ok,
    intervalCoverage: ok,
    perRecordMembership: ok,
    disclosures: [],
    extensions: [],
    countersignatures: [],
    capsuleResults: {},
  } as never;
  for (const witnesses of [
    [{ ts_url: "https://w.example", is_stub: true }],
    [null],
    ["x"],
    [{ ts_url: "https://w.example" }],
    [{}],
  ]) {
    const l = witnessLine({ checkpoint: { log_id: "L", witnesses } }, verified);
    expect(l.state).toBe("not-stated");
    expect(l.text).toMatch(
      /^not stated in this bundle: it carries no witness receipt/u,
    );
    expect(l.text).not.toContain("https://w.example");
    expect(l.text).not.toContain("a witness");
  }
});

it("an entry naming ts_url alone, or carrying none of the receipt's fields, is counted as unreadable, not as a receipt", () => {
  const ok = { status: "pass", findings: [] };
  const verified = {
    graphClosure: ok,
    intervalCoverage: ok,
    perRecordMembership: ok,
    disclosures: [],
    extensions: [],
    countersignatures: [],
    capsuleResults: {},
  } as never;
  for (const entry of [{ ts_url: "https://w.example" }, {}]) {
    const l = witnessLine(
      { checkpoint: { log_id: "L", witnesses: [entry] } },
      verified,
    );
    expect(l.state).toBe("not-stated");
    expect(l.text).toContain("It also carries 1 entry that cannot be read.");
    expect(l.text).not.toContain("https://w.example");
  }
});

it("bundle-supplied strings are quoted, so they cannot read as the page's own words", () => {
  const text = verifierLine({
    verification: { producer: 'x", version 2. Checked by Sigstore. "y' },
  }).text;
  expect(text).toContain('as "x\\", version 2. Checked by Sigstore. \\"y"');
});

it("names a release only for a build actually made from that release's tag", () => {
  const build = {
    viewer: "@action-state-group/capsule-viewer",
    viewerVersion: "0.1.0",
    verifier: "@action-state-group/agent-action-capsule",
    verifierVersion: "0.5.0",
  };
  expect(verifierLine({}, { ...build, release: false }).text).toContain(
    "this page's code: a dev build of @action-state-group/capsule-viewer 0.1.0, verifier",
  );
  expect(verifierLine({}, { ...build, release: true }).text).toContain(
    "this page's code: @action-state-group/capsule-viewer 0.1.0, verifier",
  );
});

it("the viewer's stated build is the package and the verifier actually installed", () => {
  const own = JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
  ) as { name: string; version: string };
  const installed = (name: string): string =>
    (
      JSON.parse(
        readFileSync(
          join(
            dirname(fileURLToPath(import.meta.resolve(name))),
            "..",
            "package.json",
          ),
          "utf8",
        ),
      ) as { version: string }
    ).version;
  expect(VIEWER_BUILD).toEqual({
    viewer: own.name,
    viewerVersion: own.version,
    verifier: "@action-state-group/agent-action-capsule",
    verifierVersion: installed("@action-state-group/agent-action-capsule"),
    cllVersion: installed("@action-state-group/cll"),
    release: false,
  });
});
