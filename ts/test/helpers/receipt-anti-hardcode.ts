// SPDX-License-Identifier: Apache-2.0
/**
 * The anti-hardcode check of the receipt view-model note's section 5
 * (docs/design/receipt-view-model.md; capsule-viewer#488): every visible
 * text node in the receipt module's region is either a wording-pack string
 * or a value read from the copy, and every value resolves.
 *
 * It reads the marks the x-deal-v1 drawer puts on its nodes (receipt_core.js,
 * "source tags"):
 *
 *   - a pack node (`data-src="pack"`, `data-key`): its children are exactly
 *     the key's template as the pack holds it now, literal text for literal
 *     text and, for each `{placeholder}`, one child marked `data-ph` with that
 *     name, itself a pack, value or derived node. A pack node with a
 *     `data-ptr` is a token: its key ends in the value its source holds.
 *   - a value node (`data-src="field"`, `data-ptr`, `data-fmt`): its text is
 *     the formatter's output for the value its source holds; a `data-time`
 *     value is read after the page put it in the reader's zone.
 *   - a derived node (`data-derive`): recomputed from the sources it lists.
 *
 * Anything else that holds text fails, except white space between nodes and
 * any node listed in EXCLUDED (none since PR 3). The source is resolved, never
 * searched for: a record pointer reads that record's pair, a report pointer
 * capsulectl's report as the fixture holds it, a checked pointer the side
 * input as the page checked it, a bundle pointer the bundle.
 */
import { RECEIPT_CORE } from "../../src/receipt-core.generated.js";
import { PACK_BYTES, PACK_SHA256, type Obj } from "./receipt-deal-v1-pages.js";

type Core = {
  WORDS: Record<string, string>;
  PACK: { id: string; sha256: string };
  FORMATS: Record<string, (v: unknown) => string>;
  DERIVATIONS: string[];
  plainTime(v: string): string;
  recordDigest(v: unknown): string | null;
};
export const core = RECEIPT_CORE as unknown as Core;

/**
 * The receipt module's nodes left unchecked. None since the note's PR 3
 * (#489): beside the core the module draws no check list or witness line of
 * its own, and its proof panel's summary, its link to the core's list and
 * the TIME-STAMPED stamp are pack words like every other node.
 */
export const EXCLUDED: readonly string[] = [];

/** What the check reads besides the page: the fixture's inputs and the page's own checks. */
export type Inputs = {
  bundle: Obj;
  report: Obj;
  /** The side inputs the page's maker gave (verifyCommand, dealOffer). */
  given: Obj;
  /** The x-deal-v1 entry the page put into the verified context (its own checks included). */
  entry: Obj;
  /** The per-record membership proofs the page checked (the context's completeness.memberships). */
  memberships: Obj;
  /** The bundle's digest, recomputed here (bundleDigest). */
  digest: string;
  /** The page's own check of each countersignature on the bundle (the context's countersignatures). */
  countersignatures: unknown[];
};

const isObj = (v: unknown): v is Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** RFC 6901. */
export function pointer(value: unknown, path: string): unknown {
  if (path === "") return value;
  if (!path.startsWith("/")) return undefined;
  let at: unknown = value;
  for (const raw of path.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(at)) at = /^\d+$/.test(key) ? at[Number(key)] : undefined;
    else if (isObj(at))
      at = Object.prototype.hasOwnProperty.call(at, key) ? at[key] : undefined;
    else return undefined;
  }
  return at;
}

const ext = (bundle: Obj, name: string): Obj => {
  const e = bundle["extensions"];
  return isObj(e) && isObj(e[name]) ? e[name] : {};
};

/**
 * A record's pair ({record, header, payload}, or a pair sent whole,
 * {record, agent_input}: the standalone report, the book's offer): the book's
 * pair for that Capsule id, else the
 * bundle's record with its disclosed header and the payload its header
 * commits to in evidencebook/payloads.
 */
