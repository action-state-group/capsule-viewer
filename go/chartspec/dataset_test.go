// SPDX-License-Identifier: Apache-2.0

package chartspec

import (
	"encoding/json"
	"strconv"
	"testing"

	"github.com/action-state-group/agent-action-capsule/go/canonical"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type m = map[string]interface{}

func digestOf(t *testing.T, value interface{}) string {
	t.Helper()
	d, err := canonical.JSONDigest(value)
	require.NoError(t, err)
	return d
}

func ref(t *testing.T, value interface{}) m {
	return m{"digest_alg": "SHA-256", "digest": digestOf(t, value)}
}

// sealed is a record committing to its agent_input and agent_output (nil
// for none), and the disclosures entry that discloses them.
func sealed(t *testing.T, id string, input, output interface{}) (m, m) {
	compute := m{}
	disclosed := m{}
	if input != nil {
		compute["agent_input_digest"] = digestOf(t, input)
		disclosed["agent_input"] = input
	}
	if output != nil {
		compute["agent_output_digest"] = digestOf(t, output)
		disclosed["agent_output"] = output
	}
	return m{"capsule_id": id, "model_attestation": m{"compute_attestation": compute}}, disclosed
}

func caseHeader(seq int) m {
	return m{
		"seq":              json.Number(itoa(seq)),
		"record_type":      "case_record",
		"event_time_claim": "2026-09-0" + itoa(seq) + "T09:00:00Z",
	}
}

func itoa(i int) string { return strconv.Itoa(i) }

type fixture struct {
	plan, dataset m
	headers       []m
	records       []interface{}
	disclosures   m
}

// newFixture has four rows: 1 and 2 disclosed as agent_input, 3 sealed but
// withheld, 4 carried inline as evidence_record_header.
func newFixture(t *testing.T) *fixture {
	f := &fixture{disclosures: m{}}
	f.plan = m{"header": m{"ir_version": "evidence-plan-ir-v0"}, "nodes": []interface{}{
		m{"id": "w", "operator": "traditional.window", "params": m{"field": "event_time_claim", "from": "2026-09-01", "to": "2026-09-30"}},
	}}
	var rows []interface{}
	for seq := 1; seq <= 4; seq++ {
		h := caseHeader(seq)
		f.headers = append(f.headers, h)
		rows = append(rows, m{"seq": json.Number(itoa(seq)), "record_type": "case_record", "digest_alg": "SHA-256", "digest": digestOf(t, h)})
		id := "rec-" + itoa(seq)
		switch seq {
		case 1, 2:
			record, disclosed := sealed(t, id, h, nil)
			f.records = append(f.records, record)
			f.disclosures[id] = disclosed
		case 3:
			record, _ := sealed(t, id, h, nil)
			f.records = append(f.records, record)
		case 4:
			f.records = append(f.records, m{"capsule_id": id, RecordHeaderMember: h})
		}
	}
	f.dataset = m{"dataset_version": "evidence-dataset-v0", "plan_ref": ref(t, f.plan), "rows": rows}
	return f
}

func (f *fixture) add(record, disclosed m) {
	f.records = append(f.records, record)
	f.disclosures[record["capsule_id"].(string)] = disclosed
}

func (f *fixture) bundle(root string) map[string]interface{} {
	return m{"root": root, "records": f.records, "disclosures": f.disclosures}
}

func (f *fixture) result(t *testing.T) m {
	return m{"result_version": "evidence-result-v0", "plan_ref": ref(t, f.plan), "dataset_ref": ref(t, f.dataset)}
}

func checkRows(t *testing.T, d *Dataset, f *fixture) {
	t.Helper()
	require.NotNil(t, d)
	require.Len(t, d.Rows, 4)
	assert.Equal(t, f.plan, map[string]interface{}(d.Plan))
	assert.Equal(t, f.headers[0], map[string]interface{}(d.Rows[0].Header))
	assert.Equal(t, "rec-1", d.Rows[0].RecordID)
	assert.NotNil(t, d.Rows[1].Header)
	assert.Nil(t, d.Rows[2].Header, "row 3 is withheld")
	assert.Equal(t, f.headers[3], map[string]interface{}(d.Rows[3].Header))
	assert.Equal(t, "rec-4", d.Rows[3].RecordID)
	assert.Equal(t, int64(4), d.Rows[3].Seq)
}

func TestDatasetOfPayloadForm(t *testing.T) {
	f := newFixture(t)
	// The plan and the dataset disclosed as one record's members.
	f.add(sealed(t, "docs", f.plan, f.dataset))
	f.add(sealed(t, "root", nil, f.result(t)))
	d, err := DatasetOf(f.bundle("root"))
	require.NoError(t, err)
	checkRows(t, d, f)

	// The withheld row refuses a chart; the dataset itself is fine.
	_, err = Check(m{
		"$schema":  schemaURL,
		"data":     m{"name": "dataset"},
		"mark":     "bar",
		"encoding": m{"x": m{"field": "record_type", "type": "nominal"}, "y": m{"aggregate": "count", "type": "quantitative"}},
		"usermeta": m{"capsule": m{"population": m{"count": json.Number("4")}, "values": []interface{}{}}},
	}, d)
	var refusal *Refusal
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, ReasonRowWithheld, refusal.Reason)
}

