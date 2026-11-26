// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// capsulectl's own verify report carried into a page for an x-deal-v0 copy
// (capsule-viewer#383, CV3b): the field contract and its fixtures
// (tests/testdata/deal-v0-report/README.md). The report is read only for its
// own bundle; on a pass it brings two lines only capsulectl can check, in
// its voice: the holder's own book's witness time (u219), on the holder's
// own keep page only, and the countersign rung it resolved (line 9), one
// line per countersignature. A report for another bundle, a malformed one or
// none leaves both out; a report that states a failure refuses the copy and
// says which.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildVerifiedBundleContext,
  jcs,
  sha256Hex,
} from "@action-state-group/agent-action-capsule";
import {
  createPresentationRegistry,
  renderEvidenceGraph,
} from "../src/evidence-graph-view.js";
import { checkReceipt, receiptModules, renderReceipt } from "../src/receipt.js";
import { verifierReportReading } from "../src/verifier-report.js";

type Obj = Record<string, unknown>;
const testdata = (dir: string, name: string): Obj =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "..", "tests", "testdata", dir, name),
      "utf8",
    ),
  ) as Obj;
const copy = (name: string): Obj =>
  name === "countersigned-keep"
    ? testdata("deal-v0-report", `${name}.bundle.json`)
    : testdata("receipt", `${name}.bundle.json`);
const report = (name: string): Obj =>
  testdata("deal-v0-report", `${name}.verify.json`);
const dealEntry = (r: Obj): Obj =>
  (r["extensions"] as Obj[]).find((e) => e["kind"] === "x-deal-v0")!;
const countersign = (r: Obj): Obj => dealEntry(r)["countersign"] as Obj;
const csEntries = (r: Obj): Obj[] => countersign(r)["entries"] as Obj[];

const local = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));

const BOOK_LINE = `Time-stamped by witness.example at ${local("2026-10-27T22:10:00Z")} (22:10:00 UTC), as capsulectl verify reported on your own book. This file carries no witness receipt, so this page did not check it itself.`;
// The header's witness notice on these copies, which the u219 line replaces (#424).
const HEADER_WITNESS =
  "No witness this verifier trusts has vouched for this log";
const PAGE_CHECKED =
  "This report's text is carried in the file outside the log. This page checked it itself";

async function drawn(
  bundle: Obj,
  verifierReport?: unknown,
  options: { carrier?: "page" | "report" } = {},
): Promise<HTMLElement> {
  const host = document.createElement("div");
  await renderReceipt(bundle, host, {
    ...(verifierReport === undefined ? {} : { verifierReport }),
    ...options,
    depth: "L2",
  });
  return host;
}
const rungs = (host: HTMLElement, rung: string): string[] =>
  [...host.querySelectorAll(`[data-rung="${rung}"]`)].map(
    (n) => n.textContent ?? "",
  );

