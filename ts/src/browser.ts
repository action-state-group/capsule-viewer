// SPDX-License-Identifier: Apache-2.0
// The in-browser renderer the emitted page runs. It is published only as
// dist/evidence-graph.iife.js (`npm run emitter:iife`), which exposes
// renderEvidenceGraph, and not as a package export. It bundles
// @action-state-group/agent-action-capsule (0.8.0 or later) through that
// package's own browser entry, by plain package resolution. The Go module
// ships the build as go/pageruntime.
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
// browser can verify Ed25519 signatures). This list is the runtime's contract
// with presentation modules: a name is added here only from
// agent-action-capsule's verifier, and removing one breaks the modules that
// call it.
export {
  disclosureOf,
  ed25519Available,
  verifiedPayload,
  verifyDisclosureEnvelope,
  verifyProducerEnvelope,
} from "@action-state-group/agent-action-capsule";
