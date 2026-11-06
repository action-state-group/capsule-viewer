// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  READINESS_STATUSES,
  StudioViewRefused,
  studioViewDocument,
  studioViewHtml,
} from "../src/studio-view.js";

const input = (): Record<string, any> =>
  JSON.parse(
    readFileSync(
      resolve("test", "fixtures", "studio-view", "input.json"),
      "utf8",
    ),
  );

describe("the Studio home", () => {
  it("draws the loop, the desk, the term map and the switch", () => {
    const html = studioViewHtml(input());
    expect(html).toContain('data-view="loop"');
    expect(html).toContain('data-stage="tried" data-state="done"');
    expect(html).toContain('data-stage="switched_on" data-state="not-yet"');
    expect(html).toContain('data-view="readiness"');
    expect(html).toContain("Checkable now".toLowerCase());
    expect(html).toContain('data-status="field"');
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    // the other pack is a link; the active pack is not
    expect(html).toContain('<a href="runs/late-delivery/2/report.html">');
    expect(html).toContain('aria-current="page"');
    // each pack cites its own digest and the shared one, labelled
    expect(html).toContain("1".repeat(64));
    expect(html).toContain("3".repeat(64));
    expect(html).toContain("dataset <code>" + "2".repeat(64));
  });

  it("never shows two packs' verdicts: only the active pack's terms", () => {
    const html = studioViewHtml(input());
    expect(html.match(/data-view="readiness"/g)).toHaveLength(1);
    expect(html.match(/data-view="term-map"/g)).toHaveLength(1);
  });

  it("draws caller text as text", () => {
    const html = studioViewHtml(input());
    expect(html).toContain("&lt;b&gt;Refund&lt;/b&gt;");
    expect(html).not.toContain("<b>Refund");
  });

  it("knows every readiness status the producer writes", () => {
    expect(READINESS_STATUSES).toHaveLength(5);
    for (const status of READINESS_STATUSES) {
      const v = input();
      v["readiness"].terms[0].status = status;
      expect(() => studioViewHtml(v)).not.toThrow();
    }
  });

  const refusals: [string, (v: Record<string, any>) => void, string][] = [
    ["an unknown member", (v) => (v["extra"] = 1), "input.extra"],
    [
      "an unknown status",
      (v) => (v["readiness"].terms[0].status = "ready"),
      "terms[0].status",
    ],
    [
      "an absolute page path",
      (v) => (v["packs"][1].page = "/etc/x.html"),
      "packs[1].page",
    ],
    [
      "a scheme in a page path",
      (v) => (v["packs"][1].page = "https://x.example/a.html"),
      "packs[1].page",
    ],
    [
      "a parent path",
      (v) => (v["packs"][1].page = "a/../b.html"),
      "packs[1].page",
    ],
    [
      "a quote in a page path",
      (v) => (v["packs"][1].page = 'a".html'),
      "packs[1].page",
    ],
    [
      "an unknown shared kind",
      (v) => (v["packs"][0].shared.kind = "card"),
      "shared.kind",
    ],
    [
      "an active pack that is not listed",
      (v) => (v["active"] = "nope"),
      "input.active",
    ],
    [
      "a readiness of another pack",
      (v) => (v["readiness"].pack_id = "late-delivery"),
      "readiness.pack_id",
    ],
  ];
  for (const [name, mutate, where] of refusals)
    it(`refuses ${name}`, () => {
      const v = input();
      mutate(v);
      try {
        studioViewHtml(v);
        throw new Error("not refused");
      } catch (e) {
        expect(e).toBeInstanceOf(StudioViewRefused);
        expect((e as StudioViewRefused).reasons.join(";")).toContain(where);
      }
    });
});

describe("the Studio page as a file", () => {
  it("is static, labels its snapshot and states the snapshot's SHA-256", async () => {
    const page = await studioViewDocument(input());
    const scripts = page.match(/<script/g) ?? [];
    expect(scripts).toHaveLength(1);
    expect(page).toContain(
      '<script type="application/json" data-studio-input>',
    );
    expect(page).toContain("Workspace snapshot, not sealed evidence");
    const json = /data-studio-input>([\s\S]*?)<\/script>/.exec(page)![1]!;
    const digest = /data-snapshot-digest>([0-9a-f]{64})</.exec(page)![1];
    expect(digest).toBe(
      createHash("sha256").update(json, "utf8").digest("hex"),
    );
  });

  it("rebuilt from its embedded JSON is byte-identical", async () => {
    const page = await studioViewDocument(input());
    const json = /data-studio-input>([\s\S]*?)<\/script>/.exec(page)![1]!;
    expect(await studioViewDocument(JSON.parse(json))).toBe(page);
  });

  it("does not depend on key order or on the order the JSON was written", async () => {
    const a = input();
    const b = Object.fromEntries(Object.entries(a).reverse());
    expect(await studioViewDocument(b)).toBe(await studioViewDocument(a));
  });

  it("keeps a closing script tag in caller text from ending the JSON", async () => {
    const v = input();
    v["readiness"].terms[0].statement = "x </script><script>alert(1)</script>";
    const page = await studioViewDocument(v);
    expect(page.match(/<script/g)).toHaveLength(1);
  });
});