describe("the u219 line on an x-deal-v0 copy, from capsulectl's report", () => {
  it("draws capsulectl's witness time on the holder's own keep copy, in its voice", async () => {
    for (const [name, kind] of [
      ["main-standalone-keep", "unilateral"],
      ["seller-keep", "seller"],
      // A Mesh copy seals its report in the log; capsulectl reads it INCOMPLETE as a producer selection.
      ["mesh-payer-selected", "unilateral"],
    ] as const) {
      expect(
        await checkReceipt(copy(name), { verifierReport: report(name) }),
        name,
      ).toMatchObject({
        kind: "checked",
        module: `capsuleviewer.receipt.${kind}/v0`,
      });
      const host = await drawn(copy(name), report(name));
      expect(rungs(host, "witness"), name).toEqual([BOOK_LINE]);
    }
  });

  it("keeps the page's own check of a standalone report as the page's", async () => {
    const host = await drawn(
      copy("main-standalone-keep"),
      report("main-standalone-keep"),
    );
    expect(host.textContent).toContain(PAGE_CHECKED);
    expect(host.textContent).not.toContain(
      "capsulectl verify reported its signature check as",
    );
  });

  it("never on a counterparty's copy, or a page or report shown to others", async () => {
    const shared = await drawn(
      copy("main-standalone-counterparty"),
      report("main-standalone-counterparty"),
    );
    expect(shared.textContent).not.toContain("Time-stamped by");
    for (const carrier of ["page", "report"] as const) {
      const host = await drawn(
        copy("main-standalone-keep"),
        report("main-standalone-keep"),
        { carrier },
      );
      expect(host.textContent, carrier).not.toContain("Time-stamped by");
    }
  });

  it("no report, another bundle's, or a malformed witnessed member: the line as before", async () => {
    const before = rungs(await drawn(copy("main-standalone-keep")), "witness");
    expect(before).not.toEqual([BOOK_LINE]);
    const edits: ((r: Obj) => void)[] = [
      (r) => (r["bundle_digest"] = "0".repeat(64)),
      (r) => (r["spec_version"] = "other/v1"),
      (r) => (r["record_identity"] = {}),
      (r) => (dealEntry(r)["witnessed"] = "verified"),
      (r) => (dealEntry(r)["witnessed"] = { status: "verified" }),
      (r) =>
        (dealEntry(r)["witnessed"] = {
          status: "verified",
          witness: "W",
          at: "yesterday",
        }),
      (r) =>
        (r["extensions"] = [
          ...(r["extensions"] as Obj[]),
          { ...dealEntry(r) },
        ]),
    ];
    for (const [i, edit] of edits.entries()) {
      const r = report("main-standalone-keep");
      edit(r);
      expect(
        rungs(await drawn(copy("main-standalone-keep"), r), "witness"),
        String(i),
      ).toEqual(before);
    }
    expect(
      rungs(await drawn(copy("main-standalone-keep"), "not json"), "witness"),
    ).toEqual(before);
  });

  it("a v1 report is never read for an x-deal-v0 copy", async () => {
    const r = report("main-standalone-keep");
    for (const e of r["extensions"] as Obj[])
      if (e["kind"] === "x-deal-v0") e["kind"] = "x-deal-v1";
    const ctx = await buildVerifiedBundleContext(copy("main-standalone-keep"));
    expect(await verifierReportReading(ctx, r)).toBeNull();
  });
});

