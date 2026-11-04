// SPDX-License-Identifier: Apache-2.0

// Package historyview is the Go twin of the History view
// (docs/design/history-view.md, capsule-viewer#253): one History page for
// Muse's private History, the mesh-llm console's saved page and the Goose
// History card. Render writes the same bytes as the TypeScript
// historyViewHtml(input, overlay) for the same input, held to the shared
// vectors in vectors/history-view/.
//
// The view draws; it never fetches and never verifies. Its caller passes a
// history-view/v0 object built from what the caller itself checked, and the
// view decides the layout, the words and which slots may fill. Unknown
// members are refused. Caller text is only ever text: it never goes in an
// attribute, and the page is written by its own serializer, not
// html/template.
package historyview

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
)

// View is the contract's name, the value of an input's "view" member.
const View = "history-view/v0"

// CheckIDs are the check ids the view knows (design note section 3). The
// words for each are the pack's check.<id>.
var CheckIDs = []string{
	"readable", "refusal", "artifact_digest", "card_digest",
	"checkpoint_signatures", "checkpoint_chain", "consistency", "anchor",
	"period_counts", "envelope_signature", "key_is_node", "reply_bound",
	"witness", "second_signature", "deal_report",
}

// Refused is the error for an input the view refuses: every reason it found.
type Refused struct{ Reasons []string }

func (e *Refused) Error() string {
	return "history-view refused: " + strings.Join(e.Reasons, "; ")
}

//go:embed wording/history-view.en.json
var wordingJSON []byte

// base is the view's wording pack, neutral words only.
var base = func() map[string]string {
	var pack struct {
		Entries map[string]string `json:"entries"`
	}
	if err := json.Unmarshal(wordingJSON, &pack); err != nil {
		panic("historyview: wording pack: " + err.Error())
	}
	return pack.Entries
}()

// slotChecks are the checks whose failure is drawn in its chip or row slot,
// never as the page's verdict.
var slotChecks = map[string]bool{"witness": true, "second_signature": true}

// --- the element tree ------------------------------------------------------

type element struct {
	tag      string
	attrs    [][2]string
	children []any // *element or string
}

var tokenRE = regexp.MustCompile(`^[a-z0-9 _.-]*$`)

func attrs(pairs ...string) [][2]string {
	var out [][2]string
	for i := 0; i < len(pairs); i += 2 {
		out = append(out, [2]string{pairs[i], pairs[i+1]})
	}
	return out
}

func el(tag string, a [][2]string, children ...any) *element {
	for _, p := range a {
		if !tokenRE.MatchString(p[0]) || !tokenRE.MatchString(p[1]) {
			panic(internal(fmt.Sprintf("attribute %s=%s is not a view token", p[0], p[1])))
		}
	}
	e := &element{tag: tag, attrs: a}
	for _, c := range children {
		if c == nil {
			continue
		}
		if ce, ok := c.(*element); ok && ce == nil {
			continue
		}
		e.children = append(e.children, c)
	}
	return e
}

var textEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", " ", "&nbsp;")

// serialize writes the tree by the HTML fragment serialization rules: in
// text, escape &, <, > and U+00A0. Attributes hold only the view's own tokens.
func serialize(b *strings.Builder, n any) {
	if s, ok := n.(string); ok {
		b.WriteString(textEscaper.Replace(s))
		return
	}
	e := n.(*element)
	b.WriteByte('<')
	b.WriteString(e.tag)
	for _, p := range e.attrs {
		b.WriteString(" " + p[0] + `="` + p[1] + `"`)
	}
	b.WriteByte('>')
	for _, c := range e.children {
		serialize(b, c)
	}
	b.WriteString("</" + e.tag + ">")
}

type internal string

// --- the read input ---------------------------------------------------------

type slot struct {
	state   string
	by      *string
	at      *instant
	through *[2]int64
}

type row struct {
	kind      string
	cut       *instant
	logSize   int64
	anchor    string
	signature string
	asked     string
	outcome   string
	money     *string
	opened    *instant
	last      *instant
	record    string
	witness   slot
	second    slot
}

type check struct{ id, status string }

type cell struct {
	what  string
	value *string
}

type period struct {
	from, to *instant
	cells    []cell
}

type sharing struct {
	standardHistory       *bool
	historySegments       *string
	recordAtCompletion    *string
	adjudications         *string
	exchangeCorroboration *bool
	twins                 *bool
	witnesses             *[]string
	// Stated only by a Goose node's policy; nil draws no line.
	shareDealHalf *string
	strangerSafe  *[]string
}

var placeholderRE = regexp.MustCompile(`\{([a-z_]+)\}`)

func placeholders(text string) []string {
	out := []string{}
	for _, m := range placeholderRE.FindAllStringSubmatch(text, -1) {
		out = append(out, m[1])
	}
	sort.Strings(out)
	return out
}

func readOverlay(r *reader, v any) map[string]string {
	out := map[string]string{}
	o := r.object(v, "overlay", []string{"id", "entries"}, []string{"id", "entries"})
	if o == nil {
		return out
	}
	r.str(o.get("id"), "overlay.id", 200)
	allowed := make([]string, 0, len(base))
	for k := range base {
		allowed = append(allowed, k)
	}
	e := r.object(o.get("entries"), "overlay.entries", allowed, nil)
	if e == nil {
		return out
	}
	for _, k := range e.keys {
		b, known := base[k]
		s, ok := r.str(e.get(k), "overlay.entries."+k, 2000)
		if !known || !ok {
			continue
		}
		if strings.Join(placeholders(b), ",") != strings.Join(placeholders(s), ",") {
			want, _ := json.Marshal(placeholders(b))
			r.refuse("overlay.entries."+k, "must use the placeholders "+string(want))
		} else {
			out[k] = s
		}
	}
	return out
}

