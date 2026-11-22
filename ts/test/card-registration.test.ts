// SPDX-License-Identifier: Apache-2.0
// card_registered on the History card (capsule-viewer#342; agent-action-capsule
// spec/standard-history-v0.md section 13): vectors/card-registration-v0 (a byte
// copy of AAC's, see VENDORED.md) through the runtime's cardRegisteredUnder,
// and readerCardRegistered on a card bundle a real capsulectl cut, which is
// signed by a key the vectors do not hold, so it can only fail, not pass.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cardRegisteredUnder,
  MAX_CARD_STATEMENTS,
  MAX_STATEMENT_HEX,
  readerCardRegistered,
} from "../src/card-registered.js";
import { setReaderWitnessPolicy } from "../src/reader-witnesses.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const corpus = JSON.parse(
  readFileSync(
    join(ROOT, "vectors", "card-registration-v0", "vectors.json"),
    "utf8",
  ),
) as {
  policies: Record<string, unknown>;
  cases: {
    name: string;
    card: string;
    holder: string;
    anchor: string;
    statements: string[];
    policy: string | unknown;
    expected: {
      status: string;
      service: string | null;
      registration_time: number | null;
      statements: {
        status: string;
        service: string | null;
        registration_time: number | null;
      }[];
    };
  }[];
};
const policyOf = (p: string | unknown) =>
  typeof p === "string" ? corpus.policies[p] : p;
const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../gu) ?? [], (b) => Number.parseInt(b, 16));

describe("card-registration-v0 vectors, through the runtime", () => {
  it.each(corpus.cases.map((c) => [c.name, c] as const))("%s", async (_, c) => {
    const got = await cardRegisteredUnder(
      fromHex(c.card),
      c.holder,
      c.anchor,
      c.statements,
      policyOf(c.policy),
    );
    expect(got.status).toBe(c.expected.status);
    expect(got.statements).toEqual(c.expected.statements);
    expect(got.service).toBe(c.expected.service);
    expect(got.registration_time).toBe(c.expected.registration_time);
    expect(got.key_id).toBe(c.holder);
  });

  it("covers every status, so a runtime that answers one thing fails", () => {
    expect(new Set(corpus.cases.map((c) => c.expected.status))).toEqual(
      new Set(["PASS", "FAIL", "NOT_CHECKED", "NOT_PRESENT"]),
    );
  });

  it("counts an entry that is not hex as a statement that fails, beside a passing one", async () => {
    const c = corpus.cases.find((x) => x.name === "pass-eddsa-time")!;
    const got = await cardRegisteredUnder(
      fromHex(c.card),
      c.holder,
      c.anchor,
      ["not hex", ...c.statements],
      policyOf(c.policy),
    );
    expect(got.status).toBe("PASS");
    expect(got.statements.map((s) => s.status)).toEqual(["FAIL", "PASS"]);
    const only = await cardRegisteredUnder(
      fromHex(c.card),
      c.holder,
      c.anchor,
      ["abc"],
      policyOf(c.policy),
    );
    expect(only.status).toBe("FAIL");
  });

  it("never reports a pass without a service the policy lists", async () => {
    const c = corpus.cases.find((x) => x.name === "pass-eddsa-time")!;
    const got = await cardRegisteredUnder(
      fromHex(c.card),
      c.holder,
      c.anchor,
      c.statements,
      { witnesses: [] },
    );
    expect(got.status).toBe("NOT_CHECKED");
    expect(got.service).toBeNull();
    expect(got.registration_time).toBeNull();
  });
});

const DATA = join(ROOT, "tests", "testdata", "standard-history", "witness");
const bundle = (): Record<string, any> =>
  JSON.parse(
    readFileSync(join(DATA, "person-shared-witnessed.bundle.json"), "utf8"),
  );
const rootRecord = (b: Record<string, any>) =>
  b.records.find((r: Record<string, any>) => r.capsule_id === b.root);
const statement = corpus.cases.find((x) => x.name === "pass-eddsa-time")!
  .statements[0]!;

describe("readerCardRegistered", () => {
  beforeEach(() => setReaderWitnessPolicy(null));

  it("says NOT_PRESENT with no statement, whatever else holds", async () => {
    const context = await buildVerifiedBundleContext(bundle());
    expect((await readerCardRegistered(context, null)).status).toBe(
      "NOT_PRESENT",
    );
    expect((await readerCardRegistered(context, [])).status).toBe(
      "NOT_PRESENT",
    );
  });

  it("fails a statement by another key than the one the card is signed with, and names that key", async () => {
    const b = bundle();
    const context = await buildVerifiedBundleContext(b);
    setReaderWitnessPolicy(corpus.policies["default"]);
    const got = await readerCardRegistered(context, [statement]);
    expect(got.status).toBe("FAIL");
    expect(got.key_id).toBe(rootRecord(b).key_id);
    expect(got.service).toBeNull();
  });

  it("says NOT_CHECKED, never FAIL, when the card has no verified signature to name a key", async () => {
    const b = bundle();
    const r = rootRecord(b);
    delete r.signature;
    delete r.key_id;
    const context = await buildVerifiedBundleContext(b);
    expect((await readerCardRegistered(context, [statement])).status).toBe(
      "NOT_CHECKED",
    );
    const tampered = bundle();
    const t = rootRecord(tampered);
    t.signature = (t.signature[0] === "0" ? "1" : "0") + t.signature.slice(1);
    const bad = await buildVerifiedBundleContext(tampered);
    expect((await readerCardRegistered(bad, [statement])).status).toBe(
      "NOT_CHECKED",
    );
  });

  it("checks nothing it was not handed as a verified context", async () => {
    expect((await readerCardRegistered(bundle(), [statement])).status).toBe(
      "NOT_CHECKED",
    );
    expect((await readerCardRegistered({}, [statement])).status).toBe(
      "NOT_CHECKED",
    );
  });

  it("bounds the statements: too many, or one too long, is NOT_CHECKED", async () => {
    const context = await buildVerifiedBundleContext(bundle());
    const many = new Array<string>(MAX_CARD_STATEMENTS + 1).fill(statement);
    expect((await readerCardRegistered(context, many)).status).toBe(
      "NOT_CHECKED",
    );
    const long = "00".repeat(MAX_STATEMENT_HEX / 2 + 1);
    expect((await readerCardRegistered(context, [long])).status).toBe(
      "NOT_CHECKED",
    );
  });
});