export function pairOf(bundle: Obj, id: string): Obj | undefined {
  const standalone = ext(bundle, "x-deal-report/v0");
  if (isObj(standalone["record"]) && standalone["record"]["capsule_id"] === id)
    return standalone;
  const book = ext(bundle, "x-deal-v1")["book"];
  const pairs: Obj[] = [];
  if (isObj(book)) {
    for (const k of ["agreement", "offer"])
      if (isObj(book[k])) pairs.push(book[k]);
    for (const k of ["relied_on", "records"])
      if (isObj(book[k])) pairs.push(...Object.values(book[k]).filter(isObj));
    const received = book["received"];
    if (isObj(received) && isObj(received["records"]))
      pairs.push(...Object.values(received["records"]).filter(isObj));
  }
  const pair = pairs.find(
    (p) => isObj(p["record"]) && p["record"]["capsule_id"] === id,
  );
  // A pair sent whole ({record, agent_input}: the offer, #498) is its own pair.
  if (pair !== undefined && "agent_input" in pair) return pair;
  const records = Array.isArray(bundle["records"]) ? bundle["records"] : [];
  const record = records.find((r) => isObj(r) && r["capsule_id"] === id) as
    | Obj
    | undefined;
  if (pair === undefined && record === undefined) return undefined;
  const disclosures = isObj(bundle["disclosures"]) ? bundle["disclosures"] : {};
  const disclosed = isObj(disclosures[id]) ? disclosures[id] : {};
  const header = pair?.["header"] ?? disclosed["agent_input"];
  let payload = pair?.["payload"];
  if (payload === undefined && isObj(header)) {
    const commitment = (header["payload_commitments"] as unknown[])?.[0];
    const b64 = ext(bundle, "evidencebook/payloads")[commitment as string];
    if (typeof b64 === "string")
      payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  }
  return { record: record ?? pair?.["record"], header, payload };
}

/** The value a source names, or undefined when it names none. */
export function resolve(ref: string, inputs: Inputs): unknown {
  const colon = ref.indexOf(":");
  const scheme = ref.slice(0, colon);
  const rest = ref.slice(colon + 1);
  const hash = rest.indexOf("#");
  const name = hash < 0 ? rest : rest.slice(0, hash);
  const path = hash < 0 ? "" : rest.slice(hash + 1);
  switch (scheme) {
    case "record": {
      const pair = pairOf(inputs.bundle, name);
      return pair === undefined ? undefined : pointer(pair, path);
    }
    case "report": {
      // capsulectl's report as the fixture holds it; its x-deal-v1 standalone
      // entry; or a side input the page's maker gave.
      if (name === "capsulectl") return pointer(inputs.report, path);
      if (name === "x-deal-v1") {
        const entries = inputs.report["extensions"];
        const entry = Array.isArray(entries)
          ? entries.find(
              (e) =>
                isObj(e) &&
                e["kind"] === "x-deal-v1" &&
                e["report"] === "standalone",
            )
          : undefined;
        return entry === undefined ? undefined : pointer(entry, path);
      }
      return Object.prototype.hasOwnProperty.call(inputs.given, name)
        ? pointer(inputs.given[name], path)
        : undefined;
    }
    case "checked": {
      // The bundle's digest, recomputed here; any other input as the page put
      // it into the verified context after its own check.
      if (name === "bundle_digest")
        return path === "" ? inputs.digest : undefined;
      if (name === "memberships") return pointer(inputs.memberships, path);
      if (name === "countersignatures")
        return pointer(inputs.countersignatures, path);
      return Object.prototype.hasOwnProperty.call(inputs.entry, name)
        ? pointer(inputs.entry[name], path)
        : undefined;
    }
    case "bundle":
      return pointer(inputs.bundle, name);
    case "pack":
      return name === "id"
        ? (JSON.parse(PACK_BYTES.toString("utf8")) as Obj)["id"]
        : name === "sha256"
          ? PACK_SHA256
          : undefined;
    default:
      return undefined;
  }
}

// The format localTimes writes, in this run's own zone.
const local = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));

// The leaves an MMR of `size` nodes holds (size = 2L - popcount(L)), worked out here on its own.
function leaves(size: number): number | null {
  for (let l = 0; l <= size; l++) {
    if (2 * l - l.toString(2).replace(/0/g, "").length === size) return l;
  }
  return null;
}

/** One reason a node fails, with where it is. */
export type Problem = { what: string; at: string };

function where(node: Node): string {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const path: string[] = [];
  for (
    let e: Element | null = el;
    e !== null && path.length < 4;
    e = e.parentElement
  ) {
    const attrs = Array.from(e.attributes)
      .filter((a) => a.name.startsWith("data-") || a.name === "class")
      .map((a) => `${a.name}=${a.value.slice(0, 40)}`)
      .join(" ");
    path.unshift(`${e.tagName.toLowerCase()}[${attrs}]`);
  }
  return path.join(" > ");
}

const TEMPLATE = /\{([a-z_]+)\}/g;

