// SPDX-License-Identifier: Apache-2.0

// Package pageruntime ships capsule-viewer's page runtime: the browser
// script an emitted page runs in its core runtime slot (go/emitter's
// BuildOfflineHTML, BuildEmbeddedHTML), built by ts/scripts/build-iife.mjs
// from ts/src/browser.ts. It bundles the viewer's page code with
// agent-action-capsule's verifier, taken from the npm release ts/package.json
// pins, and exposes them on the global EvidenceGraph, with renderEvidenceGraph
// also on globalThis.
//
// Besides registerPresentation, the global carries the verifier functions a
// presentation module may call: disclosureOf, ed25519Available,
// verifiedPayload, verifyDisclosureEnvelope and verifyProducerEnvelope,
// agent-action-capsule's own functions re-exported unchanged (the list in
// ts/src/browser.ts).
//
// The file is committed as built at Commit, with its SHA-256 pin beside it
// (evidence-graph.iife.js.sha256). scripts/pageruntime.sh rebuilds it at
// Commit and compares it byte for byte (CI), and refreshes all three with
// --write. The stylesheets the runtime inserts are listed for the page's CSP
// in go/emitter/runtime-style-hashes.txt, which the TypeScript tests check
// against this file's styles. NOTICE and THIRD_PARTY_NOTICES.md beside it
// carry the bundled components' licenses.
package pageruntime

import (
	_ "embed"
	"strings"
)

// Commit is the capsule-viewer commit the runtime was built from. The page's
// "Verified by" line names it.
const Commit = "cd1b02f4e1a7c103bad7a5d3baf8e6feaed5c279"

var (
	// IIFE is the runtime's bytes, for go/emitter's runtime argument.
	//go:embed evidence-graph.iife.js
	IIFE []byte

	//go:embed evidence-graph.iife.js.sha256
	sha256File string

	// SHA256 is the lowercase hex SHA-256 of IIFE, for go/emitter's
	// CoreRuntimeSHA256.
	SHA256 = strings.TrimSpace(sha256File)
)
