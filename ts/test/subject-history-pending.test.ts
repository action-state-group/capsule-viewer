// SPDX-License-Identifier: BSD-3-Clause
import { describe, it } from "vitest";

// Outcomes frame 5 of Steven's Terms Pack canvas ("Same customer in this
// report", view="subject-history", capsule-viewer#122). No bundle carries the
// data it draws, so nothing here can run yet. The producer emits it in a
// pack-namespaced `x-airline-support-outcomes` member on the day Result
// (evidencebook-skills#89; no new AAC vocabulary, agent-action-capsule#511).
// When a fixture carrying it exists, replace each todo with a golden and a
// test; never draw the page from invented data.
describe("subject-history (frame 5): waiting on producer data", () => {
  it.todo("a per-conversation customer handle, with its handle_scope");
  it.todo(
    "follow_up_of: a later conversation cites the earlier root through references[]",
  );
  it.todo(
    "a request label per conversation from the pack's closed list (seat change, refund)",
  );
  it.todo("a USD band per conversation (USD e+1, USD e+2)");
  it.todo("the customer's halves present per conversation (4 of 4)");
  it.todo(
    "a slice count is never drawn without its denominator (the canvas's 'of the report's 244')",
  );
  it.todo(
    "the operator page draws all five fields; the shared page draws only label, band and halves, no handle and no follow_up_of",
  );
  it.todo(
    "a buyer-facing pack build with the handle enabled fails until the per-share salt lands (evidencebook-skills#93)",
  );
});
