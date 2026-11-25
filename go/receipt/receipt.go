// SPDX-License-Identifier: Apache-2.0

// Package receipt is capsule-viewer's receipt renderer for Go page builders:
// the deal receipt modules as module-slot scripts, each with the manifest
// that pins it, ready for go/emitter's module slot (capsule-viewer#383).
// It is the one place receipts are drawn: capsulectl's pages and reports and
// the browser build carry these modules rather than a renderer of their own.
//
// The modules are capsuleviewer.receipt.unilateral/v0, .seller/v0 and
// .bilateral/v0 (the x-deal-v0 receipt, a seller's copy and a composed pair)
// and capsuleviewer.receipt.deal/v1 (the x-deal-v1 sealed report). Each
// script registers exactly one module, so a page carries one script per
// module it chose.
//
// receipt_core.js is the source of all four. `go generate` writes each
// receipt_<kind>.js and the executable block of each manifest-<kind>.json
// from it, the manifest, wording-en.json and the kit stylesheet
// (internal/writer). The Python package's copies (src/capsule_viewer/static,
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
)

// Kinds are the receipt modules this package carries.
var Kinds = []string{Unilateral, Seller, Bilateral, Deal}

var (
	//go:embed receipt_unilateral.js
	unilateralJS []byte
	//go:embed receipt_seller.js
	sellerJS []byte
	//go:embed receipt_bilateral.js
	bilateralJS []byte
	//go:embed receipt_deal.js
	dealJS []byte

	//go:embed manifest-unilateral.json
	unilateralManifest []byte
	//go:embed manifest-seller.json
	sellerManifest []byte
	//go:embed manifest-bilateral.json
	bilateralManifest []byte
	//go:embed manifest-deal.json
	dealManifest []byte
)

type files struct{ script, manifest []byte }

var byKind = map[string]files{
	Unilateral: {unilateralJS, unilateralManifest},
	Seller:     {sellerJS, sellerManifest},
	Bilateral:  {bilateralJS, bilateralManifest},
	Deal:       {dealJS, dealManifest},
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
