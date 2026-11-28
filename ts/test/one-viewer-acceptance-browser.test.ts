// SPDX-License-Identifier: Apache-2.0
/**
 * The one acceptance test of docs/design/one-viewer.md section 2.2 (row 2 of
 * its section 3, capsule-viewer#524), over every page-producing entry point
 * (helpers/one-viewer-pages.ts). Each page is opened in headless Chromium
 * with the network blocked, and fails unless:
 *
 * 1. every check it names has a status and an attribution from the core's
 *    one check list (ran in this browser, reported by capsulectl, or not
 *    run), and no "this page checked it" claim sits over a check the page
 *    did not run;
 * 2. its re-check line names a command from the closed set, and the bundle a
 *    reader exports from the page passes AAC's verifier with the verdict the
 *    page shows (running capsulectl itself is evidencebook's page tests'; a
 *    page of rows with no bundle is the plugin's, section 2.3);
 * 3. it never claims a check it did not run: opened offline, it makes no
 *    request and draws the same check list.
 *
 * Every violation has an id. A page today that has one is listed in KNOWN
 * with its issue; any other violation fails, and so does a KNOWN entry that
 * no longer occurs, so a fix must remove its entry. Rendering and fixture
 * errors are never KNOWN. Skipped where there is no Chromium.
 */
import {
  buildVerifiedBundleContext,
  jcs,
  verificationBanner,
  verificationCheckLists,
} from "@action-state-group/agent-action-capsule";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  allPages,
  fetchingPage,
  type Obj,
  type PageCase,
} from "./helpers/one-viewer-pages.js";

function browserPath(): string | undefined {
  return [
    process.env.AAC_CHROMIUM_PATH,
    chromium.executablePath(),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((c) => c !== undefined && c !== "" && existsSync(c));
}
const executablePath = browserPath();

/** What the opened page shows, read from the DOM. */
export interface Shown {
  /** The core's lists, or null when the page draws none. */
  readonly core: {
    page: string[];
    failed: string[];
    notChecked: string[];
    capsulectl: string[];
  } | null;
  /** Elements outside the core's lists that name a check: `[data-check]`. */
  readonly claims: { id: string; status: string | null }[];
  /** Whether the entry point's own region was drawn (PageCase.region). */
  readonly region: boolean;
  /** `[data-checked]` and `[data-checked-here]` notes: whether each says the page checked it here. */
  readonly checkedNotes: { here: boolean; text: string }[];
  /** Ladder rungs: `<n>:<status>`. */
  readonly rungs: string[];
  /** The History row view's checks and its "where" line. */
  readonly rowChecks: string[];
  readonly rowWhere: string | null;
  /** The History card's proof lede key and its text, and its "Expect" line. */
  readonly lede: { key: string; text: string } | null;
  readonly expectLine: { digest: string; text: string } | null;
  /** Bundle-level re-check lines: `[data-verify-command]`, `[data-verifier-hint]`. */
  readonly lines: string[];
  /** The receipt's "Check it yourself" notes, for the pack's fallback line. */
  readonly checkNotes: string[];
  /** The proof file's download name, if the page offers one. */
  readonly download: string | null;
  readonly verify: string | null;
  readonly cannotCheck: boolean;
  readonly scripts: number;
  readonly refusal: string | null;
}

/** The core's names for capsulectl's checks that are also the page's (evidence-graph-view.ts SAME_CHECK). */
const SAME_CHECK: Record<string, string> = {
  producer_signatures: "producer-signatures",
  interval_coverage: "range",
  graph_closure: "closure",
  per_record_membership: "membership",
  checkpoint: "checkpoint-signature",
};
/**
 * What a ladder rung's PASS rests on (ts/src/record-page.ts, ladder): the
 * checks of the core's page list it needs, or null where no page may pass
 * it (rung 6, no bundle carries a retained head; rung 8, not read yet).
 */
const RUNG_CHECKS: Record<string, readonly string[] | null> = {
  "1": ["record-digests"],
  "2": ["disclosures"],
  "3": ["producer-signatures"],
  "4": ["record-rules"],
  "5": ["membership", "checkpoint-signature"],
  "6": null,
  "7": ["witness-receipts"],
  "8": null,
  "9": ["record-digests"],
  "10": ["record-digests"],
  "11": ["countersignatures"],
};
/** The History card's proof rows the lede sums (history-view.ts PROOF_CHECKS). */
const CARD_PROOF = [
  "producer_signatures",
  "interval_coverage",
  "graph_closure",
  "per_record_membership",
  "checkpoint",
];

/** The receipt pack's fallback re-check line, and the command it names. */
const NO_COMMAND = (
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), "..", "go", "receipt", "wording-en.json"),
      "utf8",
    ),
  ) as { entries: Record<string, string> }
).entries["deal.check.no_command"]!;
const NO_COMMAND_LINE = "capsulectl deal verify --bundle";

