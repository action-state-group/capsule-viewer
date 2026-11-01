// SPDX-License-Identifier: Apache-2.0
// The in-browser renderer the emitted page runs. It is published only as
// dist/evidence-graph.iife.js (`npm run emitter:iife`), which exposes
// renderEvidenceGraph, and not as a package export. It bundles
// @action-state-group/agent-action-capsule (0.9.0 or later) and
// @action-state-group/cll, each through its own browser entry, by plain
// package resolution. The Go module ships the build as go/pageruntime.
export * from "./evidence-graph-view.js";
export * from "./contract-report.js";
export * from "./contract-report-wording.js";
export { conversationStatus } from "./outcome-report-view.js";
export { obligationStatus, rowStatus } from "./compliance-view.js";
export * from "./presentation-mount.js";

// The verifier functions a presentation module may call on the runtime's
// global (EvidenceGraph), beside registerPresentation: agent-action-capsule's
// own functions, re-exported by name and unchanged, so a module verifies with
// the same verifier the page does (ed25519Available is its check that the
// browser can verify Ed25519 signatures; buildResultRoot is its Result
// reader, which the Show-evidence component, static/show_evidence.js, draws
// from; buildVerifiedBundleContext verifies a bundle a module carries inside
// the one the page verified, such as each member of a composed/v1 bundle,
// capsule-viewer#167). This list is the runtime's contract
// with presentation modules: a name is added here only from
// agent-action-capsule's verifier, and removing one breaks the modules that
// call it.
export {
  buildResultRoot,
  buildVerifiedBundleContext,
  disclosureOf,
  ed25519Available,
  verifiedPayload,
  verifyDisclosureEnvelope,
  verifyProducerEnvelope,
} from "@action-state-group/agent-action-capsule";

// The reader's own witness list, and the History card's witness standing under
// it (static/standard_history_card.js; capsule-viewer#183). The check is
// agent-action-capsule's checkAnchorWitnessed, unchanged; the module calls
// readerAnchorWitness and verifies nothing itself.
export {
  readerAnchorWitness,
  readerWitnessPolicy,
  setReaderWitnessPolicy,
} from "./reader-witnesses.js";

// The deal receipt's two checks a module may not run (capsule-viewer#214;
// evidencebook-deal#94, 9b frame 8): a Lightning settlement's preimage
// against its payment hash (lightning-v0 `preimage_verified`), and a deal
// bundle's x-cadence-witness/v0 chain with its receipts under the reader's
// own witness list. Built from cll's checkpoint and MMR verifiers and
// agent-action-capsule's JCS and receipt check; the module verifies nothing.
export { paymentPreimageCheck } from "./payment-preimage.js";
export { readerCadenceWitness } from "./cadence-witness.js";

// The History card's signature (capsule-viewer#211; rule F4.7): the context's
// own strict verdict for the root record, which the module draws and does
// not decide.
export { readerCardSignature } from "./card-signature.js";
