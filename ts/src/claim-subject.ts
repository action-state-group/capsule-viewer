// SPDX-License-Identifier: BSD-3-Clause
import {
  disclosureOf,
  type ResultClaim,
  type VerifiedBundleContext,
} from "@action-state-group/agent-action-capsule";
import { RECORD_HEADER_MEMBER } from "./chart-dataset.js";

/**
 * The subject a claim belongs to, which picks its deal's receipt (the
 * subject convention v0, evidencebook#116 design note section 4, Readers).
 * A claim's subject is read from the records it cites: one that is a member
 * of a `subject_root` the bundle carries names that root's `subject_id`.
 * A claim citing no member keeps its id's part before the first `::`, as
 * before the convention, so an older Result reads as it did. A claim
 * citing members of two subjects has none.
 *
 * Membership mirrors evidencebook's `SubjectsOfRecord` (subject.go), which
 * the report's `checkReceipts` uses, so the page and the report pick the
 * same receipt: the root is a record of the member's own book with a lower
 * `seq`; the holder's control records are never members; a `field:<pointer>`
 * member cites the root and carries the subject id at the pointer into its
 * header, and a `log` member need not cite it.
 *
 * Headers are read only as the bundle verifier checked them, in the order
 * evidencebook's VerifyBundle takes them: a record's own
 * `evidence_record_header` (its `capsule_id` covers it, and the context holds
 * only records whose identity verified), else its disclosed `agent_input`
 * when that disclosure matched its commitment and is a record header. A
 * record carrying its header inline discloses its payload, never a header,
 * in `agent_input`.
 *
 * This is not the card's grouping: a contract-report card draws one row per
 * conversation, the claim id's part before `::` (`claimsFitCard`), and a
 * conversation is a member of a subject, never one (ruling D-28).
 */

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const SUBJECT_ROOT = "subject_root";
const SUBJECT_CLOSE = "subject_close";
const MEMBERSHIP_LOG = "log";
const MEMBERSHIP_FIELD = "field:";

/**
 * evidencebook's `subjectControl` (subject.go): a root, a close and the
 * holder's bookkeeping (`subjectBookkeeping`: index root, disclosure,
 * answered request, disclosure policy, lifecycle, book close, and a
 * window's open and close) are never a subject's members.
 */
const CONTROL_RECORD_TYPES: ReadonlySet<string> = new Set([
  SUBJECT_ROOT,
  SUBJECT_CLOSE,
  "index_root",
  "disclosure",
  "evidence_request_answered",
  "disclosure_policy",
  "lifecycle",
  "book_close",
  "window_open",
  "window_close",
]);

interface Header {
  readonly bookId: string;
  readonly seq: number;
  readonly recordType: string;
  readonly cites: readonly string[];
  readonly raw: Obj;
}

interface Root {
  readonly id: string;
  readonly header: Header;
  readonly subjectId: string;
  /** The pointer's reference tokens, or undefined for `log` membership. */
  readonly pointer?: readonly string[];
}

function readHeader(value: unknown): Header | undefined {
  if (!isObj(value)) return undefined;
  const { book_id: bookId, seq, record_type: recordType, links } = value;
  if (
    typeof bookId !== "string" ||
    typeof seq !== "number" ||
    !Number.isSafeInteger(seq) ||
    typeof recordType !== "string" ||
    !Array.isArray(links)
  )
    return undefined;
  const cites = links.flatMap((link) =>
    isObj(link) && link.type === "cites" && typeof link.target === "string"
      ? [link.target]
      : [],
  );
  return { bookId, seq, recordType, cites, raw: value };
}

/** The verified header of a record the context holds, as described above. */
function headerOf(
  context: VerifiedBundleContext,
  id: string,
): Header | undefined {
  const record = context.recordIndex.get(id) as Obj | undefined;
  if (record === undefined) return undefined;
  if (RECORD_HEADER_MEMBER in record)
    return readHeader(record[RECORD_HEADER_MEMBER]);
  const input = disclosureOf(context, id, "agent_input");
  return input.state === "disclosed" ? readHeader(input.payload) : undefined;
}

