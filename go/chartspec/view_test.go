// SPDX-License-Identifier: Apache-2.0

package chartspec

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The shared view-spec vectors (vectors/view-spec/), which
// ts/test/view-spec-vectors.test.ts runs against the TypeScript view checker
// (capsule-viewer#156). They replace the test that refused every view entry.

type viewVector struct {
	Name    string                 `json:"name"`
	Base    string                 `json:"base"`
	View    interface{}            `json:"view"`
	Dataset *string                `json:"dataset"`
	Expect  map[string]interface{} `json:"expect"`
}

func decodeViewFile(t *testing.T, name string, into interface{}) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "vectors", "view-spec", name))
	require.NoError(t, err)
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	require.NoError(t, decoder.Decode(into))
}

func groupsOf(c *Chart) []interface{} {
	values := []interface{}{}
	for _, g := range c.Values() {
		values = append(values, map[string]interface{}(g))
	}
	return values
}

// runView is the vector runner of the TypeScript test (runView in
// ts/test/helpers/view-vectors.ts).
func runView(t *testing.T, v viewVector, datasets map[string]vectorDataset) map[string]interface{} {
	t.Helper()
	var dataset *Dataset
	if v.Dataset != nil {
		d, ok := datasets[*v.Dataset]
		require.True(t, ok, "%s names no dataset %s", v.Name, *v.Dataset)
		dataset = &Dataset{Plan: d.Plan}
		for _, r := range d.Rows {
			dataset.Rows = append(dataset.Rows, Row{Seq: r.Seq, RecordType: r.RecordType, Digest: r.Digest, Header: r.Header})
		}
	}
	view, err := CheckView(v.View, dataset)
	if err != nil {
		var refusal *Refusal
		require.True(t, errors.As(err, &refusal), "%s: not a refusal: %v", v.Name, err)
		out := map[string]interface{}{"reason": refusal.Reason}
		if refusal.Pointer != "" {
			out["pointer"] = refusal.Pointer
		}
		return out
	}
	part := func(p ViewChart) map[string]interface{} {
		out := map[string]interface{}{"id": p.ID, "values": groupsOf(p.Chart)}
		if p.Role != "" {
			out["role"] = p.Role
		}
		if p.Mark != "" {
			out["mark"] = p.Mark
		}
		if p.Classes != nil {
			classes := map[string]interface{}{}
			for k, c := range p.Classes {
				classes[k] = c
			}
			out["classes"] = classes
		}
		return out
	}
	out := map[string]interface{}{
		"valid":    true,
		"view":     view.Kind,
		"window":   map[string]interface{}{"field": view.Window.Field, "from": view.Window.From, "to": view.Window.To},
		"unplaced": float64(view.Unplaced),
	}
	var parts []interface{}
	switch view.Kind {
	case "calendar", "timeline":
		for _, l := range view.Lanes {
			parts = append(parts, part(l))
		}
	case "by-period":
		parts = append(parts, part(*view.Count))
		for _, c := range view.Columns {
			parts = append(parts, part(c))
		}
	default:
		parts = append(parts, part(*view.Count))
		out["subject"] = view.Subject
		out["requirements"] = view.Requirements
		out["failing"] = float64(view.Failing)
		subjects, records := []interface{}{}, []interface{}{}
		for _, line := range view.Cells {
			s, r := []interface{}{}, []interface{}{}
			for _, cell := range line {
				s = append(s, float64(cell.Subjects))
				seqs := []interface{}{}
				for _, row := range cell.Rows {
					seqs = append(seqs, float64(row.Seq))
				}
				r = append(r, seqs)
			}
			subjects, records = append(subjects, s), append(records, r)
		}
		out["subjects"], out["records"] = subjects, records
	}
	out["parts"] = parts
	return out
}

func TestViewVectors(t *testing.T) {
	var cases []viewVector
	datasets := map[string]vectorDataset{}
	decodeViewFile(t, "cases.json", &cases)
	decodeViewFile(t, "datasets.json", &datasets)
	require.NotEmpty(t, cases)
	byName := map[string]viewVector{}
	for _, v := range cases {
		_, dup := byName[v.Name]
		require.False(t, dup, "%s is listed twice", v.Name)
		byName[v.Name] = v
	}
	reasons := map[string]bool{}
	kinds := map[string]bool{}
	for _, v := range cases {
		t.Run(v.Name, func(t *testing.T) {
			assert.Equal(t, plain(v.Expect), runView(t, v, datasets))
			if reason, ok := v.Expect["reason"].(string); ok {
				reasons[reason] = true
			}
			if kind, ok := v.Expect["view"].(string); ok {
				kinds[kind] = true
			}
			// A negative changes one passing positive: its base draws.
			if v.Base != "" {
				base, ok := byName[v.Base]
				require.True(t, ok, "no base %s", v.Base)
				require.Equal(t, true, base.Expect["valid"])
				assert.Equal(t, plain(base.Expect), runView(t, base, datasets))
			}
		})
	}
	var got []string
	for r := range reasons {
		got = append(got, r)
	}
	sort.Strings(got)
	for _, want := range []string{ReasonViewUnsupportedMember, ReasonViewChartShape, ReasonViewRunsUnsealed, ReasonViewRunsMismatch, ReasonViewWindowNotMonths, ReasonViewOverlap, ReasonViewLaneRole} {
		assert.Contains(t, got, want)
	}
	assert.Equal(t, map[string]bool{"calendar": true, "by-period": true, "timeline": true, "co-failure": true}, kinds)
}

// A view entry is not a chart spec: Check still refuses it, so a caller that
// forgets IsView never draws a view unchecked.
func TestCheckStillRefusesAViewEntry(t *testing.T) {
	_, err := Check(map[string]interface{}{"view": "calendar"}, nil)
	var refusal *Refusal
	require.True(t, errors.As(err, &refusal), "%v", err)
	assert.Equal(t, ReasonUnsupportedMember, refusal.Reason)
	assert.True(t, IsView(map[string]interface{}{"view": "calendar"}))
	assert.False(t, IsView(map[string]interface{}{"mark": "bar"}))
}