describe("line 9 on an x-deal-v0 copy: the countersign rung capsulectl resolved", () => {
  const bundle = (): Obj => copy("countersigned-keep");
  const r = (): Obj => report("countersigned-keep");
  const OWN_LINE_STATE = null;
  const states = (host: HTMLElement): (string | null)[] =>
    [...host.querySelectorAll('[data-rung="countersign"]')].map((n) =>
      n.getAttribute("data-countersign"),
    );

  it("one line per countersignature, attributed to capsulectl and its directory", async () => {
    const host = await drawn(bundle(), r());
    expect(states(host)).toEqual([
      "resolved",
      "not_independent",
      "unresolved_signer",
    ]);
    const [resolved, self, unknown] = rungs(host, "countersign");
    expect(resolved).toBe(
      "Countersigned by Example Countersigners Ltd, a signer listed in the directory capsulectl verify was given (countersigners.json): it signed this bundle's digest, which covers its records but not the countersignatures beside them, with its own results (chain consistency: established). It vouches only as far as you trust that directory. capsulectl verify reported this; this page did not check it itself. It carries no log signature.",
    );
    expect(self).toBe(
      "NOT INDEPENDENT: capsulectl verify reported a countersignature by the producer's own key. A self-countersignature is not a check by anyone else.",
    );
    expect(unknown).toMatch(
      /^capsulectl verify reported a countersignature by a key the directory it was given \(countersigners\.json\) does not list \([0-9a-f]{16}…\): its signer is unknown\./u,
    );
    expect(
      host
        .querySelector('[data-countersign="not_independent"]')
        ?.classList.contains("cv-tone--caution"),
    ).toBe(true);
    // The u219 line comes with it.
    expect(rungs(host, "witness")).toEqual([BOOK_LINE]);
  });

  it("says each log-signature result, and none for a self or unchecked countersignature", async () => {
    const x = r();
    csEntries(x)[0]!["receipt"] = "verified";
    csEntries(x)[1]!["receipt"] = "verified";
    csEntries(x)[2]!["receipt"] = "unverified";
    let lines = rungs(await drawn(bundle(), x), "countersign");
    expect(lines[0]).toMatch(
      / Its log signature verifies, as capsulectl verify reported\.$/u,
    );
    expect(lines[1]).not.toContain("log signature");
    expect(lines[2]).toMatch(
      / Its log signature does not verify, as capsulectl verify reported\.$/u,
    );
    // No receipt member: no suffix.
    const none = r();
    for (const e of csEntries(none)) delete e["receipt"];
    lines = rungs(await drawn(bundle(), none), "countersign");
    for (const line of lines) expect(line).not.toContain("log signature");
    // A type capsulectl does not check: shown, attributed, never counted, no suffix.
    const unchecked = r();
    csEntries(unchecked)[2]!["state"] = "unverified";
    csEntries(unchecked)[2]!["receipt"] = "verified";
    const host = await drawn(bundle(), unchecked);
    expect(
      host.querySelector('[data-countersign="unverified"]')?.textContent,
    ).toBe(
      "capsulectl verify reported a countersignature of a type it does not check: it is not counted.",
    );
    expect(
      (await checkReceipt(bundle(), { verifierReport: unchecked })).kind,
    ).toBe("checked");
  });

  it("is drawn on any copy capsulectl reported on, a page shown to others included", async () => {
    const host = await drawn(bundle(), r(), { carrier: "page" });
    expect(states(host)).toEqual([
      "resolved",
      "not_independent",
      "unresolved_signer",
    ]);
  });

  it("an unbound member is ignored: the page keeps its own countersign line", async () => {
    const own = states(await drawn(bundle()));
    expect(own).toEqual([OWN_LINE_STATE]);
    const tampered = (edit: (b: Obj) => void): Obj => {
      const b = bundle();
      edit(b);
      return b;
    };
    const cs = (b: Obj): Obj[] => b["countersignatures"] as Obj[];
    const unbound: [string, Obj, Obj][] = [
      [
        "a replaced signature",
        tampered((b) => (cs(b)[0]!["signature"] = "0".repeat(128))),
        r(),
      ],
      [
        "a replaced statement",
        tampered(
          (b) =>
            ((cs(b)[0]!["statement"] as Obj)["recomputed_at"] =
              "2026-11-21T00:00:00Z"),
        ),
        r(),
      ],
      [
        "an added receipt",
        tampered((b) => (cs(b)[2]!["receipt"] = { tree_size: 1 })),
        r(),
      ],
      ["a removed countersignature", tampered((b) => cs(b).pop()), r()],
      [
        "an added countersignature",
        tampered((b) => cs(b).push({ ...cs(b)[0]! })),
        r(),
      ],
      [
        "the wrong digest",
        bundle(),
        (() => {
          const x = r();
          countersign(x)["countersignatures_sha256"] = "0".repeat(64);
          return x;
        })(),
      ],
      [
        "entries out of order",
        bundle(),
        (() => {
          const x = r();
          csEntries(x).reverse();
          return x;
        })(),
      ],
      [
        "no digest",
        bundle(),
        (() => {
          const x = r();
          delete countersign(x)["countersignatures_sha256"];
          return x;
        })(),
      ],
    ];
    for (const [why, b, x] of unbound)
      expect(states(await drawn(b, x)), why).toEqual(own);
  });

  it("the countersignatures' digest is the SHA-256 of their JCS", async () => {
    expect(countersign(r())["countersignatures_sha256"]).toBe(
      await sha256Hex(jcs(bundle()["countersignatures"])),
    );
  });

  it("a malformed display member drops the whole member", async () => {
    const own = states(await drawn(bundle()));
    const edits: [string, (x: Obj) => void][] = [
      ["no directory", (x) => delete countersign(x)["directory"]],
      ["an unknown state", (x) => (csEntries(x)[1]!["state"] = "other")],
      [
        "a resolved signer with no name",
        (x) => delete csEntries(x)[0]!["signer_name"],
      ],
      ["a malformed receipt", (x) => (csEntries(x)[0]!["receipt"] = "broken")],
      [
        "checks not a list",
        (x) => (csEntries(x)[0]!["checks"] = "established"),
      ],
      [
        "a malformed check beside a good one",
        (x) =>
          (csEntries(x)[0]!["checks"] = [
            { name: "chain consistency", result: "established" },
            { name: 1 },
          ]),
      ],
    ];
    for (const [why, edit] of edits) {
      const x = r();
      edit(x);
      expect(states(await drawn(bundle(), x)), why).toEqual(own);
    }
  });

  it("a bound invalid countersignature refuses the copy, before any display member is read", async () => {
    const invalid = r();
    csEntries(invalid)[2]!["state"] = "invalid";
    expect(
      (await checkReceipt(bundle(), { verifierReport: invalid })).kind,
    ).toBe("did_not_verify");
    const alsoMalformed = r();
    csEntries(alsoMalformed)[2]!["state"] = "invalid";
    csEntries(alsoMalformed)[0]!["receipt"] = "broken";
    expect(
      (await checkReceipt(bundle(), { verifierReport: alsoMalformed })).kind,
    ).toBe("did_not_verify");
    // A stale one, for countersignatures this copy no longer carries, is not read.
    const stale = bundle();
    (stale["countersignatures"] as Obj[]).pop();
    expect((await checkReceipt(stale, { verifierReport: invalid })).kind).toBe(
      "checked",
    );
  });
});

