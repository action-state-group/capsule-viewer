// SPDX-License-Identifier: BSD-3-Clause
import { build } from "esbuild";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { jsonDigest } from "@action-state-group/agent-action-capsule";
import { buildPresentation } from "../src/presentation-builder.js";
import { packCitation } from "../src/studio-pack.js";
import { studioViewHtml } from "../src/studio-view.js";
import { readFileSync } from "node:fs";
import { chartBundleSource } from "./helpers/chart-bundle.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

/**
 * Acceptance 2 of capsule-viewer#291 as Steven ruled it (one Result per
 * bundle, no umbrella record, no AAC change): two packs judged over the same
 * data are two bundles. Their report pages each carry their own bundle and
 * cite the same dataset digest (and plan digest) that Result section 7.3
 * names; no page cites a shared bundle digest, because there is none.
 */

const host = new JSDOM();
globalThis.document = host.window.document;
globalThis.HTMLElement = host.window.HTMLElement;

type Obj = Record<string, unknown>;

/** The charts book's bundle, its Result tagged as pack `pack`: same plan and dataset. */
async function packBundle(pack: string) {
  const { source, plan, dataset } = await chartBundleSource();
  const root = source["root"] as string;
  const header = (source["disclosures"] as Record<string, Obj>)[root]![
    "agent_input"
  ] as Obj;
  (header["statement"] as Obj)["x-pack"] = { pack_id: pack };
  const { bundle } = await sealEvidenceBundle(source);
  return {
    bundle,
    plan: await jsonDigest(plan),
    dataset: await jsonDigest(dataset),
  };
}

async function runtime(): Promise<string> {
  return (
    await build({
      entryPoints: [resolve(process.cwd(), "src", "browser.ts")],
      bundle: true,
      format: "iife",
      globalName: "EvidenceGraph",
      footer: {
        js: "globalThis.renderEvidenceGraph = EvidenceGraph.renderEvidenceGraph;",
      },
      write: false,
    })
  ).outputFiles[0]!.text;
}

describe("two packs over the same data", () => {
  it("are two bundles with two digests that name one dataset and one plan", async () => {
    const a = await packBundle("outcomes");
    const b = await packBundle("obligations");
    const ca = await packCitation(a.bundle);
    const cb = await packCitation(b.bundle);
    expect(ca.bundle_digest).not.toBe(cb.bundle_digest);
    expect(ca.shared).toEqual({ dataset_ref: a.dataset, plan_ref: a.plan });
    expect(cb.shared).toEqual(ca.shared);
  }, 60_000);

  it("draw as two pages, each carrying its own bundle, and the switch cites the same dataset digest for both", async () => {
    const a = await packBundle("outcomes");
    const b = await packBundle("obligations");
    const rt = await runtime();
    const pages: string[] = [];
    for (const { bundle } of [a, b]) {
      const built = await buildPresentation(bundle, {
        presentation: "auto",
        format: "html",
        audience: "anyone",
        depth: "L1",
        runtime: { code: rt },
      });
      if (built.format !== "html") throw new Error("an html page expected");
      pages.push(built.html);
    }
    expect(pages[0]).not.toBe(pages[1]);
    // each page carries its own bundle: its own bundle digest rebuilds from it
    const carried = pages.map(
      (p) =>
        JSON.parse(
          /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/
            .exec(p)![1]!
            .replace(/\\u003c/gu, "<"),
        ) as unknown,
    );
    const cites = [
      await packCitation(carried[0]),
      await packCitation(carried[1]),
    ];
    expect(cites[0]!.bundle_digest).toBe(
      (await packCitation(a.bundle)).bundle_digest,
    );
    expect(cites[1]!.bundle_digest).toBe(
      (await packCitation(b.bundle)).bundle_digest,
    );
    // the switch, built from what the bundles carry
    const html = studioViewHtml({
      schema: "studio-view/v0",
      active: "outcomes",
      packs: ["outcomes", "obligations"].map((id, i) => ({
        pack_id: id,
        pack_digest: String(i + 1).repeat(64),
        page: `${id}.html`,
        bundle_digest: cites[i]!.bundle_digest,
        shared: cites[i]!.shared!,
      })),
      readiness: {
        pack_id: "outcomes",
        pack_version: "0.1.0",
        records: 0,
        terms: [],
        counts: Object.fromEntries(
          [
            "checkable now",
            "needs examples",
            "needs a field",
            "needs the other side",
            "not this pack's concern",
          ].map((s) => [s, 0]),
        ),
      },
      history: [],
    });
    const items = html.split("<li data-pack=").slice(1);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toContain(`dataset digest <code>${a.dataset}</code>`);
      expect(item).toContain(`plan digest <code>${a.plan}</code>`);
    }
    expect(html).toContain(cites[0]!.bundle_digest);
    expect(html).toContain(cites[1]!.bundle_digest);
  }, 120_000);

  it("a bundle that does not verify, or whose root is no Result, has no citation", async () => {
    const a = await packBundle("outcomes");
    const tampered = structuredClone(a.bundle) as Obj;
    ((tampered["records"] as Obj[])[0] as Obj)["action_type"] = "decide";
    await expect(packCitation(tampered)).rejects.toThrow(/does not verify/u);
  }, 60_000);

  it("a verified bundle whose root is no Result has no citation either", async () => {
    const { bundle } = await sealEvidenceBundle(
      JSON.parse(
        readFileSync(resolve("test", "testdata", "week-bundle.json"), "utf8"),
      ) as Obj,
    );
    await expect(packCitation(bundle)).rejects.toThrow(
      /not an Evidence Result/u,
    );
  }, 60_000);
});
