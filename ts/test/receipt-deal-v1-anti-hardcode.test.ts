// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
/**
 * The anti-hardcode test of the receipt view-model note's section 5
 * (docs/design/receipt-view-model.md; capsule-viewer#488), for the x-deal-v1
 * receipt: on every deal fixture, in every carrier, each visible text node of
 * the receipt module's region is a wording-pack string or a value read from
 * the copy, and each value resolves (helpers/receipt-anti-hardcode.ts says
 * how). The nodes PR 3 of the note replaces are left out (EXCLUDED).
 */
import { bundleDigest } from "@action-state-group/agent-action-capsule";
import { readFileSync, readdirSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { check, core, type Inputs } from "./helpers/receipt-anti-hardcode.js";
import {
  CARRIERS,
  FIXTURES,
  type Obj,
  drawn,
  moduleRegions,
  type Fixture,
  type Carrier,
  read,
} from "./helpers/receipt-deal-v1-pages.js";

/** The page, its regions and what the check reads besides it. */
export async function page(
  fixture: Fixture,
  carrier: Carrier,
  bundle: Obj = fixture.bundle(),
): Promise<{ regions: HTMLElement[]; inputs: Inputs }> {
  const { root, contexts } = await drawn(fixture, carrier, bundle);
  const context = contexts[contexts.length - 1] ?? {};
  const extensions = ((context["verification"] as Obj | undefined)?.[
    "extensions"
  ] ?? []) as Obj[];
  // The x-deal-v1 entry the page added for the receipt module (withVerifierReport).
  const entry =
    extensions.find(
      (e) =>
        e["kind"] === "x-deal-v1" &&
        e["report"] === "standalone" &&
        e["integrityCovered"] === true,
    ) ?? {};
  const options = fixture.options ? fixture.options() : {};
  return {
    regions: moduleRegions(root),
    inputs: {
      bundle,
      report: fixture.report(),
      given: {
        ...(options["verifyCommand"] === undefined
          ? {}
          : { verify_command: options["verifyCommand"] }),
        ...(options["dealOffer"] === undefined
          ? {}
          : { deal_offer: options["dealOffer"] }),
      },
      entry,
      digest: await bundleDigest(bundle as never),
      countersignatures: (context["countersignatures"] ?? []) as unknown[],
      memberships: ((context["completeness"] as Obj | undefined)?.[
        "memberships"
      ] ?? {}) as Obj,
    },
  };
}

describe("every word on an x-deal-v1 receipt is the pack's or the copy's (note section 5)", () => {
  for (const fixture of FIXTURES) {
    for (const carrier of CARRIERS) {
      it(`${fixture.name}, ${carrier ?? "own page"}`, async () => {
        const { regions, inputs } = await page(fixture, carrier);
        expect(regions).toHaveLength(3);
        const problems = regions.flatMap((r) => check(r, inputs));
        expect(problems).toEqual([]);
      });
    }
  }
});

// ---- the check itself fails where it should (section 5's negative test) ----

const ruled = FIXTURES.find((f) => f.name === "ruled-dispute")!;
async function ruledPage(): Promise<{
  regions: HTMLElement[];
  inputs: Inputs;
}> {
  const p = await page(ruled, null);
  expect(p.regions.flatMap((r) => check(r, p.inputs))).toEqual([]);
  return p;
}
const problemsOf = (p: { regions: HTMLElement[]; inputs: Inputs }) =>
  p.regions.flatMap((r) => check(r, p.inputs)).map((x) => x.what);

describe("the anti-hardcode check refuses text that is not the pack's or the copy's", () => {
  it("a value hardcoded in place of the one its source holds", async () => {
    const p = await ruledPage();
    // The payment card's amount, still marked with its source, but its text fixed.
    const amount = p.regions[0]!.querySelector(
      '[data-card="paid"] .cv-rcpt-card__value [data-ptr]',
    )!;
    amount.textContent = "1,000 msat ";
    expect(problemsOf(p).join("\n")).toMatch(/amount of record:.* gives/);
  });
  it("a pack line replaced by its own text, unmarked, beside lines that still resolve", async () => {
    // The top line drawn as a fixed string while the status card beside it
    // still reads the agreement's state from the report.
    const p = await ruledPage();
    const state = p.regions[0]!.querySelector("[data-card-status] [data-ptr]")!;
    expect(state.getAttribute("data-ptr")).toMatch(
      /\/agent_input\/start\/state$/,
    );
    const node = p.regions[0]!.querySelector("[data-top-line] [data-key]")!;
    node.replaceWith(document.createTextNode(node.textContent ?? ""));
    expect(problemsOf(p).join("\n")).toMatch(
      /unmarked text "Ruled: Delivery not met"/,
    );
  });
  it("a pack literal copied into the page under a forged key", async () => {
    const p = await ruledPage();
    const forged = document.createElement("span");
    forged.setAttribute("data-src", "pack");
    forged.setAttribute("data-key", "deal.surface.title.buyer");
    forged.textContent = "Order receipt!";
    p.regions[0]!.querySelector("[data-receipt-title]")!.replaceChildren(
      forged,
    );
    expect(problemsOf(p)).toContain(
      'deal.surface.title.buyer: part 0 is not the template\'s text "Order receipt"',
    );
  });
  it("a source that names another value than the one shown", async () => {
    const p = await ruledPage();
    const id = p.regions[1]!.querySelector(
      "[data-inventory-record] [data-ptr]",
    )!;
    id.setAttribute(
      "data-ptr",
      id
        .getAttribute("data-ptr")!
        .replace("/record/capsule_id", "/record/action_id"),
    );
    expect(problemsOf(p).join("\n")).toMatch(
      /short of record:.*action_id gives/,
    );
  });
  it("a placeholder filled with text that names no source", async () => {
    const p = await ruledPage();
    const ph = p.regions[0]!.querySelector("[data-ph]")!;
    ph.removeAttribute("data-src");
    expect(problemsOf(p).join("\n")).toMatch(/has no source/);
  });
  it("a token whose source holds another value", async () => {
    const p = await ruledPage();
    const token =
      p.regions[0]!.querySelector('[data-key^="deal.status."][data-ptr]') ??
      p.regions[0]!.querySelector('[data-key^="deal.state."][data-ptr]')!;
    token.setAttribute(
      "data-key",
      token.getAttribute("data-key")!.replace(/\.[a-z_]+$/, ".settled"),
    );
    expect(problemsOf(p).length).toBeGreaterThan(0);
  });
});

describe("the page's words are read from the pack as it is now, not copied from it (pack perturbation)", () => {
  it("every pack node follows a pack whose literal text changed", async () => {
    const words = core.WORDS;
    const saved = { ...words };
    try {
      // Each template's literal text changes; its placeholders stay.
      for (const k of Object.keys(words)) words[k] = `${words[k]}⁣`;
      for (const carrier of CARRIERS) {
        const p = await page(ruled, carrier);
        expect(p.regions).toHaveLength(3);
        expect(p.regions.flatMap((r) => check(r, p.inputs))).toEqual([]);
        // And the text did change: the drawer read the pack, it held no copy of it.
        expect(
          p.regions[0]!.querySelector("[data-receipt-title]")!.textContent,
        ).toMatch(/⁣$/);
      }
    } finally {
      for (const k of Object.keys(words)) words[k] = saved[k]!;
    }
  });
});

describe("the formatters a value's text comes from", () => {
  const f = core.FORMATS;
  it("text and trim", () => {
    expect(f["text"]!(5)).toBe("5");
    expect(f["trim"]!("  200 badges \n")).toBe("200 badges");
  });
  it("amount: once, in its recorded asset", () => {
    expect(
      f["amount"]!({ value: "1000", assetCode: "BTC", assetScale: 11 }),
    ).toBe("1,000 msat");
    expect(f["amount"]!({ value: "1", assetCode: "BTC", assetScale: 8 })).toBe(
      "1 sat",
    );
    expect(
      f["amount"]!({ value: "1234", assetCode: "USD", assetScale: 2 }),
    ).toBe("12.34 USD");
  });
  it("asset: as an older line says it", () => {
    expect(
      f["asset"]!({ value: "1000", assetCode: "BTC", assetScale: 11 }),
    ).toBe("0.00000001000 BTC");
    expect(f["asset"]!({ value: "7", assetCode: "X", assetScale: 0 })).toBe(
      "7 X",
    );
    expect(f["asset"]!("nope")).toBe("-");
  });
  it("short: a long id as its head and tail, a short one whole", () => {
    expect(
      f["short"]!(
        "e6abc639939660cdda9781118a8d4d9ef41f4130da2ea4bded0df45b4c066a99",
      ),
    ).toBe("e6abc639…6a99");
    expect(f["short"]!("abc")).toBe("abc");
  });
  it("json and json_timeless", () => {
    const record = {
      a: 1,
      timestamp: "2026-01-01T00:00:00.5Z",
      settlement: { leg: "payer", observed_at: "x" },
    };
    expect(f["json"]!(record)).toBe(JSON.stringify(record, null, 2));
    expect(JSON.parse(f["json_timeless"]!(record))).toEqual({
      a: 1,
      settlement: { leg: "payer" },
    });
  });
  it("second: a time to the second, any other value as it is", () => {
    expect(f["second"]!("2026-11-27T14:51:23.123456Z")).toBe(
      "2026-11-27T14:51:23Z",
    );
    expect(f["second"]!("2026-11-27T14:51:23Z")).toBe("2026-11-27T14:51:23Z");
    expect(f["second"]!("2026-11-27")).toBe("2026-11-27");
    expect(f["second"]!("not a time")).toBe("not a time");
  });
  it("utc_minutes and proof_file", () => {
    expect(f["utc_minutes"]!("2026-11-27T18:56:20Z")).toBe("18:56 UTC");
    expect(f["proof_file"]!("deal-a34da1fe7277a53b")).toBe(
      "deal-a34da1fe7277a53b.bundle.json",
    );
    expect(f["proof_file"]!("")).toBe("deal.bundle.json");
    expect(f["proof_file"]!("it's")).toBe("'it'\\''s.bundle.json'");
  });
  it("is the closed list the check knows", () => {
    expect(Object.keys(f).sort()).toEqual([
      "amount",
      "asset",
      "json",
      "json_timeless",
      "proof_file",
      "second",
      "short",
      "text",
      "trim",
      "utc_minutes",
    ]);
    expect([...core.DERIVATIONS].sort()).toEqual([
      "book",
      "count",
      "count_where",
      "key",
      "leaves",
      "length",
      "named",
      "ordinal",
    ]);
  });
});

describe("times and raw records on the page", () => {
  it("holds in another time zone: each time is its source's, said in the reader's zone", async () => {
    const before = process.env["TZ"];
    try {
      for (const tz of ["UTC", "America/Chicago", "Asia/Kolkata"]) {
        process.env["TZ"] = tz;
        const p = await page(ruled, null);
        const times = p.regions.flatMap((r) =>
          Array.from(r.querySelectorAll("[data-time][data-ptr]")),
        );
        expect(times.length).toBeGreaterThan(0);
        expect(p.regions.flatMap((r) => check(r, p.inputs))).toEqual([]);
      }
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
    }
  });
  it("a page that shows no record time shows raw records without one (json_timeless)", async () => {
    for (const fixture of FIXTURES) {
      for (const carrier of CARRIERS) {
        const p = await page(fixture, carrier);
        const own =
          carrier === null &&
          p.regions[0]!.querySelector('[data-banner="private"]') !== null;
        for (const pre of p.regions.flatMap((r) =>
          Array.from(r.querySelectorAll("pre.cv-rcpt-raw [data-fmt]")),
        )) {
          expect(
            pre.getAttribute("data-fmt"),
            `${fixture.name} / ${carrier}`,
          ).toBe(own ? "json" : "json_timeless");
          if (!own)
            expect(pre.textContent).not.toMatch(/"(timestamp|observed_at)"/);
        }
      }
    }
  });
});

describe("no literal from a fixture is in the receipt's code or its pack", () => {
  it("names, items, ids and amounts the deal fixtures hold appear in none of go/receipt, ts/src or the pack", () => {
    const ROOT = resolvePath(process.cwd(), "..");
    const literals = new Set<string>();
    const walk = (v: unknown, key: string | null): void => {
      if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v !== null && typeof v === "object") {
        for (const [k, x] of Object.entries(v as Obj)) {
          // A settlement member's amount, as the page would say it.
          if (
            ["amount", "received", "receive_fee"].includes(k) &&
            x !== null &&
            typeof x === "object"
          )
            literals.add(core.FORMATS["amount"]!(x));
          walk(x, k);
        }
      } else if (
        typeof v === "string" &&
        key !== null &&
        ["item", "name", "witness", "deal_id", "forum", "act"].includes(key)
      )
        literals.add(v);
    };
    const dir = resolvePath(ROOT, "tests", "testdata", "deal-v1");
    for (const file of readdirSync(dir, { recursive: true }) as string[]) {
      if (file.endsWith(".json") && !file.includes("vectors"))
        walk(JSON.parse(readFileSync(resolvePath(dir, file), "utf8")), null);
    }
    expect(literals.size).toBeGreaterThan(10);
    const sources = [
      resolvePath(ROOT, "go", "receipt", "receipt_core.js"),
      resolvePath(ROOT, "go", "receipt", "wording-en.json"),
      ...readdirSync(resolvePath(ROOT, "ts", "src"))
        .filter((f) => f.endsWith(".ts"))
        .map((f) => resolvePath(ROOT, "ts", "src", f)),
    ];
    // A literal counts as a whole word ("lamp" is not in "clamp").
    const word = (l: string): RegExp =>
      new RegExp(
        `(?<![A-Za-z0-9])${l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`,
      );
    const found = sources.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [...literals]
        .filter((l) => l.length > 3 && word(l).test(text))
        .map((l) => `${l} in ${file}`);
    });
    expect(found).toEqual([]);
  });
});

