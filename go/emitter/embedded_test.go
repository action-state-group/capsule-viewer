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

// The vectors come from ts/test/go-embedded-vectors.test.ts: seeded,
// generated (bundle, settings) inputs and the snippet, CSP sources or
// refusal buildPresentation's "embedded" result gives for each. Go must
// write the same bytes and sources, and refuse the same inputs.
func TestBuildEmbeddedHTMLMatchesTypeScript(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "embedded-vectors.json"))
	require.NoError(t, err)
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var doc struct {
		Cases []struct {
			Name     string      `json:"name"`
			Bundle   interface{} `json:"bundle"`
			Settings struct {
				Audience string   `json:"audience"`
				Depth    string   `json:"depth"`
				Wording  *Wording `json:"wording"`
				Modules  []struct {
					Code        string   `json:"code"`
					SHA256      string   `json:"sha256"`
					StyleSHA256 []string `json:"style_sha256"`
				} `json:"modules"`
			} `json:"settings"`
			Runtime       string   `json:"runtime"`
			RuntimeSHA256 string   `json:"runtime_sha256"`
			HTML          string   `json:"html"`
			ScriptSources []string `json:"script_sources"`
			StyleSources  []string `json:"style_sources"`
			Error         string   `json:"error"`
		} `json:"cases"`
	}
	require.NoError(t, decoder.Decode(&doc))
	require.Greater(t, len(doc.Cases), 30)
	for _, c := range doc.Cases {
		t.Run(c.Name, func(t *testing.T) {
			options := OfflineOptions{
				Audience: c.Settings.Audience, Depth: c.Settings.Depth, Wording: c.Settings.Wording,
				CoreRuntimeSHA256: c.RuntimeSHA256,
			}
			for _, m := range c.Settings.Modules {
				options.Modules = append(options.Modules, Module{Code: []byte(m.Code), SHA256: m.SHA256, StyleSHA256: m.StyleSHA256})
			}
			built, err := BuildEmbeddedHTML(c.Bundle, []byte(c.Runtime), options)
			if c.Error != "" {
				require.Error(t, err, "TypeScript refused: %s", c.Error)
				return
			}
			require.NoError(t, err)
			require.True(t, built.HTML == c.HTML, "Go snippet differs from TypeScript's")
			require.Equal(t, c.ScriptSources, built.ScriptSources)
			require.Equal(t, c.StyleSources, built.StyleSources)
		})
	}
}

// The reported sources are exactly the snippet's executable scripts, and
// the stylesheets the runtime and modules insert; the JSON data element is
// not a script a CSP governs.
func TestBuildEmbeddedHTMLSourcesAreTheSnippets(t *testing.T) {
	first := hexPinOf(".m{color:red}")
	module := styledModule(t, []string{first}, []string{first})
	built, err := BuildEmbeddedHTML(map[string]interface{}{"k": "</script><!--"}, []byte(marker), OfflineOptions{
		Audience: "counterparty", Depth: "L1", Modules: []Module{module},
		Wording: wordingOf(`{"entries":{"page.title":"Résumé </script> & co"},"id":"org.example.w/v0","locale":"fr-CA","wording_pack_version":"aac.wording-pack/v0"}`),
	})
	require.NoError(t, err)
	scripts, styles, err := inlineElements(built.HTML)
	require.NoError(t, err)
	require.Empty(t, styles)
	sources := []string{}
	for _, script := range scripts {
		sources = append(sources, cspHashSource(script))
	}
	require.Equal(t, sources, built.ScriptSources)
	require.Equal(t, 1, strings.Count(built.HTML, `<script type="application/json">`))
	require.Equal(t, append(coreRuntimeStyleSources(), sourceOf(".m{color:red}")), built.StyleSources)
	require.NotContains(t, built.HTML, "Content-Security-Policy")
	require.NotContains(t, built.HTML, "</script><!--\"")
	require.NotContains(t, built.HTML, "</script> & co")
}

func TestBuildEmbeddedHTMLModulesAndRefusals(t *testing.T) {
	bundle := map[string]interface{}{"kind": "test"}
	first := hexPinOf(".m{color:red}")
	module := styledModule(t, []string{first}, []string{first})
	built, err := BuildEmbeddedHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Modules: []Module{module}})
	require.NoError(t, err)
	require.Equal(t, "<script>"+marker+"</script>\n<script>"+string(module.Code)+"</script>\n<div data-aac-embedded></div>\n"+
		`<script type="application/json">{"kind":"test"}</script>`+"\n"+
		`<script>(function (data) { renderEvidenceGraph(JSON.parse(data.textContent), data.previousElementSibling, undefined, {"audience":"*","format":"embedded"}); })(document.currentScript.previousElementSibling);</script>`+"\n",
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
