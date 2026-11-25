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
	require.Len(t, out, 2*len(Kinds))
	for name, want := range out {
		got, err := os.ReadFile(name)
		require.NoError(t, err)
		assert.Equal(t, string(want), string(got), "%s is stale: run go generate ./receipt", name)
	}
}

func TestModulePinsItsScriptAndStylesheet(t *testing.T) {
	css, err := os.ReadFile(writer.DefaultSources(".").KitCSS)
	require.NoError(t, err)
	ids := map[string]string{
		Unilateral: "capsuleviewer.receipt.unilateral/v0",
		Seller:     "capsuleviewer.receipt.seller/v0",
		Bilateral:  "capsuleviewer.receipt.bilateral/v0",
		Deal:       "capsuleviewer.receipt.deal/v1",
	}
	for _, kind := range Kinds {
		m, err := Module(kind)
		require.NoError(t, err)
		assert.Equal(t, sum(m.Code), m.SHA256, kind)
		assert.Equal(t, []string{sum(css)}, m.StyleSHA256, kind)
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

func TestUnknownKindIsRefused(t *testing.T) {
	_, err := Module("provider")
	assert.ErrorContains(t, err, `no "provider" receipt module`)
	_, err = ID("")
	assert.Error(t, err)
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
// x-deal-v0 block), so no receipt module here takes it: it stays the Python
// provider module's, frozen at 0.25.0.
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
	// never a receipt module's.
	cases := []struct{ name, audience, want string }{
		{"mesh-payer-selected", "keep", "capsuleviewer.receipt.unilateral/v0"},
		{"mesh-payer-selected", "*", "capsuleviewer.receipt.unilateral/v0"},
		{"mesh-provider-selected", "keep", "aac.builtin.no-aggregate/v0"},
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
// package's copies are the ones that change. The pins keep an edit to the
// frozen copies, or a rerun of the Python writer, from passing unseen.
func TestFrozenPythonCopiesStayFrozen(t *testing.T) {
	pins := map[string]string{
		"static/receipt_core.js":                "1e0f98f27a36f8dbf4dfcc4f1dbbc6f98396704add1cba33634bd349baa455d8",
		"static/receipt_unilateral.js":          "f4fb1ffff653f63af2b204bb24d457f2e56bbeb39ee426964e57d194163f851a",
		"static/receipt_seller.js":              "bfa71f640ecef842fcf59bc4f0ddaf3529bc426edd787ca07548990d499af07a",
		"static/receipt_bilateral.js":           "58d44eeacaedff905d7ca8cf363185daa7f290c450f6976fb4fab4fc10c18122",
		"static/receipt_deal.js":                "7ad78e95187c1c75bbe803e53e365b97cf8a65479f3a75789a6b04b223bb0f5a",
		"receipt_slot/manifest-unilateral.json": "bdf74647e823dc3651748e6311d5b7df6712254a9fa4308989ec367b2532b8f7",
		"receipt_slot/manifest-seller.json":     "ec448a50776a0f418c5cb6e40985de81adc07be90b39247664e1f2a28ae4161c",
		"receipt_slot/manifest-bilateral.json":  "e2722aa746da21c6a7158a48841781e3ca67c1b89c6a1020c750367d53975548",
		"receipt_slot/manifest-deal.json":       "d6eee9a12d99692e23d7d2980e008b55aeb70a01b9150f02a8b2d7ccaf436c7d",
		"receipt_slot/wording-en.json":          "86b1f1bc62907dfba420f76541bf3047b4b2355b744b2c5107f1870993d9dfe9",
	}
	for name, pin := range pins {
		b, err := os.ReadFile(filepath.Join("..", "..", "src", "capsule_viewer", filepath.FromSlash(name)))
		require.NoError(t, err)
		assert.Equal(t, pin, sum(b), "%s is frozen at 0.25.0: change go/receipt instead", name)
	}
}
