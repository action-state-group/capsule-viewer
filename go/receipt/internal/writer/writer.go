// SPDX-License-Identifier: Apache-2.0

// Package writer writes the receipt package's generated files: one
// module-slot script per receipt module and the manifest that pins it. Each
// script is receipt_core.js with its "@generated" lines filled: the module
// it registers, its manifest (with script_sha256 all zeros, as a script
// cannot carry its own digest), the words of the example English wording
// pack (compiled in: the script reads no pack), the pack's id and sha256, the
// kit stylesheet (src/capsule_viewer/static/kit.css, the one copy, which the
// manifest pins by style_sha256) and the seller kind.
//
// It writes the same bytes the Python writer (capsule_viewer.receipt_slot)
// wrote for capsule-viewer 0.25.0, so the JSON it fills in is serialised the
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
// three x-deal-v0 modules and the x-deal-v1 deal module.
var Kinds = []string{"unilateral", "seller", "bilateral", "deal"}

// SellerKind is the seller copy's bundle extension kind.
const SellerKind = "x-deal-seller/v0"

const zero = "0000000000000000000000000000000000000000000000000000000000000000"

// generated matches one "@generated" line of receipt_core.js; the two names
// must agree (RE2 has no backreference, so Fill checks it).
var generated = regexp.MustCompile(`(?m)^(  var (\w+) = ).*; // @generated (\w+)$`)

// Sources are the inputs: the package directory (receipt_core.js, the
// hand-edited manifest-<kind>.json and wording-en.json) and the kit
// stylesheet.
type Sources struct {
	Dir    string
	KitCSS string
}

// DefaultSources are the inputs of a capsule-viewer checkout, from the
// receipt package's directory.
func DefaultSources(dir string) Sources {
	return Sources{Dir: dir, KitCSS: filepath.Join(dir, "..", "..", "src", "capsule_viewer", "static", "kit.css")}
}

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
	out := make(map[string][]byte, 2*len(Kinds))
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
			"KIND":        inline(kind),
			"MANIFEST":    inline(mo.withExecutable(zero, digest(css))),
			"WORDS":       inline(entries),
			"PACK":        inline(object{{"id", id}, {"sha256", digest(pack)}}),
			"KIT_CSS":     inline(string(css)),
			"SELLER_KIND": inline(SellerKind),
		}
		script, err := Fill(core, values)
		if err != nil {
			return nil, err
		}
		out["receipt_"+kind+".js"] = script
		out["manifest-"+kind+".json"] = append([]byte(indented(mo.withExecutable(digest(script), digest(css)))), '\n')
	}
	return out, nil
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
// added last), pinning the script and the kit stylesheet.
func (o object) withExecutable(script, style string) object {
	exec := object{{"carrier", "module-slot"}, {"script_sha256", script}, {"style_sha256", []interface{}{style}}}
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
