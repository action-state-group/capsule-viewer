// Without this file vitest would load the repository root's vitest.config.js,
// which belongs to the viewer's js-tests.
import { defineConfig } from "vitest/config";

// A few tests seal and verify several real bundles end to end, and the
// report-card suites render sealed month-scale fixtures and open every
// toggle; under this suite's full parallel run that can pass 5s each on a
// loaded or slower box, well past vitest's 5000ms default, with nothing
// wrong in what they're testing.
//
// Every record in a bundle also draws its own page (record-page.ts), so the
// 450-record report is about 150,000 DOM elements in jsdom and
// presentation-builder.test.ts, which builds it in four packagings, needs
// more heap than a runner's default (about 4 GB). The cap is a ceiling, not a
// reservation.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    execArgv: ["--max-old-space-size=8192"],
  },
});
