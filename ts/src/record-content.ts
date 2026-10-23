// SPDX-License-Identifier: BSD-3-Clause
import type {
  ConversationTranscript,
  TranscriptTurn,
} from "@action-state-group/agent-action-capsule";
import type { Words } from "./contract-report-wording.js";
import { renderChat } from "./report-levels.js";

/**
 * How the core draws a record's disclosed content: the core checks it
 * against the record's digest first (the verifier's disclosure resolution;
 * a value that does not hash to its commitment is never drawn), then hands
 * it to the first content module whose `matches` accepts it. With none, the
 * content is shown as recorded, indented, never dropped.
 *
 * A module only draws inside the content block it is handed; it never reads
 * the bundle and never says anything about verification. Today a module
 * recognises content by its shape. Once a payload can declare its type (the
 * CPB `content_type`, for example the proposed `verifiable-agent-conversation`
 * class), a module also lists the types it takes and only `pickContentModule`
 * changes.
 */
export interface ContentModule {
  readonly id: string;
  matches(content: unknown): boolean;
  render(content: unknown, w: Words): HTMLElement;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * JSON text of the value with every object's members in canonical order
 * (RFC 8785 JCS: by key, compared as UTF-16 code units), indented by
 * `indent` spaces when given. A record commits to its content's canonical
 * form, and the same content reaches the page with its members in a
 * different order depending on how the bundle was packaged; drawing the
 * canonical order shows every packaging the same text, in the order that
 * was sealed.
 *
 * Written out here rather than by re-ordering an object for JSON.stringify:
 * an object puts integer-like keys ("9", "10") first in numeric order
 * whatever order they are added in, and assigning a member named
 * `__proto__` would set the object's prototype instead of keeping the
 * member. Strings and numbers are written by JSON.stringify, so a number
 * JSON cannot hold exactly was already rounded when the payload was parsed.
 */
export function canonicalJson(value: unknown, indent?: number): string {
  const pad = indent === undefined ? "" : " ".repeat(indent);
  const write = (v: unknown, depth: number): string => {
    const open = pad === "" ? "" : `\n${pad.repeat(depth + 1)}`;
    const close = pad === "" ? "" : `\n${pad.repeat(depth)}`;
    const colon = pad === "" ? ":" : ": ";
    if (Array.isArray(v))
      return v.length === 0
        ? "[]"
        : `[${v.map((item) => open + write(item, depth + 1)).join(",")}${close}]`;
    if (isObject(v)) {
      const keys = Object.keys(v).sort(byCodeUnits);
      return keys.length === 0
        ? "{}"
        : `{${keys
            .map(
              (key) =>
                `${open}${JSON.stringify(key)}${colon}${write(v[key], depth + 1)}`,
            )
            .join(",")}${close}}`;
    }
    return JSON.stringify(v) ?? "null";
  };
  return write(value, 0);
}

/** Orders strings by UTF-16 code units, as JCS does. */
function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The turns of a conversation payload, or undefined when the content is not
 * one. Mirrors agent-action-capsule `ts/src/outcome-report.ts`
 * `transcriptTurns` (0.6.0), which that package does not export: an
 * `agent_interaction.messages` array, each message's `role`, `content` and
 * `tool_calls`, the call arguments re-serialised (there with JSON.stringify,
 * here in canonical member order). Keep the two in step.
 */
export function conversationTurns(
  content: unknown,
): TranscriptTurn[] | undefined {
  if (!isObject(content)) return undefined;
  const interaction = isObject(content.agent_interaction)
    ? content.agent_interaction
    : undefined;
  if (interaction === undefined || !Array.isArray(interaction.messages))
    return undefined;
  return interaction.messages.flatMap((m): TranscriptTurn[] => {
    if (!isObject(m)) return [];
    const role = typeof m.role === "string" ? m.role : "unknown";
    const text = typeof m.content === "string" ? m.content : undefined;
    const calls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
    return [
      {
        role,
        ...(text === undefined ? {} : { content: text }),
        toolCalls: calls.flatMap((call) =>
          isObject(call)
            ? [
                {
                  name: typeof call.name === "string" ? call.name : "unnamed",
                  // Re-serialised as there, but in canonical member order,
                  // so every packaging shows the same text.
                  arguments: canonicalJson(call.arguments ?? null),
                },
              ]
            : [],
        ),
      },
    ];
  });
}

/** A conversation, drawn as a chat (renderChat): who said what, each tool call and its result. */
export const conversationModule: ContentModule = {
  id: "conversation",
  matches: (content) => conversationTurns(content) !== undefined,
  render(content, w) {
    const transcript: ConversationTranscript = {
      state: "verified",
      turns: conversationTurns(content) ?? [],
    };
    // The record view states only what the core checked: the content
    // against this record's own digest, never which case a judge read.
    return renderChat(transcript, undefined, w, "chat.state.record");
  },
};

/** The content modules the core picks from, in order. */
export const CONTENT_MODULES: readonly ContentModule[] = [conversationModule];

/** The first module that takes this content, or undefined. */
export function pickContentModule(
  content: unknown,
  modules: readonly ContentModule[] = CONTENT_MODULES,
): ContentModule | undefined {
  return modules.find((module) => module.matches(content));
}

/**
 * Disclosed content in its content block: by its module when one takes it,
 * otherwise as recorded: the verifier's parsed payload in canonical member
 * order, indented. Indenting adds whitespace only; a number JSON cannot
 * hold exactly was already rounded when the payload was parsed.
 */
export function renderContent(
  content: unknown,
  w: Words,
  modules: readonly ContentModule[] = CONTENT_MODULES,
): HTMLElement {
  const block = document.createElement("div");
  block.className = "cv-content";
  const module = pickContentModule(content, modules);
  if (module !== undefined) {
    block.dataset.contentModule = module.id;
    block.append(module.render(content, w));
    return block;
  }
  block.dataset.contentModule = "as-recorded";
  const pre = document.createElement("pre");
  let text: string;
  try {
    text = canonicalJson(content, 2);
  } catch {
    text = String(content);
  }
  pre.textContent = text;
  pre.dataset.exact = "as-parsed";
  block.append(pre);
  return block;
}

/**
 * The content block's own stylesheet, scoped to `.cv-content`: the records
 * section is the core's, drawn on every page, inside no module's frame, so
 * a chat or a JSON value there cannot lean on a module's styles. Inserted
 * once per page by the core (evidence-graph-view.ts) and listed in
 * CORE_RUNTIME_STYLES, so the CSP carries its hash.
 */
export const RECORD_CONTENT_CSS = `
.cv-content pre{margin:4px 0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Menlo,monospace;font-size:12px;max-height:420px;overflow:auto}
.cv-content .chat .chat-k{font-size:12.5px;margin:4px 0 6px}
.cv-content .chat ol.turns{list-style:none;margin:0;padding:10px;display:grid;gap:6px;max-height:620px;overflow:auto;border:1px solid #E3DED3;border-radius:10px;background:#FAF8F4}
.cv-content .chat li.turn{border-radius:10px;padding:6px 10px;max-width:86%;background:#fff;border:1px solid #E3DED3;font-size:13.5px}
.cv-content .chat li.turn.user{justify-self:end;background:#ECE8F7;border-color:transparent}
.cv-content .chat li.turn.assistant{justify-self:start}
.cv-content .chat li.turn.tool,.cv-content .chat li.turn.system{justify-self:center;max-width:96%;border-style:dashed}
.cv-content .chat li.turn .who{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px}
.cv-content .chat li.turn .say{white-space:pre-wrap;word-break:break-word}
.cv-content .chat li.turn pre.say{margin:0;font-size:11.5px;max-height:180px}
.cv-content .chat .call{margin-top:4px;font-size:12.5px;background:#FBEFD9;border-radius:6px;padding:3px 8px;word-break:break-word}
`;
