// SPDX-License-Identifier: Apache-2.0
// The History card page's registration line (capsule-viewer#342; agent-action-capsule
// spec/standard-history-v0.md section 13): the module draws the runtime's
// readerCardRegistered answer beside the level reached, as existence at a time and
// nothing else. The check itself is AAC's, run by ts/test/card-registration.test.ts.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { standInContext } from "./aacContext.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = readFileSync(join(ROOT, "src", "capsule_viewer", "static", "standard_history_card.js"), "utf8");
const DATA = join(ROOT, "tests", "testdata", "standard-history");
const EXT = "x-standard-history/v0";
const clone = (v) => JSON.parse(JSON.stringify(v));
const bundleOf = (name) => JSON.parse(readFileSync(join(DATA, `${name}.bundle.json`), "utf8"));
const verifyOf = (name) => JSON.parse(readFileSync(join(DATA, "verify", `${name}.json`), "utf8"));
const KEY = "1bbf5cb0ca89" + "0".repeat(52);
const STATEMENTS = ["d28458", "d28459"];

function load(eg = {}) {
  const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", { runScripts: "outside-only" });
  const registered = [];
  dom.window.EvidenceGraph = { registerPresentation: (m) => registered.push(m), ...eg };
  dom.window.eval(SCRIPT);
  return { window: dom.window, document: dom.window.document, registered, api: dom.window.CapsuleViewerStandardHistory };
}

function contextOf(name, statements) {
  const bundle = bundleOf(name);
  if (statements !== undefined) bundle.extensions[EXT].card_statements = statements;
  return standInContext(bundle, { verify: verifyOf(name) });
}

function renderAll(l, model, depth = "L2") {
  const doc = l.document;
  const host = { L0: doc.createElement("div"), L1: doc.createElement("div"), L2: doc.createElement("div"), depth };
  doc.body.replaceChildren(host.L0, host.L1, host.L2);
  l.registered[0].render(model, host, {});
  return host;
}
const text = (host) => [host.L0, host.L1, host.L2].map((r) => r.textContent).join("\n");

// The page for one runtime answer; `seen` records what the runtime was handed.
async function page({ answer, name = "person-shared", statements = STATEMENTS, signature = { status: "PASS", key_id: KEY } } = {}) {
  if (statements === null) statements = undefined; // null: the block carries no card_statements
  const seen = [];
  const eg = { readerCardSignature: () => Promise.resolve(signature) };
  if (answer !== undefined) {
    eg.readerCardRegistered = (context, given) => {
      seen.push(given);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    };
  }
  const l = load(eg);
  const model = await l.registered[0].buildModel(contextOf(name, statements));
  return { l, model, host: renderAll(l, model), seen };
}
const registration = (host) => host.L0.querySelector("[data-sh-registration]");
const row = (host, p) => host.L2.querySelector(`[data-property="${p}"]`);

const PASS = { status: "PASS", service: "service-a", registration_time: 1795190400, statements: [], key_id: KEY };

