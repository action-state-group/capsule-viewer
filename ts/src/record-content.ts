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
 * The value with every object's members in canonical order (RFC 8785 JCS:
 * by key, in UTF-16 code units, which is JavaScript's default string sort).
 * A record commits to its content's canonical form, and the same content
 * reaches the page with its members in a different order depending on how
 * the bundle was packaged; drawing the canonical order shows every
 * packaging the same text, in the order that was sealed.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
  return out;
}

/** `JSON.stringify` of the canonical form (see `canonical`). */
export function canonicalJson(value: unknown, indent?: number): string {
  return JSON.stringify(canonical(value), null, indent) ?? String(value);
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
