// The x-deal-v1 keep page as Steven's ARD hand run (2026-11-25) read it, on that run's own deal: the
// counterparty copy of deal-fe219bb1ab3d4dec (tests/testdata/deal-v1/counterparty-copy.bundle.json), a
// paid deal whose two terms both read met, with its real book. Five findings, one test or more each:
//   #429 the Side column and the term ids wrapped ("buye / r", "paid_as_agre / ed"): terms in words,
//        and a side or term name never breaks inside a word (headless Chromium, below);
//   #430 "Where it stands: Started" beside two terms met: the line also says where the terms stand;
//   #431 the records table showed raw UTC: it says each time as the header does;
//   #432 "No payment record is among the records" on a paid deal: one line says why;
//   #424 "Time from a named witness: yes" while the page checked no witness receipt: on the holder's
//        own page the yes says it is "your report"'s; any other copy shows no record time and no
//        named-witness column (Sherlock2, u239).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOSE_TIMEOUT_MS, findChrome, launch } from "./headlessChrome.js";
import { loadScript, manifestOf, renderInto, RECEIPT_DIR, ROOT } from "./receiptScripts.js";

const DATA = join(ROOT, "tests", "testdata", "deal-v1");
const SHARED = JSON.parse(readFileSync(join(DATA, "counterparty-copy.bundle.json"), "utf8"));
const REPORT = SHARED.extensions["x-deal-report/v0"].agent_input;

// The run's copy with its report edited by *edit* and its book by *editBook* (the page rechecks no
// digest: capsulectl's check is given).
function context(edit = (c) => c, editBook = () => {}) {
  const content = edit(structuredClone(REPORT));
  const ext = structuredClone(SHARED.extensions);
  ext["x-deal-report/v0"] = { record: ext["x-deal-report/v0"].record, agent_input: content };
  editBook(ext["x-deal-v1"].book);
  return { bundle: { records: [], extensions: ext }, records: [], resolvedDisclosures: new Map(), root: null, completeness: { memberships: {} } };
}
const env = (audience) => ({
  audience,
  verification: () => ({ verifier: "test", outcome: "verified", checks: [] }),
  assurance: () => ({ bundle_digest: "ab".repeat(32), witnesses: "withheld", countersignatures: [], report_checked: "pass" }),
});
async function page(edit, depth = "L2", editBook, carrier) {
  const lib = loadScript("deal");
  const module = lib.api.createModule("deal", env(null));
  const ctx = context(edit, editBook);
  expect(await module.canRender(ctx)).toBe(true);
  const model = await module.buildModel(ctx);
  if (!carrier) return { lib, model, host: renderInto(lib, module, model, depth) };
  // Drawn inside a page or report shown to others (data-receipt-carrier).
  const doc = lib.document;
  const outer = doc.createElement("div");
  outer.setAttribute("data-receipt-carrier", carrier);
  const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth };
  outer.append(host.L0, host.L1, host.L2);
  module.render(model, host, {});
  return { lib, model, host };
}
// The run's copy as its holder's own (keep) copy.
const asKeep = (c) => ({ ...c, audience: "keep" });
// The table whose column headers are *head*, as rows of cell text.
function table(root, head) {
  const t = [...root.querySelectorAll("table")].find((x) => [...x.querySelectorAll("th")].map((th) => th.textContent).join("|") === head.join("|"));
  if (!t) return null;
  return [...t.querySelectorAll("tbody tr")].map((tr) => [...tr.children]);
}
const BASIS = ["Term", "Record", "Side", "Time", "Time from a named witness"];
const WHY = {
  statements: "These terms rest only on what the sides say, not on a payment record, so this page does not show or check a payment.",
  mixed: "These terms rest on what the sides say and on other deal records. None is a payment record, so this page does not show or check a payment.",
  other: "These terms rest on deal records, none of them a payment record, so this page does not show or check a payment.",
  no_records: "No term's status rests on any record yet, so there is no payment record to show.",
};
// Steven's run, drawn while the contest window was still open: both terms met so far, not settled yet.
const openWindow = (c) => ({ ...c, settled: false, rows: c.rows.map((r) => ({ ...r, status: "agreed_so_far" })) });