/** An RFC 6901 pointer's reference tokens, or undefined when malformed (subject.go `pointer`). */
function pointerTokens(pointer: string): string[] | undefined {
  if (!pointer.startsWith("/")) return undefined;
  const tokens = pointer.slice(1).split("/");
  for (const token of tokens) if (/~(?![01])/u.test(token)) return undefined;
  return tokens.map((t) => t.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** A subject_root's statement, read as strictly as subject.go `readSubjectRoot`. */
function readRoot(id: string, header: Header): Root | undefined {
  if (header.recordType !== SUBJECT_ROOT) return undefined;
  const statement = header.raw.statement;
  if (!isObj(statement)) return undefined;
  const keys = Object.keys(statement);
  if (
    keys.some(
      (k) => k !== "subject_kind" && k !== "subject_id" && k !== "membership",
    )
  )
    return undefined;
  const { subject_kind: kind, subject_id: subjectId, membership } = statement;
  if (
    typeof kind !== "string" ||
    kind === "" ||
    typeof subjectId !== "string" ||
    subjectId === "" ||
    typeof membership !== "string"
  )
    return undefined;
  if (membership === MEMBERSHIP_LOG) return { id, header, subjectId };
  if (!membership.startsWith(MEMBERSHIP_FIELD)) return undefined;
  const pointer = pointerTokens(membership.slice(MEMBERSHIP_FIELD.length));
  return pointer === undefined ? undefined : { id, header, subjectId, pointer };
}

/** The string at a pointer into a header (subject.go `headerValueAt`). */
function valueAt(header: Obj, tokens: readonly string[]): string | undefined {
  let value: unknown = header;
  for (const token of tokens) {
    if (Array.isArray(value)) {
      if (!/^(0|[1-9][0-9]*)$/u.test(token)) return undefined;
      value = value[Number(token)];
    } else if (isObj(value) && Object.hasOwn(value, token)) {
      value = value[token];
    } else return undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function isMember(root: Root, id: string, member: Header): boolean {
  if (id === root.id || CONTROL_RECORD_TYPES.has(member.recordType))
    return false;
  // A book admits members to its own subjects only, after their root.
  if (member.bookId !== root.header.bookId || member.seq <= root.header.seq)
    return false;
  if (root.pointer === undefined) return true;
  return (
    member.cites.includes(root.id) &&
    valueAt(member.raw, root.pointer) === root.subjectId
  );
}

/** Every subject_root the bundle carries with a verified header. */
function rootsOf(context: VerifiedBundleContext): Root[] {
  const roots: Root[] = [];
  for (const record of context.records) {
    const header = headerOf(context, record.capsule_id);
    const root =
      header === undefined ? undefined : readRoot(record.capsule_id, header);
    if (root !== undefined) roots.push(root);
  }
  return roots;
}

/** The subject ids the record `id` is a member of, as evidencebook's `SubjectsOfRecord`. */
function subjectsOfRecord(
  context: VerifiedBundleContext,
  roots: readonly Root[],
  id: string,
): string[] {
  const member = headerOf(context, id);
  if (member === undefined) return [];
  return roots.filter((r) => isMember(r, id, member)).map((r) => r.subjectId);
}

/** A claim id's part before the first `::`, or undefined: the deal before the subject convention. */
export function dealPrefixOf(claimId: string): string | undefined {
  const at = claimId.indexOf("::");
  return at > 0 ? claimId.slice(0, at) : undefined;
}

/**
 * Each claim's deal by its id, as described above; a claim with none is
 * absent. A claim id given twice keeps its first claim's deal.
 */
export function claimDeals(
  context: VerifiedBundleContext,
  claims: readonly ResultClaim[],
): ReadonlyMap<string, string> {
  const roots = rootsOf(context);
  const deals = new Map<string, string>();
  for (const claim of claims) {
    if (deals.has(claim.id)) continue;
    const subjects = new Set<string>();
    for (const ref of claim.evidence)
      for (const subject of subjectsOfRecord(context, roots, ref.digest))
        subjects.add(subject);
    const deal =
      subjects.size === 0
        ? dealPrefixOf(claim.id)
        : subjects.size === 1
          ? [...subjects][0]
          : undefined;
    if (deal !== undefined) deals.set(claim.id, deal);
  }
  return deals;
}
