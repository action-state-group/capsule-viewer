// SPDX-License-Identifier: Apache-2.0

package receipt

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/action-state-group/capsule-viewer/go/emitter"
	"github.com/action-state-group/capsule-viewer/go/pageruntime"
	"github.com/action-state-group/capsule-viewer/go/presentation"
	"github.com/action-state-group/capsule-viewer/go/receipt/internal/writer"
)

func sum(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

// The committed scripts and manifests are what `go generate` writes from
// receipt_core.js, the manifests, the wording pack and the kit stylesheet.
func TestGeneratedFilesAreCurrent(t *testing.T) {
	out, err := writer.Outputs(writer.DefaultSources("."))
	require.NoError(t, err)
	require.Len(t, out, 2*len(Kinds)+2+len(writer.StyleCopies))
	for name, want := range out {
		got, err := os.ReadFile(name)
		require.NoError(t, err)
		assert.Equal(t, string(want), string(got), "%s is stale: run go generate ./receipt", name)
	}
}

func TestModulePinsItsScriptAndStylesheet(t *testing.T) {
	src := writer.DefaultSources(".")
	// The kit stylesheet, pinned unchanged (the kit's other modules share it),
	// then the receipt's dark overrides, scoped to a receipt (#391), then the
	// receipt's own rules, also scoped to a receipt (#429).
	kit, err := os.ReadFile(src.KitCSS)
	require.NoError(t, err)
	dark, err := os.ReadFile(src.KitDarkCSS)
	require.NoError(t, err)
	assert.Contains(t, string(dark), "@supports (color: light-dark(#000, #fff)) {\n  [data-receipt-module] {")
	assert.Contains(t, string(dark), "--cv-color-surface: light-dark(#ffffff, ")
	own, err := os.ReadFile(filepath.Join(src.Dir, "receipt.css"))
	require.NoError(t, err)
	assert.Contains(t, string(own), "[data-receipt-module] .cv-receipt-word { overflow-wrap: normal; }")
	ids := map[string]string{
		Unilateral: "capsuleviewer.receipt.unilateral/v0",
		Seller:     "capsuleviewer.receipt.seller/v0",
		Bilateral:  "capsuleviewer.receipt.bilateral/v0",
		Deal:       "capsuleviewer.receipt.deal/v1",
		Provider:   "capsuleviewer.receipt.provider/v0",
	}
	for _, kind := range Kinds {
		m, err := Module(kind)
		require.NoError(t, err)
		assert.Equal(t, sum(m.Code), m.SHA256, kind)
		assert.Equal(t, []string{sum(kit), sum(dark), sum(own)}, m.StyleSHA256, kind)
		id, err := ID(kind)
		require.NoError(t, err)
		assert.Equal(t, ids[kind], id)
		// The script registers its own module and no other.
		assert.Contains(t, string(m.Code), `var KIND = "`+kind+`"; // @generated KIND`)
		var manifest map[string]interface{}
		require.NoError(t, json.Unmarshal(m.Manifest, &manifest))
		assert.Equal(t, "module-slot", manifest["executable"].(map[string]interface{})["carrier"])
	}
}

// A caller's change to the returned module never reaches the next caller.
func TestModuleReturnsCopies(t *testing.T) {
	a, err := Module(Unilateral)
	require.NoError(t, err)
	a.Code[0] = 'X'
	a.Manifest[0] = 'X'
	a.StyleSHA256[0] = "x"
	b, err := Module(Unilateral)
	require.NoError(t, err)
	assert.NotEqual(t, byte('X'), b.Code[0])
	assert.NotEqual(t, byte('X'), b.Manifest[0])
	assert.NotEqual(t, "x", b.StyleSHA256[0])
}

// Styles returns, for every kind, exactly the stylesheets its manifest pins,
// in style_sha256 order, and the generated copies are the sources' bytes.
func TestStylesAreThoseTheManifestPins(t *testing.T) {
	src := writer.DefaultSources(".")
	kit, err := os.ReadFile(src.KitCSS)
	require.NoError(t, err)
	dark, err := os.ReadFile(src.KitDarkCSS)
	require.NoError(t, err)
	own, err := os.ReadFile(filepath.Join(src.Dir, "receipt.css"))
	require.NoError(t, err)
	for _, kind := range Kinds {
		m, err := Module(kind)
		require.NoError(t, err)
		styles, err := Styles(kind)
		require.NoError(t, err)
		require.Len(t, styles, len(m.StyleSHA256), kind)
		for i, s := range styles {
			assert.Equal(t, m.StyleSHA256[i], sum(s), "%s style %d", kind, i)
		}
		assert.Equal(t, [][]byte{kit, dark, own}, styles, kind)
	}
}

func TestStylesReturnsCopies(t *testing.T) {
	a, err := Styles(Deal)
	require.NoError(t, err)
	want := sum(a[0])
	a[0][0] ^= 0xff
	a[1] = nil
	b, err := Styles(Deal)
	require.NoError(t, err)
	assert.Equal(t, want, sum(b[0]))
	assert.NotEmpty(t, b[1])
}

func TestUnknownKindIsRefused(t *testing.T) {
	_, err := Module("payer")
	assert.ErrorContains(t, err, `no "payer" receipt module`)
	_, err = ID("")
	assert.Error(t, err)
	styles, err := Styles("payer")
	assert.ErrorContains(t, err, `no "payer" receipt module`)
	assert.Nil(t, styles)
}

// Each module goes into an offline page as go/emitter checks it: the manifest
// pins the script and the stylesheet, and the page carries the script whole.
// The bundle is a Mesh node's keep copy (tests/testdata/receipt).
func TestOfflinePageCarriesEachModule(t *testing.T) {
	bundle := meshKeepCopy(t)
	for _, kind := range Kinds {
		m, err := Module(kind)
		require.NoError(t, err)
		page, err := emitter.BuildOfflineHTML(bundle, pageruntime.IIFE, emitter.OfflineOptions{
			Audience: "keep", CoreRuntimeSHA256: pageruntime.SHA256, Modules: []emitter.Module{m},
		})
		require.NoError(t, err, kind)
		assert.True(t, strings.Contains(page, `var KIND = "`+kind+`"`), kind)
	}
}

// A manifest that does not pin its script is refused by the offline builder,
// so a stale pin cannot reach a page.
func TestOfflinePageRefusesAWrongPin(t *testing.T) {
	bundle := meshKeepCopy(t)
	m, err := Module(Unilateral)
	require.NoError(t, err)
	m.Code = append(m.Code, ' ')
	m.SHA256 = sum(m.Code)
	_, err = emitter.BuildOfflineHTML(bundle, pageruntime.IIFE, emitter.OfflineOptions{
		Audience: "keep", CoreRuntimeSHA256: pageruntime.SHA256, Modules: []emitter.Module{m},
	})
	assert.Error(t, err)
}

// meshKeepCopy is a Mesh node's keep copy of a deal receipt.
func meshKeepCopy(t *testing.T) map[string]interface{} {
	t.Helper()
	return fixture(t, "mesh-payer-selected")
}

// fixture is a receipt bundle from tests/testdata/receipt, numbers kept as
// their JSON text.
func fixture(t *testing.T, name string) map[string]interface{} {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "tests", "testdata", "receipt", name+".bundle.json"))
	require.NoError(t, err)
	d := json.NewDecoder(strings.NewReader(string(raw)))
	d.UseNumber()
	var bundle map[string]interface{}
	require.NoError(t, d.Decode(&bundle))
	return bundle
}