/** Every problem in one module region. */
export function check(
  region: Element,
  inputs: Inputs,
  words = core.WORDS,
): Problem[] {
  const problems: Problem[] = [];
  const fail = (what: string, node: Node): void => {
    problems.push({ what, at: where(node) });
  };
  const excluded = new Set<Element>();
  for (const sel of EXCLUDED)
    region.querySelectorAll(sel).forEach((e) => excluded.add(e));

  const lowerFirst = (t: string): string =>
    t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  // `lower`: this node's first letter was lower-cased mid-sentence (data-case="lower-first" on it or an ancestor
  // whose first text it holds).
  const visit = (node: Node, lower = false): void => {
    if (node.nodeType === 3) {
      if ((node.nodeValue ?? "").trim() !== "")
        fail(`unmarked text ${JSON.stringify(node.nodeValue)}`, node);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (excluded.has(el)) return;
    const src = el.getAttribute("data-src");
    const lowered = lower || el.getAttribute("data-case") === "lower-first";
    if (
      el.hasAttribute("data-case") &&
      el.getAttribute("data-case") !== "lower-first"
    )
      return fail(`unknown data-case ${el.getAttribute("data-case")}`, el);
    if (src === "pack") return checkPack(el, lowered);
    if (src === "list") return checkList(el, lowered);
    if (src === "field") return checkValue(el, lowered);
    if (src !== null) return fail(`unknown data-src ${src}`, el);
    if (el.hasAttribute("data-ph"))
      return fail("a placeholder with no source", el);
    if (lowered)
      return fail("lower-cased text that is not a pack or value node", el);
    el.childNodes.forEach((c) => visit(c));
  };

  const checkPack = (el: Element, lower: boolean): void => {
    const key = el.getAttribute("data-key") ?? "";
    const template = words[key];
    if (template === undefined)
      return fail(`pack key ${key} is not in the pack`, el);
    const ref = el.getAttribute("data-ptr");
    if (el.getAttribute("data-derive") === "book") {
      // Whose book: the record's signing key is the agreement's own key, counterparty_key or adjudicator key.
      const [signer, matched] = (ref ?? "").split(" ");
      const a = signer ? resolve(signer, inputs) : undefined;
      const b = matched ? resolve(matched, inputs) : undefined;
      const which = matched?.endsWith("/record/key_id")
        ? "holder"
        : matched?.endsWith("/counterparty_key")
          ? "other"
          : matched?.endsWith("/adjudicator/key_id")
            ? "adjudicator"
            : null;
      if (
        a === undefined ||
        a !== b ||
        which === null ||
        !new RegExp(`^deal\\.book\\.${which}(\\.|$)`).test(key)
      )
        fail(`book ${key} is not what keys ${signer} and ${matched} say`, el);
    } else if (el.hasAttribute("data-derive")) {
      fail(`a pack node derived ${el.getAttribute("data-derive")}`, el);
    } else if (ref !== null) {
      const value = resolve(ref, inputs);
      if (
        value === undefined ||
        (!key.endsWith(`.${String(value)}`) &&
          !key.endsWith(`.${String(value)}.report`))
      )
        fail(
          `token ${key} is not the value ${JSON.stringify(value)} at ${ref}`,
          el,
        );
    }
    // The children are the template, part by part.
    const want: ({ text: string } | { ph: string })[] = [];
    let last = 0;
    for (const m of template.matchAll(TEMPLATE)) {
      if (m.index! > last) want.push({ text: template.slice(last, m.index) });
      want.push({ ph: m[1]! });
      last = m.index! + m[0].length;
    }
    if (last < template.length) want.push({ text: template.slice(last) });
    // A run of text may be split into several text nodes; join adjacent ones.
    const got: ({ text: string } | { el: Element })[] = [];
    el.childNodes.forEach((c) => {
      if (c.nodeType === 3) {
        const prev = got[got.length - 1];
        if (prev && "text" in prev) prev.text += c.nodeValue ?? "";
        else got.push({ text: c.nodeValue ?? "" });
      } else if (c.nodeType === 1) got.push({ el: c as Element });
    });
    if (got.length !== want.length)
      return fail(
        `${key}: ${got.length} parts where its template has ${want.length}`,
        el,
      );
    want.forEach((part, i) => {
      const g = got[i]!;
      const first = lower && i === 0;
      if ("text" in part) {
        const text = first ? lowerFirst(part.text) : part.text;
        if (!("text" in g) || g.text !== text)
          fail(
            `${key}: part ${i} is not the template's text ${JSON.stringify(text)}`,
            el,
          );
      } else if (!("el" in g) || g.el.getAttribute("data-ph") !== part.ph) {
        fail(`${key}: part ${i} is not the placeholder {${part.ph}}`, el);
      } else if (g.el.getAttribute("data-src") === null) {
        fail(`${key}: {${part.ph}} has no source`, g.el);
      } else visit(g.el, first);
    });
  };

  // A list: its items, each a marked node, between pack separators (deal.sep.*).
  const checkList = (el: Element, lower: boolean): void => {
    const kids = Array.from(el.childNodes).filter(
      (c) => c.nodeType === 1 || (c.nodeValue ?? "") !== "",
    );
    kids.forEach((c, i) => {
      if (c.nodeType !== 1)
        return fail(
          `unmarked text ${JSON.stringify(c.nodeValue)} in a list`,
          el,
        );
      const item = c as Element;
      if (i % 2 === 1) {
        if (
          item.getAttribute("data-src") !== "pack" ||
          !(item.getAttribute("data-key") ?? "").startsWith("deal.sep.")
        )
          fail("a list's items are not between separators", item);
        else checkPack(item, false);
      } else visit(item, lower && i === 0);
    });
  };

  const checkValue = (el: Element, lower: boolean): void => {
    if (Array.from(el.childNodes).some((c) => c.nodeType !== 3))
      return fail("a value node holds more than text", el);
    const text = el.textContent ?? "";
    const refs = (el.getAttribute("data-ptr") ?? "").split(" ").filter(Boolean);
    if (!refs.length) return fail("a value node with no source", el);
    const values = refs.map((r) => resolve(r, inputs));
    const missing = refs.filter((_, i) => values[i] === undefined);
    if (missing.length) return fail(`unresolved ${missing.join(" ")}`, el);
    const how = el.getAttribute("data-derive");
    if (how !== null) {
      if (!core.DERIVATIONS.includes(how))
        return fail(`unknown derivation ${how}`, el);
      let want: string | null = null;
      if (how === "count") want = String(refs.length);
      if (how === "length" && Array.isArray(values[0]))
        want = String(values[0].length);
      if (how === "count_where" && Array.isArray(values[0])) {
        const [member, value] = (el.getAttribute("data-where") ?? "").split(
          "=",
        );
        want = String(
          values[0].filter((v) => isObj(v) && v[member!] === value).length,
        );
      }
      if (how === "key") want = refs[0]!.split("/").pop() ?? null;
      if (how === "named") {
        // The named record's payload digest (or, withheld, its header's commitment) is the digest the statement names.
        const id = values[1];
        const pair =
          typeof id === "string" ? pairOf(inputs.bundle, id) : undefined;
        const header = pair?.["header"];
        const digest = isObj(pair?.["payload"])
          ? core.recordDigest(pair!["payload"])
          : isObj(header)
            ? (header["payload_commitments"] as unknown[] | undefined)?.[0]
            : undefined;
        want =
          digest !== undefined && digest === values[0]
            ? core.FORMATS["short"]!(id)
            : null;
      }
      if (how === "ordinal") {
        const row = el.closest("li, tr");
        const list = row?.parentElement;
        want =
          row && list
            ? String(Array.from(list.children).indexOf(row) + 1)
            : null;
      }
      if (how === "leaves" && typeof values[0] === "number") {
        const n = leaves(values[0]);
        want = n === null ? null : String(n);
      }
      if (want !== text)
        fail(`derived ${how} says ${text}, its sources give ${want}`, el);
      return;
    }
    const fmt = el.getAttribute("data-fmt") ?? "";
    const format = core.FORMATS[fmt];
    if (format === undefined) return fail(`unknown formatter ${fmt}`, el);
    if (refs.length !== 1)
      return fail("a formatted value names one source", el);
    const formatted = format(values[0]);
    const shown = lower ? lowerFirst(formatted) : formatted;
    const time = el.getAttribute("data-time");
    if (time !== null) {
      if (time !== shown) return fail(`data-time ${time} is not ${shown}`, el);
      if (text !== local(time) && text !== core.plainTime(time))
        fail(`time ${JSON.stringify(text)} is not ${time} in this zone`, el);
      return;
    }
    if (text !== shown)
      fail(
        `${fmt} of ${refs[0]} gives ${JSON.stringify(shown.slice(0, 80))}, the page says ${JSON.stringify(text.slice(0, 80))}`,
        el,
      );
  };

  visit(region);
  return problems;
}
