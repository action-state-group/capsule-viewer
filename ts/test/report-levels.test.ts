// SPDX-License-Identifier: BSD-3-Clause
// @vitest-environment jsdom

import { expect, it } from "vitest";
import {
  caseParts,
  exactText,
  judgedOf,
  judgeNote,
  lazyBody,
  levelToggle,
  openToggle,
  renderChat,
  ruleWord,
} from "../src/report-levels.js";

it("a toggle is level-tagged and builds its body only when first opened", () => {
  let builds = 0;
  const toggle = levelToggle(1, "Show the 3 conversations", () => {
    builds += 1;
    return document.createElement("div");
  });
  expect(toggle.dataset.level).toBe("1");
  expect(builds).toBe(0);
  openToggle(toggle);
  openToggle(toggle);
  expect(builds).toBe(1);
  expect(
    levelToggle(2, "Proofs", () => document.createElement("p"), {
      eager: true,
    }).querySelector("p"),
  ).not.toBeNull();
});

it("the conversation reads as a chat: who spoke, and each tool called with its arguments", () => {
  const chat = renderChat(
    {
      state: "verified",
      transcriptRecordId: "tx",
      caseRecordId: "case",
      inputDigest: "d".repeat(64),
      turns: [
        { role: "user", content: "cancel my trip", toolCalls: [] },
        {
          role: "assistant",
          content: "looking it up",
          toolCalls: [
            { name: "get_user_details", arguments: '{"user_id":"u1"}' },
          ],
        },
        {
          role: "tool",
          content: '{"user_id":"u1","flights":[]}',
          toolCalls: [],
        },
      ],
    },
    "case",
  );
  const turns = [...chat.querySelectorAll<HTMLElement>("li.turn")];
  expect(turns.map((t) => t.querySelector(".who")!.textContent)).toEqual([
    "User",
    "Agent",
    "Tool result",
  ]);
  const call = chat.querySelector<HTMLElement>(
    '[data-tool-call="get_user_details"]',
  )!;
  // the arguments as the model hands them over, never claimed verbatim
  expect(call.textContent).toBe('called get_user_details {"user_id":"u1"}');
  expect(call.querySelector("code")!.dataset.exact).toBe("as-modelled");
  expect(chat.textContent).toContain(
    "Tool arguments are shown as the report model hands them over, re-serialised",
  );
  // a JSON tool result is indented for reading, the words unchanged
  expect(turns[2]!.querySelector("pre")!.textContent).toBe(
    JSON.stringify({ user_id: "u1", flights: [] }, null, 2),
  );
  expect(chat.textContent).toContain("3 messages, 1 tool call.");
});

it("a transcript read from the case the claims cite (the reports withheld) is drawn, and never called the conversation the judge read", () => {
  const chat = renderChat(
    {
      state: "cited",
      transcriptRecordId: "case",
      caseRecordId: "case",
      inputDigest: "d".repeat(64),
      turns: [{ role: "user", content: "cancel my trip", toolCalls: [] }],
    },
    "case",
  );
  expect(chat.dataset.transcript).toBe("cited");
  expect(chat.querySelectorAll("li.turn")).toHaveLength(1);
  expect(chat.textContent).toContain(
    "The judge's reports are withheld, so which conversation the judge read is not shown.",
  );
  expect(chat.textContent).not.toContain(
    "the conversation the judge read, checked",
  );
  expect(chat.textContent).not.toContain(
    "The exact conversation the judge read",
  );
});

it("a missing or refused transcript says so in plain words and names the case record", () => {
  expect(renderChat({ state: "absent" }, "abc").textContent).toContain(
    "not in this bundle. It is sealed in the case record abc",
  );
  expect(
    renderChat({ state: "mismatch", reason: "it does not check" }, "abc")
      .textContent,
  ).toContain("not shown: it does not check");
});

