// Without this file vitest would load the repository root's vitest.config.js,
// which belongs to the viewer's js-tests.
import { defineConfig } from "vitest/config";

// Many tests here are CPU-bound jsdom work: sealing and verifying real
// bundles, rendering month-scale reports and opening every toggle, building
// the static page of the 451-record outcome report (about 200,000 elements).
// Their wall time is their CPU time multiplied by however loaded the machine
// is: two gates on one Mac made it 2 to 5 times longer (capsule-viewer#433),
// and a wall-clock limit sized for a quiet machine then fails with nothing
// wrong in what is tested. So the limits are hang ceilings, not work budgets:
// a test or hook that never finishes still fails, and the work a page costs
// is held by the tests' deterministic budgets (page bytes, for one).
//
// Every record in a bundle also draws its own page (record-page.ts), so the
// 450-record report is about 150,000 DOM elements in jsdom and
// presentation-builder.test.ts, which builds it in four packagings, needs
// more heap than a runner's default (about 4 GB). The cap is a ceiling, not a
// reservation.
const HANG_CEILING_MS = 20 * 60_000;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: HANG_CEILING_MS,
    hookTimeout: HANG_CEILING_MS,
    execArgv: ["--max-old-space-size=8192"],
  },
});
