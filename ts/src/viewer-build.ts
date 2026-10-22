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
   * The first 12 hex characters of the commit this exact build was made
   * from, when the build supplied one; undefined when none did, so the
   * "Verified by" line says the commit is not stated. Never a release
   * flag: the line names what the build actually was.
   */
  readonly commit?: string;
}

/**
 * esbuild's `define` for __CAPSULE_VIEWER_COMMIT__ (scripts/build-iife.mjs)
 * is the only source of this value; it is declared here only so tsc accepts
 * the reference. tsc's own ESM output (dist/) never defines it, so every
 * read goes behind `typeof ... === "string"`, which is safe on an
 * undeclared global.
 */
declare const __CAPSULE_VIEWER_COMMIT__: string;

const COMMIT_SHA = /^[0-9a-f]{40}$/u;

/**
 * The 12-hex prefix of a full 40-hex commit sha; undefined for anything
 * else, including "". Exported so a test can assert the rejection directly,
 * without redefining the build-time global below.
 */
export function commitPrefix(value: string): string | undefined {
  return COMMIT_SHA.test(value) ? value.slice(0, 12) : undefined;
}

/** The 12-hex prefix of a build-supplied commit; undefined for anything else, including a value that isn't a full 40-hex sha. */
function builtCommit(): string | undefined {
  if (typeof __CAPSULE_VIEWER_COMMIT__ !== "string") return undefined;
  return commitPrefix(__CAPSULE_VIEWER_COMMIT__);
}

const commit = builtCommit();

export const VIEWER_BUILD: ViewerBuild = {
  viewer: "@action-state-group/capsule-viewer",
  viewerVersion: "0.1.0",
  verifier: "@action-state-group/agent-action-capsule",
  verifierVersion: "0.6.0",
  cllVersion: "0.2.1",
  ...(commit === undefined ? {} : { commit }),
};
