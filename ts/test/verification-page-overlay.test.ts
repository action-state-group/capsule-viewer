// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom
//
// capsule-viewer's overlay on agent-action-capsule's verification page
// model (agent-action-capsule#379): the registry's refusal rows and notices,
// and the deprecated cards' interpreters AAC 0.8.0 no longer reports.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXTENSION_NOT_INTERPRETED,
  EXTENSION_SHOWN,
  extensionRows,
} from "@action-state-group/agent-action-capsule";
import {
  aacInterpreters,
  aliasExtensionRows,
} from "../src/alias-interpreters.js";
import {
  presentationExtensionRows,
  presentationRefusalLine,
  presentationRefusalNotices,
  type PresentationRefusal,
} from "../src/presentation-registry.js";
import { renderEvidenceGraph } from "../src/browser.js";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

const refusal = (
  id: string,
  extensions: readonly string[],
): PresentationRefusal => ({
  id,
  presentation_api: "aac.presentation-api/v3",
  runtime_min: "0.1.0",
  reason: "presentation_api_unsupported",
  extensions,
  runtimeVersion: "0.1.0",
});

const outcomeBundle = {
  extensions: { "outcome-report/v1": { enabled: true } },
};
const outcomeRow = extensionRows([
  {
    kind: "outcome-report/v1",
    integrityCovered: true,
    status: "uninterpreted",
  },
]);

describe("presentationExtensionRows", () => {
  it("a covered block's refusal row begins 'Integrity verified;', and other rows are unchanged", () => {
    const rows = extensionRows([
      { kind: "composed/v1", integrityCovered: true, status: "uninterpreted" },
      { kind: "x-other", integrityCovered: true, status: "uninterpreted" },
    ]);
    const [refused, other] = presentationExtensionRows(rows, [
      refusal("org.example.x/v0", ["composed/v1"]),
    ]);
    expect(refused).toEqual({
      id: "composed/v1",
      integrity: "covered",
      refusal: refusal("org.example.x/v0", ["composed/v1"]),
      semantics:
        "Integrity verified; meaning not interpreted: presentation module org.example.x/v0 needs presentation API aac.presentation-api/v3, which this viewer does not implement",
    });
    expect(other).toBe(rows[1]);
  });

  it("the first refused module that requires the kind names the row, and it outranks an interpreter", () => {
    const shown = aliasExtensionRows(
      outcomeBundle,
      outcomeRow,
      new Set(["outcome-report-card"]),
    );
    const [row] = presentationExtensionRows(shown, [
      refusal("org.example.first/v0", ["outcome-report/v1"]),
      refusal("org.example.second/v0", ["outcome-report/v1"]),
    ]);
    expect(row!.refusal?.id).toBe("org.example.first/v0");
    expect(row!.interpreter).toBeUndefined();
  });
});

describe("presentationRefusalNotices", () => {
  it("gives one line per refused module that requires no extension, in order", () => {
    const page = refusal("org.example.page/v0", []);
    const section = refusal("org.example.section/v0", []);
    expect(
      presentationRefusalNotices([
        page,
        refusal("org.example.row/v0", ["composed/v1"]),
        section,
      ]),
    ).toEqual([
      {
        id: "org.example.page/v0",
        reason: "presentation_api_unsupported",
        line: presentationRefusalLine(page),
      },
      {
        id: "org.example.section/v0",
        reason: "presentation_api_unsupported",
        line: presentationRefusalLine(section),
      },
    ]);
    expect(presentationRefusalNotices([])).toEqual([]);
  });
});

describe("aliasExtensionRows", () => {
  it("shows an accepted outcome-report/v1 block as its card's when the card ran", () => {
    expect(
      aliasExtensionRows(
        outcomeBundle,
        outcomeRow,
        new Set(["outcome-report-card"]),
      ),
    ).toEqual([
      {
        id: "outcome-report/v1",
        integrity: "covered",
        interpreter: "outcome-report-card",
        semantics: EXTENSION_SHOWN.covered,
      },
    ]);
  });

  it("leaves the row not interpreted when the card did not run or its reader declines the block", () => {
    expect(
      aliasExtensionRows(outcomeBundle, outcomeRow, new Set(["result-root"])),
    ).toEqual(outcomeRow);
    expect(
      aliasExtensionRows(
        { extensions: { "outcome-report/v1": { enabled: false } } },
        outcomeRow,
        new Set(["outcome-report-card"]),
      ),
    ).toEqual(outcomeRow);
    expect(outcomeRow[0]!.semantics).toBe(EXTENSION_NOT_INTERPRETED);
  });

  it("an uncovered block it shows says it is not covered", () => {
    const rows = extensionRows([
      {
        kind: "outcome-report/v1",
        integrityCovered: false,
        status: "uninterpreted",
      },
    ]);
    const [row] = aliasExtensionRows(
      outcomeBundle,
      rows,
      new Set(["outcome-report-card"]),
    );
    expect(row).toEqual({
      id: "outcome-report/v1",
      integrity: "not covered",
      interpreter: "outcome-report-card",
      semantics: EXTENSION_SHOWN.notCovered,
    });
  });
});

it("aacInterpreters leaves out the alias interpreters AAC does not name", () => {
  expect([
    ...aacInterpreters(
      new Set([
        "presentation-header",
        "outcome-report-card",
        "compliance-card",
        "result-root",
      ]),
    ),
  ]).toEqual(["presentation-header", "result-root"]);
});

// The page, end to end: each deprecated card's own block reads as shown by
// the card that drew the page, as it did with AAC 0.7.0.
it.each([
  ["outcome-report-bundle.json", "outcome-report/v1", "outcome-report-card"],
  ["compliance-bundle.json", "eu-ai-act-compliance/v1", "compliance-card"],
])("%s: the %s row is interpreted by %s", async (file, kind, interpreter) => {
  const { bundle } = await sealEvidenceBundle(
    JSON.parse(
      readFileSync(resolve(process.cwd(), "test", "testdata", file), "utf8"),
    ),
  );
  const root = document.createElement("main");
  await renderEvidenceGraph(bundle, root, undefined, { depth: "L2" });
  const row = root.querySelector<HTMLElement>(
    `tr[data-extension-id="${kind}"]`,
  )!;
  expect(row.dataset).toMatchObject({
    integrity: "covered",
    semantics: "interpreted",
    interpreter,
  });
  expect(row.lastElementChild!.textContent).toBe(EXTENSION_SHOWN.covered);
});
