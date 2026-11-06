// SPDX-License-Identifier: BSD-3-Clause
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  READINESS_STATUSES,
  STUDIO_VIEW_WORDING,
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
    expect(html).toContain("dataset digest <code>" + "2".repeat(64));
    expect(html).toContain("plan digest <code>" + "7".repeat(64));
    expect(html).toContain("bundle digest <code>" + "5".repeat(64));
    expect(html).toContain("pack digest <code>" + "1".repeat(64));
  });

  it("draws only the stages the active pack's digest has evidence for", () => {
    expect(studioViewHtml(input())).toContain(
      'data-stage="tried" data-state="done"',
    );
    // an edit makes a new digest; the earlier digest's run says nothing about it
    const edited = input();
    edited["packs"][0].pack_digest = "4".repeat(64);
    const html = studioViewHtml(edited);
    expect(html).toContain('data-stage="tried" data-state="not-yet"');
    // a run counts whether or not it was a dry run, and a candidate-only table is not "terms written"
    const run = input();
    run["history"][0].rehearsal = false;
    expect(studioViewHtml(run)).toContain(
      'data-stage="tried" data-state="done"',
    );
    const ideas = input();
    for (const t of ideas["readiness"].terms) t.in_pack = false;
    expect(studioViewHtml(ideas)).toContain(
      'data-stage="terms" data-state="not-yet"',
    );
  });

  it("marks an idea that is not in the pack, in the desk and the term map", () => {
    const html = studioViewHtml(input());
    expect(html.match(/data-in-pack="false"/g)).toHaveLength(4);
    expect(html).toContain("an idea, not in the pack");
  });

  it("keeps a quote in a pack id or term out of attributes", () => {
    const v = input();
    v["packs"][0].pack_id = 'a" onmouseover="x';
    v["active"] = v["packs"][0].pack_id;
    v["readiness"].pack_id = v["packs"][0].pack_id;
    v["readiness"].terms[0].term = '"><script>x</script>';
    const html = studioViewHtml(v);
    expect(html).not.toContain('onmouseover="x');
    expect(html).not.toContain("<script>x");
  });

  it("draws caller text as text", () => {
    const html = studioViewHtml(input());
    expect(html).toContain("&lt;b&gt;Refund&lt;/b&gt;");
    expect(html).not.toContain("<b>Refund");
  });

  it("accepts the html and embedded formats", () => {
    for (const format of ["html", "embedded"]) {
      const v = input();
      v["packs"][1].format = format;
      expect(studioViewHtml(v)).toContain(`data-format="${format}"`);
    }
  });

  it("knows every readiness status the producer writes", () => {
    expect(READINESS_STATUSES).toHaveLength(5);
    for (const status of READINESS_STATUSES) {
      const v = input();
      v["readiness"].terms = v["readiness"].terms.slice(0, 1);
      v["readiness"].terms[0].status = status;
      v["readiness"].counts = Object.fromEntries(
        READINESS_STATUSES.map((s) => [s, s === status ? 1 : 0]),
      );
      expect(() => studioViewHtml(v)).not.toThrow();
    }
  });

  const refusals: [string, (v: Record<string, any>) => void, string][] = [
    [
      "a static report page",
      (v) => (v["packs"][1].format = "static"),
      "packs[1].format",
    ],
    [
      "an unknown format",
      (v) => (v["packs"][1].format = "pdf"),
      "packs[1].format",
    ],
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
      "a shared member without its plan_ref",
      (v) => delete v["packs"][0].shared.plan_ref,
      "shared.plan_ref",
    ],
    [
      "a pack without a bundle digest",
      (v) => delete v["packs"][1].bundle_digest,
      "packs[1].bundle_digest",
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

describe("the Studio wording pack", () => {
  it("has no score, rating, rank, reputation or trust word", () => {
    for (const text of Object.values(STUDIO_VIEW_WORDING.entries))
      expect(text).not.toMatch(/\b(score|rating|rank|reputation|trust)\b/iu);
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
    expect(page).toContain("Workspace snapshot, not sealed evidence.");
    const json = /data-studio-input>([\s\S]*?)<\/script>/.exec(page)![1]!;
    const digest = /data-snapshot-digest>([0-9a-f]{64})</.exec(page)![1];
    expect(digest).toBe(
      createHash("sha256").update(json, "utf8").digest("hex"),
    );
  });

  it("cannot be mistaken for a pack, bundle, dataset or plan digest: its hash never equals one", async () => {
    const v = input();
    const page = await studioViewDocument(v);
    const digest = /data-snapshot-digest>([0-9a-f]{64})</.exec(page)![1]!;
    for (const p of v["packs"])
      for (const other of [
        p.pack_digest,
        p.bundle_digest,
        p.shared.dataset_ref,
        p.shared.plan_ref,
      ])
        expect(other).not.toBe(digest);
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
