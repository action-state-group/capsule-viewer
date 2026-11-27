// SPDX-License-Identifier: Apache-2.0

// Package writer writes the receipt package's generated files: one
// module-slot script per receipt module and the manifest that pins it. Each
// script is receipt_core.js with its "@generated" lines filled: the module
// it registers, its manifest (with script_sha256 all zeros, as a script
// cannot carry its own digest), the words of the example English wording
// pack (compiled in: the script reads no pack), the pack's id and sha256, the
// kit stylesheet (src/capsule_viewer/static/kit.css, the one copy), the
// receipt's dark overrides (static/kit-dark.css), the receipt's own rules
// (receipt.css; the manifest pins the three by style_sha256, in that order)
// and the seller kind.
//
// It writes the same bytes the Python writer (capsule_viewer.receipt_slot)
// wrote for capsule-viewer 0.25.0 (apart from the dark overrides and the
// words added since, capsule-viewer#391, and the provider's script and
// manifest, which that writer never wrote, #390), so the JSON it fills in is serialised the
// way Python's json.dumps does: keys in file order, non-ASCII text as is,
// and only '"', '\\' and control characters escaped. One difference: a number
// keeps the text it was written with (Python would print 2.50 as 2.5); no
// input carries such a number, and TestGeneratedFilesAreCurrent would show
// one that did.
package writer

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Kinds are the receipt modules, in the order the package lists them: the
// three x-deal-v0 modules, the x-deal-v1 deal module and the provider's own
// receipt for an exchange it served (capsule-viewer#390).
var Kinds = []string{"unilateral", "seller", "bilateral", "deal", "provider"}

// SellerKind is the seller copy's bundle extension kind.
const SellerKind = "x-deal-seller/v0"

const zero = "0000000000000000000000000000000000000000000000000000000000000000"

// generated matches one "@generated" line of receipt_core.js; the two names
// must agree (RE2 has no backreference, so Fill checks it).
var generated = regexp.MustCompile(`(?m)^(  var (\w+) = ).*; // @generated (\w+)$`)

// Sources are the inputs: the package directory (receipt_core.js, the
// hand-edited manifest-<kind>.json, wording-en.json and receipt.css) and the
// kit stylesheet and its dark overrides.
type Sources struct {
	Dir        string
	KitCSS     string
	KitDarkCSS string
}

// DefaultSources are the inputs of a capsule-viewer checkout, from the
// receipt package's directory.
func DefaultSources(dir string) Sources {
	static := filepath.Join(dir, "..", "..", "src", "capsule_viewer", "static")
	return Sources{Dir: dir, KitCSS: filepath.Join(static, "kit.css"), KitDarkCSS: filepath.Join(static, "kit-dark.css")}
}

// The kit stylesheet is shared with the kit's other modules, which insert it
// under the same element id, so it is pinned and inserted unchanged. The
// dark overrides (generated from tokens/tokens.json by scripts/gen-tokens.py)
// are a second stylesheet of the receipt's own: they apply inside a receipt
// only and follow the colour scheme the host page declares, so a receipt on a
// dark page is dark and one on a page that declares none stays light
// (capsule-viewer#391). receipt.css is a third, also the receipt's own and
// scoped to a receipt: a word in a table cell never breaks inside
// (capsule-viewer#429).