// ---- differential pairs (section 5): one semantic member differs, and the page differs there only ----

/**
 * What a page says, by where it read it: each marked value or token, keyed by
 * its source with record ids, digests and keys left out (a valid regeneration
 * signs with new keys, so those change in every pair), and the deal's own id
 * too. Ids, digests, raw records and times are left out: they are checked
 * only to resolve, against their own fixture.
 */
function said(regions: HTMLElement[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const node of regions.flatMap((r) =>
    Array.from(r.querySelectorAll("[data-ptr]")),
  )) {
    // A settlement member's name is the same in both; its value is what the pair changes.
    if (node.getAttribute("data-derive") === "key") continue;
    const fmt = node.getAttribute("data-fmt");
    if (
      fmt === "short" ||
      fmt === "json" ||
      fmt === "json_timeless" ||
      node.hasAttribute("data-time")
    )
      continue;
    const ptr = node.getAttribute("data-ptr")!;
    if (
      /capsule_id|digest|key_id|counterparty_key|\/adjudicator|log_id|deal_id|bundle_digest|payment_ref\/value|memberships|\/record$|^bundle:/.test(
        ptr,
      )
    )
      continue;
    const key = ptr.replace(/[0-9a-f]{64}/g, "<id>");
    const text = node.getAttribute("data-key") ?? node.textContent ?? "";
    out.set(key, [...(out.get(key) ?? []), text]);
  }
  return out;
}

