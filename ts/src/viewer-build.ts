// SPDX-License-Identifier: BSD-3-Clause

/**
 * The code that draws and verifies a report page: this package and the
 * verifier it is built with, each at its exact version. A report's
 * "Verified by" line names these. They are constants, not read at run time,
 * so every packaging of a page (offline file, fragment, embedded, static)
 * says the same thing. test/report-provenance.test.ts holds them to the installed
 * packages, and scripts/build-iife.mjs refuses to bundle the page runtime
 * when they disagree.
 */
export interface ViewerBuild {
  readonly viewer: string;
  readonly viewerVersion: string;
  readonly verifier: string;
  readonly verifierVersion: string;
  readonly cllVersion?: string;
  /**
   * Whether this exact build was made from the ts/v<viewerVersion> release
   * tag, so the "Verified by" line can say so only when it is actually
   * true. False here in source control; .github/workflows/publish-ts.yml
   * flips it to true as a build step, only in the job that checks out that
   * tag to publish it. Every other build -- including this file read
   * as-is, and CI's own `ts` job on a branch or pull request -- is a dev
   * build of viewerVersion, not that release.
   */
  readonly release: boolean;
}

export const VIEWER_BUILD: ViewerBuild = {
  viewer: "@action-state-group/capsule-viewer",
  viewerVersion: "0.1.0",
  verifier: "@action-state-group/agent-action-capsule",
  verifierVersion: "0.5.0",
  cllVersion: "0.2.1",
  release: false,
};
