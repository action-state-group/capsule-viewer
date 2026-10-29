// SPDX-License-Identifier: Apache-2.0

package chartspec

import (
	"math"
	"regexp"
	"sort"
	"strings"

	"github.com/action-state-group/agent-action-capsule/go/canonical"
)

// The dataset a report's charts are checked against, read from a bundle
// (docs/design/chart-spec.md section 4): the Go twin of chartDatasetOf in
// ts/src/chart-dataset.ts. That reads a verified bundle context; Go has no
// bundle verifier here, so this reads the bundle JSON itself and treats a
// disclosed member as disclosed only when the JCS SHA-256 of its payload
// equals the digest its record commits to
// (model_attestation.compute_attestation.<member>_digest), which is the
// check the verifier makes. A mismatched member is not disclosed.

const (
	// RecordHeaderMember is evidencebook's member through which a
	// caller-sealed capsule carries its own record header.
	RecordHeaderMember = "evidence_record_header"
	datasetVersion     = "evidence-dataset-v0"
	resultVersion      = "evidence-result-v0"
	resultRecordType   = "evidence_result"
	// maxSafeInteger is Number.MAX_SAFE_INTEGER.
	maxSafeInteger = 1<<53 - 1
)

var hex64 = regexp.MustCompile(`\A[0-9a-f]{64}\z`)

func invalid(message string) {
	refuse(ReasonDatasetInvalid, message, "")
}

// digestRef reads {digest_alg: "SHA-256", digest}; "" when the member is absent.
func digestRef(value interface{}, present bool, what string) string {
	if !present {
		return ""
	}
	m, ok := isObj(value)
	digest, dok := m["digest"].(string)
	if !ok || m["digest_alg"] != "SHA-256" || !dok || !hex64.MatchString(digest) {
		invalid(what + ` is not {digest_alg: "SHA-256", digest: <64-hex>}`)
	}
	return digest
}

func jsonDigest(value interface{}) (string, bool) {
	digest, err := canonical.JSONDigest(value)
	return digest, err == nil
}

type bundleView struct {
	records     []obj
	disclosures obj
}

func (b bundleView) id(record obj) string {
	id, _ := record["capsule_id"].(string)
	return id
}

// committed is the digest a record commits to for agent_input or
// agent_output (committedDigest in agent-action-capsule).
func committed(record obj, member string) (string, bool) {
	attestation, _ := isObj(record["model_attestation"])
	compute, _ := isObj(attestation["compute_attestation"])
	digest, ok := compute[member+"_digest"].(string)
	return digest, ok
}

// disclosed is the record's member payload when the bundle discloses it and
// it hashes to the committed digest (disclosureOf's "disclosed" state).
func (b bundleView) disclosed(record obj, member string) (interface{}, bool) {
	members, ok := isObj(b.disclosures[b.id(record)])
	if !ok {
		return nil, false
	}
	payload, ok := members[member]
	if !ok {
		return nil, false
	}
	want, ok := committed(record, member)
	if !ok || !hex64.MatchString(want) {
		return nil, false
	}
	got, ok := jsonDigest(payload)
	if !ok || got != want {
		return nil, false
	}
	return payload, true
}

// resultDocument is the Result document the root carries: the first of
// agent_output and agent_input that carries one, the member itself (payload
// form) or an evidence_result record header's statement (book form).
func (b bundleView) resultDocument(root obj) (obj, bool) {
	for _, member := range []string{"agent_output", "agent_input"} {
		payload, ok := b.disclosed(root, member)
		if !ok {
			continue
		}
		p, ok := isObj(payload)
		if !ok {
			continue
		}
		if p["result_version"] == resultVersion {
			return p, true
		}
		if member == "agent_input" && p["record_type"] == resultRecordType {
			document, ok := isObj(p["statement"])
			return document, ok
		}
	}
	return nil, false
}

// documentsByDigest is every disclosed document that could be a plan or a
// dataset, by the digest of its JCS. A document JCS cannot render (a
// fraction) is skipped; TypeScript's jsonDigest throws on it instead.
func (b bundleView) documentsByDigest() map[string]obj {
	found := map[string]obj{}
	consider := func(value interface{}) {
		m, ok := isObj(value)
		if !ok || (!has(m, "dataset_version") && !has(m, "ir_version")) {
			return
		}
		if digest, ok := jsonDigest(m); ok {
			found[digest] = m
		}
	}
	for _, record := range b.records {
		for _, member := range []string{"agent_input", "agent_output"} {
			payload, ok := b.disclosed(record, member)
			if !ok {
				continue
			}
			consider(payload)
			if m, ok := isObj(payload); ok {
				consider(m["statement"])
			}
		}
		if inline, ok := isObj(record[RecordHeaderMember]); ok {
			consider(inline["statement"])
		}
	}
	return found
}

