// SPDX-License-Identifier: BSD-3-Clause
package emitter

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	"github.com/action-state-group/agent-action-capsule/go/canonical"
	"github.com/action-state-group/capsule-viewer/go/chartspec"
	"github.com/stretchr/testify/require"
)

type jsonObject = map[string]interface{}

func digestRefOf(t *testing.T, value interface{}) jsonObject {
	t.Helper()
	d, err := canonical.JSONDigest(value)
	require.NoError(t, err)
	return jsonObject{"digest_alg": "SHA-256", "digest": d}
}

// sealedRecord commits to its agent_output and discloses it.
func sealedRecord(t *testing.T, id string, output interface{}) jsonObject {
	return jsonObject{"capsule_id": id, "model_attestation": jsonObject{"compute_attestation": jsonObject{
		"agent_output_digest": digestRefOf(t, output)["digest"],
	}}}
}

// chartBundle is a Result-root bundle whose dataset is one case record,
// carried inline, under a plan with no window node. The bundle is not a
// verifiable one: the builder packages, and the chart check reads only the
// members and digests DatasetOf reads.
func chartBundle(t *testing.T) jsonObject {
	header := jsonObject{"seq": json.Number("1"), "record_type": "case_record"}
	plan := jsonObject{"header": jsonObject{"ir_version": "evidence-plan-ir-v0"}, "nodes": []interface{}{}}
	dataset := jsonObject{"dataset_version": "evidence-dataset-v0", "plan_ref": digestRefOf(t, plan), "rows": []interface{}{
		jsonObject{"seq": json.Number("1"), "record_type": "case_record", "digest_alg": "SHA-256", "digest": digestRefOf(t, header)["digest"]},
	}}
	result := jsonObject{"result_version": "evidence-result-v0", "plan_ref": digestRefOf(t, plan), "dataset_ref": digestRefOf(t, dataset)}
	return jsonObject{
		"root": "root",
		"records": []interface{}{
			sealedRecord(t, "root", result),
			sealedRecord(t, "plan", plan),
			sealedRecord(t, "dataset", dataset),
			jsonObject{"capsule_id": "case", chartspec.RecordHeaderMember: header},
		},
		"disclosures": jsonObject{
			"root":    jsonObject{"agent_output": result},
			"plan":    jsonObject{"agent_output": plan},
			"dataset": jsonObject{"agent_output": dataset},
		},
	}
}

func chartSpec(count int) json.RawMessage {
	return json.RawMessage(`{"$schema":"https://vega.github.io/schema/vega-lite/v5.json","data":{"name":"dataset"},"mark":"bar",
"encoding":{"x":{"field":"record_type","type":"nominal"},"y":{"aggregate":"count","type":"quantitative"}},
"usermeta":{"capsule":{"population":{"count":1},"values":[{"x":"case_record","y":` + strconv.Itoa(count) + `}]}}}`)
}

func TestBuildOfflineHTMLCarriesCheckedCharts(t *testing.T) {
	bundle := chartBundle(t)
	got, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Charts: []json.RawMessage{chartSpec(1)}})
	require.NoError(t, err)
	// The specs are JCS text in the bootstrap's options, before depth/format.
	require.Contains(t, got, `undefined, {"audience":"*","charts":[{"$schema":"https://vega.github.io/schema/vega-lite/v5.json","data":{"name":"dataset"},"encoding":{"x":{"field":"record_type","type":"nominal"}`)
	require.Contains(t, got, `"usermeta":{"capsule":{"population":{"count":1},"values":[{"x":"case_record","y":1}]}}}],"format":"html"}`)

	embedded, err := BuildEmbeddedHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Charts: []json.RawMessage{chartSpec(1)}})
	require.NoError(t, err)
	require.Contains(t, embedded.HTML, `"charts":[`)

	// No charts: the default page, as before.
	plain, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*"})
	require.NoError(t, err)
	require.NotContains(t, plain, `"charts"`)
	require.Contains(t, plain, DefaultBootstrap)
}

func TestBuildOfflineHTMLRefusesAFailingChart(t *testing.T) {
	bundle := chartBundle(t)
	got, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Charts: []json.RawMessage{chartSpec(1), chartSpec(2)}})
	require.ErrorContains(t, err, "chart 2 is refused: chart-aggregate-mismatch")
	require.ErrorContains(t, err, "no page is written")
	require.Empty(t, got)
	var refusal *chartspec.Refusal
	require.ErrorAs(t, err, &refusal)
	require.Equal(t, chartspec.ReasonAggregateMismatch, refusal.Reason)

	// A bundle whose root is no Result has no dataset.
	_, err = BuildOfflineHTML(loadWeekBundle(t), []byte(marker), OfflineOptions{Audience: "*", Charts: []json.RawMessage{chartSpec(1)}})
	require.ErrorContains(t, err, "chart 1 is refused: chart-no-dataset")

	_, err = BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Charts: []json.RawMessage{json.RawMessage(`{} {}`)}})
	require.ErrorContains(t, err, "chart 1 is not JSON")

	_, err = BuildEmbeddedHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Charts: []json.RawMessage{chartSpec(2)}})
	require.ErrorContains(t, err, "chart 1 is refused: chart-aggregate-mismatch")
}

// TypeScript's JSON.parse reads "1.0" and "1e0" as 1, so both builders
// carry such a spec, as the integer.
func TestBuildOfflineHTMLCarriesAnIntegerSpelledAsAFloat(t *testing.T) {
	for _, spelling := range []string{"1.0", "1e0"} {
		bundle := chartBundle(t)
		spec := strings.Replace(string(chartSpec(1)), `"count":1`, `"count":`+spelling, 1)
		require.Contains(t, spec, `"count":`+spelling)
		got, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Charts: []json.RawMessage{json.RawMessage(spec)}})
		require.NoError(t, err, spelling)
		require.Contains(t, got, `"count":1}`, spelling)
	}
}
