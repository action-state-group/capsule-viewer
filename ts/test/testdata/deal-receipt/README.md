# Deal receipt fixtures

What `test/report-receipts-browser.test.ts` (capsule-viewer#228) runs a report page's deal lines against:
evidencebook's own deal receipt module, and receipts the Mesh capsules plugin built. All are kept byte for byte.

- `deal-view.js`, `deal-view.manifest.json`, `deal-view-composed.manifest.json`: the deal view
  (`capsulectl.deal-view/v0` and `capsulectl.deal-view-composed/v0`) from evidencebook
  `capsulectl/internal/deal/assets/` at `501772c0ba113de1218af49c42eb1000f6809d7d` (origin/main when taken,
  2026-11-22). The script's SHA-256 is `7f97b62831091690b67c4802fb20fc5574ac65a3d5d76f897798013ad67ecc2e`,
  the value its composed manifest pins.
- `composition-artifact.json` (the other half came back: "Stamped by both sides"),
  `composition-absence.json` (nothing came back: "Your receipt only") and `composition-refusal.json`:
  `composed/v1` receipts the Mesh capsules plugin built, from evidencebook
  `capsulectl/internal/deal/testdata/mesh-composition/` at the same commit (built from Mesh-LLM/capsules-plugin
  at `46a688b`; the keys are the plugin tests' own).

To refresh, copy the same paths from a newer evidencebook commit and update the commit above.