describe("a passing statement on a standard card", () => {
  it("says the key the card is signed with registered it with the service, at the time, and nothing more", async () => {
    const { model, host, seen } = await page({ answer: PASS });
    expect(model.state).toBe("card");
    expect(seen).toEqual([STATEMENTS]);
    expect(registration(host).getAttribute("data-sh-registration")).toBe("line");
    expect(registration(host).textContent).toBe(
      "Registered with service-a at Nov 20, 2026 16:00 UTC by the key this card is signed with" +
        "This shows the card existed by then. It does not show that the service checked the counts, the deals or the anchor, or that this is the only card that key registered.",
    );
    expect(text(host)).toContain("That the service checked anything in the card, or that this is the only card its key registered.");
  });
  it("with no registration time, names the service and no time, and does not say 'by then'", async () => {
    const { host } = await page({ answer: { ...PASS, registration_time: null } });
    expect(registration(host).firstChild.textContent).toBe("Registered with service-a by the key this card is signed with");
    expect(registration(host).lastChild.textContent).toBe(
      "This shows the card existed when the service logged it; the Receipt states no time. It does not show that the service checked the counts, the deals or the anchor, or that this is the only card that key registered.",
    );
    expect(registration(host).textContent).not.toContain("by then");
  });
  it("is a row beside the properties, and never a level or a change to anchor_inclusion", async () => {
    const { host } = await page({ answer: PASS });
    expect(row(host, "card_registered").getAttribute("data-property-status")).toBe("PASS");
    expect(row(host, "anchor_inclusion").getAttribute("data-property-status")).toBe("NOT_CHECKED");
    expect(row(host, "anchor_inclusion").lastChild.textContent).toBe("not checked here");
  });
  it("never says the holder registered, that a service saw the counts, or that it is the only card", async () => {
    const { host } = await page({ answer: PASS });
    const line = registration(host).textContent;
    expect(line).not.toMatch(/\bholder\b/i);
    expect(line).not.toMatch(/\b(confirmed|verified|saw|unique|only card that)\b.*\b(counts|deals)/i);
  });
});

describe("Sherlock2's owed test: registration changes no level and no anchor_inclusion", () => {
  // The page without what registration adds: its line, its row, its item under "What it doesn't" and the list of accepted services.
  const strip = (host) =>
    [host.L0, host.L1, host.L2]
      .map((region) => {
        const part = region.cloneNode(true);
        part.querySelectorAll("[data-sh-registration],[data-property=card_registered],[data-sh-witness-list=true]").forEach((n) => n.remove());
        part.querySelectorAll("li").forEach((n) => n.textContent.startsWith("That the service checked anything") && n.remove());
        return part.textContent;
      })
      .join("\n");
  it("a verified card with and without a passing statement has the same properties, anchor_inclusion and page", async () => {
    const without = await page({ answer: PASS, statements: null });
    const withIt = await page({ answer: PASS });
    expect(withIt.model.properties).toEqual(without.model.properties);
    expect(row(withIt.host, "anchor_inclusion").outerHTML).toBe(row(without.host, "anchor_inclusion").outerHTML);
    expect(registration(without.host)).toBeNull();
    expect(row(without.host, "card_registered")).toBeNull();
    expect(withIt.host.L0.getAttribute("data-sh-state")).toBe(without.host.L0.getAttribute("data-sh-state"));
    expect(strip(withIt.host)).toBe(strip(without.host));
  });
});

describe("a statement that does not pass, or was not checked", () => {
  it("a failing statement says one came and did not pass, and never that the card was registered", async () => {
    const { host } = await page({ answer: { status: "FAIL", service: null, registration_time: null, statements: [], key_id: KEY } });
    expect(registration(host).getAttribute("data-sh-registration")).toBe("failed");
    expect(registration(host).textContent).toBe("A card statement came with the card and failed its check. The card's own checks above are unaffected.");
    expect(text(host)).not.toMatch(/registered with/i);
    expect(row(host, "card_registered").getAttribute("data-property-status")).toBe("FAIL");
    expect(row(host, "card_registered").firstChild.textContent).toBe("Registration with a service you accept");
  });
  it("a statement this page could not check, a runtime without the check, an error or a malformed answer says one came, never a pass", async () => {
    const answers = [
      { status: "NOT_CHECKED", service: null, registration_time: null, statements: [], key_id: null },
      { status: "NOT_PRESENT", service: null, registration_time: null, statements: [], key_id: null },
      { status: "MAYBE" },
      { status: "PASS" },
      null,
      new Error("boom"),
      undefined,
    ];
    for (const answer of answers) {
      const { host } = await page({ answer });
      expect(registration(host).getAttribute("data-sh-registration")).toBe("came");
      expect(registration(host).textContent).toBe("A card statement came with the card. This page has not checked it against a service you accept.");
      expect(text(host)).not.toMatch(/Registered with/);
      expect(row(host, "card_registered").getAttribute("data-property-status")).toBe("NOT_CHECKED");
    }
  });
  it("draws nothing for a card with no statement, and asks the runtime nothing", async () => {
    for (const statements of [null, []]) {
      const { host, seen } = await page({ answer: PASS, statements });
      expect(registration(host)).toBeNull();
      expect(row(host, "card_registered")).toBeNull();
      expect(seen).toEqual([]);
      expect(text(host)).not.toMatch(/card statement|Registered with/);
    }
  });
});