it("result words: plain by default; the grade ladder behind the flag, inconclusive only when a judge ran", () => {
  expect(ruleWord("met", false, "yes").word).toBe("met");
  expect(ruleWord("not_applicable", false, "yes").word).toBe("did not apply");
  expect(ruleWord("not_evaluable", false, "yes").word).toBe("could not decide");
  expect(ruleWord("met", true, "yes").word).toBe("established");
  expect(ruleWord("not_met", true, "yes").word).toBe("failed");
  expect(ruleWord("not_applicable", true, "yes").word).toBe("not present");
  expect(ruleWord("not_evaluable", true, "yes").word).toBe("inconclusive");
  expect(ruleWord("not_evaluable", true, "no").word).toBe("not checked");
});

it("judged: a withheld report reads 'withheld', a report in the bundle that cannot be read is never called withheld, and neither says 'not checked'", () => {
  expect(judgedOf("disclosed", "f".repeat(64))).toBe("yes");
  expect(judgedOf("disclosed", undefined)).toBe("no");
  expect(judgedOf("withheld", undefined)).toBe("withheld");
  for (const state of ["mismatch", "unreadable", "invalid"] as const) {
    expect(judgedOf(state, undefined)).toBe("unknown");
    const word = ruleWord("not_evaluable", true, judgedOf(state, undefined));
    expect(word.word).toBe("could not decide (report not available)");
    expect(word.word).not.toContain("withheld");
  }
  const withheld = ruleWord(
    "not_evaluable",
    true,
    judgedOf("withheld", undefined),
  );
  expect(withheld.word).toBe("could not decide (report withheld)");
  expect(withheld.word).not.toBe("not checked");
});

it("a failed or unsupported claim reads the same on both word sets, never 'not checked'", () => {
  for (const ladder of [false, true]) {
    expect(ruleWord("failed", ladder, "yes")).toEqual({
      word: "failed verification",
      tone: "ne",
    });
    expect(ruleWord("unsupported", ladder, "unknown")).toEqual({
      word: "evidence missing",
      tone: "ne",
    });
  }
});

it("tool results are shown exactly as sealed: indented only when that changes nothing but whitespace", () => {
  // a number JSON cannot hold exactly: JSON.parse would print 12345678901234567000
  expect(exactText('{"id":12345678901234567890}')).toEqual({
    text: '{"id":12345678901234567890}',
    indented: false,
  });
  // duplicate keys: parsing would drop the first
  expect(exactText('{"a":1,"a":2}')).toEqual({
    text: '{"a":1,"a":2}',
    indented: false,
  });
  // an escape written another way, or a number written another way
  expect(exactText('{"a":"\\u0041"}').indented).toBe(false);
  expect(exactText('{"n":1.0}').indented).toBe(false);
  // a whitespace-only difference indents; whitespace inside strings is kept
  expect(exactText('{ "a" : [1, 2], "b": "x  y" }')).toEqual({
    text: JSON.stringify({ a: [1, 2], b: "x  y" }, null, 2),
    indented: true,
  });
  expect(exactText("not json")).toEqual({ text: "not json", indented: false });
  const chat = renderChat(
    {
      state: "verified",
      turns: [
        {
          role: "tool",
          content: '{"id":12345678901234567890,"id":1}',
          toolCalls: [],
        },
      ],
    },
    "case",
  );
  const pre = chat.querySelector<HTMLElement>("li.turn pre")!;
  expect(pre.textContent).toBe('{"id":12345678901234567890,"id":1}');
  expect(pre.dataset.exact).toBe("verbatim");
});

it("a role named like an object property is shown as written, never looked up on the prototype", () => {
  const chat = renderChat(
    {
      state: "verified",
      turns: [
        { role: "constructor", content: "x", toolCalls: [] },
        { role: "toString", content: "y", toolCalls: [] },
      ],
    },
    "case",
  );
  expect([...chat.querySelectorAll(".who")].map((w) => w.textContent)).toEqual([
    "constructor",
    "toString",
  ]);
});

