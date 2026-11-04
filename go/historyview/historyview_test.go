// SPDX-License-Identifier: Apache-2.0

package historyview

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The shared History view vectors (vectors/history-view/), which
// ts/test/history-view.test.ts runs against the TypeScript view. Both must
// produce each golden's bytes.

func root(parts ...string) string {
	return filepath.Join(append([]string{"..", ".."}, parts...)...)
}

func readFile(t *testing.T, path string) []byte {
	t.Helper()
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	return raw
}

func cases(t *testing.T) map[string]json.RawMessage {
	t.Helper()
	var file struct {
		Cases map[string]json.RawMessage `json:"cases"`
	}
	require.NoError(t, json.Unmarshal(readFile(t, root("vectors", "history-view", "cases.json")), &file))
	require.NotEmpty(t, file.Cases)
	return file.Cases
}

func overlayFor(t *testing.T, name string) any {
	t.Helper()
	if !strings.HasPrefix(name, "muse-") {
		return nil
	}
	return json.RawMessage(readFile(t, root("vectors", "history-view", "overlay.json")))
}

func TestVectorsMatchGoldens(t *testing.T) {
	goldens, err := filepath.Glob(root("ts", "test", "goldens", "history-view", "*.html"))
	require.NoError(t, err)
	byName := map[string]bool{}
	for name, input := range cases(t) {
		byName[name] = true
		t.Run(name, func(t *testing.T) {
			want := string(readFile(t, root("ts", "test", "goldens", "history-view", name+".html")))
			got, err := Document(input, overlayFor(t, name), "History view golden: "+name)
			require.NoError(t, err)
			assert.Equal(t, want, got)
			frag, err := Render(input, overlayFor(t, name))
			require.NoError(t, err)
			assert.Contains(t, got, "<body>"+frag+"</body>")
		})
	}
	for _, g := range goldens {
		assert.True(t, byName[strings.TrimSuffix(filepath.Base(g), ".html")], "golden %s has no vector", g)
	}
}

func TestStylesMatchTypeScript(t *testing.T) {
	src := string(readFile(t, root("ts", "src", "history-view.ts")))
	start := strings.Index(src, "historyViewStyles = `")
	require.GreaterOrEqual(t, start, 0)
	rest := src[start+len("historyViewStyles = `"):]
	assert.Equal(t, rest[:strings.Index(rest, "`;")], Styles)
}

// The wording pack the Go module embeds is a copy of the TypeScript one.
func TestWordingPackIsTheTypeScriptCopy(t *testing.T) {
	assert.Equal(t,
		string(readFile(t, root("ts", "src", "wording", "history-view.en.json"))),
		string(wordingJSON),
		"copy ts/src/wording/history-view.en.json to go/historyview/wording/")
}

func mesh(t *testing.T) map[string]any {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal(cases(t)["mesh-service-history"], &m))
	return m
}

func reasons(t *testing.T, input, overlay any) []string {
	t.Helper()
	_, err := Render(input, overlay)
	var refused *Refused
	require.True(t, errors.As(err, &refused), "got %v", err)
	return refused.Reasons
}