describe("a card that is not drawn as a standard card never says it was registered", () => {
  it("a refused card with a passing answer says only that a statement came, in the line and in the row", async () => {
    const { model, host } = await page({ answer: PASS, name: "neg-percentage-member" });
    expect(model.state).toBe("refused");
    expect(text(host)).not.toMatch(/registered with/i);
    expect(host.L0.querySelector('[data-sh-registration="came"]')).not.toBeNull();
    expect(row(host, "card_registered").getAttribute("data-property-status")).toBe("NOT_CHECKED");
  });
  it("a refused card whose statement failed says it failed its check, never that it was not checked", async () => {
    const { host } = await page({ answer: { status: "FAIL", service: null, registration_time: null, statements: [], key_id: KEY }, name: "neg-percentage-member" });
    expect(host.L0.querySelector('[data-sh-registration="failed"]').textContent).toBe("A card statement came with the card and failed its check. The card's own checks above are unaffected.");
    expect(text(host)).not.toContain("has not checked it");
    expect(row(host, "card_registered").getAttribute("data-property-status")).toBe("FAIL");
  });
  it("a card whose signature fails draws no registration at all", async () => {
    const { model, host } = await page({ answer: PASS, signature: { status: "FAIL", key_id: null } });
    expect(model.state).toBe("signature_failed");
    expect(registration(host)).toBeNull();
  });
});

describe("the block member", () => {
  it("a malformed card_statements never makes the card unreadable: it is a statement that fails", async () => {
    for (const bad of ["not an array", [1, null, {}], [""]]) {
      const { model, seen } = await page({ answer: { status: "FAIL", service: null, registration_time: null, statements: [], key_id: KEY }, statements: bad });
      expect(model.state).toBe("card");
      expect(seen[0].every((s) => s === "")).toBe(true);
    }
  });
  it("any other unknown member still makes the block unreadable", () => {
    const bundle = bundleOf("person-shared");
    bundle.extensions[EXT].card_statement = STATEMENTS;
    const l = load();
    expect(clone(l.api.buildModelSync(standInContext(bundle, { verify: verifyOf("person-shared") }))).state).toBe("unreadable");
  });
  it("saving the list twice through the page's own buttons asks the runtime again each time, with the context", async () => {
    const calls = [];
    const l = load({
      readerCardSignature: () => Promise.resolve({ status: "PASS", key_id: KEY }),
      readerWitnessPolicy: () => ({ witnesses: [] }),
      setReaderWitnessPolicy: () => true,
      readerCardRegistered: (context, given) => {
        calls.push([context, given]);
        return Promise.resolve(PASS);
      },
    });
    const context = contextOf("person-shared", STATEMENTS);
    const model = await l.registered[0].buildModel(context);
    const host = renderAll(l, model);
    const flush = () => new Promise((r) => setTimeout(r, 20));
    for (const button of ["save", "reset", "save"]) {
      host.L2.querySelector(`[data-sh-witness-list="${button}"]`).click();
      await flush();
      expect(registration(host).getAttribute("data-sh-registration")).toBe("line");
    }
    expect(calls.length).toBe(4);
    expect(calls.every(([c, given]) => c === context && JSON.stringify(given) === JSON.stringify(STATEMENTS))).toBe(true);
  });
  it("a redraw for a new list asks the runtime again, for the same statements", async () => {
    const { l, model, seen } = await page({ answer: PASS });
    const again = await l.api.withRegistration(await l.api.withWitness(model.pre || model), model.context);
    expect(seen.length).toBe(2);
    expect(seen[1]).toEqual(STATEMENTS);
    expect(again.registration.status).toBe("PASS");
  });
});
