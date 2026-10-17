// result/v0 card -- extension members (`x-`, Evidence Result v0 section 8a,
// agent-action-capsule 7662a003). The document and each claim admit members
// named `x-...`; a verifier ignores them, and an extension member never
// changes a claim's meaning or verdict. So the card must render a Result with
// x- members EXACTLY as it renders the same Result without them: no label,
// value, chip or count derived from one, and no bucket, coverage, close-state
// or refusal decision moved by one.
//
// The Python twin is tests/test_result_v0_extension_members.py; both pin the
// same two vendored files by sha256 (tests/testdata/README.md).
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadViewer } from "./loadViewer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTDATA = resolve(HERE, "..", "tests", "testdata");

// Vendored byte-for-byte from agent-action-capsule vectors/evidence-result/
// at 7662a00362049bcf287108497a1e3a867141dd67 (its SHA256SUMS lists the same).
const PINNED = {
  "pos-example-org-extended-result.json": "f194bcb3baa4c3db25e6b13b7d8996d4e00ef4fcc6f7dac187a059e68af4ebb7",
  "pos-judge-producer-x-judge-result.json": "d8c1ee5b38ac7680ecfbfce1d24b605afbe4b21f4db62b4f6ad0f0668a577f70",
};
const X_FIXTURES = Object.keys(PINNED);

function bytes(name) {
  return readFileSync(resolve(TESTDATA, name));
}

function fixture(name) {
  return JSON.parse(bytes(name).toString("utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isExtension(key) {
  return key.startsWith("x-");
}

// The same document with every x- member removed, at both levels the slot
// admits -- the document and each claim. Nothing else is touched.
function stripExtensions(result) {
  const out = {};
  Object.keys(result).forEach((key) => {
    if (!isExtension(key)) out[key] = result[key];
  });
  if (Array.isArray(result.claims)) {
    out.claims = result.claims.map((claim) => {
      if (!claim || typeof claim !== "object") return claim;
      const c = {};
      Object.keys(claim).forEach((key) => {
        if (!isExtension(key)) c[key] = claim[key];
      });
      return c;
    });
  }
  return out;
}

function extensionMembers(result) {
  const found = [];
  Object.keys(result).forEach((key) => {
    if (isExtension(key)) found.push([key, result[key]]);
  });
  (result.claims || []).forEach((claim) => {
    Object.keys(claim || {}).forEach((key) => {
      if (isExtension(key)) found.push([key, claim[key]]);
    });
  });
  return found;
}

// Every string leaf inside an extension member's value, and every key name
// under it -- what a renderer that "showed" an x- member would put on the page.
function extensionTokens(result) {
  const tokens = new Set();
  function walk(value) {
    if (typeof value === "string") tokens.add(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      Object.keys(value).forEach((key) => {
        tokens.add(key);
        walk(value[key]);
      });
    }
  }
  extensionMembers(result).forEach(([key, value]) => {
    tokens.add(key);
    walk(value);
  });
  return tokens;
}

function entryFor(result, records) {
  const entry = { capsule_id: null, record: result, conversation: { disclosed: false, messages: [] } };
  if (records !== undefined) entry.records = records;
  return entry;
}

async function render(result, records) {
  const CapsuleViewer = loadViewer();
  return CapsuleViewer.renderEntry(entryFor(result, records));
}

// Every attribute value and every text node, so a token hidden on a data-*
// attribute or a title counts as rendered too.
function renderedStrings(node) {
  const out = [node.textContent];
  node.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => out.push(attr.name, attr.value));
  });
  return out.join("\n");
}

// The tokens that, if found on the page, can only have come from an x-
// member: those that the stripped document's own rendering does not already
// contain (a requirement_ref the producer also lists in x-judged-selection
// is shown because it is the claim's defined member, not because of the x-).
async function tokensOnlyFromExtensions(result) {
  const baseline = renderedStrings(await render(stripExtensions(result)));
  return Array.from(extensionTokens(result)).filter((t) => t.length >= 4 && !baseline.includes(t));
}

describe("vendored x- fixtures are pinned to agent-action-capsule 7662a003", () => {
  it.each(X_FIXTURES)("%s matches its pinned sha256", (name) => {
    expect(createHash("sha256").update(bytes(name)).digest("hex")).toBe(PINNED[name]);
  });

  it.each(X_FIXTURES)("%s carries x- members at BOTH the document and the claim level", (name) => {
    const result = fixture(name);
    expect(Object.keys(result).some(isExtension)).toBe(true);
    expect(result.claims.some((claim) => Object.keys(claim).some(isExtension))).toBe(true);
  });

  it("the extended positive, x- members stripped, is the claims positive (the AAC README's own check)", () => {
    expect(stripExtensions(fixture("pos-example-org-extended-result.json"))).toEqual(
      fixture("pos-example-org-claims-result.json")
    );
  });
});