func digest(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Outputs returns each generated file's name, relative to Dir, and bytes.
func Outputs(s Sources) (map[string][]byte, error) {
	core, err := os.ReadFile(filepath.Join(s.Dir, "receipt_core.js"))
	if err != nil {
		return nil, err
	}
	pack, err := os.ReadFile(filepath.Join(s.Dir, "wording-en.json"))
	if err != nil {
		return nil, err
	}
	css, err := os.ReadFile(s.KitCSS)
	if err != nil {
		return nil, err
	}
	dark, err := os.ReadFile(s.KitDarkCSS)
	if err != nil {
		return nil, err
	}
	own, err := os.ReadFile(filepath.Join(s.Dir, "receipt.css"))
	if err != nil {
		return nil, err
	}
	packValue, err := decode(pack)
	if err != nil {
		return nil, fmt.Errorf("wording-en.json: %w", err)
	}
	packObj, ok := packValue.(object)
	if !ok {
		return nil, errors.New("wording-en.json is not an object")
	}
	entries, okE := packObj.get("entries")
	id, okI := packObj.get("id")
	if !okE || !okI {
		return nil, errors.New("wording-en.json has no id or entries")
	}
	out := make(map[string][]byte, 2*len(Kinds)+1+len(StyleCopies))
	var manifests object
	for _, kind := range Kinds {
		raw, err := os.ReadFile(filepath.Join(s.Dir, "manifest-"+kind+".json"))
		if err != nil {
			return nil, err
		}
		m, err := decode(raw)
		if err != nil {
			return nil, fmt.Errorf("manifest-%s.json: %w", kind, err)
		}
		mo, ok := m.(object)
		if !ok {
			return nil, fmt.Errorf("manifest-%s.json is not an object", kind)
		}
		values := map[string]string{
			"KIND":         inline(kind),
			"MANIFEST":     inline(mo.withExecutable(zero, digest(css), digest(dark), digest(own))),
			"WORDS":        inline(entries),
			"PACK":         inline(object{{"id", id}, {"sha256", digest(pack)}}),
			"KIT_CSS":      inline(string(css)),
			"KIT_DARK_CSS": inline(string(dark)),
			"RECEIPT_CSS":  inline(string(own)),
			"SELLER_KIND":  inline(SellerKind),
		}
		script, err := Fill(core, values)
		if err != nil {
			return nil, err
		}
		out["receipt_"+kind+".js"] = script
		final := mo.withExecutable(digest(script), digest(css), digest(dark), digest(own))
		out["manifest-"+kind+".json"] = append([]byte(indented(final)), '\n')
		manifests = append(manifests, member{kind, final})
	}
	ts, err := typescript(out["receipt_"+Kinds[0]+".js"], manifests)
	if err != nil {
		return nil, err
	}
	out[TSModule] = ts
	// Byte-identical copies of the kit stylesheet and its dark overrides, so
	// the package can embed them (go:embed cannot reach outside the Go
	// module) and return them beside the scripts that inline them.
	out[StyleCopies[0]] = css
	out[StyleCopies[1]] = dark
	return out, nil
}

// StyleCopies are the generated copies of the kit stylesheet and its dark
// overrides, in that order, relative to Dir.
var StyleCopies = []string{"kit.css", "kit-dark.css"}

// TSModule is where the npm package's copy of the receipt modules is
// written, relative to the receipt package's directory.
const TSModule = "../../ts/src/receipt-core.generated.ts"

const scriptEnd = "})(typeof globalThis !== \"undefined\" ? globalThis : this);\n"

// typescript is the npm package's copy: the first module's script run
// against a private root (so it registers nothing on the page it is bundled
// into), its CapsuleViewerReceipt API, and the manifests as the Go
// package ships them. One script serves every kind: its createModule draws
// any of them, and the manifests are given beside it.
func typescript(script []byte, manifests object) ([]byte, error) {
	body := string(script)
	if !strings.HasSuffix(body, scriptEnd) {
		return nil, errors.New("receipt script does not end with its globalThis call")
	}
	var b strings.Builder
	b.WriteString("// @ts-nocheck\n")
	b.WriteString("// GENERATED by `go generate` in go/receipt (go/receipt/internal/writer) from\n")
	b.WriteString("// go/receipt/receipt_unilateral.js and the manifests. Do not edit by hand.\n")
	b.WriteString("const root = {};\n")
	b.WriteString(strings.TrimSuffix(body, scriptEnd))
	b.WriteString("})(root);\n\n")
	b.WriteString("/** The receipt script's API (CapsuleViewerReceipt), from a private root. */\n")
	b.WriteString("export const RECEIPT_CORE = root.CapsuleViewerReceipt;\n\n")
	b.WriteString("/** The receipt modules' manifests, by kind, as go/receipt ships them. */\n")
	b.WriteString("export const RECEIPT_MANIFESTS = ")
	b.WriteString(indented(manifests))
	b.WriteString(";\n")
	return []byte(b.String()), nil
}

// Fill replaces the value of each "@generated" line of core with values[name],
// and fails unless core carries exactly those lines.
func Fill(core []byte, values map[string]string) ([]byte, error) {
	var names []string
	var bad error
	filled := generated.ReplaceAllFunc(core, func(line []byte) []byte {
		m := generated.FindSubmatch(line)
		name := string(m[2])
		if name != string(m[3]) {
			bad = fmt.Errorf("receipt_core.js: the @generated line for %s names %s", name, m[3])
			return line
		}
		names = append(names, name)
		v, ok := values[name]
		if !ok {
			return line
		}
		return []byte(string(m[1]) + v + "; // @generated " + name)
	})
	if bad != nil {
		return nil, bad
	}
	want := make([]string, 0, len(values))
	for k := range values {
		want = append(want, k)
	}
	sort.Strings(names)
	sort.Strings(want)
	if strings.Join(names, ",") != strings.Join(want, ",") {
		return nil, errors.New("receipt_core.js does not carry exactly the generated lines this fills")
	}
	return filled, nil
}

// object is a JSON object that keeps its members in order.
type object []member

type member struct {
	key   string
	value interface{}
}

func (o object) get(key string) (interface{}, bool) {
	for _, m := range o {
		if m.key == key {
			return m.value, true
		}
	}
	return nil, false
}

// withExecutable is the manifest with its executable block replaced (or
// added last), pinning the script and its stylesheets, in insertion order.
func (o object) withExecutable(script string, styles ...string) object {
	pins := make([]interface{}, len(styles))
	for i, style := range styles {
		pins[i] = style
	}
	exec := object{{"carrier", "module-slot"}, {"script_sha256", script}, {"style_sha256", pins}}
	out := make(object, 0, len(o)+1)
	found := false
	for _, m := range o {
		if m.key == "executable" {
			out = append(out, member{"executable", exec})
			found = true
			continue
		}
		out = append(out, m)
	}
	if !found {
		out = append(out, member{"executable", exec})
	}
	return out
}

// decode reads one JSON value, keeping object member order and number text.
func decode(b []byte) (interface{}, error) {
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	v, err := value(d)
	if err != nil {
		return nil, err
	}
	if _, err := d.Token(); err != io.EOF {
		return nil, errors.New("trailing data after the JSON value")
	}
	return v, nil
}

func value(d *json.Decoder) (interface{}, error) {
	t, err := d.Token()
	if err != nil {
		return nil, err
	}
	switch t := t.(type) {
	case json.Delim:
		switch t {
		case '{':
			o := object{}
			for d.More() {
				k, err := d.Token()
				if err != nil {
					return nil, err
				}
				key, ok := k.(string)
				if !ok {
					return nil, errors.New("an object key is not a string")
				}
				v, err := value(d)
				if err != nil {
					return nil, err
				}
				o = append(o, member{key, v})
			}
			_, err := d.Token()
			return o, err
		case '[':
			a := []interface{}{}
			for d.More() {
				v, err := value(d)
				if err != nil {
					return nil, err
				}
				a = append(a, v)
			}
			_, err := d.Token()
			return a, err
		}
		return nil, fmt.Errorf("unexpected %v", t)
	default:
		return t, nil
	}
}

// inline is json.dumps(v, ensure_ascii=False, separators=(", ", ": ")).
func inline(v interface{}) string {
	var b strings.Builder
	write(&b, v, "", false)
	return b.String()
}

// indented is json.dumps(v, indent=2, ensure_ascii=False).
func indented(v interface{}) string {
	var b strings.Builder
	write(&b, v, "", true)
	return b.String()
}

func write(b *strings.Builder, v interface{}, pad string, indent bool) {
	switch v := v.(type) {
	case object:
		if len(v) == 0 {
			b.WriteString("{}")
			return
		}
		b.WriteByte('{')
		inner := pad + "  "
		for i, m := range v {
			sep(b, i, inner, indent)
			quote(b, m.key)
			b.WriteString(": ")
			write(b, m.value, inner, indent)
		}
		end(b, pad, indent)
		b.WriteByte('}')
	case []interface{}:
		if len(v) == 0 {
			b.WriteString("[]")
			return
		}
		b.WriteByte('[')
		inner := pad + "  "
		for i, e := range v {
			sep(b, i, inner, indent)
			write(b, e, inner, indent)
		}
		end(b, pad, indent)
		b.WriteByte(']')
	case string:
		quote(b, v)
	case json.Number:
		b.WriteString(v.String())
	case bool:
		if v {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case nil:
		b.WriteString("null")
	default:
		panic(fmt.Sprintf("writer: unexpected JSON value %T", v))
	}
}

func sep(b *strings.Builder, i int, inner string, indent bool) {
	switch {
	case indent:
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteByte('\n')
		b.WriteString(inner)
	case i > 0:
		b.WriteString(", ")
	}
}

func end(b *strings.Builder, pad string, indent bool) {
	if indent {
		b.WriteByte('\n')
		b.WriteString(pad)
	}
}

// quote writes s as Python's json.dumps(ensure_ascii=False) does.
func quote(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if r < 0x20 {
				fmt.Fprintf(b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
}