// The page's resolution (go/presentation, the Go twin of the runtime's
// registry) picks these modules as the reference runtime would: each
// registers beside the built-ins without ambiguity, and each Mesh fixture
// resolves to the module below. A Mesh provider's receipt is not a deal (no
// x-deal-v0 block): only the provider module takes it, and only for its
// owner (capsule-viewer#390).
func TestResolutionPicksTheReceiptModule(t *testing.T) {
	registry, err := presentation.NewBuiltinRegistry(presentation.ReferenceRuntime())
	require.NoError(t, err)
	for _, kind := range Kinds {
		m, err := Module(kind)
		require.NoError(t, err)
		manifest, err := presentation.ParseManifest(m.Manifest)
		require.NoError(t, err, kind)
		_, err = registry.Register(manifest)
		require.NoError(t, err, kind)
	}
	assert.Empty(t, registry.Refused())

	// A payer's keep copy is the unilateral receipt at the owner's audience
	// and at "*", the audience a report opens a carried receipt for (#383:
	// the module then draws it as a shared copy). A provider's receipt is
	// the provider module's at the owner's audience only, as the Python twin's
	// manifest says; at any other the built-in page shows it.
	cases := []struct{ name, audience, want string }{
		{"mesh-payer-selected", "keep", "capsuleviewer.receipt.unilateral/v0"},
		{"mesh-payer-selected", "*", "capsuleviewer.receipt.unilateral/v0"},
		{"mesh-provider-selected", "keep", "capsuleviewer.receipt.provider/v0"},
		{"mesh-provider-selected", "*", "aac.builtin.no-aggregate/v0"},
		{"mesh-provider-selected", "counterparty", "aac.builtin.no-aggregate/v0"},
	}
	for _, c := range cases {
		d, _ := presentation.DescribeBundle(fixture(t, c.name))
		got, err := registry.Resolve(d, c.audience, presentation.FormatHTML)
		require.NoError(t, err, c.name)
		require.Equal(t, presentation.ResolutionModule, got.Kind, c.name)
		assert.Equal(t, c.want, got.Manifest.ID, "%s at %s", c.name, c.audience)
	}
}