func readSlot(r *reader, v any, path string, needBy bool) slot {
	o := r.object(v, path, []string{"state", "by", "at", "through"}, []string{"state"})
	s := slot{state: "not_checked"}
	if o != nil {
		if st, ok := r.oneOf(o.get("state"), path+".state", []string{"passed", "failed", "none", "not_checked"}); ok {
			s.state = st
		}
		if o.has("by") {
			if by, ok := r.str(o.get("by"), path+".by", 200); ok {
				s.by = &by
			}
		}
		if o.has("at") {
			s.at = r.time(o.get("at"), path+".at")
		}
		if o.has("through") {
			t := r.object(o.get("through"), path+".through", []string{"k", "n"}, []string{"k", "n"})
			if t != nil {
				k, kok := r.count(t.get("k"), path+".through.k")
				n, nok := r.count(t.get("n"), path+".through.n")
				if kok && nok {
					if k > n || n == 0 {
						r.refuse(path+".through", "k must be at most n, and n more than 0")
					} else {
						s.through = &[2]int64{k, n}
					}
				}
			}
		}
	}
	if s.state == "passed" {
		if o == nil || !o.has("at") {
			r.refuse(path, "a passed slot needs at")
		}
		if needBy && !(o != nil && o.has("by")) {
			r.refuse(path, "a passed second-signature slot needs by")
		}
	}
	return s
}

var epoch = &instant{}

func readRow(r *reader, v any, path, kind string) *row {
	if kind == "checkpoint" {
		keys := []string{"kind", "cut_at", "log_size", "anchor", "signature", "witness", "second_signature"}
		o := r.object(v, path, keys, keys)
		if o == nil {
			return nil
		}
		if o.get("kind") != "checkpoint" {
			r.refuse(path+".kind", "must be the page's kind, checkpoint")
		}
		x := &row{kind: kind, signature: "not_run"}
		if x.cut = r.time(o.get("cut_at"), path+".cut_at"); x.cut == nil {
			x.cut = epoch
		}
		x.logSize, _ = r.count(o.get("log_size"), path+".log_size")
		x.anchor, _ = r.str(o.get("anchor"), path+".anchor", 200)
		if sg, ok := r.oneOf(o.get("signature"), path+".signature", []string{"pass", "fail", "not_run"}); ok {
			x.signature = sg
		}
		x.witness = readSlot(r, o.get("witness"), path+".witness", false)
		x.second = readSlot(r, o.get("second_signature"), path+".second_signature", true)
		return x
	}
	all := []string{"kind", "asked", "outcome", "money", "opened_at", "last_at", "record", "witness", "second_signature"}
	req := []string{"kind", "asked", "outcome", "opened_at", "last_at", "record", "witness", "second_signature"}
	o := r.object(v, path, all, req)
	if o == nil {
		return nil
	}
	if o.get("kind") != "deal" {
		r.refuse(path+".kind", "must be the page's kind, deal")
	}
	x := &row{kind: kind}
	x.asked, _ = r.str(o.get("asked"), path+".asked", 2000)
	x.outcome, _ = r.str(o.get("outcome"), path+".outcome", 200)
	if o.has("money") {
		if m, ok := r.str(o.get("money"), path+".money", 200); ok {
			x.money = &m
		}
	}
	if x.opened = r.time(o.get("opened_at"), path+".opened_at"); x.opened == nil {
		x.opened = epoch
	}
	if x.last = r.time(o.get("last_at"), path+".last_at"); x.last == nil {
		x.last = epoch
	}
	x.record, _ = r.str(o.get("record"), path+".record", 200)
	x.witness = readSlot(r, o.get("witness"), path+".witness", false)
	x.second = readSlot(r, o.get("second_signature"), path+".second_signature", true)
	return x
}

var topKeys = []string{
	"view", "kind", "surface", "reader", "holder", "audience", "built_at",
	"checked", "outcome", "picked", "rows", "checks", "periods", "sharing",
	"signer_directory", "period",
}

// --- the page ---------------------------------------------------------------

// Render draws the History view for input as an HTML fragment, the same
// bytes as the TypeScript historyViewHtml(input, overlay). input is a
// history-view/v0 object: JSON text as json.RawMessage or []byte, or any
// value encoding/json can encode. overlay is a product caller's words
// (surface "product" only), in the same forms, or nil (or empty JSON text)
// for none. A refused
// input returns a *Refused naming every reason, and no page.
func Render(input, overlay any) (html string, err error) {
	defer func() {
		if p := recover(); p != nil {
			if msg, ok := p.(internal); ok {
				html, err = "", fmt.Errorf("historyview: %s", string(msg))
				return
			}
			panic(p)
		}
	}()
	in, derr := toValue(input)
	if derr != nil {
		return "", &Refused{Reasons: []string{"input: is not JSON: " + derr.Error()}}
	}
	var ov any
	hasOverlay := overlay != nil
	switch t := overlay.(type) {
	case json.RawMessage:
		hasOverlay = len(t) > 0
	case []byte:
		hasOverlay = len(t) > 0
	}
	if hasOverlay {
		var oerr error
		if ov, oerr = toValue(overlay); oerr != nil {
			return "", &Refused{Reasons: []string{"overlay: is not JSON: " + oerr.Error()}}
		}
	}
	tree, reasons := build(in, ov, hasOverlay)
	if len(reasons) > 0 {
		return "", &Refused{Reasons: reasons}
	}
	var b strings.Builder
	serialize(&b, tree)
	return b.String(), nil
}

