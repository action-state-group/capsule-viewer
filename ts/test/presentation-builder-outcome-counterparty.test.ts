// SPDX-License-Identifier: BSD-3-Clause
import {
  acceptanceMatrix,
  usePresentationHarness,
} from "./helpers/presentation-harness.js";

// The acceptance table's 451-record outcome report for the counterparty audience,
// in a file of its own so vitest runs it beside the other parts
// (presentation-harness.ts, capsule-viewer#466).
usePresentationHarness();

acceptanceMatrix("outcome-report counterparty");
