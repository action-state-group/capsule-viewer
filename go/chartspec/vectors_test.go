// SPDX-License-Identifier: Apache-2.0

package chartspec

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The shared chart-spec vectors (vectors/chart-spec/), which
// ts/test/chart-spec-vectors.test.ts runs against the TypeScript checker.

type vector struct {
	Name    string                 `json:"name"`
	Base    string                 `json:"base"`
	Spec    interface{}            `json:"spec"`
	Dataset *string                `json:"dataset"`
	Expect  map[string]interface{} `json:"expect"`
}

type vectorDataset struct {
	Plan map[string]interface{} `json:"plan"`
	Rows []struct {
		Seq        int64                  `json:"seq"`
		RecordType string                 `json:"record_type"`
		Digest     string                 `json:"digest"`
		Header     map[string]interface{} `json:"header"`
	} `json:"rows"`
}

func decodeFile(t *testing.T, name string, into interface{}) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "vectors", "chart-spec", name))
	require.NoError(t, err)
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	require.NoError(t, decoder.Decode(into))
}

// plain turns every json.Number into a float64, so a vector's expected
// values compare with Values' numbers as JavaScript numbers.
func plain(value interface{}) interface{} {
	switch v := value.(type) {
	case json.Number:
		f, _ := numberOf(v)
		return f
	case map[string]interface{}:
		out := make(map[string]interface{}, len(v))
		for k, x := range v {
			out[k] = plain(x)
		}
		return out
	case []interface{}:
		out := make([]interface{}, len(v))
		for i, x := range v {
			out[i] = plain(x)
		}
		return out
	}
	return value
}

// run is the vector runner of the TypeScript test: {valid, values} or {reason}.
func run(t *testing.T, v vector, datasets map[string]vectorDataset) map[string]interface{} {
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
	chart, err := Check(v.Spec, dataset)
	if err != nil {
		var refusal *Refusal
		require.True(t, errors.As(err, &refusal), "%s: not a refusal: %v", v.Name, err)
		return map[string]interface{}{"reason": refusal.Reason}
	}
	values := []interface{}{}
	for _, g := range chart.Values() {
		values = append(values, map[string]interface{}(g))
	}
	return map[string]interface{}{"valid": true, "values": values}
}

func TestVectors(t *testing.T) {
	var cases []vector
	datasets := map[string]vectorDataset{}
	decodeFile(t, "cases.json", &cases)
	decodeFile(t, "datasets.json", &datasets)
	require.NotEmpty(t, cases)
	byName := map[string]vector{}
	for _, v := range cases {
		_, dup := byName[v.Name]
		require.False(t, dup, "%s is listed twice", v.Name)
		byName[v.Name] = v
	}
	reasons := map[string]bool{}
	for _, v := range cases {
		t.Run(v.Name, func(t *testing.T) {
			assert.Equal(t, plain(v.Expect), run(t, v, datasets))
			if reason, ok := v.Expect["reason"].(string); ok {
				reasons[reason] = true
			}
			// A negative changes one passing positive: its base draws, so the
			// refusal is this vector's change and nothing else.
			if v.Base != "" {
				base, ok := byName[v.Base]
				require.True(t, ok, "no base %s", v.Base)
				require.Equal(t, true, base.Expect["valid"])
				assert.Equal(t, plain(base.Expect), run(t, base, datasets))
			}
		})
	}
	assert.Len(t, reasons, 13, "every refusal reason has a vector")
}
