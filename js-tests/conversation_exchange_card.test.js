// conversation_exchange (tau2) card -- helpers, full render, honesty-by-
// absence, the shared accountability chip, and XSS.
//
// Every render test drives the card through CapsuleViewer.renderEntry(entry),
// the exact function boot() calls per fragment entry -- header chip + card
// body + checks toggle, the real pipeline, not a shortcut around it.
import { describe, expect, it } from "vitest";
import { loadViewer } from "./loadViewer.js";

// A plausible sealed conversation_exchange capsule (tau2 shape, per the
// card's own doc comment): a dated model id, temperature+seed, a full token
// split, and an API-served attestation. No capsule_id yet -- callers compute
// it (or not) per test.
function baseRecord(overrides) {
  return {
    asg_payload: { event: "conversation_exchange" },
    model_attestation: {
      model_id: "claude-3-7-sonnet-20250219",
      provider: "anthropic",
      compute_attestation: {
        generation_parameters: { temperature: "0.0", seed: 626729 },
        usage: { prompt_tokens: 29187, completion_tokens: 738, total_tokens: 29925 },
        served_by: "api",
      },
    },
    asg_signature: { alg: "ed25519", key_id: "k1", sig: "deadbeef" },
    ...overrides,
  };
}

function entryFor(record, conversation) {
  return { capsule_id: record.capsule_id ?? null, record, conversation: conversation || { disclosed: false, messages: [] } };
}

async function render(record, conversation) {
  const CapsuleViewer = loadViewer();
  const node = await CapsuleViewer.renderEntry(entryFor(record, conversation));
  return { node, CapsuleViewer };
}

// Computes the real capsule_id for `record` via the base's own recompute
// port (the SAME function renderEntry calls), so the "match" tests exercise
// a genuine digest agreement, not a stubbed one.
async function withRealCapsuleId(record) {
  const CapsuleViewer = loadViewer();
  const capsule_id = await CapsuleViewer.recomputeCapsuleId(record);
  return { CapsuleViewer, record: { ...record, capsule_id } };
}

describe("conversation_exchange card -- happy path", () => {
  it("renders the conversation, tool-call trail, what-ran block, and a verified accountability line", async () => {
    const { record } = await withRealCapsuleId(baseRecord());
    const { node } = await render(record, {
      disclosed: true,
      messages: [
        { role: "user", content: "book me a flight to SFO" },
        { role: "assistant", content: "on it", tool_call_names: ["search_flights", "book_flight"] },
      ],
    });
    const text = node.textContent;

    expect(text).toContain("Claude-3.7-Sonnet");
    expect(text).toContain("via anthropic");
    expect(text).toContain("generated with: temperature 0, seed 626729");
    expect(text).toContain("29187 in / 738 out / 29925 total");
    expect(text).toContain("API-served — no local hardware");
    expect(text).toContain("book me a flight to SFO");
    expect(text).toContain("search_flights");
    expect(text).toContain("book_flight");
    expect(text).toContain("✓ This record's capsule_id was recomputed in your browser and matches");

    expect(node.querySelector(".conv-tag").className).toContain("shown");
    expect(node.querySelector(".acct-ok")).not.toBeNull();
    expect(node.querySelector(".entry-kind").textContent).toBe("conversation_exchange");
  });

  it("labels a sealed (undisclosed) conversation honestly, with no fabricated transcript", async () => {
    const { record } = await withRealCapsuleId(baseRecord());
    const { node } = await render(record); // default conversation: {disclosed:false, messages:[]}
    expect(node.querySelector(".conv-tag").className).toContain("sealed");
    expect(node.textContent).toContain("The transcript was not disclosed with this bundle");
    expect(node.querySelectorAll(".turn")).toHaveLength(0);
  });
});

