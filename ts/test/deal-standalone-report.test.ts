// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

// A deal copy's standalone report, checked in the page as capsulectl deal
// verify checks it (capsule-viewer#397): each condition of evidencebook's
// standaloneReportEntry (x-deal-v0) refuses on its own, and a receipt whose
// report passes draws.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  computeCapsuleId,
  createEd25519Identity,
  jsonDigest,
  signCapsuleId,
} from "@action-state-group/agent-action-capsule";
import {
  dealStandaloneReport,
  instant,
  jsonUint,
} from "../src/deal-standalone-report.js";
import { checkReceipt, renderReceipt } from "../src/receipt.js";

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
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
type SigningIdentity = ReturnType<typeof createEd25519Identity>;
const identity = (): SigningIdentity =>
  createEd25519Identity(generateKeyPairSync("ed25519").privateKey);
const sign = (record: Obj, who: SigningIdentity): void => {
  record.key_id = hex(who.publicKey);
  record.signature = hex(signCapsuleId(record.capsule_id, who));
};

// A copy whose report is re-sealed: `edit` changes the report's payload, its
// Capsule commits the new payload and is signed again, with the deal's last
// step, by a test key, so only this check's conditions on what is signed
// can refuse it. `last` signs the last step instead, when it is another key.
async function resealed(
  edit: (input: Obj, b: Obj) => void,
  last?: SigningIdentity,
): Promise<Obj> {
  const b = keep();
  const who = identity();
  const report = x(b);
  edit(report.agent_input, b);
  const { signature: _s, key_id: _k, ...capsule } = report.record;
  capsule.model_attestation.compute_attestation.agent_input_digest =
    await jsonDigest(report.agent_input);
  capsule.capsule_id = await computeCapsuleId(
    Object.fromEntries(
      Object.entries(capsule).filter(([k]) => k !== "capsule_id"),
    ) as never,
  );
  report.record = capsule;
  sign(report.record, who);
  b.extensions["x-deal-v0"].sealed_report = report.record.capsule_id;
  sign(steps(b).at(-1)!, last ?? who);
  return b;
}

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

  it("a report re-sealed unchanged by the last step's key passes (the tests below rest on it)", async () => {
    expect(await dealStandaloneReport(await resealed(() => undefined))).toBe(
      "pass",
    );
  });

  const signedRefused: Record<string, (input: Obj, b: Obj) => void> = {
    "its type is not deal_report": (input) => {
      input.type = "deal_step";
    },
    "its profile is not x-deal-v0": (input) => {
      input.profile = "x-deal-v1";
    },
    "its audience is not a copy audience": (input) => {
      input.audience = "public";
    },
    "its deal_id is another deal's": (input) => {
      input.deal_id = "another";
    },
    "its deal_checkpoint holds a fourth member": (input) => {
      input.deal_checkpoint.timestamp = "x";
    },
    "its deal_checkpoint names another log": (input) => {
      input.deal_checkpoint.log_id = "deal/another";
    },
    "its deal_checkpoint size is a string, which Go does not read as a number":
      (input) => {
        input.deal_checkpoint.mmr_size = String(input.deal_checkpoint.mmr_size);
      },
    "its as_of is another time": (input) => {
      const t = Date.parse(input.report.lifecycle.as_of) + 1000;
      input.report.lifecycle.as_of = new Date(t).toISOString();
    },
    "its as_of is year 26 and the checkpoint's 1926, which Go reads apart": (
      input,
      b,
    ) => {
      input.report.lifecycle.as_of = "0026-10-27T22:09:19Z";
      b.checkpoint.timestamp = "1926-10-27T22:09:19Z";
    },
  };
  for (const [why, edit] of Object.entries(signedRefused)) {
    it(`fails when, signed by the last step's key, ${why}`, async () => {
      expect(await dealStandaloneReport(await resealed(edit))).toBe("fail");
    });
  }

  it("fails when the report and the last step are signed by two keys", async () => {
    expect(
      await dealStandaloneReport(await resealed(() => undefined, identity())),
    ).toBe("fail");
  });

  it("reads a JSON number as Go's JSONUint does: never a string, a fraction or -0", () => {
    expect(jsonUint(22)).toBe(22n);
    expect(jsonUint(0)).toBe(0n);
    for (const v of ["22", -1, -0, 2.5, Number.MAX_SAFE_INTEGER + 1, null])
      expect(jsonUint(v), String(v)).toBeUndefined();
  });

  it("reads an RFC 3339 time as Go's time.Parse(RFC3339Nano) does", () => {
    // The year as written, never 19xx.
    expect(instant("0026-10-27T22:09:19Z")).not.toBe(
      instant("1926-10-27T22:09:19Z"),
    );
    expect(instant("0099-01-01T00:00:00Z")).not.toBe(
      instant("1999-01-01T00:00:00Z"),
    );
    // Year 0 is a leap year, as in Go; 1900 is not.
    expect(instant("0000-02-29T00:00:00Z")).toBeDefined();
    expect(instant("1900-02-29T00:00:00Z")).toBeUndefined();
    // One instant, however written.
    expect(instant("2026-10-27T23:09:19+01:00")).toBe(
      instant("2026-10-27T22:09:19Z"),
    );
    expect(instant("2026-10-27T22:09:19.1234567891Z")).toBe(
      instant("2026-10-27T22:09:19.123456789Z"),
    );
    // Not RFC 3339 as Go's fast path reads it.
    for (const v of [
      "2026-10-27t22:09:19Z",
      "2026-10-27T22:09:19z",
      "2026-10-27T24:00:00Z",
      "2026-10-27T22:09:60Z",
      "2026-13-01T00:00:00Z",
      "2026-10-27T22:09:19+24:00",
    ])
      expect(instant(v), v).toBeUndefined();
  });

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

  it("a receipt whose standalone report passes draws and says the page checked it; one whose report fails did not verify", async () => {
    expect(await checkReceipt(keep())).toMatchObject({
      kind: "checked",
      module: "capsuleviewer.receipt.unilateral/v0",
    });
    // The report is described by the page's own check, never as capsulectl's
    // (Sherlock2, the #398 follow-up).
    const drawn = document.createElement("div");
    await renderReceipt(keep(), drawn, { depth: "L1" });
    const note = drawn.querySelector('[data-checked-here="true"]');
    expect(note?.textContent).toBe(
      "This report's text is carried in the file outside the log. This page checked it itself: signed by the deal's last step, matching its Capsule, and made at this deal's checkpoint.",
    );
    expect(drawn.textContent).not.toContain("capsulectl verify reported");
    // A change only this check sees: the bundle's own checks still pass, and
    // the copy reads as one that did not verify, never as one not there.
    const b = keep();
    x(b).agent_input.audience = "adjudicator";
    expect((await checkReceipt(b)).kind).toBe("did_not_verify");
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
