// SPDX-License-Identifier: BSD-3-Clause
package emitter

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/action-state-group/agent-action-capsule/go/canonical"
)

// The embedded packaging (spec/presentation-builder-v0.md section 2.3) for
// a caller with no DOM: a snippet a host page inlines where the
// presentation goes. TypeScript's buildPresentation hands back mount(element)
// instead, which calls renderEvidenceGraph(bundle, element, undefined,
// {audience, format: "embedded", depth, wording}); the snippet's bootstrap
// makes the same call with the same options, written as JCS, on the element
// just before it. The host page owns its CSP, so the snippet carries none
// and reports the hash sources the host must allow.

// EmbeddedHostAttribute marks the host element the snippet renders into.
const EmbeddedHostAttribute = "data-aac-embedded"

// BuiltEmbedded is the embedded packaging.
type BuiltEmbedded struct {
	// HTML is the snippet: the core runtime and each module as inline
	// scripts, the host element, and the bootstrap that renders into it.
	HTML string
	// ScriptSources are the CSP hash sources of the snippet's inline
	// scripts, in order: the host's script-src must allow each.
	ScriptSources []string
	// StyleSources are the CSP hash sources of the stylesheets the core
	// runtime and the modules insert at render time: the host's style-src
	// must allow each, or they do not apply.
	StyleSources []string
}

// BuildEmbeddedHTML packages a (scoped) bundle as the embedded snippet. It
// checks the settings as BuildOfflineHTML does, and the runtime and each
// module against its pin. Title and ThemeCSS are the host page's, as with
// TypeScript's mount, and are not used.
func BuildEmbeddedHTML(value interface{}, runtime []byte, o OfflineOptions) (*BuiltEmbedded, error) {
	bundleObject, ok := value.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("bundle is not a JSON object")
	}
	if _, err := checkSettings(o); err != nil {
		return nil, err
	}
	runtimeText := string(runtime)
	if err := checkInline("browser IIFE", runtimeText, "</script"); err != nil {
		return nil, err
	}
	if o.CoreRuntimeSHA256 != "" {
		sum := sha256.Sum256(runtime)
		if hex.EncodeToString(sum[:]) != o.CoreRuntimeSHA256 {
			return nil, fmt.Errorf("browser IIFE does not match its SHA-256 pin")
		}
	}
	scripts := []string{runtimeText}
	styles := coreRuntimeStyleSources()
	for index, module := range o.Modules {
		name := fmt.Sprintf("module %d", index)
		if err := checkInline(name, string(module.Code), "</script"); err != nil {
			return nil, err
		}
		if err := checkPin(name, module.SHA256, string(module.Code)); err != nil {
			return nil, err
		}
		scripts = append(scripts, string(module.Code))
		for styleIndex, pin := range module.StyleSHA256 {
			source, err := CSPHashSourceFromHex(pin)
			if err != nil {
				return nil, fmt.Errorf("%s style %d: %w", name, styleIndex, err)
			}
			styles = append(styles, source)
		}
	}
	bundleJSON, err := canonical.JCS(bundleObject)
	if err != nil {
		return nil, err
	}
	options, err := renderOptions(o, "embedded")
	if err != nil {
		return nil, err
	}
	bootstrap := "renderEvidenceGraph(" + escapeJSONForHTMLScript(string(bundleJSON)) +
		", document.currentScript.previousElementSibling, undefined, " + options + ");"
	if err := checkInline("bootstrap", bootstrap, "</script"); err != nil {
		return nil, err
	}
	var html strings.Builder
	sources := make([]string, 0, len(scripts)+1)
	for _, script := range scripts {
		html.WriteString("<script>" + script + "</script>\n")
		sources = append(sources, cspHashSource(script))
	}
	html.WriteString("<div " + EmbeddedHostAttribute + "></div>\n")
	html.WriteString("<script>" + bootstrap + "</script>\n")
	sources = append(sources, cspHashSource(bootstrap))
	return &BuiltEmbedded{HTML: html.String(), ScriptSources: unique(sources), StyleSources: unique(styles)}, nil
}
