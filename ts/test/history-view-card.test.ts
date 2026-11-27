// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// The History view's card page (capsule-viewer#384): drawn from the signed
// object it carries, bound to capsulectl verify's answer by the bundle digest,
// in the receipt's look and words, with the reader's own times when scripted.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jcs } from "@action-state-group/agent-action-capsule";
import { describe, expect, it } from "vitest";
import {
  HISTORY_VIEW_WORDING,
  SEAL_SHAPES,
  amountText,
  type HistoryCardInput,
  buildHistoryView,
  historyViewHtml,
  renderHistoryView,
  sha256Hex,
} from "../src/history-view.js";

type Json = Record<string, unknown>;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const readJson = (path: string): Json =>
  JSON.parse(readFileSync(join(root, path), "utf8")) as Json;
const cases = (
  readJson("vectors/history-view/cases.json") as { cases: Record<string, Json> }
).cases;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const words = HISTORY_VIEW_WORDING.entries as Record<string, string>;

function page(input: unknown, options?: { localTime?: boolean }): HTMLElement {
  const div = document.createElement("div");
  expect(renderHistoryView(input, div, undefined, options)).toBe(true);
  return div;
}

/** A real capsulectl card bundle as its canonical text, with capsulectl verify's real answer. */
function realCard(bundle: string, verify: string): Json {
  const doc = readJson(bundle);
  const text = new TextDecoder().decode(jcs(doc));
  const out = readJson(verify) as Record<string, { status: string }> & {
    bundle_digest: string;
    verdict: string;
  };
  return {
    view: "history-view/v0",
    kind: "deal",
    surface: "neutral",
    reader: "recipient",
    holder: { name: "Rowan" },
    audience: { kind: "shared" },
    built_at: "2026-11-27T03:15:00Z",
    checked: { where: "builder", by: "capsulectl verify" },
    rows: [],
    checks: [],
    machine: {
      file: "rowan-card.json",
      text,
      verify: {
        verdict: out.verdict,
        bundle_digest: out.bundle_digest,
        checks: Object.fromEntries(
          [
            "producer_signatures",
            "interval_coverage",
            "graph_closure",
            "per_record_membership",
            "checkpoint",
            "witnesses",
          ].map((k) => [k, (out[k] as { status: string }).status]),
        ),
      },
    },
  };
}

describe("the card page's object", () => {
  it("sha256Hex is SHA-256 of the UTF-8 text", () => {
    for (const s of [
      "",
      "abc",
      "é…✓ 🦭",
      "x".repeat(55),
      "y".repeat(56),
      "z".repeat(64),
      "q".repeat(1000),
    ])
      expect(sha256Hex(s)).toBe(
        createHash("sha256").update(s, "utf8").digest("hex"),
      );
  });

  it("takes a real capsulectl card with capsulectl verify's real answer for it", () => {
    const input = realCard(
      "tests/testdata/standard-history/person-shared.bundle.json",
      "tests/testdata/standard-history/verify/person-shared.json",
    );
    const p = page(input);
    expect(p.querySelector('[data-history="top-line"]')?.textContent).toMatch(
      /^\d+ deals?/u,
    );
    expect(p.querySelectorAll('[data-history="row"]')).toHaveLength(0);
    expect(p.querySelector('[data-history="hero"]')?.textContent).toContain(
      "As Rowan reported.",
    );
  });

  it("refuses a bundle changed after capsulectl verify answered for it", () => {
    const input = realCard(
      "tests/testdata/standard-history/person-shared.bundle.json",
      "tests/testdata/standard-history/verify/person-shared.json",
    );
    const machine = input["machine"] as Json;
    machine["text"] = (machine["text"] as string).replace('"of":', '"of" :');
    const built = buildHistoryView(input);
    expect(built.ok).toBe(false);
  });

  it("refuses a real own copy shown as a card someone was sent", () => {
    const input = realCard(
      "tests/testdata/standard-history/person-own.bundle.json",
      "tests/testdata/standard-history/verify/person-own.json",
    );
    const built = buildHistoryView(input);
    expect(built.ok ? [] : built.reasons).toEqual([
      "input.machine.text: carries the holder's deal entries; a card someone was sent never does",
    ]);
  });

  it("the download is the object's own bytes, and the command names the downloaded file", () => {
    const input = cases["card-theirs"] as Json;
    const p = page(input);
    const a = p.querySelector('a[data-history="download"]');
    const href = a?.getAttribute("href") ?? "";
    const prefix = "data:application/json;charset=utf-8,";
    expect(href.startsWith(prefix)).toBe(true);
    expect(decodeURIComponent(href.slice(prefix.length))).toBe(
      (input["machine"] as Json)["text"],
    );
    expect(a?.getAttribute("download")).toBe("alder-history-card.json");
    expect(
      p.querySelector('[data-verify-command="download"]')?.textContent,
    ).toBe("capsulectl verify --bundle alder-history-card.json");
  });
});

