// SPDX-License-Identifier: BSD-3-Clause
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BackfillTimelineRefused,
  backfillTimelineHtml,
} from "../src/backfill-timeline.js";
import { studioViewDocument, studioViewHtml } from "../src/studio-view.js";

const rec = (): Record<string, any> =>
  JSON.parse(
    readFileSync(
      resolve("test", "fixtures", "backfill-timeline", "record.json"),
      "utf8",
    ),
  );
const studio = (): Record<string, any> =>
  JSON.parse(
    readFileSync(
      resolve("test", "fixtures", "studio-view", "input.json"),
      "utf8",
    ),
  );
const cp = [{ digest: "c".repeat(64), size: 40, at: "2026-11-05T10:05:00Z" }];

describe("the backfill timeline", () => {
  it("draws each row's source time against the import time, the gaps and the checkpoints", () => {
    const html = backfillTimelineHtml(rec(), cp);
    expect(html).toContain('datetime="2026-11-05T08:01:00Z"');
    expect(html).toContain("data-source-says");
    expect(html).toContain('data-imported-at datetime="2026-11-05T10:00:00Z"');
    expect((html.match(/data-gap /gu) ?? []).length).toBe(2);
    expect(html).toContain("Gap</strong> calls: cursors 8 to 9");
    expect(html).toContain("source not read");
    expect(html).toContain("c".repeat(64));
    expect(html).toContain("data-late");
    expect(html).toContain("data-anomalies");
    expect(html).toContain(
      'data-row="c12" data-imported="true" data-retained="true"',
    );
  });

  it("labels the pass as imported in both forms", () => {
    for (const form of ["rehearsal", "record"] as const) {
      const html = backfillTimelineHtml(rec(), cp, form);
      expect(html).toContain(`data-form="${form}"`);
      expect(html).toContain("data-imported-label");
      expect(html).toContain("Imported, not recorded as it happened");
    }
  });

  it("says so when no checkpoint covers the pass or no gap was declared", () => {
    const r = rec();
    r["gaps"] = [];
    const html = backfillTimelineHtml(r);
    expect(html).toContain('data-gaps="none"');
    expect(html).toContain('data-checkpoints="none"');
  });

  it("draws an empty pass whose lists are null (a Go nil slice) with its gap", () => {
    const r = rec();
    r["tier_a"] = null;
    r["retained"] = null;
    r["refused"] = null;
    r["anomalies"] = null;
    r["window"] = JSON.parse(
      '{"constructor":{"after":1,"through":2},"__proto__":{"after":null,"through":null}}',
    );
    r["horizons"] = {};
    const html = backfillTimelineHtml(r);
    expect(html).toContain("data-gap ");
    expect(html).toContain('data-source="constructor"');
    expect(html).toContain("This pass read no new rows.");
  });

  it("draws refused rows, a retrospective record kept from an earlier pass's row, a limited horizon and what it cannot see", () => {
    const r = rec();
    r["refused"] = [
      {
        source: "calls",
        id: "c3",
        digest: "a",
        tier_a_digest: "b",
        reason: "the host changed the row",
      },
    ];
    r["retained"].push({
      capsule_id: "z",
      source_digest: "a",
      action_id: "calls/c3",
      pinned_by: "p",
      retrospective: true,
    });
    r["horizons"]["tools"] = {
      oldest_cursor: 1,
      oldest_at: "2026-11-05T07:00:00Z",
      limited: true,
    };
    r["notes"] = ["the reader hit its row limit"];
    r["cannot_see"] = ["the host's store before the first pass"];
    const html = backfillTimelineHtml(r);
    expect(html).toContain("data-refused");
    expect(html).toContain("the host changed the row");
    expect(html).toContain("data-kept-elsewhere");
    expect(html).toContain("kept in hindsight");
    expect(html).toContain('data-source="tools"');
    expect(html).toContain("row limit, so more rows wait");
    expect(html).toContain("data-notes");
    expect(html).toContain("the host&#39;s store before the first pass");
  });

  it("refuses what the record shape does not allow", () => {
    const cases: [string, (r: Record<string, any>) => void][] = [
      ["record.first_pass", (r) => (r["first_pass"] = "yes")],
      ["record.horizons", (r) => (r["horizons"] = "x")],
      ["record.anomalies[0].digest", (r) => (r["anomalies"][0].digest = "a")],
      ["record.imported_at", (r) => (r["imported_at"] = "2026-11-05T10:00:00")],
    ];
    for (const [where, edit] of cases) {
      const r = rec();
      edit(r);
      expect(() => backfillTimelineHtml(r), where).toThrow(where);
    }
    expect(() => backfillTimelineHtml(rec(), undefined, "x" as any)).toThrow(
      BackfillTimelineRefused,
    );
  });

  it("never lets caller text become markup", () => {
    const r = rec();
    r["gaps"][0].reason = '<img src=x onerror="1">';
    const html = backfillTimelineHtml(r);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("refuses unknown members, a wrong schema, bad times and bad checkpoints", () => {
    const bad = rec();
    bad["extra"] = 1;
    bad["schema"] = "backfill-import/v1";
    bad["tier_a"][0].at = "yesterday";
    let err: unknown;
    try {
      backfillTimelineHtml(bad, [
        { digest: "d", size: -1, at: "2026-11-05T10:05:00Z" },
      ]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BackfillTimelineRefused);
    const reasons = (err as BackfillTimelineRefused).reasons.join("\n");
    expect(reasons).toContain("record.extra");
    expect(reasons).toContain("record.schema");
    expect(reasons).toContain("record.tier_a[0].at");
    expect(reasons).toContain("checkpoints[0].size");
  });
});

describe("the Studio home with a backfill pass", () => {
  it("draws the timeline on the page, still renders with a declared gap, and rebuilds byte-identical", async () => {
    const input = studio();
    input["backfill"] = [{ record: rec(), checkpoints: cp, form: "rehearsal" }];
    const html = studioViewHtml(input);
    expect(html).toContain('data-view="backfill-timeline"');
    expect(html).toContain('data-view="readiness"');
    expect(html).toContain("data-gap ");
    const doc = await studioViewDocument(input);
    const embedded = /data-studio-input>(.*?)<\/script>/su.exec(doc)![1]!;
    expect(await studioViewDocument(JSON.parse(embedded))).toBe(doc);
  });

  it("refuses a backfill record the timeline refuses, naming where", () => {
    const input = studio();
    const bad = rec();
    bad["gaps"] = "none";
    input["backfill"] = [{ record: bad }];
    expect(() => studioViewHtml(input)).toThrow(
      /input\.backfill\[0\]\.record\.gaps/u,
    );
  });
});