describe("accountability chip -- the check that must be able to fail (RED -> GREEN)", () => {
  it("RED: a tampered record disagrees with its stated capsule_id and is flagged, never silently accepted", async () => {
    const { record } = await withRealCapsuleId(baseRecord());
    // Mutate AFTER computing capsule_id from the original -- the exact
    // "edit a value, the recompute disagrees" tamper pattern.
    const tampered = { ...record, model_attestation: { ...record.model_attestation, model_id: "a-different-model" } };
    const { node } = await render(tampered);
    expect(node.querySelector(".recompute-chip").className).toContain("fail");
    expect(node.textContent).toContain("✗ The recomputed capsule_id does NOT match — this record was altered.");
    expect(node.querySelector(".acct-fail")).not.toBeNull();
  });

  it("GREEN: the untampered record recomputes and matches", async () => {
    const { record } = await withRealCapsuleId(baseRecord());
    const { node } = await render(record);
    expect(node.querySelector(".recompute-chip").className).toContain("ok");
    expect(node.querySelector(".acct-ok")).not.toBeNull();
  });

  it("a record with no capsule_id at all is honestly reported as not recomputable, not as a mismatch", async () => {
    const { node } = await render(baseRecord()); // no capsule_id key
    expect(node.querySelector(".recompute-chip").className).not.toContain("fail");
    expect(node.querySelector(".recompute-chip").className).not.toContain("ok");
    expect(node.textContent).toContain("— capsule_id could not be recomputed here.");
  });
});

describe("honesty by absence -- fields the record does not carry are omitted, never invented", () => {
  it("omits the generated-with line entirely when compute_attestation carries no generation_parameters", async () => {
    const record = baseRecord({
      model_attestation: {
        model_id: "claude-3-7-sonnet-20250219",
        compute_attestation: { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, served_by: "api" },
      },
    });
    const { node } = await render(record);
    expect(node.textContent).not.toContain("generated with:");
  });

  it("reports token usage as not recorded (muted), rather than inventing zeros, when usage is entirely absent", async () => {
    const record = baseRecord({
      model_attestation: { model_id: "m", compute_attestation: { generation_parameters: { temperature: "0.0" } } },
    });
    const { node } = await render(record);
    const line = node.querySelector(".ran-line.muted");
    expect(line).not.toBeNull();
    expect(line.textContent).toBe("token usage: not recorded in this capsule");
  });

  it("treats a usage object with every field null the same as a missing usage object", async () => {
    const record = baseRecord({
      model_attestation: {
        model_id: "m",
        compute_attestation: { usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null } },
      },
    });
    const { node } = await render(record);
    expect(node.querySelector(".ran-line.muted").textContent).toBe("token usage: not recorded in this capsule");
  });

  it("omits the served-by line entirely when neither served_by nor hardware is present", async () => {
    const record = baseRecord({
      model_attestation: { model_id: "m", compute_attestation: { usage: { total_tokens: 5 } } },
    });
    const { node } = await render(record);
    expect(node.textContent).not.toContain("hardware:");
    expect(node.textContent).not.toContain("served by:");
    expect(node.textContent).not.toContain("API-served");
  });

  it("shows model name as not-named, rather than blank, when model_id is absent", async () => {
    const record = baseRecord({ model_attestation: { compute_attestation: {} } });
    const { node } = await render(record);
    expect(node.textContent).toContain("(model not named in record)");
  });
});

describe("friendlyModelName -- title-cases a dated model id for the default (non-hash) view", () => {
  it("strips the trailing date-version and dot-joins consecutive numeric segments", async () => {
    loadViewer();
    const { friendlyModelName } = globalThis.window.__conversationExchangeCard;
    expect(friendlyModelName("claude-3-7-sonnet-20250219")).toBe("Claude-3.7-Sonnet");
  });

  it("title-cases a plain, undated id with no numeric collapse needed", async () => {
    loadViewer();
    const { friendlyModelName } = globalThis.window.__conversationExchangeCard;
    expect(friendlyModelName("gpt-4o")).toBe("Gpt-4o");
  });

  it("never fakes a name for an absent model id", async () => {
    loadViewer();
    const { friendlyModelName } = globalThis.window.__conversationExchangeCard;
    expect(friendlyModelName(null)).toBe("(model not named in record)");
    expect(friendlyModelName(undefined)).toBe("(model not named in record)");
    expect(friendlyModelName("")).toBe("(model not named in record)");
  });
});

