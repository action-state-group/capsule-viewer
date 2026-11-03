// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom
// The History view (docs/design/history-view.md, capsule-viewer#247): the
// vectors' goldens, static and scripted pages alike, the refusals, the page
// verdict, and the word gates (neutral banned terms, T8, the Muse snapshot).
//
// UPDATE_GOLDENS=1 npx vitest run test/history-view.test.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HISTORY_VIEW_WORDING,
  buildHistoryView,
  historyViewDocument,
  historyViewHtml,
  renderHistoryView,
} from "../src/history-view.js";

type Json = Record<string, unknown>;
const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string): Json =>
  JSON.parse(readFileSync(join(here, path), "utf8")) as Json;
const vectors = read("../../vectors/history-view/cases.json") as {
  cases: Record<string, Json>;
};
const overlay = read("../../vectors/history-view/overlay.json");
const goldens = join(here, "goldens", "history-view");
const write = process.env.UPDATE_GOLDENS === "1";
const overlayFor = (name: string): Json | undefined =>
  name.startsWith("muse-") ? overlay : undefined;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const mesh = (): Json => clone(vectors.cases["mesh-service-history"] as Json);

function textOf(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}

describe("the History view's vectors", () => {
  if (write) mkdirSync(goldens, { recursive: true });
  for (const [name, input] of Object.entries(vectors.cases)) {
    it(`${name} matches its golden`, () => {
      const html = historyViewHtml(input, overlayFor(name));
      const file = join(goldens, `${name}.html`);
      if (write)
        writeFileSync(
          file,
          historyViewDocument(
            input,
            overlayFor(name),
            `History view golden: ${name}`,
          ),
        );
      expect(
        historyViewDocument(
          input,
          overlayFor(name),
          `History view golden: ${name}`,
        ),
      ).toBe(readFileSync(file, "utf8"));
      expect(html.length).toBeGreaterThan(0);
    });

    it(`${name}: a scripted page draws the same HTML`, () => {
      const container = document.createElement("div");
      expect(renderHistoryView(input, container, overlayFor(name))).toBe(true);
      expect(container.innerHTML).toBe(
        historyViewHtml(input, overlayFor(name)),
      );
    });

    it(`${name}: words pass the gates`, () => {
      const text = textOf(
        historyViewHtml(input, overlayFor(name)),
      ).toLowerCase();
      // T8 (tests/testdata/history/t8-banned.json): no deal status phrase, no similarity claim.
      const t8 = JSON.parse(
        readFileSync(
          join(here, "../../tests/testdata/history/t8-banned.json"),
          "utf8",
        ),
      ) as {
        banned_deal_status: { phrases: string[] };
        similarity_claim: { patterns: string[] };
      };
      for (const phrase of t8.banned_deal_status.phrases)
        expect(text).not.toMatch(new RegExp(`\\b${phrase}\\b`, "u"));
      for (const pattern of t8.similarity_claim.patterns)
        expect(text).not.toMatch(new RegExp(pattern, "iu"));
      // The mesh console's banned terms (banned-terms.ts), even inside other words.
      if (input["surface"] === "neutral")
        for (const banned of [
          "countersign",
          "reputation",
          "score",
          "rating",
          "rank",
        ])
          expect(text).not.toContain(banned);
    });
  }
});

describe("the view's own pack", () => {
  it("holds neutral words only", () => {
    const all = Object.values(HISTORY_VIEW_WORDING.entries)
      .join("\n")
      .toLowerCase();
    for (const banned of [
      "countersign",
      "reputation",
      "score",
      "rating",
      "rank",
      "muse",
      "action state",
    ])
      expect(all).not.toContain(banned);
  });

  it("copies Muse's words as the vendored snapshot holds them", () => {
    const snapshot = read("./fixtures/history-view/muse-source.json") as {
      muse_commit: string;
      entries: Record<string, string>;
    };
    expect(HISTORY_VIEW_WORDING.provenance.muse_commit).toBe(
      snapshot.muse_commit,
    );
    for (const [key, source] of Object.entries(
      HISTORY_VIEW_WORDING.provenance.sources,
    ))
      expect(
        (HISTORY_VIEW_WORDING.entries as Record<string, string>)[key],
        key,
      ).toBe(snapshot.entries[source]);
  });
});