describe("a differential pair differs on the page exactly where its one member does", () => {
  const named = (name: string): Fixture =>
    FIXTURES.find((f) => f.name === name)!;
  const PAIRS = [
    {
      a: "view-model/settled",
      b: "view-model/pair/item-b",
      member: /^report:deal_offer#\/body\/terms\/item$/,
      want: [["lamp"], ["kettle"]],
    },
    {
      a: "view-model/settled",
      b: "view-model/pair/amount-b",
      member: /\/record\/settlement\/amount$/,
      want: [["45.00 USD"], ["44.00 USD"]],
    },
    {
      a: "view-model/pair/ruled-a",
      b: "view-model/pair/ruled-b",
      member: /\/against$/,
      want: null,
    },
  ];
  for (const pair of PAIRS) {
    it(`${pair.a} and ${pair.b}`, async () => {
      const [a, b] = await Promise.all([
        page(named(pair.a), null),
        page(named(pair.b), null),
      ]);
      for (const p of [a, b])
        expect(p.regions.flatMap((r) => check(r, p.inputs))).toEqual([]);
      const [sa, sb] = [said(a.regions), said(b.regions)];
      const differs = [...new Set([...sa.keys(), ...sb.keys()])].filter(
        (k) => JSON.stringify(sa.get(k)) !== JSON.stringify(sb.get(k)),
      );
      // Something differs, and only the member the pair changes.
      expect(differs.length, JSON.stringify(differs)).toBeGreaterThan(0);
      expect(differs.filter((k) => !pair.member.test(k))).toEqual([]);
      if (pair.want !== null) {
        const shown = (s: Map<string, string[]>) =>
          [...s.entries()]
            .filter(([k]) => pair.member.test(k))
            .flatMap(([, v]) => v);
        expect([[...new Set(shown(sa))], [...new Set(shown(sb))]]).toEqual(
          pair.want,
        );
      }
    });
  }
});