describe("the x-deal-v1 page of the ARD run's deal", () => {
  it("#429: names each term in words, keeps its id on the element, and words each side", async () => {
    const { host } = await page(asKeep);
    const rows = table(host.L1, ["Term", "Owed by", "Status", "Due", "Contest window ends", "Detail"]);
    expect(rows.map((r) => [r[0].textContent, r[1].textContent])).toEqual([["Payment as agreed", "buyer"], ["Delivery", "seller"]]);
    const term = rows[0][0].querySelector("[data-row-id]");
    expect([term.getAttribute("data-row-id"), term.getAttribute("title"), term.className]).toEqual(["paid_as_agreed", "paid_as_agreed", "cv-receipt-word"]);
    expect(rows[0][1].querySelector(".cv-receipt-word").getAttribute("data-side")).toBe("buyer");
    const basis = table(host.L2, BASIS);
    expect(basis.map((r) => [r[0].textContent, r[2].textContent])).toEqual([
      ["Payment as agreed", "buyer"], ["Payment as agreed", "seller"], ["Delivery", "buyer"], ["Delivery", "seller"],
    ]);
    for (const r of basis) for (const i of [0, 2]) expect(r[i].querySelector(".cv-receipt-word")).not.toBeNull();
    expect(host.L1.textContent + host.L2.textContent).not.toContain("paid_as_agreed");
  });

  it("#429: a term id the pack does not word is shown as it is, in the id's own type", async () => {
    const { host } = await page((c) => ({ ...c, rows: [{ ...c.rows[0], id: "on_time" }] }));
    const cell = table(host.L1, ["Term", "Owed by", "Status", "Due", "Contest window ends", "Detail"])[0][0];
    expect(cell.textContent).toBe("on_time");
    expect(cell.querySelector('[data-row-id="on_time"]').className).toBe("cv-mono");
  });

  it("#429: the receipt's own stylesheet goes in once, scoped to a receipt, as the manifest's third pin", async () => {
    const { lib } = await page();
    const styles = lib.document.querySelectorAll("#cv-receipt-css");
    expect(styles.length).toBe(1);
    const css = readFileSync(join(RECEIPT_DIR, "receipt.css"), "utf8");
    expect(styles[0].textContent).toBe(css);
    expect(css).toContain("[data-receipt-module] .cv-receipt-word { overflow-wrap: normal; }");
    const { createHash } = await import("node:crypto");
    expect(manifestOf("deal").executable.style_sha256[2]).toBe(createHash("sha256").update(css, "utf8").digest("hex"));
  });

  it("#430: a started deal not yet settled says where its terms stand, beside the start state", async () => {
    const { host } = await page(openWindow, "L0");
    const state = host.L0.querySelector("[data-deal-state]");
    expect(state.getAttribute("data-deal-state")).toBe("started");
    // The deal-level line stays start.state (section 9); the terms' count sits beside it, outside it.
    expect(state.textContent).toBe("Started");
    expect(state.querySelector("[data-deal-terms]")).toBeNull();
    expect(host.L0.querySelector("[data-deal-terms]").textContent).toBe("Terms: Both say the same so far (2 of 2)");
    expect(host.L0.querySelector(".cv-metric__value").textContent).toBe("Started · Terms: Both say the same so far (2 of 2)");
    expect(host.L0.querySelector("[data-settled]")).toBeNull();
    expect(host.L0.textContent).not.toMatch(/closed|close\b|done/i);
  });

  it("#430: mixed statuses are each counted in the rows' order; a settled deal says settled and no tally", async () => {
    const mixed = await page((c) => ({ ...c, settled: false, rows: [{ ...c.rows[0], status: "waiting", value: null }, { ...c.rows[1], status: "agreed_so_far" }] }), "L0");
    expect(mixed.host.L0.querySelector("[data-deal-terms]").textContent).toBe("Terms: Waiting for the other side (1 of 2); Both say the same so far (1 of 2)");
    const settled = await page(undefined, "L0");
    expect(settled.host.L0.querySelector("[data-settled]")).not.toBeNull();
    expect(settled.host.L0.querySelector("[data-deal-terms]")).toBeNull();
    // A deal that has not started has no terms to count.
    const none = await page((c) => ({ ...c, start: { state: "awaiting_agreement", local: false, by: null }, settled: false, rows_state: "not_started", rows: [] }), "L0");
    expect(none.host.L0.querySelector("[data-deal-terms]")).toBeNull();
  });

  it("#431: the records table says each time as the header does, the data keeping UTC", async () => {
    const { host } = await page(asKeep);
    const times = table(host.L2, BASIS).map((r) => r[3]);
    for (const cell of times) {
      expect(cell.querySelector("[data-time]").getAttribute("data-time")).toBe("2026-11-25T14:31:31Z");
      expect(cell.textContent).toBe("Nov 25, 2026, 14:31 UTC");
    }
    expect(host.L2.textContent).not.toContain("2026-11-25T14:31:31Z");
  });

  it("#432: on the paid deal, one line says the terms rest on the sides' statements, not a payment record", async () => {
    const { host } = await page();
    expect(host.L1.querySelector('[data-legs="none"]').textContent).toBe("No payment record is among the records the terms' statuses rest on.");
    expect(host.L1.querySelector("[data-legs-why]").getAttribute("data-legs-why")).toBe("statements");
    expect(host.L1.querySelector("[data-legs-why]").textContent).toBe(WHY.statements);
  });

  it("#432: terms resting on no record yet, or on other records, each say so; never of each term", async () => {
    const noRecords = (c) => ({ ...c, rows: c.rows.map((r) => ({ ...r, status: "not_due", value: null, relied_on: [] })) });
    const empty = await page(noRecords, "L1", (book) => { book.relied_on = {}; });
    expect(empty.host.L1.querySelector("[data-legs-why]").textContent).toBe("No term's status rests on any record yet, so there is no payment record to show.");
    // One term rests on both statements, the other on none: the line speaks of the records, not each term.
    const half = await page((c) => ({ ...c, rows: [c.rows[0], { ...c.rows[1], status: "not_due", value: null, relied_on: [] }] }), "L1");
    expect(half.host.L1.querySelector("[data-legs-why]").getAttribute("data-legs-why")).toBe("statements");
    expect(half.host.L1.querySelector("[data-legs-why]").textContent).toBe(WHY.statements);
    // A book pair whose payload names another record type (a dispute, say), or none, is not a statement:
    // beside a statement the records are a mix; with no statement, other records.
    const typed = (types) => (book) => Object.values(book.relied_on).forEach((pair, i) => {
      const x = pair.payload["x-deal-v1"];
      if (types[i] === undefined) delete x.record_type;
      else x.record_type = types[i];
    });
    for (const [types, why] of [[["dispute", "statement"], "mixed"], [[undefined, "statement"], "mixed"], [["dispute", "dispute"], "other"]]) {
      const { host } = await page(undefined, "L1", typed(types));
      expect(host.L1.querySelector("[data-legs-why]").getAttribute("data-legs-why")).toBe(why);
      expect(host.L1.querySelector("[data-legs-why]").textContent).toBe(WHY[why]);
    }
    for (const text of Object.values(WHY)) expect(text).not.toMatch(/each term/i);
  });

  it("#432: a settle record the terms rest on that shows no leg gets no why line", async () => {
    const { host } = await page(undefined, "L1", (book) => { Object.values(book.relied_on)[0].payload["x-deal-v1"].record_type = "settle"; });
    expect(host.L1.querySelector('[data-legs="none"]')).not.toBeNull();
    expect(host.L1.querySelector("[data-legs-why]")).toBeNull();
  });

  it("#424: on the holder's own page the yes is said as the report's, never the page's own", async () => {
    const { host } = await page(asKeep);
    for (const r of table(host.L2, BASIS)) {
      expect(r[4].textContent).toBe("yes, as your report states it");
      expect(r[4].querySelector("[data-named-witness]").getAttribute("data-named-witness")).toBe("yes");
    }
    // A record with no named witness says no.
    const no = await page((c) => ({ ...asKeep(c), rows: c.rows.map((r) => ({ ...r, relied_on: r.relied_on.map((e) => ({ ...e, time: null, witnessed: false })) })) }));
    for (const r of table(no.host.L2, BASIS)) expect([r[3].textContent, r[4].textContent]).toEqual(["no time", "no"]);
    // The header still says the file carries no witness receipt the page checked.
    expect(host.L0.querySelector('[data-rung="witness"]').textContent).toBe("No outside time stamp: this copy carries no witness receipt.");
  });

  // Sherlock2, u239: a copy that is not the holder's own page lists the records each term rests on,
  // with no record time and no named-witness column, anywhere in L0 to L2.
  const RECORD_TIME = "2026-11-25T14:31:31Z";
  const noRecordTime = (host) => {
    for (const region of [host.L0, host.L1, host.L2]) {
      expect(region.querySelector(`[data-time="${RECORD_TIME}"]`)).toBeNull();
      expect(region.textContent).not.toMatch(/14:31|Time from a named witness|states it/);
    }
  };
  it("u239: the counterparty's copy, and the holder's copy carried for others, list the records without time or witness", async () => {
    for (const p of [await page(), await page(asKeep, "L2", undefined, "page"), await page(asKeep, "L2", undefined, "report")]) {
      const rows = table(p.host.L2, ["Term", "Record", "Side"]);
      expect(rows.map((r) => [r[0].textContent, r[2].textContent])).toEqual([
        ["Payment as agreed", "buyer"], ["Payment as agreed", "seller"], ["Delivery", "buyer"], ["Delivery", "seller"],
      ]);
      expect(table(p.host.L2, BASIS)).toBeNull();
      noRecordTime(p.host);
    }
  });
  it("u239: the adjudicator's copy draws no record time and no named-witness column", async () => {
    const adj = (c) => ({ ...c, audience: "adjudicator", rows_state: "withheld", rows: [] });
    const p = await page(adj);
    expect(p.host.L1.querySelector('[data-rows-state="withheld"]')).not.toBeNull();
    expect(table(p.host.L2, BASIS)).toBeNull();
    noRecordTime(p.host);
  });
});

