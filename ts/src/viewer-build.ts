// SPDX-License-Identifier: BSD-3-Clause

/**
 * The code that draws and verifies a report page: this package and the
 * verifier it is built with, each at its exact version. A report's
 * "Verified by" line names these. They are constants, not read at run time,
 * so every packaging of a page (offline file, fragment, embedded, static)
 * says the same thing. test/viewer-build.test.ts holds them to the installed
 * packages, and scripts/build-iife.mjs refuses to bundle the page runtime
 * when they disagree.
 */
export interface ViewerBuild {
  readonly viewer: string;
  readonly viewerVersion: string;
  readonly verifier: string;
  readonly verifierVersion: string;
  readonly cllVersion?: string;
}

export const VIEWER_BUILD: ViewerBuild = {
  viewer: "@action-state-group/capsule-viewer",
  viewerVersion: "0.1.0",
  verifier: "@action-state-group/agent-action-capsule",
  verifierVersion: "0.1.1",
  cllVersion: "0.2.1",
};