// The Python package's receipt files are frozen at 0.25.0 (#383): this
// package's copies are the ones that change. The one exception is the
// Python pack's id, capsuleviewer.receipt.wording.en/v1 like this package's
// (evidencebook#956, #439), so the scripts and manifests the Python writer
// made from it changed with it. The pins keep an edit to the frozen copies,
// or a rerun of the Python writer, from passing unseen.
func TestFrozenPythonCopiesStayFrozen(t *testing.T) {
	pins := map[string]string{
		"static/receipt_core.js":                "1e0f98f27a36f8dbf4dfcc4f1dbbc6f98396704add1cba33634bd349baa455d8",
		"static/receipt_unilateral.js":          "70dd992ae345de7c2f44d8ae1e72e126d8c9695f9ae4d352d62212b20e2a8169",
		"static/receipt_seller.js":              "e28e262719b3d1c202828c469e7f41122902080b935ceaf58dc1186233f9a290",
		"static/receipt_bilateral.js":           "b05afa9fd19c98c9db3f0d4682969a379c2cdce07f3ea6bb18ada98210d999c5",
		"static/receipt_deal.js":                "59f3005f7eee5c81d15a0c9824bc6a9d460268fa6b933a3d64fd9b1381be03bc",
		"receipt_slot/manifest-unilateral.json": "5111bf2f60a9cab24eb295439641ad64260c1994cc3431d028644e4ea6ac9d7a",
		"receipt_slot/manifest-seller.json":     "a8ad65785c839fdcc15274aab6a55e8845c25f30bae2313757739be0a672f360",
		"receipt_slot/manifest-bilateral.json":  "3252cd8af2fe30c41f3772f25bb6834860becc389d2535e00486f9e17deb51c1",
		"receipt_slot/manifest-deal.json":       "69e42baf84da5ae6dfcb2ffc58a82f8cd5a7bd4b0239031cccc10314f7a270f4",
		"receipt_slot/wording-en.json":          "30c6e0d4afb71d3caebe0154a1682e84c4738bdb95fe251be83b60e55d5459cb",
	}
	for name, pin := range pins {
		b, err := os.ReadFile(filepath.Join("..", "..", "src", "capsule_viewer", filepath.FromSlash(name)))
		require.NoError(t, err)
		assert.Equal(t, pin, sum(b), "%s is frozen at 0.25.0: change go/receipt instead", name)
	}
}

// The provider's own receipt names the other party only as keeping its own
// record (#460, Sherlock2's wording): in these records a countersignature is
// a third party re-checking a bundle (the countersign.* lines), never the
// other party signing, so no provider.* line uses the word.
func TestProviderWordsNeverCallTheOtherPartyACountersigner(t *testing.T) {
	b, err := os.ReadFile("wording-en.json")
	require.NoError(t, err)
	var pack struct {
		Entries map[string]string `json:"entries"`
	}
	require.NoError(t, json.Unmarshal(b, &pack))
	seen := 0
	for key, words := range pack.Entries {
		if !strings.HasPrefix(key, "provider.") {
			continue
		}
		seen++
		assert.NotContains(t, strings.ToLower(words), "countersign", key)
	}
	assert.Positive(t, seen, "the pack has provider.* words")
	assert.Equal(t,
		"This is this node's own record of its half of the exchange. It is not a joint record: the other party keeps its own.",
		pack.Entries["provider.own_half"])
}

// A failed or dispatched exchange's page is drawn in Sherlock2's words
// (#465): its labels and title never say it was served, a failed record's
// reason is one of the five classes the plugin writes, in words, and only
// provider.status.failed_reason takes a {reason}.
func TestProviderNotServedWords(t *testing.T) {
	b, err := os.ReadFile("wording-en.json")
	require.NoError(t, err)
	var pack struct {
		Entries map[string]string `json:"entries"`
	}
	require.NoError(t, json.Unmarshal(b, &pack))
	e := pack.Entries
	assert.Equal(t, "Your record of an exchange you were asked to serve", e["provider.title_asked"])
	assert.Equal(t, "Model asked for", e["provider.model_asked"])
	assert.Equal(t, "Recorded at", e["provider.recorded_at"])
	assert.Equal(t, "This node's record says the exchange failed: {reason}. It was not served. Any payment this node received for it is listed below.", e["provider.status.failed_reason"])
	assert.Equal(t, strings.Replace(e["provider.status.failed_reason"], ": {reason}", "", 1), e["provider.status.failed"])
	assert.Equal(t, "This node's record says the request was sent on, but the host reported no response. It does not show that the exchange was served.", e["provider.status.dispatched"])
	reasons := map[string]string{}
	for key, words := range e {
		if class, ok := strings.CutPrefix(key, "provider.reason."); ok {
			reasons[class] = words
		}
		if strings.HasPrefix(key, "provider.") && key != "provider.status.failed_reason" && key != "provider.received_count" {
			assert.NotContains(t, words, "{", key)
		}
	}
	assert.Equal(t, map[string]string{
		"payment_required": "payment required",
		"refused":          "refused",
		"upstream_error":   "upstream error",
		"timeout":          "timed out",
		"dropped":          "dropped",
	}, reasons)
}
