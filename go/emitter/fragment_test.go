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

type fragmentVector struct {
	Name     string      `json:"name"`
	Bundle   interface{} `json:"bundle"`
	Settings struct {
		Audience string   `json:"audience"`
		Depth    string   `json:"depth"`
		Title    string   `json:"title"`
		ThemeCSS string   `json:"theme_css"`
		Wording  *Wording `json:"wording"`
		Modules  []struct {
			Code   string `json:"code"`
			SHA256 string `json:"sha256"`
		} `json:"modules"`
		MaxFragmentLength int    `json:"max_fragment_length"`
		ViewerURL         string `json:"viewer_url"`
	} `json:"settings"`
	Runtime      string `json:"runtime"`
	BundlePad    int    `json:"bundle_pad"`
	ViewerURLPad int    `json:"viewer_url_pad"`
	Presentation string `json:"presentation"`
	Fragment     string `json:"fragment"`
	URL          string `json:"url"`
	Refused      *struct {
		Subject string `json:"subject"`
		Length  int    `json:"length"`
		Limit   int    `json:"limit"`
	} `json:"refused"`
	Error string `json:"error"`
}

// The vectors come from ts/test/go-fragment-vectors.test.ts: seeded,
// generated (bundle, settings) inputs and what buildPresentation's
// "fragment" format gives for each. Go must give the same token and URL,
// refuse the same over-long ones with the same lengths, and refuse what
// AAC's JCS refuses.
func TestBuildPresentationFragmentMatchesTypeScript(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "fragment-vectors.json"))
	require.NoError(t, err)
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var doc struct {
		Cases []fragmentVector `json:"cases"`
	}
	require.NoError(t, decoder.Decode(&doc))
	require.Greater(t, len(doc.Cases), 60)
	for _, c := range doc.Cases {
		t.Run(c.Name, func(t *testing.T) {
			if c.BundlePad > 0 {
				c.Bundle.(map[string]interface{})["pad"] = strings.Repeat("x", c.BundlePad)
			}
			options := FragmentOptions{
				OfflineOptions: OfflineOptions{
					Audience: c.Settings.Audience, Depth: c.Settings.Depth, Title: c.Settings.Title,
					ThemeCSS: c.Settings.ThemeCSS, Wording: c.Settings.Wording,
				},
				Presentation: c.Presentation,
				MaxLength:    c.Settings.MaxFragmentLength,
				ViewerURL:    c.Settings.ViewerURL + strings.Repeat("é", c.ViewerURLPad),
			}
			for _, m := range c.Settings.Modules {
				options.Modules = append(options.Modules, Module{Code: []byte(m.Code), SHA256: m.SHA256})
			}
			built, err := BuildPresentationFragment(c.Bundle, []byte(c.Runtime), options)
			switch {
			case c.Refused != nil:
				var tooLarge *FragmentTooLargeError
				require.ErrorAs(t, err, &tooLarge)
				require.Equal(t, FragmentTooLargeError{Length: c.Refused.Length, MaxLength: c.Refused.Limit, Subject: c.Refused.Subject}, *tooLarge)
			case c.Error != "":
				require.Error(t, err, "TypeScript refused: %s", c.Error)
			default:
				require.NoError(t, err)
				require.True(t, built.Fragment == c.Fragment, "Go token differs from TypeScript's")
				require.Equal(t, c.URL, built.URL)
				// The payload decodes back to the settings it was built from.
				payload, err := DecodePresentationFragment(built.Fragment, 0)
				require.NoError(t, err)
				require.Equal(t, built.Payload.Audience, payload.Audience)
				require.Equal(t, built.Payload.ModuleSHA256, append([]string{}, payload.ModuleSHA256...))
			}
		})
	}
}

// The golden fragment from ts/test/presentation-builder.test.ts rebuilds to
// itself: the same scoped bundle and settings give the same token.
func TestBuildPresentationFragmentRebuildsTheGolden(t *testing.T) {
	token := strings.TrimSpace(readTestdata(t, "offline-fragment.txt"))
	payload, err := DecodePresentationFragment(token, 0)
	require.NoError(t, err)
	built, err := BuildPresentationFragment(payload.Bundle, []byte(marker), FragmentOptions{
		OfflineOptions: OfflineOptions{
			Audience: payload.Audience, Depth: payload.Depth, Title: payload.Title,
			ThemeCSS: payload.ThemeCSS, Wording: payload.Wording,
		},
		Presentation: payload.Presentation,
		MaxLength:    FragmentTokenMaxLength,
	})
	require.NoError(t, err)
	require.True(t, built.Fragment == token)
	html, err := OfflineHTMLFromFragment(built.Fragment, []byte(marker), nil)
	require.NoError(t, err)
	require.True(t, html == readTestdata(t, "expected-offline.html"))
}

func TestBuildPresentationFragmentRefusals(t *testing.T) {
	week := map[string]interface{}{"kind": "test"}
	base := FragmentOptions{OfflineOptions: OfflineOptions{Audience: "*"}, MaxLength: FragmentTokenMaxLength}
	built, err := BuildPresentationFragment(week, []byte(marker), base)
	require.NoError(t, err)
	require.Equal(t, "auto", built.Payload.Presentation)
	require.Equal(t, hexPinOf(marker), built.Payload.CoreRuntimeSHA256)

	// The default budget refuses what the ceiling allows, naming both.
	big := map[string]interface{}{"pad": strings.Repeat("x", FragmentTokenDefaultBudget)}
	_, err = BuildPresentationFragment(big, []byte(marker), FragmentOptions{OfflineOptions: OfflineOptions{Audience: "*"}})
	var tooLarge *FragmentTooLargeError
	require.ErrorAs(t, err, &tooLarge)
	require.Equal(t, FragmentTokenDefaultBudget, tooLarge.MaxLength)
	require.Equal(t, "fragment token", tooLarge.Subject)
	require.Contains(t, err.Error(), "refused, never truncated")

	for name, o := range map[string]FragmentOptions{
		"no audience":       {MaxLength: 1},
		"bad depth":         {OfflineOptions: OfflineOptions{Audience: "*", Depth: "L3"}},
		"bad wording":       {OfflineOptions: OfflineOptions{Audience: "*", Wording: &Wording{Pack: "{}", SHA256: strings.Repeat("0", 64)}}},
		"runtime pin":       {OfflineOptions: OfflineOptions{Audience: "*", CoreRuntimeSHA256: strings.Repeat("0", 64)}},
		"module pin":        {OfflineOptions: OfflineOptions{Audience: "*", Modules: []Module{{Code: []byte("x"), SHA256: strings.Repeat("0", 64)}}}},
		"budget too high":   {OfflineOptions: OfflineOptions{Audience: "*"}, MaxLength: FragmentTokenMaxLength + 1},
		"negative budget":   {OfflineOptions: OfflineOptions{Audience: "*"}, MaxLength: -1},
		"viewer fragment":   {OfflineOptions: OfflineOptions{Audience: "*"}, ViewerURL: "https://v.example/#x"},
		"manifest mismatch": {OfflineOptions: OfflineOptions{Audience: "*", Modules: []Module{styledModule(t, nil, []string{hexPinOf("s")})}}},
	} {
		_, err := BuildPresentationFragment(week, []byte(marker), o)
		require.Error(t, err, name)
	}
}