func TestDatasetOfBookForm(t *testing.T) {
	f := newFixture(t)
	// The plan and the dataset as book headers' statements: one disclosed
	// as agent_input, one inline.
	f.add(sealed(t, "plan", m{"record_type": "evidence_plan", "statement": f.plan}, nil))
	f.records = append(f.records, m{"capsule_id": "data", RecordHeaderMember: m{"record_type": "evidence_dataset", "statement": f.dataset}})
	f.add(sealed(t, "root", m{"record_type": "evidence_result", "statement": f.result(t)}, nil))
	d, err := DatasetOf(f.bundle("root"))
	require.NoError(t, err)
	checkRows(t, d, f)
}

func TestDatasetOfDigestMismatchIsNotDisclosed(t *testing.T) {
	f := newFixture(t)
	f.add(sealed(t, "docs", f.plan, f.dataset))
	f.add(sealed(t, "root", nil, f.result(t)))
	// Row 2's disclosed header no longer hashes to its committed digest.
	f.disclosures["rec-2"] = m{"agent_input": m{"seq": json.Number("2"), "record_type": "case_record", "event_time_claim": "2026-09-09T09:00:00Z"}}
	d, err := DatasetOf(f.bundle("root"))
	require.NoError(t, err)
	assert.Nil(t, d.Rows[1].Header, "a mismatched disclosure is not disclosed")

	// A mismatched Result is no Result: no dataset.
	f.disclosures["root"] = m{"agent_output": m{"result_version": "evidence-result-v0"}}
	d, err = DatasetOf(f.bundle("root"))
	require.NoError(t, err)
	assert.Nil(t, d)
}

func TestDatasetOfNoDatasetAndInvalid(t *testing.T) {
	f := newFixture(t)
	f.add(sealed(t, "root", nil, f.result(t)))
	// The plan and the dataset are not disclosed.
	d, err := DatasetOf(f.bundle("root"))
	require.NoError(t, err)
	assert.Nil(t, d)
	// No such root.
	d, err = DatasetOf(f.bundle("other"))
	require.NoError(t, err)
	assert.Nil(t, d)

	// A malformed plan_ref is invalid, not absent.
	g := newFixture(t)
	g.add(sealed(t, "root", nil, m{"result_version": "evidence-result-v0", "plan_ref": "x", "dataset_ref": ref(t, g.dataset)}))
	_, err = DatasetOf(g.bundle("root"))
	var refusal *Refusal
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, ReasonDatasetInvalid, refusal.Reason)

	// A row out of seq order is invalid.
	h := newFixture(t)
	rows := h.dataset["rows"].([]interface{})
	rows[0], rows[1] = rows[1], rows[0]
	h.add(sealed(t, "docs", h.plan, h.dataset))
	h.add(sealed(t, "root", nil, h.result(t)))
	_, err = DatasetOf(h.bundle("root"))
	require.ErrorAs(t, err, &refusal)
	assert.Equal(t, ReasonDatasetInvalid, refusal.Reason)
}

func TestUTCDateOf(t *testing.T) {
	for in, want := range map[string]string{
		"2026-09-07T23:30:00+05:00":   "2026-09-07",
		"2026-09-07T01:30:00+05:00":   "2026-09-06",
		"2026-09-07t20:30:00.5-04:00": "2026-09-08",
		"9999-12-31T23:59:59z":        "9999-12-31",
		"0001-01-01T00:00:00Z":        "0001-01-01",
		"2024-02-29T00:00:00Z":        "2024-02-29",
	} {
		got, ok := utcDateOf(in)
		assert.True(t, ok, in)
		assert.Equal(t, want, got, in)
	}
	for _, in := range []string{
		"2026-09-07T12:00:00",       // no offset
		"2026-09-07T12:00:00Z\n",    // trailing newline
		"2026-09-07T24:00:00Z",      // hour 24
		"2026-09-07T23:59:60Z",      // leap second
		"2026-02-29T00:00:00Z",      // no such day
		"2026-09-07T12:00:00+24:00", // offset hour 24
		"9999-12-31T23:00:00-02:00", // UTC year 10000
		"0001-01-01T00:00:00+00:01", // UTC year 0
		"0000-01-01T00:00:00Z",      // year 0
		"2026-09-0٧T12:00:00Z",      // a non-ASCII digit
		"2026-09-07 12:00:00Z",      // a space for T
	} {
		_, ok := utcDateOf(in)
		assert.False(t, ok, in)
	}
	assert.True(t, isCalendarDate("0001-01-01"))
	assert.False(t, isCalendarDate("0000-12-31"))
	assert.False(t, isCalendarDate("2026-09-01\n"))
	assert.False(t, fieldPath.MatchString("a.b\n"))
}

// TypeScript's day walk never ends on a window that ends 9999-12-31; this one does.
func TestUnitsOfEndsAtYear9999(t *testing.T) {
	got := unitsOf(&Window{Field: "t", From: "9999-12-30", To: "9999-12-31"}, "utcyearmonthdate")
	assert.Equal(t, []string{"9999-12-30", "9999-12-31"}, got)
	got = unitsOf(&Window{Field: "t", From: "2024-01-01", To: "2024-03-31"}, "utcyearmonth")
	assert.Equal(t, []string{"2024-01-01", "2024-02-01", "2024-03-01"}, got)
}
