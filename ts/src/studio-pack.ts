// SPDX-License-Identifier: Apache-2.0
/**
 * What a pack's report page cites (docs/design/studio-page.md section 7,
 * ruled by Steven on capsule-viewer#291): the page's own bundle digest, and
 * the dataset and plan digests its Result names (Evidence Result v0 section
 * 7.3). Two packs judged over the same data are two bundles, each with one
 * Result; what they share is `dataset_ref` and `plan_ref`, never a bundle
 * digest. Read from the bundle itself, so a caller that builds the studio-view
 * input from it cites what the page's own bundle carries (the view draws what
 * it is given and checks only its form).
 */
import {
  buildResultRoot,
  buildVerifiedBundleContext,
  bundleVerified,
  isResultRoot,
} from "@action-state-group/agent-action-capsule";
import { resultDatasetRefs } from "./chart-dataset.js";

export interface PackCitation {
  readonly bundle_digest: string;
  /** Both or neither, as in the Result spec. */
  readonly shared?: {
    readonly dataset_ref: string;
    readonly plan_ref: string;
  };
}

/** Refuses a bundle that does not verify or whose root is not an Evidence Result. */
export async function packCitation(bundle: unknown): Promise<PackCitation> {
  const context = await buildVerifiedBundleContext(bundle);
  if (!bundleVerified(context.verification))
    throw new Error("packCitation: the bundle does not verify");
  const digest = context.verification.bundleDigest;
  if (typeof digest !== "string")
    throw new Error("packCitation: the bundle has no computable digest");
  if (!(await isResultRoot(context)))
    throw new Error(
      "packCitation: the bundle's root is not an Evidence Result",
    );
  const shared = resultDatasetRefs(context, await buildResultRoot(context));
  return { bundle_digest: digest, ...(shared === undefined ? {} : { shared }) };
}