func TestRefusals(t *testing.T) {
	t.Run("an unknown member", func(t *testing.T) {
		m := mesh(t)
		m["words"] = "hello"
		assert.Equal(t, []string{"input.words: is not a member of history-view/v0"}, reasons(t, m, nil))
	})
	t.Run("an unknown check id", func(t *testing.T) {
		m := mesh(t)
		m["checks"] = []any{map[string]any{"id": "vibes", "status": "pass"}}
		assert.Contains(t, reasons(t, m, nil)[0], "input.checks[0].id: is not one of readable")
	})
	t.Run("a passed witness slot without at", func(t *testing.T) {
		m := mesh(t)
		row := m["rows"].([]any)[0].(map[string]any)
		row["witness"] = map[string]any{"state": "passed"}
		assert.Equal(t, []string{"input.rows[0].witness: a passed slot needs at"}, reasons(t, m, nil))
	})
	t.Run("a passed second signature without by or at", func(t *testing.T) {
		m := mesh(t)
		row := m["rows"].([]any)[0].(map[string]any)
		row["second_signature"] = map[string]any{"state": "passed"}
		assert.Equal(t, []string{
			"input.rows[0].second_signature: a passed slot needs at",
			"input.rows[0].second_signature: a passed second-signature slot needs by",
		}, reasons(t, m, nil))
	})
	t.Run("an unknown sharing value", func(t *testing.T) {
		m := mesh(t)
		m["sharing"].(map[string]any)["history_segments"] = "everyone"
		assert.Equal(t, []string{"input.sharing.history_segments: is not one of off, counterparties, peers"}, reasons(t, m, nil))
	})
	t.Run("an overlay on a neutral page", func(t *testing.T) {
		assert.Equal(t, []string{"overlay: a neutral page takes no overlay"},
			reasons(t, mesh(t), map[string]any{"id": "x", "entries": map[string]any{}}))
	})
	t.Run("an overlay with an unknown key or placeholder", func(t *testing.T) {
		var m map[string]any
		require.NoError(t, json.Unmarshal(cases(t)["muse-owner"], &m))
		got := reasons(t, m, map[string]any{"id": "x", "entries": map[string]any{
			"no.such.key":  "x",
			"badge.shared": "Shared with {someone}",
		}})
		assert.Contains(t, got, "overlay.entries.no.such.key: is not a member of history-view/v0")
		assert.Contains(t, got, `overlay.entries.badge.shared: must use the placeholders ["who"]`)
	})
	t.Run("not JSON", func(t *testing.T) {
		assert.Contains(t, reasons(t, []byte("{"), nil)[0], "input: is not JSON")
	})
	t.Run("every reason is named", func(t *testing.T) {
		m := mesh(t)
		m["words"] = 1
		m["kind"] = "ledger"
		assert.Len(t, reasons(t, m, nil), 2)
	})
}

func TestTimeParsing(t *testing.T) {
	for _, bad := range []string{"2026-02-30T00:00:00Z", "2026-11-03T24:00:00Z", "2026-11-03T12:00:60Z", "2026-11-03 12:00:00Z", "2026-11-03T12:00:00"} {
		assert.Nil(t, parseInstant(bad), bad)
	}
	a := parseInstant("2026-11-03T12:00:00.5+01:00")
	b := parseInstant("2026-11-03T11:00:00Z")
	require.NotNil(t, a)
	require.NotNil(t, b)
	assert.Equal(t, b.ms+0, a.ms)
	assert.Equal(t, "Nov 3, 2026, 11:00 UTC", minuteOf(b))
}

// The shared refusal vectors (vectors/history-view/refusals.json): the same
// reasons, in the same order, as the TypeScript view gives.
func TestRefusalVectors(t *testing.T) {
	var file struct {
		Cases []struct {
			Name    string          `json:"name"`
			Input   json.RawMessage `json:"input"`
			Overlay json.RawMessage `json:"overlay"`
			Reasons []string        `json:"reasons"`
		} `json:"cases"`
	}
	require.NoError(t, json.Unmarshal(readFile(t, root("vectors", "history-view", "refusals.json")), &file))
	require.NotEmpty(t, file.Cases)
	for _, c := range file.Cases {
		t.Run(c.Name, func(t *testing.T) {
			input := any(c.Input)
			var s string
			if json.Unmarshal(c.Input, &s) == nil {
				input = []byte(s) // a string input is JSON text
			}
			var overlay any
			if len(c.Overlay) > 0 {
				overlay = c.Overlay
			}
			assert.Equal(t, c.Reasons, reasons(t, input, overlay))
		})
	}
}

func TestEmptyOverlayIsNone(t *testing.T) {
	want, err := Render(cases(t)["mesh-service-history"], nil)
	require.NoError(t, err)
	got, err := Render(cases(t)["mesh-service-history"], json.RawMessage(nil))
	require.NoError(t, err)
	assert.Equal(t, want, got)
}
