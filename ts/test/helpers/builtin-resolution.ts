// SPDX-License-Identifier: BSD-3-Clause
// Moved from agent-action-capsule ts/test/helpers/builtin-resolution.ts at 60a5b11
// (agent-action-capsule#379); imports adapted.
// The built-in page a verified bundle resolves to, by the built-in manifests
// alone (BUILTIN_MANIFESTS, every module able to render). The modules that
// draw those pages are capsule-viewer's (action-state-group/capsule-viewer);
// which one a bundle selects is AAC's registry and manifests.
import type { VerifiedBundleContext } from "@action-state-group/agent-action-capsule";
import { BUILTIN_MANIFESTS } from "../../src/builtin-manifests.js";
import { PresentationRegistry } from "../../src/presentation-registry.js";
import { stub } from "./presentation-resolution-vectors.js";

/** The selected built-in id, or the resolution kind when none is selected. */
export async function builtinPage(
  context: VerifiedBundleContext,
): Promise<string> {
  const registry = new PresentationRegistry();
  for (const manifest of BUILTIN_MANIFESTS) registry.register(stub(manifest));
  const resolution = await registry.resolve(context, "*", "html");
  return resolution.kind === "module"
    ? resolution.module.manifest.id
    : `<${resolution.kind}>`;
}