describe("refusals", () => {
  const refused = (input: unknown, ov?: unknown): readonly string[] => {
    const built = buildHistoryView(input, ov);
    expect(built.ok).toBe(false);
    expect(() => historyViewHtml(input, ov)).toThrow(/history-view refused/u);
    const container = document.createElement("div");
    expect(renderHistoryView(input, container, ov)).toBe(false);
    expect(
      container.querySelector('[data-history="refused"]')?.textContent,
    ).toContain("This page can't show this history");
    return built.ok ? [] : built.reasons;
  };

  it("an unknown member", () => {
    expect(refused({ ...mesh(), filled: true }).join()).toContain(
      "input.filled",
    );
  });
  it("an unknown check id", () => {
    const m = mesh();
    (m["checks"] as Json[]).push({ id: "trust_me", status: "pass" });
    expect(refused(m).join()).toContain("checks[");
  });
  it("a passed witness slot without at", () => {
    const m = mesh();
    ((m["rows"] as Json[])[0] as Json)["witness"] = {
      state: "passed",
      by: "w",
    };
    expect(refused(m).join()).toContain("a passed slot needs at");
  });
  it("a passed second-signature slot without by", () => {
    const m = mesh();
    ((m["rows"] as Json[])[0] as Json)["second_signature"] = {
      state: "passed",
      at: "2026-11-03T12:00:00Z",
    };
    expect(refused(m).join()).toContain("needs by");
  });
  it("an unknown setting value", () => {
    const m = mesh();
    (m["sharing"] as Json)["history_segments"] = "prospective";
    expect(refused(m).join()).toContain("history_segments");
  });
  it("a stated setting of the wrong type", () => {
    const m = mesh();
    (m["sharing"] as Json)["record_at_completion"] = null;
    expect(refused(m).join()).toContain("record_at_completion");
  });
  it("a checkpoint page with no sharing member at all", () => {
    const m = mesh();
    m["sharing"] = "yes";
    expect(refused(m).length).toBeGreaterThan(0);
    delete m["sharing"];
    expect(refused(m).join()).toContain("input.sharing");
  });
  it("a row of another kind", () => {
    const m = mesh();
    ((m["rows"] as Json[])[0] as Json)["kind"] = "deal";
    expect(refused(m).length).toBeGreaterThan(0);
  });
  it("an overlay on a neutral page", () => {
    expect(refused(mesh(), overlay).join()).toContain(
      "a neutral page takes no overlay",
    );
  });
  it("an overlay with an unknown key or a changed placeholder", () => {
    const muse = clone(vectors.cases["muse-owner"]);
    expect(
      refused(muse, { id: "x", entries: { "stamp.filled": "YES" } }).join(),
    ).toContain("overlay.entries.stamp.filled");
    expect(
      refused(muse, { id: "x", entries: { "row.opened": "Opened" } }).join(),
    ).toContain("placeholders");
  });
  it("a malformed time", () => {
    expect(refused({ ...mesh(), built_at: "yesterday" }).join()).toContain(
      "built_at",
    );
  });
});