describe("the two perspectives", () => {
  it("their card: counts only, no rows, no stamps, no seal, as its holder reported", () => {
    const p = page(cases["card-theirs"]);
    expect(p.querySelector("h1")?.textContent).toBe(
      "Alder Print Co.'s History",
    );
    expect(p.querySelector('[data-history="top-line"]')?.textContent).toBe(
      "11 deals, 5 didn't go as agreed, 5 not final yet",
    );
    expect(p.textContent).toContain("As Alder Print Co. reported.");
    expect(p.textContent).toContain("10 of these deals are sample history.");
    expect(
      p.querySelectorAll('[data-history="row"], .cvh-stamp, svg'),
    ).toHaveLength(0);
    expect(p.textContent).not.toMatch(/did not hold/u);
  });

  it("your History: one row per deal entry, newest first, PRIVATE, from the same look", () => {
    const input = cases["card-yours"] as Json;
    const p = page(input);
    expect(p.querySelector("h1")?.textContent).toBe("Your History");
    expect(p.querySelector('[data-audience="private"]')?.textContent).toBe(
      "Private: your copy",
    );
    const text = (input["machine"] as Json)["text"] as string;
    const deals = (
      JSON.parse(text) as {
        extensions: Record<string, { deals: { agreed_at: string }[] }>;
      }
    ).extensions["x-standard-history/v0"]!.deals;
    const rows = p.querySelectorAll('[data-history="row"]');
    expect(rows).toHaveLength(deals.length);
    const times = [...rows].map(
      (r) => r.querySelector("time")?.getAttribute("datetime") ?? "",
    );
    expect([...times].sort().reverse()).toEqual(times);
    // Same layout parts as their card: header, hero, proof, does-not-show, signed, technical, footer.
    const parts = (e: HTMLElement) =>
      [
        "header",
        "hero",
        "proof",
        "does-not-show",
        "signed",
        "technical",
        "footer",
      ].map((k) => e.querySelector(`[data-history="${k}"]`) !== null);
    expect(parts(p)).toEqual(parts(page(cases["card-theirs"])));
  });

  it("a ruled not-met deal draws the seal and says it in words; no row draws the Done seal", () => {
    const p = page(cases["card-yours"]);
    const sealed = [...p.querySelectorAll('[data-history="row"]')].filter((r) =>
      r.querySelector("svg"),
    );
    expect(sealed.length).toBeGreaterThan(0);
    for (const r of sealed) {
      expect(r.getAttribute("data-deal-state")).toBe("not_as_agreed");
      expect(r.textContent).toContain("Didn't go as agreed");
      const svg = r.querySelector("svg")!;
      expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
    expect(p.querySelector('[data-seal="done"]')).toBeNull();
  });

  it("stamps: RECORDED only from the row's own slot, COUNTERSIGNED never from the other side's half", () => {
    const p = page(cases["card-yours"], { localTime: false });
    const rows = [...p.querySelectorAll('[data-history="row"]')];
    const stampOf = (r: Element, i: number) =>
      r.querySelectorAll(".cvh-stamp")[i]!;
    const withHalf = rows.filter((r) =>
      r.querySelector('[data-history="both-halves"]'),
    );
    expect(withHalf.length).toBeGreaterThan(0);
    for (const r of withHalf) {
      expect(r.textContent).toContain(
        "Their signed agreement is in your records.",
      );
      if (!r.textContent?.includes("Ledger Notary"))
        expect(stampOf(r, 2).getAttribute("data-filled")).toBe("no");
    }
    const lines = rows.map((r) => stampOf(r, 0).textContent);
    expect(lines).toContain(
      "RECORDEDCheckpointed through step 3 of 5 · Nov 27, 2026, 03:12 UTC",
    );
    expect(lines).toContain("RECORDEDNot checkpointed yet");
    expect(p.textContent).not.toContain(
      "the other party signed this record too",
    );
  });

  it("an empty History and a failed card say so, with no counts", () => {
    expect(
      page(cases["card-yours-empty"]).querySelector('[data-history="top-line"]')
        ?.textContent,
    ).toBe("No deals yet.");
    const failed = page(cases["card-theirs-failed"]);
    expect(failed.querySelector('[data-history="top-line"]')?.textContent).toBe(
      words["card.failed"],
    );
    expect(
      failed.querySelector("[data-proof]")?.getAttribute("data-proof"),
    ).toBe("failed");
  });
});

describe("caller text stays text", () => {
  it("an item with markup and quotes is drawn as text", () => {
    const input = clone(cases["card-yours"]) as Json;
    const deals = input["deals"] as Record<string, Json>;
    const id = Object.keys(deals)[0]!;
    deals[id]!["item"] = `"><script>alert(1)</script> & <b>`;
    const html = historyViewHtml(input);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;".replace("&quot;", '"'));
    const p = page(input);
    expect(p.querySelector("script, b")).toBeNull();
  });

  it("an amount or time cannot carry markup into an attribute", () => {
    const input = clone(cases["card-yours"]) as Json;
    const deals = input["deals"] as Record<string, Json>;
    const id = Object.keys(deals)[0]!;
    deals[id]!["recorded"] = {
      state: "passed",
      at: '2026-11-27T03:12:00Z"><x',
    };
    expect(buildHistoryView(input).ok).toBe(false);
  });
});

describe("times", () => {
  it("static pages say UTC; a scripted page rewrites each time into the reader's zone and says so", () => {
    const input = cases["card-yours"];
    const utc = page(input, { localTime: false });
    expect(utc.querySelector('[data-history="times"]')?.textContent).toBe(
      "Times are in UTC.",
    );
    const local = page(input);
    expect(local.querySelector('[data-history="times"]')?.textContent).toBe(
      "Times are in your time zone.",
    );
    const fmt = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    const times = [...local.querySelectorAll("time[data-time]")];
    expect(times.length).toBeGreaterThan(0);
    for (const t of times)
      expect(t.textContent).toBe(
        fmt.format(new Date(t.getAttribute("datetime")!)),
      );
  });

  it("pages without card times are not touched by the scripted rewrite", () => {
    const input = cases["muse-owner"];
    const div = document.createElement("div");
    renderHistoryView(
      input,
      div,
      readJson("vectors/history-view/overlay.json"),
    );
    expect(div.innerHTML).toBe(
      historyViewHtml(input, readJson("vectors/history-view/overlay.json")),
    );
  });
});

describe("one source with the receipt", () => {
  const receipt = readFileSync(
    join(root, "go/receipt/receipt_core.js"),
    "utf8",
  );
  const receiptWords = readJson("go/receipt/wording-en.json") as {
    entries?: Record<string, string>;
  } & Record<string, unknown>;
  const rw = (receiptWords.entries ?? receiptWords) as Record<string, string>;

  it("draws the receipt's own seal shapes", () => {
    const body = /var SEAL_BODY = (\[[\s\S]*?\n {2}\]);/u.exec(receipt)?.[1];
    const moods = /var SEAL_MOODS = (\{[\s\S]*?\n {2}\});/u.exec(receipt)?.[1];
    expect(body && moods).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const read = (src: string): unknown => new Function(`return (${src});`)();
    expect(read(body!)).toEqual(SEAL_SHAPES.body);
    expect((read(moods!) as Record<string, unknown>)["not_as_agreed"]).toEqual(
      SEAL_SHAPES.moods["not_as_agreed"],
    );
  });

  it("says what the receipt says where it means the same", () => {
    const same: [string, string][] = [
      ["card.tag.private", "deal.surface.tag.private"],
      ["card.tag.shared", "deal.surface.tag.shared"],
      ["card.stamp.recorded", "deal.stamp.recorded"],
      ["card.stamp.recorded.filled", "deal.stamp.recorded.filled"],
      ["card.stamp.recorded.partial", "deal.stamp.recorded.partial"],
      ["card.stamp.recorded.open", "deal.stamp.recorded.open"],
      ["card.stamp.recorded.not_checked", "deal.stamp.recorded.not_checked"],
      ["card.stamp.recorded.failed", "deal.stamp.recorded.failed"],
      ["card.stamp.time_stamped", "deal.stamp.time_stamped"],
      ["card.stamp.time_stamped.open", "deal.stamp.time_stamped.open"],
      [
        "card.stamp.time_stamped.not_checked",
        "deal.stamp.time_stamped.not_checked",
      ],
      ["card.stamp.time_stamped.failed", "deal.stamp.time_stamped.failed"],
      ["card.stamp.countersigned", "deal.stamp.countersigned"],
      ["card.stamp.countersigned.open", "deal.stamp.countersigned.open"],
      [
        "card.stamp.countersigned.not_checked",
        "deal.stamp.countersigned.not_checked",
      ],
      ["card.stamp.countersigned.failed", "deal.stamp.countersigned.failed"],
      ["card.proof.heading", "deal.section.proof"],
      ["card.proof.lede.passed", "deal.proof.lede.passed"],
      ["card.proof.lede.partial", "deal.proof.lede.partial"],
      ["card.proof.lede.failed", "deal.proof.lede.failed"],
      ["card.proof.producer_signatures", "deal.proof.producer_signatures"],
      ["card.proof.interval_coverage", "deal.proof.interval_coverage"],
      ["card.proof.graph_closure", "deal.proof.graph_closure"],
      ["card.proof.checkpoint", "deal.proof.checkpoint"],
      ["card.proof.witness.open", "deal.proof.witness.open"],
      ["card.proof.witness.failed", "deal.proof.witness.failed"],
      ["card.proof.status.pass", "deal.proof.status.pass"],
      ["card.proof.status.fail", "deal.proof.status.fail"],
      ["card.proof.status.absent", "deal.proof.status.absent"],
      ["card.proof.status.withheld", "deal.proof.status.withheld"],
      ["card.check.title", "deal.check.title"],
      ["card.check.expect", "deal.check.expect"],
      ["card.not_proven.heading", "deal.section.not_proven"],
      ["card.not_proven.who.owner", "deal.not_proven.who"],
      ["card.footer.local", "deal.footer.times"],
      ["card.row.ruled", "deal.top.ruled_not_met"],
      ["card.row.in_dispute", "deal.top.in_dispute"],
      ["card.row.in_disagreement", "deal.top.in_disagreement"],
      ["card.row.not_due", "deal.top.all.not_due"],
      ["card.row.not_reached", "deal.top.all.not_reached"],
      ["card.seal.not_as_agreed", "deal.seal.not_as_agreed"],
    ];
    for (const [ours, theirs] of same)
      expect([ours, words[ours]]).toEqual([ours, rw[theirs]]);
  });
});

describe("round 1 of the review", () => {
  it("amounts: msat below a sat stays msat, whole sats read as sat, other assets as decimals", () => {
    const btc = (value: string) =>
      amountText({ value, code: "BTC", scale: 11 });
    expect([
      btc("0"),
      btc("1"),
      btc("999"),
      btc("1000"),
      btc("1001"),
      btc("2000000"),
    ]).toEqual([
      "0 sat",
      "1 msat",
      "999 msat",
      "1 sat",
      "1,001 msat",
      "2,000 sat",
    ]);
    expect(amountText({ value: "1", code: "BTC", scale: 8 })).toBe("1 sat");
    expect(amountText({ value: "1999", code: "USD", scale: 2 })).toBe(
      "19.99 USD",
    );
    const caip = "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    expect(amountText({ value: "5", code: caip, scale: 30 })).toBe(
      `0.${"0".repeat(29)}5 ${caip}`,
    );
  });

  it("a CAIP-19 amount with a large scale does not refuse the page", () => {
    const input = clone(cases["card-yours"]) as Json;
    const deals = input["deals"] as Record<string, Json>;
    deals[Object.keys(deals)[0]!]!["amount"] = {
      value: "5",
      assetCode: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      assetScale: 200,
    };
    expect(buildHistoryView(input).ok).toBe(true);
  });

  it("a stamp covering part of the steps says how far and is not drawn filled", () => {
    const input = clone(cases["card-yours"]) as Json;
    const deals = input["deals"] as Record<string, Json>;
    const id = Object.keys(deals)[0]!;
    const through = { k: 2, n: 4 };
    deals[id] = {
      recorded: { state: "passed", at: "2026-11-27T03:12:00Z", through },
      time_stamped: {
        state: "passed",
        by: "W",
        at: "2026-11-27T03:13:00Z",
        through,
      },
      countersigned: {
        state: "passed",
        by: "C",
        at: "2026-11-27T03:14:00Z",
        through,
      },
    };
    const row = [
      ...page(input, { localTime: false }).querySelectorAll(
        '[data-history="row"]',
      ),
    ].find((r) => r.textContent?.includes("Countersigned through"))!;
    const stamps = [...row.querySelectorAll(".cvh-stamp")];
    expect(stamps.map((s) => s.getAttribute("data-filled"))).toEqual([
      "no",
      "no",
      "no",
    ]);
    expect(stamps.map((s) => s.getAttribute("data-state"))).toEqual([
      "partial",
      "partial",
      "partial",
    ]);
    expect(stamps.map((s) => s.textContent)).toEqual([
      "RECORDEDCheckpointed through step 2 of 4 · Nov 27, 2026, 03:12 UTC",
      "TIME-STAMPEDW · Time-stamped through step 2 of 4 · Nov 27, 2026, 03:13 UTC",
      "COUNTERSIGNEDC signed this record too · Countersigned through step 2 of 4 · Nov 27, 2026, 03:14 UTC",
    ]);
  });

  it("a term's words follow its value; final met terms read as went as agreed", () => {
    const text =
      page(cases["card-yours"], { localTime: false }).textContent ?? "";
    expect(text).toContain("not met, not contested");
    expect(text).toContain("both say it was not met");
    const input = clone(cases["card-yours"]) as Json;
    const machine = input["machine"] as Json;
    const doc = JSON.parse(machine["text"] as string) as Json;
    const block = (doc["extensions"] as Json)["x-standard-history/v0"] as {
      deals: Json[];
    };
    block.deals = [
      {
        ...block.deals[0],
        rows: [
          { owed_by: "holder", status: "uncontested", value: "met" },
          {
            owed_by: "counterparty",
            status: "ruled",
            value: "met",
            remedy: "none",
          },
        ],
      },
    ];
    machine["text"] = new TextDecoder().decode(jcs(doc));
    (machine["verify"] as Json)["bundle_digest"] = sha256Hex(
      machine["text"] as string,
    );
    delete input["deals"];
    const row = page(input).querySelector('[data-history="row-line"]');
    expect(row?.textContent).toBe("Went as agreed: every term ended as met");
  });

  it("what the signature shows is said only when its check passed", () => {
    const note = (producer: string) => {
      const input = clone(cases["card-theirs"]) as Json;
      const v = (input["machine"] as Json)["verify"] as Json;
      (v["checks"] as Json)["producer_signatures"] = producer;
      if (producer === "fail") v["verdict"] = "INVALID";
      return page(input).querySelector("[data-signature]")?.textContent;
    };
    expect(note("pass")).toBe(words["card.signed.note"]);
    expect(note("fail")).toBe(words["card.signed.failed"]);
    expect(note("withheld")).toBe(words["card.signed.unchecked"]);
  });

  it("a failed witness check is not summed up as every test passing", () => {
    const p = page(cases["card-yours-v1"]);
    expect(p.querySelector("[data-proof]")?.getAttribute("data-proof")).toBe(
      "failed",
    );
  });

  it("a card whose outcomes carry a member SH does not have is refused", () => {
    const input = clone(cases["card-theirs"]) as Json;
    const machine = input["machine"] as Json;
    const doc = JSON.parse(machine["text"] as string) as Json;
    const root = (doc["records"] as Json[])[0]!;
    const card = (
      (doc["disclosures"] as Json)[root["capsule_id"] as string] as Json
    )["agent_input"] as Json;
    (card["outcomes"] as Json)["percent_held"] = 50;
    machine["text"] = new TextDecoder().decode(jcs(doc));
    (machine["verify"] as Json)["bundle_digest"] = sha256Hex(
      machine["text"] as string,
    );
    const built = buildHistoryView(input);
    expect(built.ok ? [] : built.reasons).toEqual([
      "input.machine.text: its card's outcomes carry a member SH §4 does not have",
    ]);
  });

  it("the exported type describes both perspectives", () => {
    const theirs: HistoryCardInput = cases[
      "card-theirs"
    ] as unknown as HistoryCardInput;
    const yours: HistoryCardInput = {
      ...(cases["card-yours"] as unknown as HistoryCardInput),
      deals: {
        "deal-301": {
          item: "Badges",
          receipt: "r.html",
          recorded: { state: "none" },
        },
      },
    };
    expect(buildHistoryView(theirs).ok).toBe(true);
    expect(buildHistoryView(yours).ok).toBe(true);
  });
});