/** The closed set of re-check commands (section 2.2 point 2). */
const CAPSULECTL = /^capsulectl(?: [a-z][a-z-]*)* verify(?: |$)/u;
const AAC = /^agent-action-capsule verify(?: |$)/u;

/** capsulectl's answers in its report: `<name>:<status>`, as the page may show them. */
function reported(report: Obj | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (report === undefined) return out;
  for (const name of [...Object.keys(SAME_CHECK), "witnesses"]) {
    const status = (report[name] as Obj | undefined)?.["status"];
    if (typeof status === "string") out.set(name, status);
  }
  // An x-deal-v1 copy: the other side's half and the book's witness, as its entry reports them.
  const entry = ((report["extensions"] ?? []) as Obj[]).find(
    (e) => e["kind"] === "x-deal-v1",
  );
  const word = (s: unknown) =>
    s === "verified" ? "pass" : s === "failed" ? "fail" : undefined;
  const half = word(
    (entry?.["counterparty_half"] as Obj | undefined)?.["status"],
  );
  if (half !== undefined) out.set("counterparty_half", half);
  const witnessed = word((entry?.["witnessed"] as Obj | undefined)?.["status"]);
  if (witnessed !== undefined) out.set("witnesses", witnessed);
  return out;
}

const sameJson = (a: unknown, b: unknown): boolean =>
  Buffer.from(jcs(a as never)).equals(Buffer.from(jcs(b as never)));

/** AAC's own reading of the bundle in Node: the checks a runtime can run on it. */
async function oracle(bundle: unknown) {
  const context = await buildVerifiedBundleContext(bundle);
  return {
    lists: verificationCheckLists(bundle, context.verification, {
      ...(context.strict === undefined ? {} : { strict: context.strict }),
    }),
    /** The banner state AAC reaches on this bundle with no other input. */
    state: verificationBanner(context, []).state as string,
  };
}

