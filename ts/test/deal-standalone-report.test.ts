// SPDX-License-Identifier: Apache-2.0

// A deal copy's standalone report, checked in the page as capsulectl deal
// verify checks it (capsule-viewer#397): each condition of evidencebook's
// standaloneReportEntry (x-deal-v0) refuses on its own, and a receipt whose
// report passes draws.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { dealStandaloneReport } from "../src/deal-standalone-report.js";
import { checkReceipt } from "../src/receipt.js";

type Obj = Record<string, any>;

const read = (name: string): Obj =>
  JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "..",
        "tests",
        "testdata",
        "receipt",
        `${name}.bundle.json`,
      ),
      "utf8",
    ),
  );
const keep = (): Obj => read("main-standalone-keep");
const x = (b: Obj): Obj => b.extensions["x-deal-report/v0"];

// The deal's step records, by log position.
const steps = (b: Obj): Obj[] => {
  const memberships = b.completeness_certificate.memberships;
  return b.records
    .filter((r: Obj) =>
      ["deal_step", "step_completed", "step_failed"].includes(
        r.evidence_record_header?.record_type,
      ),
    )
    .sort(
      (a: Obj, z: Obj) =>
        Number(memberships[a.capsule_id].log_coordinates.seq) -
        Number(memberships[z.capsule_id].log_coordinates.seq),
    );
};
const flip = (hex: string): string =>
  (hex[0] === "0" ? "1" : "0") + hex.slice(1);

describe("a deal copy's standalone report, checked in the page (#397)", () => {
  it("passes on the copies capsulectl cut, owner's and counterparty's", async () => {
    expect(await dealStandaloneReport(keep())).toBe("pass");
    expect(
      await dealStandaloneReport(read("main-standalone-counterparty")),
    ).toBe("pass");
  });

  it("has no answer for a copy with no standalone report, or an x-deal-v1 copy", async () => {
    const none = keep();
    delete none.extensions["x-deal-report/v0"];
    expect(await dealStandaloneReport(none)).toBeNull();
    const v1 = keep();
    v1.extensions["x-deal-v1"] = {};
    expect(await dealStandaloneReport(v1)).toBeNull();
    expect(await dealStandaloneReport(read("mesh-payer-selected"))).toBeNull();
    expect(await dealStandaloneReport("not a bundle")).toBeNull();
  });

  const refused: Record<string, (b: Obj) => void> = {
    "the section holds more than the pointer": (b) => {
      b.extensions["x-deal-v0"].other = 1;
    },
    "the pointer is not a string": (b) => {
      b.extensions["x-deal-v0"].sealed_report = 1;
    },
    "the extension holds more than record and agent_input": (b) => {
      x(b).more = {};
    },
    "the record is not the pointer's": (b) => {
      b.extensions["x-deal-v0"].sealed_report = "0".repeat(64);
    },
    "the record is not a deal report": (b) => {
      x(b).record.action_id = "capsulectl-deal-step";
    },
    "its signature does not verify": (b) => {
      x(b).record.signature = flip(x(b).record.signature);
    },
    "its key_id is not the key it verifies under": (b) => {
      x(b).record.key_id = flip(x(b).record.key_id);
    },
    "the last step's signature does not verify": (b) => {
      const last = steps(b).at(-1)!;
      last.signature = flip(last.signature);
    },
    "no record is a step": (b) => {
      for (const r of b.records) delete r.evidence_record_header;
    },
    "its payload is not the one the Capsule commits": (b) => {
      x(b).agent_input.audience = "adjudicator";
    },
    "the bundle's log is another deal's": (b) => {
      b.completeness_certificate.log_id = "deal/another";
    },
    "the bundle's log is not a deal's": (b) => {
      b.completeness_certificate.log_id = "book/x";
    },
    "the bundle's checkpoint root is another": (b) => {
      b.checkpoint.root = flip(b.checkpoint.root);
    },
    "the bundle's checkpoint size is another": (b) => {
      b.checkpoint.mmr_size = Number(b.checkpoint.mmr_size) + 1;
    },
    "a report record is on the log beside it": (b) => {
      b.records.push({ ...b.records[0], action_id: "capsulectl-deal-report" });
    },
    "the checkpoint's time is not the report's": (b) => {
      const t = new Date(Date.parse(b.checkpoint.timestamp) + 1000);
      b.checkpoint.timestamp = t.toISOString();
    },
    "the checkpoint's time is not RFC 3339 as Go reads it": (b) => {
      b.checkpoint.timestamp = b.checkpoint.timestamp.replace("T", "t");
    },
  };
  for (const [why, edit] of Object.entries(refused)) {
    it(`fails when ${why}`, async () => {
      const b = keep();
      edit(b);
      expect(await dealStandaloneReport(b)).toBe("fail");
    });
  }

  it("reads the checkpoint's time as one instant: another offset, or more fraction digits, is the same time", async () => {
    const b = keep();
    const asOf = x(b).agent_input.report.lifecycle.as_of as string;
    expect(b.checkpoint.timestamp).toBe(asOf);
    const at = new Date(Date.parse(asOf));
    // The same instant written with a +01:00 offset.
    const shifted = new Date(at.getTime() + 3600_000).toISOString();
    const frac = /\.(\d+)Z$/u.exec(asOf)?.[1] ?? "";
    b.checkpoint.timestamp =
      shifted.replace(/\.\d+Z$/u, "").replace(/Z$/u, "") +
      (frac === "" ? "" : `.${frac}`) +
      "+01:00";
    expect(await dealStandaloneReport(b)).toBe("pass");
    const longer = keep();
    longer.checkpoint.timestamp = asOf.replace(
      /(\.\d+)?Z$/u,
      (m, f: string | undefined) => `${(f ?? ".").padEnd(10, "0")}000Z`,
    );
    expect(await dealStandaloneReport(longer)).toBe("pass");
  });

  it("a receipt whose standalone report passes draws; one whose report fails has no module", async () => {
    expect(await checkReceipt(keep())).toMatchObject({
      kind: "checked",
      module: "capsuleviewer.receipt.unilateral/v0",
    });
    const b = keep();
    b.checkpoint.timestamp = new Date(
      Date.parse(b.checkpoint.timestamp) + 1000,
    ).toISOString();
    expect((await checkReceipt(b)).kind).not.toBe("checked");
  });

  it("has no answer where the browser has no Ed25519", async () => {
    vi.resetModules();
    vi.doMock("@action-state-group/agent-action-capsule", async (original) => ({
      ...(await original<object>()),
      ed25519Available: () => false,
    }));
    const { dealStandaloneReport: withoutEd25519 } = await import(
      "../src/deal-standalone-report.js"
    );
    expect(await withoutEd25519(keep())).toBeNull();
    vi.doUnmock("@action-state-group/agent-action-capsule");
    vi.resetModules();
  });
});