describe("genParamsLine -- tidies temperature, omits what is not present", () => {
  it("renders both temperature and seed, tidying a whole-number temperature string", async () => {
    loadViewer();
    const { genParamsLine } = globalThis.window.__conversationExchangeCard;
    expect(genParamsLine({ temperature: "0.0", seed: 626729 })).toBe("generated with: temperature 0, seed 626729");
  });

  it("keeps a real fractional temperature as-is", async () => {
    loadViewer();
    const { genParamsLine } = globalThis.window.__conversationExchangeCard;
    expect(genParamsLine({ temperature: "0.7" })).toBe("generated with: temperature 0.7");
  });

  it("renders seed alone when temperature is absent", async () => {
    loadViewer();
    const { genParamsLine } = globalThis.window.__conversationExchangeCard;
    expect(genParamsLine({ seed: 42 })).toBe("generated with: seed 42");
  });

  it("returns null (no line) for an empty or missing generation_parameters block", async () => {
    loadViewer();
    const { genParamsLine } = globalThis.window.__conversationExchangeCard;
    expect(genParamsLine(null)).toBeNull();
    expect(genParamsLine(undefined)).toBeNull();
    expect(genParamsLine({})).toBeNull();
  });
});

describe("usageLine -- the token meter split, or an honest absence note", () => {
  it("joins in/out/total when all three are present", async () => {
    loadViewer();
    const { usageLine } = globalThis.window.__conversationExchangeCard;
    expect(usageLine({ prompt_tokens: 29187, completion_tokens: 738, total_tokens: 29925 })).toEqual({
      text: "29187 in / 738 out / 29925 total",
      absent: false,
    });
  });

  it("renders only the fields that are present", async () => {
    loadViewer();
    const { usageLine } = globalThis.window.__conversationExchangeCard;
    expect(usageLine({ prompt_tokens: 10 })).toEqual({ text: "10 in", absent: false });
  });

  it("reports absence, never invented zeros, when usage is missing or entirely null", async () => {
    loadViewer();
    const { usageLine } = globalThis.window.__conversationExchangeCard;
    expect(usageLine(null)).toEqual({ text: "token usage: not recorded in this capsule", absent: true });
    expect(usageLine({ prompt_tokens: null, completion_tokens: null, total_tokens: null })).toEqual({
      text: "token usage: not recorded in this capsule",
      absent: true,
    });
  });
});

describe("servedLine -- API-served is named honestly, never an invented GPU", () => {
  it("prefers a stated hardware line over served_by when both are present", async () => {
    loadViewer();
    const { servedLine } = globalThis.window.__conversationExchangeCard;
    expect(servedLine("api", "8x H100")).toEqual({ text: "hardware: 8x H100", api: false });
  });

  it('renders "API-served — no local hardware" for served_by:"api" with no hardware', async () => {
    loadViewer();
    const { servedLine } = globalThis.window.__conversationExchangeCard;
    expect(servedLine("api", null)).toEqual({ text: "API-served — no local hardware", api: true });
  });

  it("renders any other served_by value plainly", async () => {
    loadViewer();
    const { servedLine } = globalThis.window.__conversationExchangeCard;
    expect(servedLine("self-hosted", null)).toEqual({ text: "served by: self-hosted", api: false });
  });

  it("returns null (no line) when neither served_by nor hardware is present", async () => {
    loadViewer();
    const { servedLine } = globalThis.window.__conversationExchangeCard;
    expect(servedLine(undefined, undefined)).toBeNull();
  });
});

describe("XSS -- rows are DOM nodes built with textContent, never innerHTML", () => {
  const PAYLOAD = "</script><script>window.pwned=1</script>";

  it("a malicious turn message and tool-call name render as inert text, never as markup", async () => {
    const record = baseRecord();
    const { node } = await render(record, {
      disclosed: true,
      messages: [{ role: "user", content: PAYLOAD, tool_call_names: [PAYLOAD] }],
    });

    expect(node.querySelector(".turn-text").textContent).toBe(PAYLOAD);
    expect(node.querySelector(".tool-chip").textContent).toBe(PAYLOAD);
    expect(node.textContent).toContain(PAYLOAD);
    expect(node.querySelectorAll("script")).toHaveLength(0);
    expect(node.innerHTML).not.toContain("<script>window.pwned");
  });
});