/** Every violation of the three points on one page, each as an id. */
export async function violations(
  c: PageCase,
  shown: Shown,
  exported: unknown,
  offline: { requests: string[]; csp: string[] },
): Promise<string[]> {
  const out: string[] = [];
  const add = (id: string) => out.push(id);

  // ---- 3: offline, nothing leaves the page.
  for (const r of offline.requests) add(`3:request ${r}`);
  for (const v of offline.csp) add(`3:csp ${v}`);
  if (!shown.region)
    add(`0:the entry point's region (${c.region}) is not drawn`);

  // ---- 1: each check has a status and an attribution from one list.
  if (c.shape === "bundle") {
    if (shown.core === null) add("1:no core check list");
    else {
      const core = shown.core;
      if (c.core !== undefined) {
        for (const which of [
          "page",
          "failed",
          "notChecked",
          "capsulectl",
        ] as const)
          if (
            JSON.stringify([...core[which]].sort()) !==
            JSON.stringify([...c.core[which]].sort())
          )
            add(
              `1:${which} list is [${core[which].join(",")}], expected [${c.core[which].join(",")}]`,
            );
      }
      // A check in the page list is one this runtime can run (AAC in Node, a second check).
      const o = await oracle(c.bundle);
      const ran = new Set<string>(o.lists.page as readonly string[]);
      for (const id of core.page)
        if (!ran.has(id))
          add(`1:page list names ${id}, which AAC does not run on this bundle`);
      // capsulectl's rows: exactly its report's answers, never a page claim.
      const given = reported(c.report);
      for (const row of core.capsulectl) {
        const [name, status] = row.split(":");
        if (c.target === "report-refused")
          add(`1:capsulectl row ${row} from a report for another bundle`);
        else if (given.get(name!) !== status)
          add(
            `1:capsulectl row ${row} is not its report's (${given.get(name!) ?? "absent"})`,
          );
      }
      // Module claims outside the lists cite the core's ids and agree with them.
      const status = new Map<string, string>();
      for (const id of core.page) status.set(id, "pass");
      for (const id of core.failed) status.set(id, "fail");
      for (const id of core.notChecked) status.set(id, "not-run");
      for (const row of core.capsulectl)
        status.set(`capsulectl-${row.split(":")[0]}`, row.split(":")[1]!);
      for (const claim of shown.claims) {
        if (claim.status === null) add(`1:claim ${claim.id} has no status`);
        const listed =
          status.get(claim.id) ?? status.get(`capsulectl-${claim.id}`);
        if (listed === undefined)
          add(`1:claim ${claim.id} outside the core's list`);
        else if (claim.status !== null && claim.status !== listed)
          add(
            `1:claim ${claim.id}:${claim.status}, the core's list says ${listed}`,
          );
      }
      for (const note of shown.checkedNotes)
        if (note.here && (core.page.length === 0 || core.failed.length > 0))
          add(
            `1:"checked here" note with page list [${core.page.join(",")}] failed [${core.failed.join(",")}]`,
          );
      for (const rung of shown.rungs) {
        const [n, statuses] = rung.split(":");
        // An aggregated row lists every status its records have ("NOT_CHECKED PASS").
        if (!statuses!.split(" ").includes("PASS")) continue;
        const needs = RUNG_CHECKS[n!];
        if (needs === undefined || needs === null)
          add(`1:rung ${n} PASS, which no page may pass`);
        else
          for (const id of needs)
            if (!core.page.includes(id))
              add(`1:rung ${n} PASS without ${id} in the page list`);
      }
      // Negative fixtures reach their state.
      const target = c.target;
      switch (target) {
        case undefined:
          break;
        case "no-report":
        case "report-refused":
          if (core.capsulectl.length > 0)
            add(`1:${target}: capsulectl rows drawn`);
          if (!shown.cannotCheck && c.entry === "receipt deal/v1")
            add(`1:${target}: no can't-check line`);
          break;
        // A check absent from both: nobody claims it, and the page does not read verified.
        case "checkpoint-signature claimed by no one":
          if (
            core.page.includes("checkpoint-signature") ||
            core.capsulectl.length > 0 ||
            shown.verify === "verified"
          )
            add(
              "1:an unsigned checkpoint is claimed, or the page reads verified",
            );
          break;
        case "checkpoint-signature failed":
          if (!core.failed.includes("checkpoint-signature"))
            add("1:forged checkpoint not in the failed list");
          break;
        case "producer-signatures not run":
          if (
            core.page.includes("producer-signatures") ||
            !core.notChecked.includes("producer-signatures")
          )
            add("1:producer signatures shown as run with no SubtleCrypto");
          break;
        case "unsigned: not verified":
          if (
            core.page.includes("checkpoint-signature") ||
            core.page.includes("producer-signatures") ||
            shown.verify === "verified"
          )
            add(
              "1:an unsigned report claims a signature check, or reads verified",
            );
          break;
        case "graph_closure not run":
        case "rows not run":
          add(`0:target ${target} on a bundle page`);
          break;
        default: {
          const never: never = target;
          add(`0:unknown target ${String(never)}`);
        }
      }
    }
  }
  if (c.shape === "card") {
    const machine = c.input!["machine"] as Obj;
    const checks = ((machine["verify"] as Obj)["checks"] ?? {}) as Obj;
    for (const claim of shown.claims) {
      const want = checks[claim.id] ?? "absent";
      if (claim.status !== want)
        add(
          `1:card row ${claim.id}:${claim.status} is not capsulectl's (${String(want)})`,
        );
    }
    // Attribution: the lede says capsulectl verify answered and the page did not re-check.
    if (shown.lede === null || !/capsulectl verify/u.test(shown.lede.text))
      add("1:card rows carry no capsulectl attribution");
    // The lede sums capsulectl's answer: failed, passed every test, or partial.
    const verify = machine["verify"] as Obj;
    const want =
      verify["verdict"] !== "VALID" ||
      Object.values(checks).some((s) => s === "fail")
        ? "failed"
        : CARD_PROOF.every((k) => checks[k] === "pass")
          ? "passed"
          : "partial";
    if (shown.lede !== null && shown.lede.key !== want)
      add(`1:card lede ${shown.lede.key}, capsulectl's answer sums to ${want}`);
    if (
      shown.expectLine === null ||
      shown.expectLine.digest !== verify["bundle_digest"] ||
      !new RegExp(`\\b${String(verify["verdict"])}\\b`, "u").test(
        shown.expectLine.text,
      )
    )
      add("1:card's Expect line is not capsulectl's verdict and digest");
    if (
      c.target === "graph_closure not run" &&
      shown.claims.find((x) => x.id === "graph_closure")?.status !== "absent"
    )
      add("1:unanswered graph_closure not shown as not run");
  }
  if (c.shape === "rows") {
    const want = ((c.input!["checks"] ?? []) as Obj[]).map((x) =>
      String(x["status"]),
    );
    if (JSON.stringify(shown.rowChecks) !== JSON.stringify(want))
      add(
        `1:row checks [${shown.rowChecks.join(",")}], the input says [${want.join(",")}]`,
      );
    const ran = shown.rowChecks.some((s) => s === "pass" || s === "fail");
    if (ran && shown.rowWhere === null)
      add("1:row checks with no line saying who ran them");
    // A static page runs nothing: it may not say its checks ran in this browser.
    if (
      ran &&
      shown.scripts === 0 &&
      shown.rowWhere !== null &&
      /in this browser/u.test(shown.rowWhere)
    )
      add("1:static page says its checks ran in this browser");
    if (
      c.target === "rows not run" &&
      (shown.rowChecks.length === 0 ||
        shown.rowChecks.some((s) => s !== "not_run") ||
        shown.rowWhere !== null)
    )
      add("1:checks that did not run are not all shown as not run");
  }

  // ---- 2: the re-check line, and the exported bundle under AAC's verifier.
  if (c.shape !== "rows") {
    // The pack's fallback names capsulectl's command in words (section 2.2 point 2).
    const lines = [...shown.lines];
    if (shown.checkNotes.includes(NO_COMMAND)) lines.push(NO_COMMAND_LINE);
    if (lines.length === 0) add("2:no re-check line");
    for (const line of lines) {
      if (AAC.test(line)) add(`2:AAC form with no bundle runner: ${line}`);
      else if (!CAPSULECTL.test(line)) add(`2:not in the closed set: ${line}`);
      const file = /--bundle (\S+)/u.exec(line)?.[1];
      if (
        file !== undefined &&
        shown.download !== null &&
        file !== shown.download
      )
        add(`2:${line} names ${file}, the download is ${shown.download}`);
    }
    if (exported === undefined) add("2:no bundle to export");
    else {
      // The file a reader gets is the page's own bundle, byte for byte in canonical form.
      const own =
        c.shape === "card"
          ? JSON.parse(String((c.input!["machine"] as Obj)["text"]))
          : c.bundle;
      if (!sameJson(exported, own))
        add("2:the exported bundle is not the page's own");
      const o = await oracle(exported);
      // The card shows capsulectl's verdict; a bundle page its own banner.
      const pageSays =
        c.shape === "card"
          ? shown.expectLine !== null &&
            /\bVALID\b/u.test(shown.expectLine.text)
            ? "verified"
            : "failed"
          : shown.verify;
      // The page may say less than AAC (incomplete where this browser could
      // not run a check), never more, and fails exactly when AAC fails.
      if (
        (pageSays === "verified" && o.state !== "verified") ||
        (pageSays === "failed") !== (o.state === "failed")
      )
        add(
          `2:AAC reads the exported bundle as ${o.state}, the page says ${pageSays}`,
        );
    }
  }
  return out;
}

