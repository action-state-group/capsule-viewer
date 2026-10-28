// SPDX-License-Identifier: Apache-2.0
package pageruntime

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/action-state-group/capsule-viewer/go/emitter"
)

func TestRuntimeMatchesItsPin(t *testing.T) {
	require.Regexp(t, `^[0-9a-f]{64}$`, SHA256)
	sum := sha256.Sum256(IIFE)
	assert.Equal(t, SHA256, hex.EncodeToString(sum[:]))
}

// The build stamps the commit it was made from (build-iife.mjs's
// __CAPSULE_VIEWER_COMMIT__), so a clean build at Commit names it.
func TestRuntimeNamesItsCommit(t *testing.T) {
	require.Regexp(t, `^[0-9a-f]{40}$`, Commit)
	assert.Contains(t, string(IIFE), `"`+Commit+`"`)
}

func TestRuntimeIsAStrictIIFE(t *testing.T) {
	text := string(IIFE)
	assert.Regexp(t, `^"use strict";\nvar EvidenceGraph = \(\(\) => \{`, text)
	assert.Contains(t, text, "globalThis.renderEvidenceGraph = EvidenceGraph.renderEvidenceGraph;")
}

// The emitter accepts the runtime under its pin.
func TestEmitterTakesTheRuntime(t *testing.T) {
	page, err := emitter.BuildOfflineHTML(map[string]interface{}{"note": "pageruntime"}, IIFE,
		emitter.OfflineOptions{Audience: "*", CoreRuntimeSHA256: SHA256})
	require.NoError(t, err)
	assert.Contains(t, page, string(IIFE))
}

func TestNoticesShipWithTheRuntime(t *testing.T) {
	for _, name := range []string{"NOTICE", "THIRD_PARTY_NOTICES.md"} {
		text, err := os.ReadFile(name)
		require.NoError(t, err, name)
		assert.Contains(t, string(text), "evidence-graph.iife.js", name)
	}
	// Every package esbuild bundled from node_modules has a notice.
	notices, err := os.ReadFile("THIRD_PARTY_NOTICES.md")
	require.NoError(t, err)
	bundled := map[string]bool{}
	for _, match := range regexp.MustCompile(`(?m)^\s*// node_modules/((?:@[^/]+/)?[^/]+)/`).FindAllStringSubmatch(string(IIFE), -1) {
		bundled[match[1]] = true
	}
	require.NotEmpty(t, bundled)
	for name := range bundled {
		assert.Contains(t, string(notices), "## "+name+" ", name)
	}
}
