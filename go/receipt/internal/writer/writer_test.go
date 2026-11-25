// SPDX-License-Identifier: Apache-2.0

package writer

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const sample = "{\"a\": \"q\\\"\\\\\\n\\r\\t\\b\\f\\u0001\\u001f é ✓   /\", \"b\": [1, true, null, {}, []], \"c\": {\"d\": []}}"

// The serialisations are Python's, byte for byte: these strings are what
// json.dumps(value, ensure_ascii=False, separators=(", ", ": ")) and
// json.dumps(value, indent=2, ensure_ascii=False) print for the same value.
func TestSerialisationIsPythons(t *testing.T) {
	v, err := decode([]byte(sample))
	require.NoError(t, err)
	assert.Equal(t, sample, inline(v))
	assert.Equal(t, "{\n  \"a\": \"q\\\"\\\\\\n\\r\\t\\b\\f\\u0001\\u001f é ✓   /\",\n  \"b\": [\n    1,\n    true,\n    null,\n    {},\n    []\n  ],\n  \"c\": {\n    \"d\": []\n  }\n}", indented(v))
}

func TestDecodeKeepsOrderAndRefusesTrailingData(t *testing.T) {
	v, err := decode([]byte(`{"z": 1, "a": 2.50}`))
	require.NoError(t, err)
	assert.Equal(t, `{"z": 1, "a": 2.50}`, inline(v))
	_, err = decode([]byte(`{} {}`))
	assert.Error(t, err)
	_, err = decode([]byte(`{"a": `))
	assert.Error(t, err)
}

func TestWithExecutableReplacesInPlaceOrAppends(t *testing.T) {
	v, err := decode([]byte(`{"id": "m", "executable": {"x": 1}, "z": true}`))
	require.NoError(t, err)
	assert.Equal(t, `{"id": "m", "executable": {"carrier": "module-slot", "script_sha256": "s", "style_sha256": ["c"]}, "z": true}`,
		inline(v.(object).withExecutable("s", "c")))
	v, err = decode([]byte(`{"id": "m"}`))
	require.NoError(t, err)
	assert.Equal(t, `{"id": "m", "executable": {"carrier": "module-slot", "script_sha256": "s", "style_sha256": ["c"]}}`,
		inline(v.(object).withExecutable("s", "c")))
}

func TestFill(t *testing.T) {
	core := []byte("a\n  var KIND = \"x\"; // @generated KIND\n  var WORDS = {}; // @generated WORDS\nb\n")
	got, err := Fill(core, map[string]string{"KIND": `"seller"`, "WORDS": `{"k": "v"}`})
	require.NoError(t, err)
	assert.Equal(t, "a\n  var KIND = \"seller\"; // @generated KIND\n  var WORDS = {\"k\": \"v\"}; // @generated WORDS\nb\n", string(got))

	// A line this does not fill, or a value with no line, is refused.
	_, err = Fill(core, map[string]string{"KIND": `"seller"`})
	assert.ErrorContains(t, err, "exactly the generated lines")
	_, err = Fill(core, map[string]string{"KIND": `"a"`, "WORDS": `{}`, "PACK": `{}`})
	assert.ErrorContains(t, err, "exactly the generated lines")
	// The variable and the marker must name the same thing.
	_, err = Fill([]byte("  var KIND = 1; // @generated WORDS\n"), map[string]string{"KIND": "2"})
	assert.ErrorContains(t, err, "names WORDS")
}

func TestOutputsRefusesMissingInputs(t *testing.T) {
	_, err := Outputs(Sources{Dir: t.TempDir(), KitCSS: "nope.css"})
	assert.Error(t, err)
}