describe("the stand-in's round 1 (PR 249)", () => {
  const page = (input: unknown, ov?: unknown): HTMLElement => {
    const container = document.createElement("div");
    renderHistoryView(input, container, ov);
    return container;
  };
  const hero = (p: HTMLElement): string =>
    p.querySelector('[data-history="hero"]')?.textContent ?? "";

  it("names every signature only when the answer's own and the key passed too", () => {
    expect(hero(page(vectors.cases["mesh-service-history"]))).toContain(
      "every checkpoint signature checks",
    );
    expect(hero(page(vectors.cases["mesh-service-history"]))).not.toContain(
      "every signature checks",
    );
    expect(hero(page(vectors.cases["mesh-every-signature"]))).toContain(
      "every signature checks, including the answer's own, by the node's published key",
    );
  });

  it("a failed row signature draws no rows", () => {
    const p = page(vectors.cases["mesh-row-signature-fails"]);
    expect(hero(p)).toBe(
      "This history didn't verify, so this page shows none of it.",
    );
    expect(p.querySelector('[data-history="rows"]')).toBeNull();
  });

  it("refuses a recipient deal page that names no one", () => {
    const m = clone(vectors.cases["muse-picked-shared"]) as Json;
    m["holder"] = {};
    delete m["picked"];
    expect(buildHistoryView(m, overlay).ok).toBe(false);
  });

  it("fills RECORDED only when the deal report check passed", () => {
    const m = clone(vectors.cases["muse-owner"]) as Json;
    m["checks"] = [{ id: "deal_report", status: "not_run" }];
    const p = page(m, overlay);
    for (const e of p.querySelectorAll(".cvh-stamp")) {
      if (e.textContent?.startsWith("RECORDED"))
        expect(e.getAttribute("data-filled")).toBe("no");
    }
    expect(p.querySelector(".cvh-seal-title")).toBeNull();
    expect(p.textContent).toContain(
      "This page did not check how these records were locked.",
    );
  });

  it("a failed witness check shows in its chip", () => {
    const m = clone(vectors.cases["mesh-witnessed"]) as Json;
    (m["checks"] as Json[]).push({ id: "witness", status: "fail" });
    expect(
      page(m).querySelector('[data-history="chips"]')?.textContent,
    ).toContain("Time stamps didn't verify");
  });

  it("always draws the seal with its second-signature slot", () => {
    for (const name of [
      "muse-empty",
      "mesh-refused",
      "goose-no-checkpoints",
      "mesh-chain-fails",
    ])
      expect(
        page(vectors.cases[name], overlayFor(name)).querySelector(
          ".cvh-seal-slot",
        ),
        name,
      ).not.toBeNull();
    // With no rows drawn, the seal holds only its slot: no locking line.
    for (const name of [
      "muse-empty",
      "mesh-refused",
      "mesh-chain-fails",
      "mesh-row-signature-fails",
    ])
      expect(
        page(vectors.cases[name], overlayFor(name)).querySelector(".cvh-seal")
          ?.textContent,
        name,
      ).not.toMatch(/did not check|Locked as it happened/u);
    expect(
      page(vectors.cases["mesh-chain-fails"])
        .querySelector(".cvh-seal-slot")
        ?.getAttribute("data-state"),
    ).toBe("not_checked");
  });

  it("the seal's second-signature slot gives its scope when rows differ", () => {
    const slotText = (states: string[], checkFails = true): string => {
      const m = clone(vectors.cases["muse-owner"]) as Json;
      (m["rows"] as Json[]).forEach((r, i) => {
        r["second_signature"] =
          states[i] === "passed"
            ? { state: "passed", by: "Ada", at: "2026-10-23T11:00:00Z" }
            : { state: states[i] };
      });
      const checks = m["checks"] as Json[];
      checks[2]!["status"] = checkFails ? "fail" : "pass";
      return (
        page(m, overlayFor("muse-owner")).querySelector(".cvh-seal-slot")
          ?.textContent ?? ""
      );
    };
    // Rows nobody countersigned are not counted.
    expect(slotText(["none", "passed", "failed"])).toContain(
      "1 of 2 didn't verify; see each row",
    );
    expect(slotText(["failed", "passed", "failed"])).toContain(
      "2 of 3 didn't verify; see each row",
    );
    expect(slotText(["failed", "failed", "failed"])).toContain("Didn't verify");
    expect(slotText(["none", "none", "failed"])).toContain("Didn't verify");
    expect(slotText(["none", "passed", "passed"])).not.toContain(
      "didn't verify;",
    );
    // The check failed, but no row did.
    expect(slotText(["none", "passed", "passed"])).toContain("Didn't verify");
  });

  it("shows the node's full key id behind its chip", () => {
    const m = mesh();
    const node = (m["holder"] as Json)["node"] as string;
    expect(page(m).querySelector("header code")?.textContent).toBe(node);
  });

  it("keeps a reason's $ sequences as written", () => {
    const container = document.createElement("div");
    renderHistoryView({ ...mesh(), "$&": 1 }, container);
    expect(container.textContent).toContain("input.$&");
  });
});

