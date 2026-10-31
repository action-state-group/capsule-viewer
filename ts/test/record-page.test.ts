// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

// The lowest level (Steven's Outcomes frame 8): one record's envelope, its
// capsule JSON and the ladder of proofs, drawn from a real signed bundle.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";
import { renderEvidenceGraph } from "../src/browser.js";
import { contractReportWords } from "../src/contract-report-wording.js";
import { nestingProblems } from "../src/report-levels.js";
import { fieldRows, readEnvelope, shortHex } from "../src/record-page.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

type Obj = Record<string, any>;

const strict = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "test/testdata/aac-vectors/bundle/strict/vectors.json",
    ),
    "utf8",
  ),
) as Obj;

function signedBundle(): Obj {
  return structuredClone(
    strict.cases.find((c: Obj) => c.id === "pos-signed-whole-log").bundle,
  );
}

async function render(
  bundle: unknown,
  voice?: "own" | "shared",
): Promise<HTMLElement> {
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root, undefined, {
    depth: "L2",
    ...(voice === undefined ? {} : { voice }),
  });
  for (const d of root.querySelectorAll<HTMLDetailsElement>(
    "details.cv-record",
  )) {
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
  }
  return root;
}

const pageOf = (root: ParentNode, id: string): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-record-page="${id}"]`)!;

const statuses = (page: HTMLElement): Record<string, string> =>
  Object.fromEntries(
    [...page.querySelectorAll<HTMLElement>("tr[data-rung]")].map((tr) => [
      tr.dataset.rung!,
      tr.dataset.rungStatus!,
    ]),
  );

const FIRST =
  "355efa38db834dbabdd2edf285ca7d796cfe36ddee397bfdc79d58c8fba25533";

it("draws one page per record, at the record's entry, with the canvas's four parts", async () => {
  const root = await render(signedBundle());
  const pages = root.querySelectorAll<HTMLElement>("[data-record-page]");
  expect(pages).toHaveLength(3);
  const page = pageOf(root, FIRST);
  expect(page.dataset.level).toBe("3");
  expect(page.closest("details.cv-record")).not.toBeNull();
  expect(
    [...page.querySelectorAll<HTMLElement>("[data-l3]")].map(
      (n) => n.dataset.l3,
    ),
  ).toEqual([
    "envelope",
    "protected",
    "unprotected",
    "payload",
    "signature",
    "capsule",
    "ladder",
    "foot",
  ]);
  // the ladder is the canvas's eleven rungs, in its order
  expect(Object.keys(statuses(page))).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
  ]);
  // the core's own records list nests three deep; the page itself holds no
  // toggle and sits in no card toggle
  expect(nestingProblems(page.parentElement!)).toEqual([]);
  expect(page.querySelector("details")).toBeNull();
});

it("reads the envelope's own bytes: algorithm, content type, key, payload and signature", async () => {
  const bundle = signedBundle();
  const record = bundle.records[0];
  const view = readEnvelope(record.signature)!;
  expect(view).toMatchObject({
    alg: -8,
    contentType: "application/agent-action-capsule-id",
    kid: record.key_id,
    unprotectedEntries: 0,
    payloadHex: record.capsule_id,
    signatureBytes: 64,
  });
  const page = pageOf(await render(bundle), FIRST);
  const protectedBox = page.querySelector<HTMLElement>(
    '[data-l3="protected"]',
  )!;
  expect(protectedBox.textContent).toContain("-8 · EdDSA, Ed25519");
  expect(protectedBox.textContent).toContain(
    "application/agent-action-capsule-id",
  );
  expect(protectedBox.textContent).toContain(shortHex(record.key_id));
  expect(page.querySelector('[data-l3="payload"]')!.textContent).toContain(
    "the raw 32 bytes of capsule_id",
  );
  expect(page.querySelector('[data-l3="signature"]')!.textContent).toContain(
    "64 bytes",
  );
  // nothing that is not a COSE_Sign1 is drawn as one
  // only a tag-18 COSE_Sign1, with nothing after it
  expect(readEnvelope(record.signature.slice(2))).toBeUndefined();
  expect(readEnvelope(`${record.signature}00`)).toBeUndefined();
  // the verifier accepts uppercase hex, so the page reads it too
  expect(readEnvelope(record.signature.toUpperCase())).toEqual(view);
  expect(readEnvelope("zz")).toBeUndefined();
  expect(readEnvelope("00")).toBeUndefined();
  expect(readEnvelope(record.signature.slice(0, 40))).toBeUndefined();
});

it("draws the capsule JSON's members, in clear or by digest, and never the envelope's", async () => {
  const bundle = signedBundle();
  const rows = fieldRows({
    ...bundle.records[0],
    agent_input_digest: "a".repeat(64),
    extra_member: { b: 1, a: "x" },
  });
  const labels = rows.map((r) => r.label);
  expect(labels).toContain("spec_version");
  expect(labels).toContain("format_version · canonicalization_id");
  expect(labels).not.toContain("signature");
  expect(labels).not.toContain("key_id");
  // a member the canvas has no row for is still drawn, never dropped
  const extra = rows.find((r) => r.label === "extra_member")!;
  expect(extra.value).toBe("a x · b 1");
  const digest = rows.find((r) => r.label === "agent_input_digest")!;
  expect(digest.tags).toEqual(["digest-only"]);
  expect(digest.value).toBe("aaaa…aaaa");
  const id = rows.find((r) => r.label === "capsule_id")!;
  expect(id.note).toBe("recomputed");
  const page = pageOf(await render(bundle), FIRST);
  expect(page.querySelector('[data-l3="capsule"]')!.textContent).toContain(
    "recomputed, never trusted as carried",
  );
});

it("states each rung's status from what the bundle holds, and says what it did not run", async () => {
  const page = pageOf(await render(signedBundle()), FIRST);
  expect(statuses(page)).toEqual({
    "1": "PASS",
    "2": "NOT_PRESENT", // this record commits to no input or output
    "3": "PASS",
    "4": "NOT_PRESENT", // no chain member
    "5": "PASS",
    "6": "NOT_CHECKED", // no retained head travels in a bundle
    "7": "NOT_PRESENT", // no witness receipt in this bundle
    "8": "NOT_CHECKED", // the page reads no controller binding yet
    "9": "NOT_PRESENT",
    "10": "NOT_PRESENT", // no Result in this bundle
    "11": "NOT_PRESENT",
  });
  const row = (n: number) => page.querySelector(`tr[data-rung="${n}"]`)!;
  expect(row(5).textContent).toContain("leaf 0 · seq 1");
  expect(row(6).textContent).toContain("carries no earlier head");
  expect(row(8).textContent).toContain("reads no controller binding record");
});

it("a signature that does not verify FAILs rung 3 and never reads as unsigned", async () => {
  const bundle = signedBundle();
  const sig: string = bundle.records[0].signature;
  // flip the last byte of the 64-byte signature
  const last = sig.slice(-2) === "00" ? "01" : "00";
  bundle.records[0].signature = sig.slice(0, -2) + last;
  const root = await render(bundle);
  const page = pageOf(root, FIRST);
  // the page still draws what the verifier accepted of this record
  expect(page).not.toBeNull();
  expect(statuses(page)["3"]).toBe("FAIL");
});

it("a record with no envelope says it is unsigned, not that its signature is bad", async () => {
  const bundle = signedBundle();
  delete bundle.records[0].signature;
  delete bundle.records[0].key_id;
  const page = pageOf(await render(bundle), FIRST);
  expect(page.querySelector('[data-l3="no-envelope"]')!.textContent).toContain(
    "not signed",
  );
  expect(statuses(page)["3"]).toBe("NOT_PRESENT");
});

it("speaks to the holder in their own preview and about the holder once shared", async () => {
  const own = pageOf(await render(signedBundle(), "own"), FIRST);
  const shared = pageOf(await render(signedBundle(), "shared"), FIRST);
  const proves = (page: HTMLElement, n: number) =>
    page.querySelector(`tr[data-rung="${n}"]`)!.children[2]!.textContent!;
  expect(own.dataset.voice).toBe("own");
  expect(shared.dataset.voice).toBe("shared");
  expect(own.querySelector(".l3-banner")!.textContent).toContain(
    "as you hold them",
  );
  expect(shared.querySelector(".l3-banner")!.textContent).toContain(
    "as the holder shared them",
  );
  expect(proves(own, 1)).toContain("you hold");
  expect(proves(shared, 1)).not.toContain("you");
  expect(proves(own, 6)).toContain("you kept");
  expect(proves(shared, 6)).toContain("the reader kept");
  expect(proves(own, 8)).toContain("your trust root");
  expect(proves(shared, 8)).toContain("the reader's trust root");
  // the shared copy is the default
  const dflt = pageOf(await render(signedBundle()), FIRST);
  expect(dflt.dataset.voice).toBe("shared");
});

it("the rung words come from the wording pack, and every rung has them in both voices", async () => {
  for (const grouping of ["lines", "groups"] as const) {
    const w = await contractReportWords(grouping);
    for (let n = 1; n <= 11; n++) {
      for (const key of ["title", "proves.own", "proves.shared", "check"])
        expect(
          w.t(`record.rung.${n}.${key}`),
          `${grouping} ${n} ${key}`,
        ).not.toBe("");
    }
  }
});

it("a Result bundle's records name the claims that cite them (rung 10)", async () => {
  const input = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "test/testdata/outcome-report-bundle.json"),
      "utf8",
    ),
  ) as Obj;
  const { bundle } = await sealEvidenceBundle(input);
  const root = await render(bundle);
  const pages = [...root.querySelectorAll<HTMLElement>("[data-record-page]")];
  expect(pages.length).toBeGreaterThan(0);
  const resultPage = pages.find((p) => statuses(p)["10"] === "PASS")!;
  expect(resultPage).toBeDefined();
  for (const page of pages)
    expect(nestingProblems(page.parentElement!)).toEqual([]);
  // an unsigned record is not drawn as signed
  expect(statuses(resultPage)["3"]).toBe("NOT_PRESENT");
});

it("the nesting check refuses a record page inside a toggle, or holding one", () => {
  const host = document.createElement("div");
  host.innerHTML = `<details data-level="2"><summary>proofs</summary><div data-level="3" data-record-page="r1"></div></details>
    <div data-level="3" data-record-page="r2"><details><summary>x</summary></details></div>`;
  expect(nestingProblems(host)).toEqual([
    'record page "r1" sits inside a level-1 or level-2 toggle',
    'record page "r2" holds a toggle',
  ]);
});

// The golden: the page for one record in each voice, as the canvas draws it.
// Regenerate with UPDATE_GOLDENS=1 npx vitest run test/record-page.test.ts
for (const voice of ["own", "shared"] as const)
  it(`golden: the record page, ${voice} voice`, async () => {
    const page = pageOf(await render(signedBundle(), voice), FIRST);
    const html = page.outerHTML.replace(/></gu, ">\n<") + "\n";
    const golden = resolve(
      process.cwd(),
      `test/goldens/record-page/signed-whole-log.${voice}.html`,
    );
    if (process.env.UPDATE_GOLDENS === "1") {
      mkdirSync(dirname(golden), { recursive: true });
      writeFileSync(golden, html);
    }
    expect(html).toBe(readFileSync(golden, "utf8"));
  });

it("rung 5 does not read PASS under a checkpoint nobody authenticated", async () => {
  const bundle = structuredClone(
    strict.cases.find((c: Obj) => c.id === "incomplete-no-signed-checkpoint")
      .bundle,
  );
  const root = await render(bundle);
  const pages = [...root.querySelectorAll<HTMLElement>("[data-record-page]")];
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    expect(statuses(page)["5"]).not.toBe("PASS");
    expect(page.querySelector('tr[data-rung="5"]')!.textContent).toContain(
      "checkpoint is not authenticated",
    );
  }
});

it("words no line says more than the page checked", async () => {
  const w = await contractReportWords("lines");
  expect(w.t("record.foot.sdk")).not.toContain("kit.");
  expect(w.t("record.foot.order")).not.toContain("banner");
  expect(w.t("record.foot.status")).not.toContain("banner");
  expect(w.t("record.env.kid.value", { kid: "x", bytes: 32 })).not.toContain(
    "agent's key",
  );
  for (const n of [6, 8])
    expect(w.t(`record.rung.${n}.check`)).toContain("not yet available");
});