/**
 * Violations today's pages have, each with its issue: the exact pages and the
 * exact violation id. Any other violation fails the test, and so does an
 * entry here that a listed page no longer has.
 */
const KNOWN: {
  readonly pages: readonly string[];
  readonly violation: string;
  readonly issue: string;
}[] = [
  {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/530",
    violation: "1:static page says its checks ran in this browser",
    pages: [
      "historyViewDocument / mesh-service-history",
      "historyViewDocument / mesh-everything-off",
      "historyViewDocument / mesh-peers",
      "historyViewDocument / mesh-same-second",
      "historyViewDocument / mesh-witnessed",
      "historyViewDocument / mesh-chain-fails",
      "historyViewDocument / mesh-refused",
      "historyViewDocument / mesh-unreadable",
      "historyViewDocument / mesh-every-signature",
      "historyViewDocument / mesh-row-signature-fails",
      "historyViewDocument / mesh-one-setting-unstated",
      "historyViewDocument / mesh-witness-last-unregistered",
      "historyViewHtml / mesh-service-history",
      "historyViewHtml / mesh-everything-off",
      "historyViewHtml / mesh-peers",
      "historyViewHtml / mesh-same-second",
      "historyViewHtml / mesh-witnessed",
      "historyViewHtml / mesh-chain-fails",
      "historyViewHtml / mesh-refused",
      "historyViewHtml / mesh-unreadable",
      "historyViewHtml / mesh-every-signature",
      "historyViewHtml / mesh-row-signature-fails",
      "historyViewHtml / mesh-one-setting-unstated",
      "historyViewHtml / mesh-witness-last-unregistered",
    ],
  },
  {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/531",
    violation: "2:no re-check line",
    pages: [
      "receipt unilateral/v0 / keep",
      "receipt unilateral/v0 / counterparty",
      "receipt unilateral/v0 / adjudicator",
      "receipt unilateral/v0 / keep + another bundle's report",
      "receipt seller/v0 / seller-keep",
      "receipt seller/v0 / seller-counterparty",
      "receipt seller/v0 / seller-keep + another bundle's report",
      "receipt bilateral/v0 / bilateral-keep",
      "receipt bilateral/v0 / bilateral-counterparty",
      "receipt bilateral/v0 / bilateral-keep + another bundle's report",
      "receipt provider/v0 / mesh-provider-selected",
      "receipt provider/v0 / mesh-provider-selected, no report",
    ],
  },
  {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/532",
    violation: "2:no re-check line",
    pages: [
      "core (no module) / signed",
      "core (no module) / unsigned checkpoint",
      "core (no module) / forged checkpoint",
      "core (no module) / signed, no SubtleCrypto",
      "contract report / result-generic",
      "contract report / result-generic-claim-not-carried",
      "contract report / eu-groups",
      "contract report / result-generic, unsigned",
    ],
  },
];

