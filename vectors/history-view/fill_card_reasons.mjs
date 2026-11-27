// SPDX-License-Identifier: Apache-2.0
// Writes each card- refusal vector's reasons from the TypeScript view (after make_cards.py):
//   npx esbuild ts/src/history-view.ts --bundle --format=esm --platform=node --outfile=<tmp>/hv.mjs
//   node vectors/history-view/fill_card_reasons.mjs <tmp>/hv.mjs
// Review the reasons it writes: both twins are then held to them.
import { readFileSync, writeFileSync } from "node:fs";
const hv = await import(process.argv[2]);
const path = new URL("./refusals.json", import.meta.url);
const doc = JSON.parse(readFileSync(path, "utf8"));
for (const c of doc.cases) {
  if (!c.name.startsWith("card-")) continue;
  const built = hv.buildHistoryView(c.input, c.overlay);
  if (built.ok) throw new Error(`${c.name} is not refused`);
  c.reasons = built.reasons;
}
writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
