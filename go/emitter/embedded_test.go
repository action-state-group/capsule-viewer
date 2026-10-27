// SPDX-License-Identifier: BSD-3-Clause
package emitter

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The vectors come from ts/test/go-embedded-vectors.test.ts: the options
// TypeScript's mount passes to renderEvidenceGraph, as JCS text. The
// snippet's bootstrap passes the same text.
func TestBuildEmbeddedHTMLMatchesTypeScript(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "embedded-vectors.json"))
	require.NoError(t, err)
	var doc struct {
		Cases []struct {
			Name     string `json:"name"`
			Settings struct {
				Audience string   `json:"audience"`
				Depth    string   `json:"depth"`
				Wording  *Wording `json:"wording"`
			} `json:"settings"`
			Options string `json:"options"`
		} `json:"cases"`
	}
	require.NoError(t, json.Unmarshal(raw, &doc))
	require.NotEmpty(t, doc.Cases)
	for _, c := range doc.Cases {
		built, err := BuildEmbeddedHTML(map[string]interface{}{"kind": "test"}, []byte(marker), OfflineOptions{
			Audience: c.Settings.Audience, Depth: c.Settings.Depth, Wording: c.Settings.Wording,
		})
		require.NoError(t, err, c.Name)
		bootstrap := `<script>renderEvidenceGraph({"kind":"test"}, document.currentScript.previousElementSibling, undefined, ` +
			escapeJSONForHTMLScript(c.Options) + ");</script>\n"
		require.True(t, strings.HasSuffix(built.HTML, "<div "+EmbeddedHostAttribute+"></div>\n"+bootstrap), c.Name)
	}
}

func embeddedGoldenOptions(t *testing.T) (interface{}, OfflineOptions) {
	t.Helper()
	sealed := loadJSON(t, filepath.Join("..", "..", "ts", "test", "testdata", "result-root-bundle.sealed.json"))
	return sealed, OfflineOptions{
		Audience: "counterparty", Depth: "L1",
		Wording: wordingOf(`{"entries":{"page.title":"Résumé </script> & co"},"id":"org.example.w/v0","locale":"fr-CA","wording_pack_version":"aac.wording-pack/v0"}`),
	}
}

// expected-embedded.html is Go's snippet for the sealed Result bundle. The
// TypeScript test "the Go embedded snippet renders" runs it with the real
// core runtime in place of the marker and checks that it renders and
// verifies. To regenerate after an intentional change, run this test with
// UPDATE_PRESENTATION_GOLDENS=1.
func TestBuildEmbeddedHTMLGolden(t *testing.T) {
	bundle, options := embeddedGoldenOptions(t)
	built, err := BuildEmbeddedHTML(bundle, []byte(marker), options)
	require.NoError(t, err)
	if os.Getenv("UPDATE_PRESENTATION_GOLDENS") == "1" {
		require.NoError(t, os.WriteFile(filepath.Join("testdata", "expected-embedded.html"), []byte(built.HTML), 0o644))
	}
	require.True(t, built.HTML == readTestdata(t, "expected-embedded.html"), "Go embedded snippet differs from its golden")

	// The reported sources are the snippet's scripts, and the runtime's
	// stylesheets.
	scripts, styles, err := inlineElements(built.HTML)
	require.NoError(t, err)
	require.Empty(t, styles)
	require.Len(t, scripts, 2)
	require.Equal(t, []string{cspHashSource(scripts[0]), cspHashSource(scripts[1])}, built.ScriptSources)
	require.Equal(t, coreRuntimeStyleSources(), built.StyleSources)
	require.NotContains(t, built.HTML, "Content-Security-Policy")
	require.NotContains(t, built.HTML, "</script> & co")
}

func TestBuildEmbeddedHTMLModulesAndRefusals(t *testing.T) {
	bundle := map[string]interface{}{"kind": "test"}
	first := hexPinOf(".m{color:red}")
	module := styledModule(t, []string{first}, []string{first})
	built, err := BuildEmbeddedHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Modules: []Module{module}})
	require.NoError(t, err)
	require.Equal(t, "<script>"+marker+"</script>\n<script>"+string(module.Code)+"</script>\n<div data-aac-embedded></div>\n"+
		`<script>renderEvidenceGraph({"kind":"test"}, document.currentScript.previousElementSibling, undefined, {"audience":"*","format":"embedded"});</script>`+"\n",
		built.HTML)
	require.Len(t, built.ScriptSources, 3)
	require.Contains(t, built.StyleSources, sourceOf(".m{color:red}"))

	for name, o := range map[string]OfflineOptions{
		"no audience":       {},
		"bad depth":         {Audience: "*", Depth: "L9"},
		"runtime pin":       {Audience: "*", CoreRuntimeSHA256: strings.Repeat("0", 64)},
		"module pin":        {Audience: "*", Modules: []Module{{Code: []byte("x"), SHA256: strings.Repeat("0", 64)}}},
		"module end tag":    {Audience: "*", Modules: []Module{{Code: []byte("</script>"), SHA256: hexPinOf("</script>")}}},
		"manifest mismatch": {Audience: "*", Modules: []Module{styledModule(t, nil, []string{first})}},
	} {
		_, err := BuildEmbeddedHTML(bundle, []byte(marker), o)
		require.Error(t, err, name)
	}
	_, err = BuildEmbeddedHTML([]interface{}{}, []byte(marker), OfflineOptions{Audience: "*"})
	require.ErrorContains(t, err, "not a JSON object")
	_, err = BuildEmbeddedHTML(bundle, []byte("a</script>"), OfflineOptions{Audience: "*"})
	require.Error(t, err)
}
