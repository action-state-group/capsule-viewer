// SPDX-License-Identifier: Apache-2.0

// Package receipt is capsule-viewer's receipt renderer for Go page builders:
// the receipt modules as module-slot scripts, each with the manifest
// that pins it, ready for go/emitter's module slot (capsule-viewer#383).
// It is the one place receipts are drawn: capsulectl's pages and reports and
// the browser build carry these modules rather than a renderer of their own.
//
// The modules are capsuleviewer.receipt.unilateral/v0, .seller/v0 and
// .bilateral/v0 (the x-deal-v0 receipt, a seller's copy and a composed pair),
// capsuleviewer.receipt.deal/v1 (the x-deal-v1 sealed report) and
// capsuleviewer.receipt.provider/v0 (a Mesh provider's own record of an
// exchange it served and the payments it received, capsule-viewer#390). Each
// script registers exactly one module, so a page carries one script per
// module it chose.
//
// receipt_core.js is the source of all five. `go generate` writes each
// receipt_<kind>.js and the executable block of each manifest-<kind>.json
// from it, the manifest, wording-en.json, the kit stylesheet
// (src/capsule_viewer/static/kit.css), the receipt's dark overrides
// (src/capsule_viewer/static/kit-dark.css) and the receipt's own rules
// (go/receipt/receipt.css) (internal/writer). It also writes byte-identical
// copies of the two kit stylesheets here (kit.css, kit-dark.css), so Styles
// can return the three stylesheets a manifest pins. The Python package's copies (src/capsule_viewer/static,
// receipt_slot) are frozen at capsule-viewer 0.25.0; this package's copies
// are the ones that change.
package receipt

//go:generate go run ./internal/gen

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/action-state-group/capsule-viewer/go/emitter"
)

// The receipt kinds, in the order Kinds lists them.
const (
	Unilateral = "unilateral"
	Seller     = "seller"
	Bilateral  = "bilateral"
	Deal       = "deal"
	Provider   = "provider"
)

// Kinds are the receipt modules this package carries.
var Kinds = []string{Unilateral, Seller, Bilateral, Deal, Provider}

var (
	//go:embed receipt_unilateral.js
	unilateralJS []byte
	//go:embed receipt_seller.js
	sellerJS []byte
	//go:embed receipt_bilateral.js
	bilateralJS []byte
	//go:embed receipt_deal.js
	dealJS []byte
	//go:embed receipt_provider.js
	providerJS []byte

	//go:embed manifest-unilateral.json
	unilateralManifest []byte
	//go:embed manifest-seller.json
	sellerManifest []byte
	//go:embed manifest-bilateral.json
	bilateralManifest []byte
	//go:embed manifest-deal.json
	dealManifest []byte
	//go:embed manifest-provider.json
	providerManifest []byte

	// The stylesheets every module's manifest pins, in its style_sha256
	// order: the kit stylesheet, the receipt's dark overrides and the
	// receipt's own rules (internal/writer pins them in this order).
	//go:embed kit.css
	kitCSS []byte
	//go:embed kit-dark.css
	kitDarkCSS []byte
	//go:embed receipt.css
	receiptCSS []byte
	styles     = [][]byte{kitCSS, kitDarkCSS, receiptCSS}
)

type files struct{ script, manifest []byte }

var byKind = map[string]files{
	Unilateral: {unilateralJS, unilateralManifest},
	Seller:     {sellerJS, sellerManifest},
	Bilateral:  {bilateralJS, bilateralManifest},
	Deal:       {dealJS, dealManifest},
	Provider:   {providerJS, providerManifest},
}

type manifest struct {
	ID         string `json:"id"`
	Executable struct {
		ScriptSHA256 string   `json:"script_sha256"`
		StyleSHA256  []string `json:"style_sha256"`
	} `json:"executable"`
}

func parse(kind string) (files, manifest, error) {
	f, ok := byKind[kind]
	if !ok {
		return files{}, manifest{}, fmt.Errorf("receipt: no %q receipt module", kind)
	}
	var m manifest
	if err := json.Unmarshal(f.manifest, &m); err != nil {
		return files{}, manifest{}, fmt.Errorf("receipt: the %s manifest: %w", kind, err)
	}
	return f, m, nil
}

// ID is the presentation module id of kind, as its manifest names it.
func ID(kind string) (string, error) {
	_, m, err := parse(kind)
	return m.ID, err
}

// Module is kind's module as go/emitter's module slot takes it: the script,
// its pin, the stylesheet pins and the manifest, which the offline builder
// checks pins the script and stylesheets.
func Module(kind string) (emitter.Module, error) {
	f, m, err := parse(kind)
	if err != nil {
		return emitter.Module{}, err
	}
	code := make([]byte, len(f.script))
	copy(code, f.script)
	return emitter.Module{
		Code:        code,
		SHA256:      m.Executable.ScriptSHA256,
		StyleSHA256: append([]string(nil), m.Executable.StyleSHA256...),
		Manifest:    append(json.RawMessage(nil), f.manifest...),
	}, nil
}

// Styles are the stylesheets kind's manifest pins, in its style_sha256
// order: each slice's SHA-256 is the manifest's entry at that index. A page
// builder that loads modules from files, such as capsulectl presentation
// build, takes them beside Module's script. The slices are copies.
func Styles(kind string) ([][]byte, error) {
	if _, _, err := parse(kind); err != nil {
		return nil, err
	}
	out := make([][]byte, len(styles))
	for i, s := range styles {
		out[i] = append([]byte(nil), s...)
	}
	return out, nil
}