describe("the check reads relations and rarer lines too", () => {
  it("a statement's named record re-pointed at another record the copy holds fails", async () => {
    const p = await ruledPage();
    const node = p.regions[0]!.querySelector('[data-derive="named"]')!;
    const [digest, target] = node.getAttribute("data-ptr")!.split(" ");
    // Another record the copy holds: the dispute.
    const other =
      "8b0dc2e82b5142f3eacccfe4731ba91cd01af49d3197a9cc338049753a35bae0";
    expect(target).not.toContain(other);
    node.setAttribute(
      "data-ptr",
      `${digest} record:${other}#/record/capsule_id`,
    );
    node.textContent = core.FORMATS["short"]!(other);
    expect(problemsOf(p).join("\n")).toMatch(/derived named says/);
  });

  // The ruled copy edited where the page reads only the sealed report and the
  // page's own checks, with capsulectl's report rebound to the edited bytes:
  // a scope line, a countersignature the page checks, a report time with
  // fractions of a second.
  it("an edited copy's scope line, countersignature status and as_of are marked and resolve", async () => {
    const bundle = ruled.bundle();
    const content = ((bundle["extensions"] as Obj)["x-deal-report/v0"] as Obj)[
      "agent_input"
    ] as Obj;
    (content["report"] as Obj)["scope"] = "Only the delivery term.";
    content["as_of"] = "2026-11-27T14:51:23.250Z";
    const copy = read("countersigned", "countersigned-copy.bundle.json");
    bundle["countersignatures"] = copy["countersignatures"];
    const report = ruled.report();
    report["bundle_digest"] = await bundleDigest(bundle as never);
    const edited: Fixture = {
      ...ruled,
      name: "ruled-dispute (edited)",
      bundle: () => bundle,
      report: () => report,
    };
    const p = await page(edited, null, bundle);
    expect(p.regions).toHaveLength(3);
    expect(p.regions.flatMap((r) => check(r, p.inputs))).toEqual([]);
    const text = p.regions.map((r) => r.textContent).join("");
    expect(text).toContain("Only the delivery term.");
    expect(
      p.regions[2]!.querySelector(
        '[data-rung="countersign"] [data-ptr^="checked:countersignatures#"]',
      ),
    ).not.toBeNull();
    // A report time the page does not read as a UTC instant is said as stored.
    expect(p.regions[1]!.querySelector("[data-as-of]")!.textContent).toContain(
      "2026-11-27T14:51:23.250Z",
    );
  });
});
