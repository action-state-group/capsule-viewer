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

// capsule-viewer#383 moves the receipt source here without changing a byte:
// each script and manifest equals the one the Python writer wrote for 0.25.0
// (the frozen copies in the Python package). The first change to what a
// receipt shows removes this test, as the copies then part on purpose.
func TestScriptsEqualTheFrozenPythonCopies(t *testing.T) {
	for _, kind := range Kinds {
		f := byKind[kind]
		frozen, err := os.ReadFile(filepath.Join("..", "..", "src", "capsule_viewer", "static", "receipt_"+kind+".js"))
		require.NoError(t, err)
		assert.Equal(t, string(frozen), string(f.script), kind)
		frozenManifest, err := os.ReadFile(filepath.Join("..", "..", "src", "capsule_viewer", "receipt_slot", "manifest-"+kind+".json"))
		require.NoError(t, err)
		assert.Equal(t, string(frozenManifest), string(f.manifest), kind)
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

// meshKeepCopy is a Mesh node's keep copy of a deal receipt, numbers kept as
// their JSON text.
func meshKeepCopy(t *testing.T) map[string]interface{} {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "tests", "testdata", "receipt", "mesh-payer-selected.bundle.json"))
	require.NoError(t, err)
	d := json.NewDecoder(strings.NewReader(string(raw)))
	d.UseNumber()
	var bundle map[string]interface{}
	require.NoError(t, d.Decode(&bundle))
	return bundle
}