// Document draws a whole static page (no script) holding the History view.
// The title defaults to "History" when empty, as the TypeScript
// historyViewDocument does.
func Document(input, overlay any, title string) (string, error) {
	body, err := Render(input, overlay)
	if err != nil {
		return "", err
	}
	if title == "" {
		title = "History"
	}
	return "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" +
		textEscaper.Replace(title) + "</title><style>" + Styles + "</style></head><body>" + body + "</body></html>\n", nil
}

func short(id string) string {
	u := utf16.Encode([]rune(id))
	if len(u) > 12 {
		return string(utf16.Decode(u[:12]))
	}
	return id
}

func build(input, overlay any, hasOverlay bool) (*element, []string) {
	r := &reader{}
	o := r.object(input, "input", topKeys, []string{"view", "kind", "surface", "reader", "holder", "audience", "built_at", "checked", "rows", "checks"})
	if o == nil {
		return nil, r.reasons
	}
	if o.get("view") != View {
		r.refuse("input.view", "is not "+View)
	}
	kind, ok := r.oneOf(o.get("kind"), "input.kind", []string{"checkpoint", "deal"})
	if !ok {
		kind = "checkpoint"
	}
	surface, ok := r.oneOf(o.get("surface"), "input.surface", []string{"neutral", "product"})
	if !ok {
		surface = "neutral"
	}
	reader_, ok := r.oneOf(o.get("reader"), "input.reader", []string{"owner", "recipient"})
	if !ok {
		reader_ = "recipient"
	}

	words := map[string]string{}
	if hasOverlay {
		if surface != "product" {
			r.refuse("overlay", "a neutral page takes no overlay")
		} else {
			words = readOverlay(r, overlay)
		}
	}

	var node, name, stream *string
	ho := r.object(o.get("holder"), "input.holder", []string{"node", "name", "stream"}, nil)
	opt := func(key string) *string {
		if ho != nil && ho.has(key) {
			if s, ok := r.str(ho.get(key), "input.holder."+key, 200); ok {
				return &s
			}
		}
		return nil
	}
	node, name, stream = opt("node"), opt("name"), opt("stream")
	if kind == "checkpoint" && node == nil && ho != nil {
		r.refuse("input.holder.node", "is missing (a checkpoint page names its node)")
	}

	au := r.object(o.get("audience"), "input.audience", []string{"kind", "for"}, []string{"kind"})
	audienceKind := "anyone"
	if au != nil {
		if k, ok := r.oneOf(au.get("kind"), "input.audience.kind", []string{"private", "shared", "anyone"}); ok {
			audienceKind = k
		}
	}
	audienceFor := ""
	if audienceKind == "shared" && au != nil {
		audienceFor, _ = r.str(au.get("for"), "input.audience.for", 200)
	}
	if audienceKind != "shared" && au != nil && au.has("for") {
		r.refuse("input.audience.for", "is only for a shared audience")
	}

	built := r.time(o.get("built_at"), "input.built_at")
	if built == nil {
		built = epoch
	}
	ck := r.object(o.get("checked"), "input.checked", []string{"where", "by"}, []string{"where", "by"})
	where, checkedBy := "builder", ""
	if ck != nil {
		if w, ok := r.oneOf(ck.get("where"), "input.checked.where", []string{"page", "builder"}); ok {
			where = w
		}
		checkedBy, _ = r.str(ck.get("by"), "input.checked.by", 200)
	}

	outcome := "answered"
	var refusedReason *string
	if o.has("outcome") {
		if kind != "checkpoint" {
			r.refuse("input.outcome", "is only for a checkpoint page")
		}
		if oc := r.object(o.get("outcome"), "input.outcome", []string{"kind", "reason"}, []string{"kind"}); oc != nil {
			if k, ok := r.oneOf(oc.get("kind"), "input.outcome.kind", []string{"answered", "refused", "unreadable"}); ok {
				outcome = k
			}
			if outcome == "refused" {
				if s, ok := r.str(oc.get("reason"), "input.outcome.reason", 200); ok {
					refusedReason = &s
				}
			} else if oc.has("reason") {
				r.refuse("input.outcome.reason", "is only for a refused answer")
			}
		}
	}

	picked := false
	if o.has("picked") {
		b, _ := r.boolean(o.get("picked"), "input.picked")
		picked = b
	}
	if picked && kind != "deal" {
		r.refuse("input.picked", "is only for a deal page")
	}
	nameOr := func() string {
		if name != nil {
			return *name
		}
		return ""
	}
	if kind == "deal" && reader_ == "recipient" && name == nil {
		r.refuse("input.holder.name", "is missing (a deal page shown to someone else names whose it is)")
	} else if picked && name == nil {
		r.refuse("input.holder.name", "is missing (a picked selection names who picked it)")
	}

	var rows []*row
	if list, ok := o.get("rows").([]any); ok {
		if len(list) > 10000 {
			r.refuse("input.rows", "has more than 10000 rows")
		}
		for i, v := range list {
			if x := readRow(r, v, fmt.Sprintf("input.rows[%d]", i), kind); x != nil {
				rows = append(rows, x)
			}
		}
		if outcome != "answered" && len(list) > 0 {
			r.refuse("input.rows", "must be empty unless the node answered")
		}
	} else {
		r.refuse("input.rows", "is not a list")
	}

	var checks []check
	if list, ok := o.get("checks").([]any); ok {
		for i, c := range list {
			path := fmt.Sprintf("input.checks[%d]", i)
			co := r.object(c, path, []string{"id", "status", "values"}, []string{"id", "status"})
			if co == nil {
				continue
			}
			id, idOK := r.oneOf(co.get("id"), path+".id", CheckIDs)
			status, stOK := r.oneOf(co.get("status"), path+".status", []string{"pass", "fail", "not_run"})
			if co.has("values") {
				if vo := r.object(co.get("values"), path+".values", nil, nil); vo != nil && len(vo.keys) > 0 {
					r.refuse(path+".values", "names a placeholder the check's words do not have")
				}
			}
			if idOK {
				for _, x := range checks {
					if x.id == id {
						r.refuse(path+".id", "is listed twice")
						break
					}
				}
			}
			if idOK && stOK {
				checks = append(checks, check{id, status})
			}
		}
	} else {
		r.refuse("input.checks", "is not a list")
	}

	var periods []period
	if o.has("periods") {
		if kind != "checkpoint" {
			r.refuse("input.periods", "is only for a checkpoint page")
		}
		if list, ok := o.get("periods").([]any); ok {
			for i, p := range list {
				path := fmt.Sprintf("input.periods[%d]", i)
				po := r.object(p, path, []string{"from", "to", "cells"}, []string{"from", "to", "cells"})
				if po == nil {
					continue
				}
				from := r.date(po.get("from"), path+".from")
				to := r.date(po.get("to"), path+".to")
				var cells []cell
				if cl, ok := po.get("cells").([]any); ok {
					for j, c := range cl {
						cpath := fmt.Sprintf("%s.cells[%d]", path, j)
						co := r.object(c, cpath, []string{"what", "value", "withheld"}, []string{"what"})
						var what string
						var whatOK bool
						if co != nil {
							what, whatOK = r.str(co.get("what"), cpath+".what", 200)
						}
						withheld := co != nil && co.has("withheld")
						if withheld && co.get("withheld") != true {
							r.refuse(cpath+".withheld", "is not true")
						}
						if co != nil && withheld == co.has("value") {
							r.refuse(cpath, "carries either a value or withheld: true")
						}
						var value *string
						if co != nil && co.has("value") {
							if s, ok := r.str(co.get("value"), cpath+".value", 40); ok {
								value = &s
							}
						}
						if whatOK {
							cells = append(cells, cell{what, value})
						}
					}
				} else {
					r.refuse(path+".cells", "is not a list")
				}
				if from != nil && to != nil {
					periods = append(periods, period{from, to, cells})
				}
			}
		} else {
			r.refuse("input.periods", "is not a list")
		}
	}

	var share *sharing
	if kind == "checkpoint" && !o.has("sharing") {
		r.refuse("input.sharing", "is missing (a checkpoint page says what its node shares)")
	}
	if o.has("sharing") {
		if kind != "checkpoint" {
			r.refuse("input.sharing", "is only for a checkpoint page")
		}
		keys := []string{"standard_history", "history_segments", "record_at_completion", "adjudications", "exchange_corroboration", "adjudicate_differing_twins", "witnesses", "share_deal_half", "stranger_safe"}
		if so := r.object(o.get("sharing"), "input.sharing", keys, nil); so != nil {
			var witnesses *[]string
			if so.has("witnesses") {
				ws := []string{}
				if list, ok := so.get("witnesses").([]any); ok {
					for i, w := range list {
						if s, ok := r.str(w, fmt.Sprintf("input.sharing.witnesses[%d]", i), 300); ok {
							ws = append(ws, s)
						}
					}
				} else {
					r.refuse("input.sharing.witnesses", "is not a list")
				}
				witnesses = &ws
			}
			var strangerSafe *[]string
			if so.has("stranger_safe") {
				ss := []string{}
				if list, ok := so.get("stranger_safe").([]any); ok {
					for i, w := range list {
						if t, ok := r.str(w, fmt.Sprintf("input.sharing.stranger_safe[%d]", i), 80); ok {
							ss = append(ss, t)
						}
					}
				} else {
					r.refuse("input.sharing.stranger_safe", "is not a list")
				}
				strangerSafe = &ss
			}
			// Every member is optional: one the node does not state stays
			// absent and is named in the one closing "this node's settings don't say" line.
			sh := &sharing{witnesses: witnesses, strangerSafe: strangerSafe}
			wrong := false
			on := func(k string) *bool {
				if !so.has(k) {
					return nil
				}
				b, ok := r.boolean(so.get(k), "input.sharing."+k)
				if !ok {
					wrong = true
					return nil
				}
				return &b
			}
			one := func(k string, values []string) *string {
				if !so.has(k) {
					return nil
				}
				v, ok := r.oneOf(so.get(k), "input.sharing."+k, values)
				if !ok {
					wrong = true
					return nil
				}
				return &v
			}
			sh.standardHistory = on("standard_history")
			sh.historySegments = one("history_segments", []string{"off", "counterparties", "peers"})
			sh.recordAtCompletion = one("record_at_completion", []string{"counterparty", "off"})
			sh.adjudications = one("adjudications", []string{"deliver_to_subjects", "off"})
			sh.exchangeCorroboration = on("exchange_corroboration")
			sh.twins = on("adjudicate_differing_twins")
			sh.shareDealHalf = one("share_deal_half", []string{"counterparty"})
			if !wrong {
				share = sh
			}
		}
	}

	var directory *string
	if o.has("signer_directory") {
		if kind != "deal" {
			r.refuse("input.signer_directory", "is only for a deal page")
		}
		if s, ok := r.str(o.get("signer_directory"), "input.signer_directory", 300); ok {
			directory = &s
			if !strings.HasPrefix(s, "https://") {
				r.refuse("input.signer_directory", "is not an https:// address")
			}
		}
	}

	var per *[2]*instant
	if o.has("period") {
		if po := r.object(o.get("period"), "input.period", []string{"from", "to"}, []string{"from", "to"}); po != nil {
			from := r.date(po.get("from"), "input.period.from")
			to := r.date(po.get("to"), "input.period.to")
			if from != nil && to != nil {
				per = &[2]*instant{from, to}
			}
		}
	}

	if len(r.reasons) > 0 {
		return nil, r.reasons
	}

	say := func(key string, values ...string) string {
		text, ok := words[key]
		if !ok {
			text, ok = base[key]
		}
		if !ok {
			panic(internal("no words for " + key))
		}
		return placeholderRE.ReplaceAllStringFunc(text, func(m string) string {
			p := m[1 : len(m)-1]
			for i := 0; i+1 < len(values); i += 2 {
				if values[i] == p {
					return values[i+1]
				}
			}
			panic(internal(key + " needs {" + p + "}"))
		})
	}
	num := func(n int64) string { return strconv.FormatInt(n, 10) }
	plural := func(key string, n int64, values ...string) string {
		suffix := "other"
		if n == 1 {
			suffix = "one"
		}
		return say(key+"."+suffix, append([]string{"n", num(n)}, values...)...)
	}

	// One verdict for the page (design note section 4).
	failedCheck := false
	for _, c := range checks {
		if c.status == "fail" && !slotChecks[c.id] {
			failedCheck = true
		}
	}
	failedRow := false
	for _, x := range rows {
		if x.kind == "checkpoint" && x.signature == "fail" {
			failedRow = true
		}
	}
	failed := failedCheck || failedRow
	statusOf := func(id string) string {
		for _, c := range checks {
			if c.id == id {
				return c.status
			}
		}
		return ""
	}
	allPass := len(rows) > 0
	for _, x := range rows {
		if x.kind == "checkpoint" && x.signature != "pass" {
			allPass = false
		}
	}
	for _, c := range checks {
		if !slotChecks[c.id] && c.status != "not_run" && c.status != "pass" {
			allPass = false
		}
	}
	allPass = allPass && (kind == "deal" || statusOf("checkpoint_signatures") == "pass")
	everySignature := allPass && statusOf("envelope_signature") == "pass" && statusOf("key_is_node") == "pass"
	verdictKey, chipKey := "verdict.pass", "chip.signatures.pass"
	if everySignature {
		verdictKey, chipKey = "verdict.pass.all", "chip.signatures.pass.all"
	}
	dealRecorded := statusOf("deal_report") == "pass"
	witnessFailed := statusOf("witness") == "fail"
	secondFailed := statusOf("second_signature") == "fail"
	lockChecked := dealRecorded
	if kind == "checkpoint" {
		lockChecked = statusOf("checkpoint_signatures") == "pass" && statusOf("checkpoint_chain") == "pass" && statusOf("consistency") == "pass"
	}

	// Header.
	var title string
	switch {
	case kind == "checkpoint" && stream != nil:
		title = say("header.title.stream", "node", short(deref(node)), "stream", *stream)
	case kind == "checkpoint":
		title = say("header.title.node", "node", short(deref(node)))
	case reader_ == "owner":
		title = say("header.title.owner")
	case audienceKind == "shared":
		title = say("header.title.shared", "name", nameOr())
	default:
		title = say("header.title.person", "name", nameOr())
	}
	var badge string
	switch audienceKind {
	case "private":
		badge = say("badge.private")
	case "shared":
		badge = say("badge.shared", "who", audienceFor)
	default:
		badge = say("badge.anyone")
	}
	builtKey := "built.recipient"
	if reader_ == "owner" {
		builtKey = "built.owner"
	}
	var nodeProof, scope *element
	if node != nil {
		nodeProof = el("details", attrs("class", "cvh-proof"),
			el("summary", nil, say("proof.node", "id", short(*node))),
			el("code", nil, *node))
	}
	if per != nil {
		scope = el("p", attrs("class", "cvh-scope"), say("scope.period", "from", dateOf(per[0]), "to", dateOf(per[1])))
	}
	header := el("header", attrs("class", "cvh-header", "data-history", "header"),
		el("h1", attrs("class", "cvh-title"), title),
		nodeProof,
		scope,
		el("p", attrs("class", "cvh-badge", "data-audience", audienceKind), badge),
		el("p", attrs("class", "cvh-built"), say(builtKey, "at", minuteOf(built))),
	)

	// Hero.
	var heroLines []string
	drawRows := false
	switch {
	case outcome == "refused":
		heroLines = append(heroLines, say("hero.refused"))
		if refusedReason != nil {
			heroLines = append(heroLines, say("hero.refused.reason", "reason", *refusedReason))
		}
	case outcome == "unreadable":
		heroLines = append(heroLines, say("hero.unreadable"))
	case failed:
		heroLines = append(heroLines, say("hero.failed"))
	case len(rows) == 0:
		if kind == "checkpoint" {
			heroLines = append(heroLines, say("hero.none.checkpoints"))
		} else {
			heroLines = append(heroLines, say("hero.none.deals"))
		}
	default:
		drawRows = true
		if kind == "checkpoint" {
			last, entries := rows[0], int64(0)
			for _, c := range rows {
				if c.cut.ms > last.cut.ms {
					last = c
				}
				if c.logSize > entries {
					entries = c.logSize
				}
			}
			verdict := "verdict.unchecked"
			if allPass {
				verdict = verdictKey
			}
			heroLines = append(heroLines, plural("hero.checkpoints", int64(len(rows)),
				"entries", plural("hero.entries", entries),
				"at", shortMinuteOf(last.cut),
				"verdict", say(verdict)))
		} else if picked {
			heroLines = append(heroLines, plural("hero.deals.picked", int64(len(rows)), "name", nameOr()))
		} else {
			heroLines = append(heroLines, plural("hero.deals", int64(len(rows))))
		}
	}
	var heroKids []any
	for i, line := range heroLines {
		class := "cvh-hero-note"
		if i == 0 {
			class = "cvh-hero-line"
		}
		heroKids = append(heroKids, el("p", attrs("class", class), line))
	}
	hero := el("section", attrs("class", "cvh-hero", "data-history", "hero"), heroKids...)

	// Chips.
	var chips *element
	if drawRows {
		stamped, anyUnchecked := 0, false
		for _, x := range rows {
			if x.witness.state == "passed" {
				stamped++
			}
			if x.witness.state == "not_checked" {
				anyUnchecked = true
			}
		}
		var stampChip string
		switch {
		case witnessFailed:
			stampChip = say("chip.timestamped.failed")
		case stamped == 0 && anyUnchecked:
			stampChip = say("chip.timestamped.unchecked")
		case stamped == 0:
			stampChip = say("chip.timestamped.none")
		case stamped == len(rows):
			stampChip = say("chip.timestamped.all", "n", strconv.Itoa(len(rows)))
		default:
			stampChip = say("chip.timestamped.some", "k", strconv.Itoa(stamped), "n", strconv.Itoa(len(rows)))
		}
		var items []string
		if kind == "checkpoint" {
			sig := "chip.signatures.unchecked"
			if allPass {
				sig = chipKey
			}
			first := rows[0]
			for _, c := range rows {
				if c.cut.ms < first.cut.ms {
					first = c
				}
			}
			items = append(items, say(sig), stampChip, say("chip.started", "date", dateOf(first.cut)))
		} else {
			if dealRecorded {
				items = append(items, say("chip.recorded"))
			}
			items = append(items, stampChip)
		}
		var lis []any
		for _, t := range items {
			lis = append(lis, el("li", attrs("class", "cvh-chip"), t))
		}
		chips = el("ul", attrs("class", "cvh-chips", "data-history", "chips"), lis...)
	}

	// Rows.
	slotLine := func(s slot, second bool) string {
		switch s.state {
		case "passed":
			at := ""
			if s.at != nil {
				at = minuteOf(s.at)
			}
			var line string
			switch {
			case second:
				line = say("slot.second.by", "by", deref(s.by), "at", at)
			case s.by != nil:
				line = say("slot.timestamped.by", "at", at, "by", *s.by)
			default:
				line = say("slot.timestamped.at", "at", at)
			}
			if s.through != nil && s.through[0] < s.through[1] {
				line += " · " + say("slot.part", "k", num(s.through[0]), "n", num(s.through[1]))
			}
			return line
		case "failed":
			return say("slot.failed")
		case "none":
			if second {
				return say("slot.second.none")
			}
			return say("slot.timestamped.none")
		}
		return say("slot.unchecked")
	}
	stamp := func(nameKey string, filled bool, state string, line *string) *element {
		f := "no"
		if filled {
			f = "yes"
		}
		var lineEl *element
		if line != nil {
			lineEl = el("span", attrs("class", "cvh-stamp-line"), *line)
		}
		return el("li", attrs("class", "cvh-stamp", "data-filled", f, "data-state", state),
			el("span", attrs("class", "cvh-stamp-name"), say(nameKey)), lineEl)
	}
	str := func(s string) *string { return &s }
	slotStamps := func(x *row) []any {
		return []any{
			stamp("stamp.timestamped", x.witness.state == "passed", x.witness.state, str(slotLine(x.witness, false))),
			stamp("stamp.second", x.second.state == "passed", x.second.state, str(slotLine(x.second, true))),
		}
	}
	proof := func(key, id string) *element {
		return el("details", attrs("class", "cvh-proof"),
			el("summary", nil, say(key, "id", short(id))), el("code", nil, id))
	}

	var rowList *element
	if drawRows {
		var items []any
		for _, x := range rows {
			if x.kind == "checkpoint" {
				var recLine *string
				if x.signature != "pass" {
					recLine = str(say("stamp.signature.unchecked"))
				}
				stamps := append([]any{stamp("stamp.recorded", x.signature == "pass", x.signature, recLine)}, slotStamps(x)...)
				items = append(items, el("li", attrs("class", "cvh-row", "data-history", "row"),
					el("p", attrs("class", "cvh-row-title"), say("row.cut", "at", minuteOf(x.cut))),
					el("p", attrs("class", "cvh-row-detail"), plural("row.entries", x.logSize)),
					proof("proof.checkpoint", x.anchor),
					el("ul", attrs("class", "cvh-stamps"), stamps...)))
				continue
			}
			parts := []string{x.outcome}
			if x.money != nil {
				parts = append(parts, *x.money)
			}
			parts = append(parts, say("row.opened", "at", minuteOf(x.opened)), say("row.last", "at", minuteOf(x.last)))
			var recorded *element
			if dealRecorded {
				recorded = stamp("stamp.recorded", true, "passed", nil)
			} else {
				recorded = stamp("stamp.recorded", false, "not_checked", str(say("slot.unchecked")))
			}
			stamps := append([]any{recorded}, slotStamps(x)...)
			items = append(items, el("li", attrs("class", "cvh-row", "data-history", "row"),
				el("p", attrs("class", "cvh-row-title"), x.asked),
				el("p", attrs("class", "cvh-row-detail"), strings.Join(parts, " · ")),
				proof("proof.record", x.record),
				el("ul", attrs("class", "cvh-stamps"), stamps...)))
		}
		heading := "rows.heading.deals"
		if kind == "checkpoint" {
			heading = "rows.heading.checkpoints"
		}
		rowList = el("section", attrs("class", "cvh-rows-block"),
			el("h2", nil, say(heading)),
			el("ol", attrs("class", "cvh-rows", "data-history", "rows"), items...))
	}

	var periodBlock *element
	if drawRows && len(periods) > 0 {
		var lis []any
		for _, p := range periods {
			var cs []any
			for _, c := range p.cells {
				if c.value == nil {
					cs = append(cs, el("li", nil, say("periods.cell.withheld", "what", c.what)))
				} else {
					cs = append(cs, el("li", nil, say("periods.cell", "what", c.what, "value", *c.value)))
				}
			}
			lis = append(lis, el("li", nil,
				el("p", nil, say("periods.row", "from", dateOf(p.from), "to", dateOf(p.to))),
				el("ul", nil, cs...)))
		}
		periodBlock = el("section", attrs("class", "cvh-periods", "data-history", "periods"),
			el("h2", nil, say("periods.heading")), el("ul", nil, lis...))
	}

	var callout *element
	if outcome == "answered" && !failed {
		var text string
		switch {
		case kind == "checkpoint":
			text = say("callout.checkpoints")
		case picked:
			text = say("callout.deals.picked", "name", nameOr())
		default:
			text = say("callout.deals")
		}
		var timeLine *element
		if kind == "checkpoint" {
			timeLine = el("p", nil, say("callout.checkpoints.time"))
		}
		callout = el("aside", attrs("class", "cvh-callout", "data-history", "does-not-show"),
			el("h2", nil, say("callout.heading")), el("p", nil, text), timeLine)
	}

	var shares *element
	if share != nil {
		// A member the node does not state is named in the one closing
		// "unstated" line, not given a line of its own.
		var unstated []string
		completes := share.recordAtCompletion != nil && *share.recordAtCompletion == "counterparty"
		lines := []string{say("shares.summary")}
		// Stated only by a Goose node's policy; a node that does not state them
		// gets no line. They sit right after the first line, which they extend.
		// A token the pack names is drawn by its plain name, any other as it is.
		if share.shareDealHalf != nil {
			lines = append(lines, say("shares.dealhalf.counterparty"))
		}
		if share.strangerSafe != nil {
			if len(*share.strangerSafe) == 0 {
				lines = append(lines, say("shares.stranger.none"))
			} else {
				names := make([]string, 0, len(*share.strangerSafe))
				for _, t := range *share.strangerSafe {
					key := "shares.stranger.token." + t
					if _, ok := words[key]; ok {
						t = say(key)
					} else if _, ok := base[key]; ok {
						t = say(key)
					}
					names = append(names, t)
				}
				lines = append(lines, say("shares.stranger", "items", strings.Join(names, ", ")))
			}
		}
		switch {
		case share.standardHistory == nil:
			unstated = append(unstated, "standard")
		case *share.standardHistory:
			lines = append(lines, say("shares.standard.on"))
		default:
			lines = append(lines, say("shares.standard.off"))
		}
		switch {
		case share.historySegments == nil:
			unstated = append(unstated, "segments")
		case *share.historySegments == "counterparties":
			lines = append(lines, say("shares.segments.counterparties"))
		case *share.historySegments == "peers":
			lines = append(lines, say("shares.segments.peers"))
		case completes:
			lines = append(lines, say("shares.segments.off")+" "+say("shares.segments.off.sealed"))
		default:
			lines = append(lines, say("shares.segments.off"))
		}
		if share.exchangeCorroboration == nil {
			unstated = append(unstated, "corroboration")
		} else if *share.exchangeCorroboration {
			lines = append(lines, say("shares.corroboration.on"))
		}
		if share.recordAtCompletion == nil {
			unstated = append(unstated, "completion")
		} else {
			if completes {
				lines = append(lines, say("shares.completion.on"))
			} else {
				lines = append(lines, say("shares.completion.off"))
			}
		}
		if share.adjudications == nil {
			unstated = append(unstated, "adjudications")
		} else {
			if *share.adjudications == "deliver_to_subjects" {
				lines = append(lines, say("shares.adjudications.on"))
			} else {
				lines = append(lines, say("shares.adjudications.off"))
			}
		}
		if share.twins == nil {
			unstated = append(unstated, "twins")
		} else if *share.twins {
			lines = append(lines, say("shares.twins.on"))
		}
		switch {
		case share.witnesses == nil:
			unstated = append(unstated, "witnesses")
		case len(*share.witnesses) > 0:
			lines = append(lines, say("shares.witnesses", "witnesses", strings.Join(*share.witnesses, ", ")))
		default:
			lines = append(lines, say("shares.witnesses.none"))
		}
		// The signed-request rule is the mesh plugin's, carried by its policy; a
		// policy that states no segments setting does not vouch for it. A stated
		// stranger_safe allowlist already says what a stranger gets, so the rule
		// is not also listed as unstated beside it (#266).
		if share.historySegments != nil {
			lines = append(lines, say("shares.never"))
		} else if share.strangerSafe == nil {
			unstated = append(unstated, "never")
		}
		if len(unstated) > 0 {
			items := make([]string, 0, len(unstated))
			for _, k := range unstated {
				items = append(items, say("shares.unstated."+k))
			}
			if len(items) == 1 {
				lines = append(lines, say("shares.unstated.one", "item", items[0]))
			} else {
				lines = append(lines, say("shares.unstated", "items", strings.Join(items, "; ")))
			}
		}
		var lis []any
		for _, l := range lines {
			lis = append(lis, el("li", nil, l))
		}
		shares = el("section", attrs("class", "cvh-shares", "data-history", "shares"),
			el("h2", nil, say("shares.heading")),
			el("ul", nil, lis...),
			el("p", attrs("class", "cvh-note"), say("shares.as_of", "at", minuteOf(built))))
	}

	var seal *element
	{
		var states []string
		if drawRows {
			for _, x := range rows {
				states = append(states, x.second.state)
			}
		}
		anyOf := func(s string) bool { return contains(states, s) }
		allNone := true
		for _, s := range states {
			if s != "none" {
				allNone = false
			}
		}
		var sealState string
		switch {
		case secondFailed || anyOf("failed"):
			sealState = "failed"
		case len(states) == 0 || anyOf("not_checked"):
			sealState = "not_checked"
		case allNone:
			sealState = "none"
		default:
			sealState = "mixed"
		}
		// A failed row must not read as if the whole deal failed: when only some
		// of the countersigned rows failed, the slot gives its scope. Rows
		// nobody countersigned are not part of the count.
		failedRows, signedRows := 0, 0
		for _, st := range states {
			if st == "failed" {
				failedRows++
			}
			if st == "failed" || st == "passed" {
				signedRows++
			}
		}
		var sealLine string
		switch sealState {
		case "failed":
			if failedRows > 0 && failedRows < signedRows {
				sealLine = say("seal.second.some_failed", "k", strconv.Itoa(failedRows), "n", strconv.Itoa(signedRows))
			} else {
				sealLine = say("slot.failed")
			}
		case "none":
			sealLine = say("slot.second.none")
		case "not_checked":
			sealLine = say("slot.unchecked")
		default:
			sealLine = say("seal.second.rows")
		}
		var title, lock, dir *element
		if drawRows && lockChecked {
			title = el("p", attrs("class", "cvh-seal-title"), say("seal.title"))
			key := "seal.deals"
			if kind == "checkpoint" {
				key = "seal.checkpoints"
			}
			lock = el("p", nil, say(key))
		}
		if directory != nil {
			dir = el("p", attrs("class", "cvh-note", "data-history", "directory"), say("seal.directory", "directory", *directory))
		}
		seal = el("section", attrs("class", "cvh-seal", "data-history", "seal"),
			title, lock,
			el("p", attrs("class", "cvh-seal-slot", "data-filled", "no", "data-state", sealState),
				el("span", attrs("class", "cvh-stamp-name"), say("seal.second.label")),
				el("span", attrs("class", "cvh-stamp-line"), sealLine)),
			dir)
	}

	checkedAttrs := attrs("class", "cvh-checked", "data-history", "checked")
	if failed || outcome != "answered" {
		checkedAttrs = append(checkedAttrs, [2]string{"open", ""})
	}
	var checkLis []any
	for _, c := range checks {
		checkLis = append(checkLis, el("li", attrs("class", "cvh-check", "data-status", c.status),
			say("check.line", "status", say("status."+c.status), "name", say("check."+c.id))))
	}
	// The "ran" sentence only when a check passed or failed; all not-run says nothing it does not already.
	var whereP *element
	for _, c := range checks {
		if c.status == "pass" || c.status == "fail" {
			whereLine := say("checked.where.builder", "at", minuteOf(built), "by", checkedBy)
			if where == "page" {
				whereLine = say("checked.where.page", "by", checkedBy)
			}
			whereP = el("p", attrs("class", "cvh-note"), whereLine)
			break
		}
	}
	panel := el("details", checkedAttrs,
		el("summary", nil, say("checked.heading")),
		el("ul", nil, checkLis...),
		whereP)

	verdict := "unchecked"
	if failed {
		verdict = "failed"
	} else if allPass {
		verdict = "pass"
	}
	tree := el("section",
		attrs("class", "cv-history", "data-history", "view", "data-kind", kind, "data-surface", surface, "data-verdict", verdict),
		header,
		el("div", attrs("class", "cvh-main"), hero, chips, rowList, periodBlock),
		el("div", attrs("class", "cvh-side"), callout, shares, seal, panel))
	return tree, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
