// Without this file vitest would load the repository root's vitest.config.js,
// which belongs to the viewer's js-tests.
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
