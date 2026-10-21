// Without this file vitest would load the repository root's vitest.config.js,
// which belongs to the viewer's js-tests.
import { defineConfig } from "vitest/config";

// A few tests seal and verify several real bundles end to end; under this
// suite's full parallel run that can pass 5s on a loaded or slower box, well
// past vitest's 5000ms default, with nothing wrong in what they're testing.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], testTimeout: 20000 },
});