/**
 * Point 3's anti-hardcode test per module (receipt-view-model.md section 5):
 * the test file that runs it, or the issue that adds it.
 */
const ANTI_HARDCODE: Record<string, { test: string } | { issue: string }> = {
  "receipt deal/v1": { test: "receipt-deal-v1-anti-hardcode.test.ts" },
  "receipt unilateral/v0": {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/533",
  },
  "receipt seller/v0": {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/533",
  },
  "receipt bilateral/v0": {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/533",
  },
  "receipt provider/v0": {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/533",
  },
  "History card": {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/533",
  },
  historyViewDocument: {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/533",
  },
  historyViewHtml: {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/533",
  },
  "contract report": {
    issue: "https://github.com/action-state-group/capsule-viewer/issues/533",
  },
};

describe.skipIf(executablePath === undefined)(
  "every page says what it checked, how to re-check it, and claims nothing it did not run (one-viewer.md 2.2)",
  () => {
    let browser: Browser;
    let directory = "";
    let count = 0;
    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), "cv-one-viewer-"));
      browser = await chromium.launch({ executablePath: executablePath! });
    }, 60_000);
    afterAll(async () => {
      await browser?.close();
      if (directory !== "") rmSync(directory, { recursive: true, force: true });
    }, 60_000);

    async function open(c: PageCase) {
      const file = join(directory, `page-${count++}.html`);
      writeFileSync(file, await c.html());
      const context = await browser.newContext({ acceptDownloads: true });
      const requests: string[] = [];
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith("file:") || url.startsWith("data:"))
          return route.continue();
        requests.push(url);
        return route.abort();
      });
      await context.setOffline(true);
      const page = await context.newPage();
      page.on("request", (r) => {
        const url = r.url();
        if (
          !url.startsWith("file:") &&
          !url.startsWith("data:") &&
          !url.startsWith("blob:")
        )
          requests.push(url);
      });
      await page.addInitScript((noWebCrypto: boolean) => {
        const seen: string[] = [];
        (globalThis as unknown as { __csp: string[] }).__csp = seen;
        document.addEventListener("securitypolicyviolation", (e) =>
          seen.push(e.effectiveDirective),
        );
        if (noWebCrypto)
          Object.defineProperty(globalThis, "crypto", { value: undefined });
      }, c.noWebCrypto === true);
      try {
        await page.goto(`file://${file}`);
        await page.evaluate(
          () => (globalThis as unknown as { __drawn?: Promise<void> }).__drawn,
        );
        const shown: Shown = await page.evaluate((region: string) => {
          const ids = (which: string) =>
            Array.from(
              document.querySelectorAll<HTMLElement>(
                `ul[data-checks="${which}"] > li`,
              ),
              (li) =>
                which === "capsulectl"
                  ? `${li.dataset.check!.replace(/^capsulectl-/u, "")}:${li.dataset.checkStatus ?? ""}`
                  : li.dataset.check!,
            );
          const hasCore =
            document.querySelector("ul[data-checks], [data-checks=scope]") !==
            null;
          const ledeNode = document.querySelector<HTMLElement>(
            '[data-history="proof"] [data-proof]',
          );
          const where = document.querySelector(
            '[data-history="checked"] > p.cvh-note',
          );
          return {
            core: hasCore
              ? {
                  page: ids("page"),
                  failed: ids("failed"),
                  notChecked: ids("not-checked"),
                  capsulectl: ids("capsulectl"),
                }
              : null,
            claims: Array.from(
              document.querySelectorAll<HTMLElement>("[data-check]"),
            )
              .filter((e) => e.closest("ul[data-checks]") === null)
              .map((e) => ({
                id: e.dataset.check!,
                status: e.dataset.checkStatus ?? null,
              })),
            region: document.querySelector(region) !== null,
            checkedNotes: Array.from(
              document.querySelectorAll<HTMLElement>(
                "[data-checked], [data-checked-here]",
              ),
              (e) => ({
                here: /in this browser|checked here|tested here/iu.test(
                  e.textContent ?? "",
                ),
                text: e.textContent ?? "",
              }),
            ),
            rungs: Array.from(
              document.querySelectorAll<HTMLElement>(
                "tr[data-rung][data-rung-status]",
              ),
              (r) => `${r.dataset.rung}:${r.dataset.rungStatus}`,
            ),
            rowChecks: Array.from(
              document.querySelectorAll<HTMLElement>("li.cvh-check"),
              (e) => e.dataset.status ?? "",
            ),
            rowWhere: where?.textContent ?? null,
            lede: ledeNode
              ? {
                  key: ledeNode.dataset.proof ?? "",
                  text: ledeNode.textContent ?? "",
                }
              : null,
            expectLine: (() => {
              const e = document.querySelector<HTMLElement>(
                '[data-history="check"] [data-expect]',
              );
              return e === null
                ? null
                : { digest: e.dataset.expect ?? "", text: e.textContent ?? "" };
            })(),
            lines: [
              ...new Set(
                Array.from(
                  // Marked commands, and a command the receipt's can't-check line names (its pack's code span).
                  document.querySelectorAll<HTMLElement>(
                    "[data-verify-command], [data-verifier-hint], [data-cannot-check] code",
                  ),
                  (e) => (e.textContent ?? "").trim(),
                ),
              ),
            ],
            checkNotes: Array.from(
              document.querySelectorAll<HTMLElement>(
                '[data-surface="check"] p',
              ),
              (e) => (e.textContent ?? "").trim(),
            ),
            download:
              document.querySelector<HTMLElement>("[data-proof-download]")
                ?.dataset.proofDownload ??
              document.querySelector<HTMLAnchorElement>(
                'a[data-history="download"]',
              )?.download ??
              null,
            verify:
              document
                .querySelector("[data-verify]")
                ?.getAttribute("data-verify") ?? null,
            cannotCheck: document.querySelector("[data-cannot-check]") !== null,
            scripts: document.scripts.length,
            refusal:
              document.querySelector("[data-refusal]")?.textContent ?? null,
          };
        }, c.region);
        // The bundle as a reader gets it: the page's download, else the page's own copy.
        let exported: unknown;
        const link =
          shown.download === null
            ? null
            : await page.$('[data-proof-download], a[data-history="download"]');
        if (link !== null) {
          const [download] = await Promise.all([
            page.waitForEvent("download"),
            link.click(),
          ]);
          const path = await download.path();
          exported = JSON.parse(readFileSync(path, "utf8"));
        } else if (c.shape === "bundle") {
          exported =
            JSON.parse(
              await page.evaluate(() => {
                const node = Array.from(
                  document.querySelectorAll('script[type="application/json"]'),
                ).find((s) => s.id !== "history-input");
                return node?.textContent ?? "null";
              }),
            ) ?? undefined;
        }
        const csp = await page.evaluate(
          () => (globalThis as unknown as { __csp: string[] }).__csp,
        );
        return { shown, exported, offline: { requests, csp } };
      } finally {
        await context.close();
      }
    }

    it("names, for each entry point, its anti-hardcode test or the issue adding it (point 3)", async () => {
      const entries = new Set((await allPages()).map((p) => p.entry));
      entries.delete("core (no module)");
      expect(Object.keys(ANTI_HARDCODE).sort()).toEqual([...entries].sort());
      for (const a of Object.values(ANTI_HARDCODE))
        if ("test" in a) {
          // The test it names runs the check over that module (and its mutation test must fail).
          const text = readFileSync(
            resolve(process.cwd(), "test", a.test),
            "utf8",
          );
          expect(text).toMatch(
            /refuses text that is not the pack's or the copy's/u,
          );
        }
    });

    it("lists every entry point the note names", async () => {
      const entries = new Set((await allPages()).map((p) => p.entry));
      for (const e of [
        "receipt unilateral/v0",
        "receipt seller/v0",
        "receipt bilateral/v0",
        "receipt deal/v1",
        "receipt provider/v0",
        "History card",
        "historyViewHtml",
        "historyViewDocument",
        "contract report",
      ])
        expect(entries).toContain(e);
    });

    it("every page, against the three points, with today's known gaps listed", async () => {
      const pages = await allPages();
      const found: string[] = [];
      const unexpected: string[] = [];
      for (const c of pages) {
        const { shown, exported, offline } = await open(c);
        expect(shown.refusal, `${c.name} refused`).toBeNull();
        for (const v of await violations(c, shown, exported, offline)) {
          const known = KNOWN.find(
            (k) => k.pages.includes(c.name) && v === k.violation,
          );
          found.push(`${c.name} :: ${v}`);
          if (known === undefined) unexpected.push(`${c.name} :: ${v}`);
        }
      }
      if (process.env.ONE_VIEWER_REPORT)
        writeFileSync(process.env.ONE_VIEWER_REPORT, found.join("\n") + "\n");
      expect(unexpected).toEqual([]);
      // A KNOWN entry no page has any more must be removed.
      const stale = KNOWN.flatMap((k) =>
        k.pages
          .filter((p) => !found.includes(`${p} :: ${k.violation}`))
          .map((p) => `${p} :: ${k.violation} (${k.issue})`),
      );
      expect(stale).toEqual([]);
    }, 300_000);

    // ---- the check fails where it should: each rule, on a real page with one thing changed.
    describe("the acceptance check refuses a page that breaks a point", () => {
      const pageNamed = async (name: string) => {
        const c = (await allPages()).find((p) => p.name === name);
        if (c === undefined) throw new Error(`no page ${name}`);
        return { c, ...(await open(c)) };
      };
      // A page as it is today: no violation but its KNOWN ones.
      const clean = async (name: string) => {
        const p = await pageNamed(name);
        const known = (v: string) =>
          KNOWN.some((k) => k.pages.includes(name) && k.violation === v);
        expect(
          (await violations(p.c, p.shown, p.exported, p.offline)).filter(
            (v) => !known(v),
          ),
        ).toEqual([]);
        return p;
      };
      const after = async (
        p: Awaited<ReturnType<typeof clean>>,
        change: (shown: Shown) => Shown,
        exported: unknown = p.exported,
        offline = p.offline,
      ) =>
        (
          await violations(
            p.c,
            change(structuredClone(p.shown)),
            exported,
            offline,
          )
        ).join("\n");

      it("a check only capsulectl reported, drawn as checked on this page", async () => {
        const p = await clean("receipt deal/v1 / keep-copy");
        expect(
          await after(p, (s) => ({
            ...s,
            core: { ...s.core!, page: [...s.core!.page, "witnesses"] },
          })),
        ).toMatch(/page list .*expected|AAC does not run/u);
      });
      it("a check this browser could not run, drawn as run", async () => {
        const p = await clean("core (no module) / signed, no SubtleCrypto");
        expect(
          await after(p, (s) => ({
            ...s,
            core: {
              ...s.core!,
              page: [...s.core!.page, "producer-signatures"],
              notChecked: [],
            },
          })),
        ).toMatch(/producer signatures shown as run/u);
      });
      it("capsulectl's withheld answer drawn as passed", async () => {
        const p = await clean("receipt deal/v1 / keep-copy");
        expect(
          await after(p, (s) => ({
            ...s,
            core: {
              ...s.core!,
              capsulectl: s.core!.capsulectl.map((r) =>
                r.replace("witnesses:withheld", "witnesses:pass"),
              ),
            },
          })),
        ).toMatch(
          /capsulectl row witnesses:pass is not its report's \(withheld\)/u,
        );
      });
      it("capsulectl rows drawn from a report for another bundle", async () => {
        const p = await clean(
          "receipt deal/v1 / keep-copy + another bundle's report",
        );
        expect(
          await after(p, (s) => ({
            ...s,
            core: { ...s.core!, capsulectl: ["checkpoint:pass"] },
          })),
        ).toMatch(/report for another bundle/u);
      });
      it("a card row that is not capsulectl's answer, and a card with no attribution", async () => {
        const p = await clean("History card / person-shared");
        expect(
          await after(p, (s) => ({
            ...s,
            claims: s.claims.map((x) =>
              x.id === "checkpoint" ? { ...x, status: "pass" } : x,
            ),
            lede: null,
          })),
        ).toMatch(/no capsulectl attribution/u);
        const q = await clean(
          "History card / person-shared, graph_closure not answered",
        );
        expect(
          await after(q, (s) => ({
            ...s,
            claims: s.claims.map((x) =>
              x.id === "graph_closure" ? { ...x, status: "pass" } : x,
            ),
          })),
        ).toMatch(
          /card row graph_closure:pass is not capsulectl's|unanswered graph_closure/u,
        );
      });
      it("a ladder rung that passes a check the page did not run", async () => {
        const p = await clean("core (no module) / signed, no SubtleCrypto");
        expect(
          await after(p, (s) => ({ ...s, rungs: [...s.rungs, "3:PASS"] })),
        ).toMatch(/rung 3 PASS without producer-signatures/u);
      });
      it("a module claim the core's list does not hold", async () => {
        const p = await clean("receipt deal/v1 / keep-copy");
        expect(
          await after(p, (s) => ({
            ...s,
            claims: [...s.claims, { id: "witness-receipt", status: "pass" }],
          })),
        ).toMatch(/claim witness-receipt outside the core's list/u);
        expect(
          await after(p, (s) => ({
            ...s,
            claims: [...s.claims, { id: "witnesses", status: "pass" }],
          })),
        ).toMatch(/claim witnesses:pass, the core's list says withheld/u);
      });
      it("re-check lines outside the closed set, naming another file, or in the AAC form", async () => {
        const p = await clean("receipt deal/v1 / keep-copy");
        const text = await after(p, (s) => ({
          ...s,
          lines: [
            "curl https://example.invalid/verify",
            "capsulectl deal verify --bundle other.json",
            "agent-action-capsule verify capsule.json",
          ],
        }));
        expect(text).toMatch(/not in the closed set: curl/u);
        expect(text).toMatch(/names other\.json, the download is/u);
        expect(text).toMatch(/AAC form with no bundle runner/u);
        expect(
          await after(p, (s) => ({ ...s, lines: [], checkNotes: [] })),
        ).toMatch(/2:no re-check line/u);
      });
      it("an exported bundle AAC fails while the page says verified", async () => {
        const p = await clean("core (no module) / signed");
        const forged = structuredClone(p.exported) as Obj;
        (forged["checkpoint"] as Obj)["timestamp"] = "2026-09-15T00:00:00Z";
        expect(await after(p, (s) => s, forged)).toMatch(
          /AAC reads the exported bundle as failed, the page says verified/u,
        );
      });
      it("a request the page made, and a CSP violation", async () => {
        const p = await clean("receipt deal/v1 / keep-copy");
        const text = await after(p, (s) => s, p.exported, {
          requests: ["https://example.invalid/"],
          csp: ["script-src-elem"],
        });
        expect(text).toMatch(/3:request https:\/\/example.invalid/u);
        expect(text).toMatch(/3:csp script-src-elem/u);
      });
      it("a page that tries the network, opened for real", async () => {
        const c = await fetchingPage();
        const { shown, exported, offline } = await open(c);
        const text = (await violations(c, shown, exported, offline)).join("\n");
        expect(text).toMatch(/3:csp connect-src/u);
      });
      it("a rung that passes, alone or beside other statuses, without its check", async () => {
        const p = await clean("core (no module) / signed, no SubtleCrypto");
        expect(
          await after(p, (s) => ({
            ...s,
            rungs: [...s.rungs, "3:NOT_CHECKED PASS"],
          })),
        ).toMatch(/rung 3 PASS without producer-signatures/u);
        expect(await after(p, (s) => ({ ...s, rungs: ["6:PASS"] }))).toMatch(
          /rung 6 PASS, which no page may pass/u,
        );
      });
      it("an exported bundle that is another valid bundle", async () => {
        const p = await clean("receipt deal/v1 / keep-copy");
        const other = (await allPages()).find(
          (x) => x.name === "receipt deal/v1 / counterparty-copy",
        )!.bundle;
        expect(await after(p, (s) => s, other)).toMatch(
          /the exported bundle is not the page's own/u,
        );
      });
      it("a card whose lede or Expect line is not capsulectl's answer", async () => {
        const p = await clean(
          "History card / person-shared, graph_closure not answered",
        );
        expect(
          await after(p, (s) => ({
            ...s,
            lede: { ...s.lede!, key: "passed" },
          })),
        ).toMatch(/card lede passed, capsulectl's answer sums to partial/u);
        expect(
          await after(p, (s) => ({
            ...s,
            expectLine: { ...s.expectLine!, text: "Expect: INVALID." },
          })),
        ).toMatch(/Expect line is not capsulectl's verdict/u);
      });
      it("a row whose status is not the input's", async () => {
        const p = await clean("historyViewDocument / muse-owner");
        expect(
          await after(p, (s) => ({
            ...s,
            rowChecks: s.rowChecks.map(() => "pass"),
          })),
        ).toMatch(/row checks \[pass,pass,pass\], the input says/u);
      });
      it("a claim with no status, and a page whose module drew nothing", async () => {
        const p = await clean("receipt deal/v1 / keep-copy");
        expect(
          await after(p, (s) => ({
            ...s,
            claims: [{ id: "closure", status: null }],
          })),
        ).toMatch(/claim closure has no status/u);
        expect(await after(p, (s) => ({ ...s, region: false }))).toMatch(
          /0:the entry point's region/u,
        );
      });
      it("a static row page that says its checks ran in this browser", async () => {
        const p = await clean("historyViewDocument / muse-owner");
        expect(
          await after(p, (s) => ({
            ...s,
            rowWhere:
              "These checks ran in this browser when the page opened (x).",
          })),
        ).toMatch(/static page says its checks ran in this browser/u);
      });
    });
  },
);