describe("capsulectl's failures on an x-deal-v0 page say which", () => {
  async function page(bundle: Obj, verifierReport: Obj): Promise<HTMLElement> {
    const registry = createPresentationRegistry();
    for (const module of receiptModules()) registry.register(module);
    const root = document.createElement("main");
    document.body.append(root);
    await renderEvidenceGraph(bundle, root, undefined, {
      depth: "L2",
      registry,
      verifierReport,
    });
    return root;
  }
  const STANDALONE_FAILED =
    "the deal report carried outside the log did not pass";

  it("a failing x-deal-v0 entry, in any report form, is capsulectl's deal line", async () => {
    for (const name of ["main-standalone-keep", "mesh-payer-selected"]) {
      const r = report(name);
      dealEntry(r)["status"] = "fail";
      expect(
        (await checkReceipt(copy(name), { verifierReport: r })).kind,
        name,
      ).toBe("did_not_verify");
      const root = await page(copy(name), r);
      expect(root.textContent, name).toContain(
        "Didn't verify: capsulectl deal verify reported that this deal's record did not pass its check.",
      );
      expect(root.textContent, name).not.toContain(STANDALONE_FAILED);
      expect(root.querySelector("[data-receipt-module]"), name).toBeNull();
    }
  });

  it("an invalid countersignature is capsulectl's countersign line", async () => {
    const r = report("countersigned-keep");
    csEntries(r)[0]!["state"] = "invalid";
    const root = await page(copy("countersigned-keep"), r);
    expect(root.textContent).toContain(
      "Didn't verify: capsulectl deal verify reported a countersignature on this file that does not verify.",
    );
    expect(root.textContent).not.toContain(STANDALONE_FAILED);
  });

  it("a passing report draws the receipt and the u219 line in place of the header's", async () => {
    const plain = report("main-standalone-keep");
    delete dealEntry(plain)["witnessed"];
    expect(
      (await page(copy("main-standalone-keep"), plain)).textContent,
    ).toContain(HEADER_WITNESS);
    const root = await page(
      copy("main-standalone-keep"),
      report("main-standalone-keep"),
    );
    expect(
      root.querySelector(
        '[data-receipt-module="capsuleviewer.receipt.unilateral/v0"]',
      ),
    ).not.toBeNull();
    expect(rungs(root, "witness")).toEqual([BOOK_LINE]);
    expect(root.textContent).not.toContain(HEADER_WITNESS);
  });
});