type header struct {
	header   obj
	recordID string
}

// headersByDigest is every disclosed record header, by the digest a dataset
// row names it with: an inline evidence_record_header by its own digest,
// else a disclosed agent_input by the digest the record commits to.
func (b bundleView) headersByDigest() map[string]header {
	found := map[string]header{}
	for _, record := range b.records {
		if inline, ok := isObj(record[RecordHeaderMember]); ok {
			if digest, ok := jsonDigest(inline); ok {
				found[digest] = header{inline, b.id(record)}
			}
			continue
		}
		digest, ok := committed(record, "agent_input")
		payload, disclosed := b.disclosed(record, "agent_input")
		if m, isObject := isObj(payload); ok && disclosed && isObject {
			found[digest] = header{m, b.id(record)}
		}
	}
	return found
}

func sortedKeyList(m obj) string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return strings.Join(keys, ",")
}

// DatasetOf returns the dataset the bundle's root Result names, as Check
// reads it; nil, nil when the root carries no Result, the Result names no
// plan_ref or dataset_ref, or the bundle does not disclose the plan or the
// dataset (Check then refuses with chart-no-dataset). A plan or dataset that
// does not match its digests or shape is a *Refusal, chart-dataset-invalid.
//
// Like the TypeScript, it does not run the plan again: it checks both
// digests, the dataset's own plan_ref, and each disclosed row's seq and
// record_type against its header. A row whose header the bundle does not
// disclose is kept with a nil Header.
func DatasetOf(bundle map[string]interface{}) (dataset *Dataset, err error) {
	defer catch(&err)
	return datasetOf(bundle), nil
}

func datasetOf(bundle obj) *Dataset {
	b := bundleView{}
	b.disclosures, _ = isObj(bundle["disclosures"])
	rootID, _ := bundle["root"].(string)
	var root obj
	list, _ := bundle["records"].([]interface{})
	for _, raw := range list {
		record, ok := isObj(raw)
		if !ok {
			continue
		}
		b.records = append(b.records, record)
		if id, ok := record["capsule_id"].(string); ok && id == rootID && root == nil {
			root = record
		}
	}
	if root == nil {
		return nil
	}
	document, ok := b.resultDocument(root)
	if !ok {
		return nil
	}
	planValue, planPresent := document["plan_ref"]
	datasetValue, datasetPresent := document["dataset_ref"]
	planRef := digestRef(planValue, planPresent, "the Result's plan_ref")
	datasetRef := digestRef(datasetValue, datasetPresent, "the Result's dataset_ref")
	if planRef == "" || datasetRef == "" {
		return nil
	}
	documents := b.documentsByDigest()
	plan, planOK := documents[planRef]
	data, dataOK := documents[datasetRef]
	if !planOK || !dataOK {
		return nil
	}
	rawRows, rowsOK := data["rows"].([]interface{})
	if sortedKeyList(data) != "dataset_version,plan_ref,rows" || data["dataset_version"] != datasetVersion || !rowsOK {
		invalid("the dataset is not an " + datasetVersion + " document")
	}
	if digestRef(data["plan_ref"], true, "the dataset's plan_ref") != planRef {
		invalid("the dataset's plan_ref is not the Result's plan_ref")
	}
	if _, ok := plan["nodes"].([]interface{}); !ok {
		invalid("the dataset plan has no nodes")
	}
	headers := b.headersByDigest()
	rows := []Row{}
	last := float64(-1)
	for _, raw := range rawRows {
		r, ok := isObj(raw)
		seq, seqOK := integerOf(r["seq"])
		recordType, typeOK := r["record_type"].(string)
		digest, digestOK := r["digest"].(string)
		if !ok || sortedKeyList(r) != "digest,digest_alg,record_type,seq" ||
			!seqOK || math.Abs(seq) > maxSafeInteger || seq <= last ||
			!typeOK || r["digest_alg"] != "SHA-256" || !digestOK || !hex64.MatchString(digest) {
			invalid("a dataset row is not {seq, record_type, digest_alg, digest}, in seq order")
		}
		last = seq
		row := Row{Seq: int64(seq), RecordType: recordType, Digest: digest}
		if found, ok := headers[digest]; ok {
			if !strictEqual(found.header["seq"], seq) || !strictEqual(found.header["record_type"], recordType) {
				invalid("dataset row seq " + jsNumber(seq) + " names a header whose seq or record_type differs")
			}
			row.Header, row.RecordID = found.header, found.recordID
		}
		rows = append(rows, row)
	}
	return &Dataset{Plan: plan, Rows: rows}
}