// #429 in a real browser: kit.css lets a cell's text wrap anywhere, which squeezed "buyer" beside a
// 64-character record id. The page as drawn (its stylesheets, as the script inserts them) is opened at
// widths where the table is a table, and no word of a side or term cell may be split across lines.
const chromePath = findChrome();
if (!chromePath && process.env.CI) throw new Error("receipt_deal_v1_ard test: no Chromium found under CI; set CHROME_PATH");
if (!chromePath) console.warn("SKIPPED the Chromium part of receipt_deal_v1_ard.test.js: no Chromium found (set CHROME_PATH to run it)");

const SPLIT_WORDS = `(() => {
  const split = [];
  const labels = new Set(["Term", "Side", "Owed by", "Side, as the report names it"]);
  for (const td of document.querySelectorAll("td[data-label]")) {
    if (!labels.has(td.getAttribute("data-label"))) continue;
    const walk = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const re = /\\S+/g;
      for (let m = re.exec(n.data); m; m = re.exec(n.data)) {
        const r = document.createRange();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + m[0].length);
        if (r.getClientRects().length > 1) split.push(td.getAttribute("data-label") + ": " + m[0]);
      }
    }
  }
  return split;
})()`;

describe.skipIf(!chromePath)("#429 in headless Chromium: no side or term name breaks inside a word", () => {
  let browser, tab, dir;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "cv-deal-ard-"));
    browser = await launch(chromePath);
    tab = await browser.newPage();
  }, 150000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }, CLOSE_TIMEOUT_MS);

  for (const width of [720, 900, 1280]) {
    it(`at ${width}px`, async () => {
      const { lib, host } = await page(asKeep);
      const styles = [...lib.document.head.querySelectorAll("style")].map((s) => s.outerHTML).join("");
      const body = [host.L0, host.L1, host.L2].map((h) => h.innerHTML).join("").replace(/<details(?![^>]*\bopen\b)/g, "<details open");
      const file = join(dir, `ard-${width}.html`);
      writeFileSync(file, `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>receipt</title>${styles}</head><body class="cv-kit"><main class="cv-page">${body}</main></body></html>`);
      await tab.open(pathToFileURL(file).href, { width, media: "screen" });
      await tab.evaluate("document.fonts.ready.then(() => true)");
      expect(await tab.evaluate(`document.querySelectorAll('td[data-label="Side"]').length`)).toBe(4);
      expect(await tab.evaluate(SPLIT_WORDS)).toEqual([]);
    });
  }
});