it("a conversation body in place is built when it nears the view, or at once where there is no IntersectionObserver", () => {
  const host = document.createElement("div");
  let builds = 0;
  lazyBody(host, () => {
    builds += 1;
    return document.createElement("p");
  });
  // jsdom has no IntersectionObserver: built at once
  expect(builds).toBe(1);
  expect(host.dataset.body).toBe("built");

  const callbacks: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  const g = globalThis as { IntersectionObserver?: unknown };
  g.IntersectionObserver = class {
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      callbacks.push(cb);
    }
    observe(): void {}
    disconnect(): void {}
  };
  try {
    const lazy = document.createElement("div");
    lazyBody(lazy, () => document.createElement("p"));
    expect(lazy.dataset.body).toBe("pending");
    expect(lazy.querySelector("p")).toBeNull();
    callbacks[0]!([{ isIntersecting: true }]);
    expect(lazy.dataset.body).toBe("built");
    expect(lazy.querySelectorAll("p")).toHaveLength(1);
  } finally {
    delete g.IntersectionObserver;
  }
});

it("printing builds only the bodies still pending in the page, with one listener for the page, none left behind per body", () => {
  const g = globalThis as { IntersectionObserver?: unknown };
  g.IntersectionObserver = class {
    observe(): void {}
    disconnect(): void {}
  };
  const added: string[] = [];
  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = ((type: string, ...rest: unknown[]) => {
    added.push(type);
    return (realAdd as (...a: unknown[]) => void)(type, ...rest);
  }) as typeof window.addEventListener;
  try {
    const attached = document.createElement("div");
    const detached = document.createElement("div");
    document.body.append(attached);
    let detachedBuilds = 0;
    lazyBody(attached, () => document.createElement("p"));
    lazyBody(detached, () => {
      detachedBuilds += 1;
      return document.createElement("p");
    });
    lazyBody(document.createElement("div"), () => document.createElement("p"));
    // at most one beforeprint listener, however many bodies are pending
    expect(added.filter((t) => t === "beforeprint").length).toBeLessThanOrEqual(
      1,
    );
    window.dispatchEvent(new Event("beforeprint"));
    expect(attached.dataset.body).toBe("built");
    // a body no longer in the page (its card unmounted) is not built
    expect(detachedBuilds).toBe(0);
    attached.remove();
  } finally {
    window.addEventListener = realAdd;
    delete g.IntersectionObserver;
  }
});

it("case labels name the task and trial, with the agent model beside them", () => {
  expect(
    caseParts("tau2:airline:claude-3-7-sonnet-20250219:task-13:trial-2"),
  ).toEqual({
    label: "task 13, trial 2",
    model: "claude-3-7-sonnet-20250219",
  });
  expect(caseParts("tau2:airline:task-20:trial-0")).toEqual({
    label: "task 20, trial 0",
  });
  expect(caseParts("something-else")).toEqual({ label: "something-else" });
});

it("the judge's synthesized rationale reads as how sure it was; any other note is shown as sealed", () => {
  expect(
    judgeNote(
      "jev choice: not_met (probabilities={'met': 0.22, 'not_met': 0.78, 'not_evaluable': 0.0}, confidence=0.67). No free-text reasoning.",
      "not_met",
    ),
  ).toBe("The judge was 78% sure.");
  expect(
    judgeNote("first assistant turn is the runner's greeting", "not_evaluable"),
  ).toBe("first assistant turn is the runner's greeting");
  // an exponent is not a probability: never "120% sure"
  const exponent = "jev choice: met (probabilities={'met': 1.2e2}).";
  expect(judgeNote(exponent, "met")).toBe(exponent);
  // the verdict is looked up as the parse's own key, never on the prototype
  const plain = "jev choice: met (probabilities={'met': 0.5}).";
  expect(judgeNote(plain, "constructor")).toBe(plain);
});