describe("the page verdict", () => {
  const drawn = (input: unknown, ov?: unknown): HTMLElement => {
    const container = document.createElement("div");
    renderHistoryView(input, container, ov);
    return container;
  };

  it("a failed log check draws no rows or counts, and keeps the panel open", () => {
    const page = drawn(vectors.cases["mesh-chain-fails"]);
    expect(page.querySelector('[data-history="rows"]')).toBeNull();
    expect(page.querySelector('[data-history="chips"]')).toBeNull();
    expect(page.querySelector('[data-history="hero"]')?.textContent).toBe(
      "This history didn't verify, so this page shows none of it.",
    );
    const panel = page.querySelector('[data-history="checked"]');
    expect(panel?.hasAttribute("open")).toBe(true);
    expect(panel?.querySelector('[data-status="fail"]')?.textContent).toContain(
      "Each checkpoint names the one before",
    );
  });

  it("a failed stamp stays in its row, and every deal is still drawn", () => {
    const page = drawn(vectors.cases["muse-owner"], overlay);
    expect(page.querySelectorAll('[data-history="row"]').length).toBe(3);
    expect(
      page.querySelectorAll('.cvh-stamp[data-state="failed"]').length,
    ).toBe(1);
  });

  it("every checkpoint signature checks only when every row and every check that ran passed", () => {
    expect(
      drawn(vectors.cases["mesh-service-history"]).querySelector(
        '[data-history="hero"]',
      )?.textContent,
    ).toContain("every checkpoint signature checks");
    expect(
      drawn(vectors.cases["goose-advertised-policy"]).querySelector(
        '[data-history="hero"]',
      )?.textContent,
    ).toContain("signatures not checked here");
  });

  it("no rows is never a pass", () => {
    expect(
      drawn(vectors.cases["goose-no-checkpoints"]).querySelector(
        '[data-history="hero"]',
      )?.textContent,
    ).toBe("No checkpoints yet.");
    expect(
      drawn(vectors.cases["muse-empty"], overlay).querySelector(
        '[data-history="hero"]',
      )?.textContent,
    ).toBe("There are no deals in this store yet.");
    const refusedPage = drawn(vectors.cases["mesh-refused"]);
    expect(
      refusedPage.querySelector('[data-history="hero"]')?.textContent,
    ).toContain("The node declined to answer.");
    expect(
      refusedPage.querySelector('[data-history="hero"]')?.textContent,
    ).toContain("no_checkpoint");
  });

  it("only a passed slot fills", () => {
    const page = drawn(vectors.cases["mesh-witnessed"]);
    const filled = [
      ...page.querySelectorAll('.cvh-stamp[data-filled="yes"]'),
    ].map((e) => e.textContent);
    expect(filled).toContain(
      "TIME-STAMPEDNov 3, 2026, 12:00 UTC · by witness.agentactioncapsule.org",
    );
    for (const e of page.querySelectorAll(
      '.cvh-stamp[data-state="not_checked"], .cvh-stamp[data-state="none"]',
    ))
      expect(e.getAttribute("data-filled")).toBe("no");
  });

  it("two checkpoints cut in one second stay two rows, told apart", () => {
    const titles = [
      ...drawn(vectors.cases["mesh-same-second"]).querySelectorAll(
        ".cvh-row-title",
      ),
    ].map((e) => e.textContent);
    expect(titles).toEqual([
      "Cut Nov 3, 2026, 18:07:12.418 UTC",
      "Cut Nov 3, 2026, 18:07:12.902 UTC",
    ]);
  });

  it("says what is not stated, rather than leaving it out", () => {
    const shares =
      drawn(vectors.cases["goose-advertised-policy"]).querySelector(
        '[data-history="shares"]',
      )?.textContent ?? "";
    expect(shares).toContain("this node's settings don't say");
  });

  it("a policy that states none of the five settings says so five times and invents no value", () => {
    const shares =
      drawn(vectors.cases["goose-policy-share-deal-half-only"]).querySelector(
        '[data-history="shares"]',
      )?.textContent ?? "";
    expect(shares.split("this node's settings don't say").length - 1).toBe(7);
    for (const invented of [
      "With anyone: the Service History.",
      "Only with the other side",
      "Sent on its own",
      "If this node judges an exchange",
      "With any node that asks by an exchange's id",
      "(off on this node)",
      "No witnesses named.",
    ])
      expect(shares).not.toContain(invented);
    expect(shares).toContain(
      "Never: a record to anyone who doesn't prove who they are.",
    );
  });

  it("a stated member keeps its line when its neighbours are absent", () => {
    const m = mesh();
    m["sharing"] = { history_segments: "peers" };
    const shares =
      drawn(m).querySelector('[data-history="shares"]')?.textContent ?? "";
    expect(shares).toContain("With any node that signs its request");
    expect(shares).toContain("Whether the Service History goes to anyone");
  });

  it("draws caller text as text, never in an attribute", () => {
    const m = mesh();
    m["holder"] = { node: '<img src=x onerror="alert(1)">' };
    const html = historyViewHtml(m);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