describe("the card accepts a Result with x- members and renders it as if they were absent", () => {
  it.each(X_FIXTURES)("%s: no claim refused, every bucket and coverage line green", async (name) => {
    const result = fixture(name);
    const node = await render(result);
    expect(node.querySelectorAll(".rv0-claim-refused")).toHaveLength(0);
    expect(node.querySelectorAll(".rv0-claim-unrecognized")).toHaveLength(0);
    expect(node.querySelectorAll(".rv0-claims .rv0-claim")).toHaveLength(result.claims.length);
    const badges = Array.from(node.querySelectorAll(".rv0-badge.ok, .rv0-badge.fail"));
    expect(badges.length).toBeGreaterThan(0);
    badges.forEach((b) => expect(b.className).toContain("ok"));
    expect(node.querySelectorAll(".rv0-diagnostic")).toHaveLength(0);
  });

  it.each(X_FIXTURES)("%s: the rendered card is byte-identical to the stripped document's", async (name) => {
    const result = fixture(name);
    const withX = await render(result);
    const without = await render(stripExtensions(result));
    expect(withX.outerHTML).toBe(without.outerHTML);
  });

  it("the extended positive renders exactly as the claims positive does", async () => {
    const extended = await render(fixture("pos-example-org-extended-result.json"));
    const plain = await render(fixture("pos-example-org-claims-result.json"));
    expect(extended.outerHTML).toBe(plain.outerHTML);
  });

  it.each(X_FIXTURES)("%s: no x- member name or value appears in any text or attribute", async (name) => {
    const result = fixture(name);
    const page = renderedStrings(await render(result));
    expect(page).not.toMatch(/\bx-[a-z]/);
    const leaked = (await tokensOnlyFromExtensions(result)).filter((t) => page.includes(t));
    expect(leaked).toEqual([]);
    // The distinctive values, named so a failure says what leaked.
    for (const t of ["mock backend", "judge choice", "prompt_template_hash", "model_hosting", "input_refs", "out_of_scope"]) {
      if (JSON.stringify(extensionMembers(result)).includes(t)) expect(page).not.toContain(t);
    }
  });
});

// x- members written to LOOK like the defined members they shadow. Each one,
// if the card read it, would move a verdict, a bucket, a count, a tier or a
// close state. None may.
describe("an x- member that mimics a defined member never moves anything (section 8a)", () => {
  function adversarial(result) {
    const out = clone(result);
    out["x-aggregate"] = { buckets: { met: [], not_met: [], not_evaluable: [] }, coverage: { evaluated_population: 99 } };
    out["x-claims"] = [{ id: "x-ghost", verdict: "met", tier: "judged", grade: "countersigned" }];
    out["x-view"] = { title: "X-SHADOW-TITLE", producer_name: "X-SHADOW-PRODUCER" };
    out.claims.forEach((claim) => {
      claim["x-verdict"] = claim.verdict === "met" ? "not_met" : "met";
      claim["x-sufficiency"] = "GAP";
      claim["x-tier"] = "shadow-tier";
      claim["x-grade"] = "shadow-grade";
      claim["x-type"] = "close";
      claim["x-evidence"] = [{ digest_alg: "SHA-256", digest: "sha256:not-a-digest" }];
      claim["x-presentation"] = { kind: "story", narrative: "X-SHADOW-NARRATIVE" };
      if (claim.close) claim["x-close_state"] = "AGREED";
    });
    return out;
  }

  const CASES = [
    ["pos-example-org-claims-result.json"],
    ["pos-example-org-extended-result.json"],
    ["pos-judge-producer-x-judge-result.json"],
    ["pos-example-org-close-contested-result.json", "pos-example-org-close-contested-result.records.json"],
    ["pos-example-org-close-unilateral-result.json", "pos-example-org-close-unilateral-result.records.json"],
    ["neg-close-agreed-relabelled-contested.json", "neg-close-agreed-relabelled-contested.records.json"],
    ["pos-example-org-reconcile-result.json"],
    ["neg-untiered-claim.json"],
  ];

  it.each(CASES)("%s: the card is byte-identical with and without the shadowing x- members", async (name, records) => {
    const sidecar = records ? fixture(records) : undefined;
    const result = adversarial(fixture(name));
    const withX = await render(result, sidecar);
    const without = await render(stripExtensions(result), sidecar);
    expect(withX.outerHTML).toBe(without.outerHTML);
    const page = renderedStrings(withX);
    for (const t of ["X-SHADOW", "shadow-tier", "shadow-grade", "x-ghost", "sha256:not-a-digest"]) {
      expect(page).not.toContain(t);
    }
  });

  it("the card internals ignore them too: claimIssues and recompute see the defined members only", async () => {
    loadViewer();
    const internals = globalThis.window.__resultV0CardInternals;
    const result = adversarial(fixture("pos-example-org-extended-result.json"));
    const stripped = stripExtensions(result);
    result.claims.forEach((claim, i) => {
      expect(internals.claimIssues(claim)).toEqual(internals.claimIssues(stripped.claims[i]));
      expect(internals.claimType(claim)).toBe("requirement");
    });
    const a = internals.recompute(result.claims);
    const b = internals.recompute(stripped.claims);
    expect(a.buckets).toEqual(b.buckets);
    expect(a.coverage).toEqual(b.coverage);
    expect(a.buckets).toEqual(fixture("pos-example-org-extended-result.json").aggregate.buckets);
  });
});
