// SPDX-License-Identifier: Apache-2.0

package historyview

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
)

// --- the card page (#384) ---------------------------------------------------
//
// The twin of the TypeScript "the card page (#384)" section. A deal page that
// carries its signed object (`machine`) is drawn from that object: the counts
// from its card, and on the holder's own copy one row per deal entry its
// x-standard-history/v0 block lists. The caller adds only what a deal entry
// does not carry and the holder's own book does (`deals`, keyed by the
// entry's id), and capsulectl verify's answer, which is bound to the object by
// its bundle digest: the SHA-256 of the object's text.

// rowStatuses are the term-row statuses of AAC SH §11.2 (TS ROW_STATUSES).
var rowStatuses = []string{
	"not_reached", "not_due", "no_statement", "waiting", "uncontested",
	"agreed_so_far", "agreed", "in_disagreement", "in_dispute", "ruled",
}

type termResult struct {
	holder bool
	status string
	value  string // "met", "not_met" or "" when absent
	remedy *string
}

type amount struct {
	value, code string
	scale       int64
}

type cardDeal struct {
	id         string
	agreed     *instant
	role       string
	amount     *amount
	outcome    string // "held", "did_not_hold", "undecided" or ""
	terms      []termResult
	hasTerms   bool
	bothHalves bool
}

type dealExtra struct {
	item                             *string
	amount                           *amount
	recorded, witness, countersigned *slot
	receipt                          *string
}

// proofChecks are capsulectl verify's checks the proof panel shows, in the
// receipt's order (TS PROOF_CHECKS).
var proofChecks = []string{
	"producer_signatures", "interval_coverage", "graph_closure",
	"per_record_membership", "checkpoint",
}

var (
	fileJSONRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.json$`)
	fileHTMLRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.html$`)
	hex64RE    = regexp.MustCompile(`^[0-9a-f]{64}$`)
	// An amount as the standard card reads one (standard_history_card.js
	// VALUE, CURRENCY): an exact integer string, an ISO 4217 code or a CAIP-19
	// asset id, a scale 0 to 255.
	digitsRE = regexp.MustCompile(`^(0|[1-9][0-9]{0,299})$`)
	codeRE   = regexp.MustCompile(`^(?:[A-Z]{3}|[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128})$`)
	derivRE  = regexp.MustCompile(`^standard_history/[1-4]$`)
)

// countOf is TS count: a safe whole number of 0 or more, without a refusal.
func countOf(v any) (int64, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	f, err := strconv.ParseFloat(string(n), 64)
	if err != nil || math.IsInf(f, 0) || f != math.Floor(f) || f < 0 || f > 9007199254740991 {
		return 0, false
	}
	return int64(f), true
}

func sha256Hex(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

func readAmount(r *reader, v any, path string) *amount {
	keys := []string{"value", "assetCode", "assetScale"}
	o := r.object(v, path, keys, keys)
	if o == nil {
		return nil
	}
	value, _ := o.get("value").(string)
	code, _ := o.get("assetCode").(string)
	scale, scaleOK := countOf(o.get("assetScale"))
	if !digitsRE.MatchString(value) || !codeRE.MatchString(code) || !scaleOK || scale > 255 {
		r.refuse(path, "is not an amount (an integer value, an ISO 4217 or CAIP-19 assetCode, assetScale 0 to 255)")
		return nil
	}
	return &amount{value: value, code: code, scale: scale}
}

// grouped is "1,000" for "1000": thousands with commas (digits only).
func grouped(digits string) string {
	var b strings.Builder
	for i, c := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	return b.String()
}

// amountText is an amount in words: bitcoin amounts as sat, or msat when not
// a whole sat; any other asset as its decimal value and code (TS amountText).
func amountText(a *amount) string {
	if a.code == "BTC" && a.scale <= 11 {
		msat := "0"
		if a.value != "0" {
			msat = a.value + strings.Repeat("0", int(11-a.scale))
		}
		if msat == "0" {
			return "0 sat"
		}
		if len(msat) > 3 && strings.HasSuffix(msat, "000") {
			return grouped(msat[:len(msat)-3]) + " sat"
		}
		return grouped(msat) + " msat"
	}
	if a.scale == 0 {
		return grouped(a.value) + " " + a.code
	}
	padded := a.value
	if n := int(a.scale) + 1; len(padded) < n {
		padded = strings.Repeat("0", n-len(padded)) + padded
	}
	cut := len(padded) - int(a.scale)
	return grouped(padded[:cut]) + "." + padded[cut:] + " " + a.code
}

// cardObject is what the card page reads from the signed object.
type cardObject struct {
	derivation, keyID               string
	signedAt                        *instant
	of, held, didNotHold, undecided int64
	waiting                         int64
	asOf                            *instant
	deals                           []cardDeal
	hasDeals                        bool
}

func asObj(v any) *object {
	o, _ := v.(*object)
	return o
}

// readCardObject is the twin of TS readCardObject; refusals go to r.
func readCardObject(r *reader, text string) *cardObject {
	doc, err := decodeJSON([]byte(text))
	if err != nil {
		r.refuse("input.machine.text", "is not JSON")
		return nil
	}
	bad := func(why string) *cardObject {
		r.refuse("input.machine.text", why)
		return nil
	}
	d := asObj(doc)
	if d == nil {
		return bad("is not a bundle")
	}
	var root *object
	if recs, ok := d.get("records").([]any); ok && len(recs) > 0 {
		root = asObj(recs[0])
	}
	if root == nil {
		return bad("has no root record")
	}
	var card *object
	if cid, ok := root.get("capsule_id").(string); ok {
		if ds := asObj(d.get("disclosures")); ds != nil {
			if disc := asObj(ds.get(cid)); disc != nil {
				card = asObj(disc.get("agent_input"))
			}
		}
	}
	if card == nil {
		return bad("discloses no card on its root record")
	}
	derivation, ok := card.get("derivation").(string)
	if !ok || !derivRE.MatchString(derivation) {
		return bad("its card is not a standard_history card")
	}
	out := &cardObject{derivation: derivation}
	oc := asObj(card.get("outcomes"))
	if oc != nil {
		for _, k := range oc.keys {
			if !contains([]string{"of", "held", "did_not_hold", "undecided"}, k) {
				return bad("its card's outcomes carry a member SH §4 does not have")
			}
		}
	}
	var ofOK, heldOK, dnhOK, undOK bool
	if oc != nil {
		out.of, ofOK = countOf(oc.get("of"))
		out.held, heldOK = countOf(oc.get("held"))
		out.didNotHold, dnhOK = countOf(oc.get("did_not_hold"))
		out.undecided, undOK = countOf(oc.get("undecided"))
	}
	if !ofOK || !heldOK || !dnhOK || !undOK || out.held+out.didNotHold+out.undecided != out.of {
		return bad("its card's outcomes are not a tally")
	}
	if nc := asObj(card.get("not_counted")); nc != nil {
		out.waiting, _ = countOf(nc.get("no_witness_time"))
	}
	out.keyID, _ = root.get("key_id").(string)
	if ts, ok := root.get("timestamp").(string); ok {
		out.signedAt = parseInstant(ts)
	}
	var ext *object
	if exts := asObj(d.get("extensions")); exts != nil {
		ext = asObj(exts.get("x-standard-history/v0"))
	}
	if ext != nil {
		if ao := asObj(ext.get("as_of")); ao != nil {
			if at, ok := ao.get("anchor_time").(string); ok {
				out.asOf = parseInstant(at)
			}
		}
	}
	if ext != nil && ext.has("deals") {
		out.hasDeals = true
		list, ok := ext.get("deals").([]any)
		if !ok {
			return bad("its deals are not a list")
		}
		for i, dv := range list {
			path := fmt.Sprintf("input.machine.text deals[%d]", i)
			de := asObj(dv)
			if de == nil {
				r.refuse(path, "is not a deal entry")
				continue
			}
			id, _ := de.get("deal").(string)
			var agreed *instant
			if s, ok := de.get("agreed_at").(string); ok {
				agreed = parseInstant(s)
			}
			role, _ := de.get("role").(string)
			if id == "" || utf16Len(id) > 200 || agreed == nil || (role != "provided" && role != "bought") {
				r.refuse(path, "has no deal id, agreed time or role")
				continue
			}
			deal := cardDeal{id: id, agreed: agreed, role: role}
			if de.has("amount") {
				deal.amount = readAmount(r, de.get("amount"), path+".amount")
			}
			if rows, ok := de.get("rows").([]any); ok {
				deal.hasTerms = true
				for _, rv := range rows {
					row := asObj(rv)
					var status string
					var statusOK bool
					valueOK, remedyOK := true, true
					var value string
					var remedy *string
					if row != nil {
						status, statusOK = row.get("status").(string)
						statusOK = statusOK && contains(rowStatuses, status)
						if row.has("value") {
							value, _ = row.get("value").(string)
							valueOK = row.get("value") == "met" || row.get("value") == "not_met"
						}
						if row.has("remedy") {
							s, ok := row.get("remedy").(string)
							remedyOK = ok
							remedy = &s
						}
					}
					if row == nil || (row.get("owed_by") != "holder" && row.get("owed_by") != "counterparty") ||
						!statusOK || !valueOK || !remedyOK {
						r.refuse(path, "has a row that is not an SH §11.2 row result")
						continue
					}
					deal.terms = append(deal.terms, termResult{
						holder: row.get("owed_by") == "holder",
						status: status,
						value:  value,
						remedy: remedy,
					})
				}
			}
			if oc, _ := de.get("outcome").(string); oc == "held" || oc == "did_not_hold" || oc == "undecided" {
				deal.outcome = oc
			}
			deal.bothHalves = de.get("happened") == "stamped_by_both"
			out.deals = append(out.deals, deal)
		}
	}
	return out
}

var cardTop = []string{
	"view", "kind", "surface", "reader", "holder", "audience", "built_at",
	"checked", "rows", "checks", "machine", "deals", "sample",
}

// isoString is JavaScript's Date.prototype.toISOString.
func isoString(t *instant) string {
	u := t.utc()
	year := ""
	switch y := u.Year(); {
	case y >= 0 && y <= 9999:
		year = fmt.Sprintf("%04d", y)
	case y < 0:
		year = fmt.Sprintf("-%06d", -y)
	default:
		year = fmt.Sprintf("+%06d", y)
	}
	return fmt.Sprintf("%s-%02d-%02dT%02d:%02d:%02d.%03dZ", year, u.Month(), u.Day(),
		u.Hour(), u.Minute(), u.Second(), u.Nanosecond()/1e6)
}

// encodeURIComponent is JavaScript's: every UTF-8 byte but the unreserved
// marks percent-encoded with uppercase hex.
func encodeURIComponent(s string) string {
	const hexDigits = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || strings.IndexByte("-_.!~*'()", c) >= 0 {
			b.WriteByte(c)
			continue
		}
		b.WriteByte('%')
		b.WriteByte(hexDigits[c>>4])
		b.WriteByte(hexDigits[c&15])
	}
	return b.String()
}

// utf16Less is JavaScript's string < (UTF-16 code unit order).
func utf16Less(a, b string) bool {
	ua, ub := utf16.Encode([]rune(a)), utf16.Encode([]rune(b))
	for i := 0; i < len(ua) && i < len(ub); i++ {
		if ua[i] != ub[i] {
			return ua[i] < ub[i]
		}
	}
	return len(ua) < len(ub)
}

// shortID is the card page's short: the first 8 and last 4 of a long id.
func shortID(id string) string {
	u := utf16.Encode([]rune(id))
	if len(u) > 16 {
		return string(utf16.Decode(u[:8])) + "…" + string(utf16.Decode(u[len(u)-4:]))
	}
	return id
}

// buildCardPage is the twin of TS buildCardPage: the card page's element
// tree, or every reason it is refused.
func buildCardPage(r *reader, o *object, overlay any, hasOverlay bool) (*element, []string) {
	for _, k := range o.keys {
		if !contains(cardTop, k) {
			r.refuse("input."+k, "is not a member of a card page")
		}
	}
	if o.get("kind") != "deal" {
		r.refuse("input.kind", "a card page is a deal page")
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
	var name string
	nameOK := false
	if ho := r.object(o.get("holder"), "input.holder", []string{"name"}, []string{"name"}); ho != nil {
		name, nameOK = r.str(ho.get("name"), "input.holder.name", 200)
	}
	audience := ""
	if au := r.object(o.get("audience"), "input.audience", []string{"kind"}, []string{"kind"}); au != nil {
		audience, _ = r.oneOf(au.get("kind"), "input.audience.kind", []string{"private", "shared"})
	}
	if reader_ == "owner" && audience != "" && audience != "private" {
		r.refuse("input.audience.kind", "the holder's own page is private")
	}
	if reader_ == "recipient" && audience != "" && audience != "shared" {
		r.refuse("input.audience.kind", "a card someone was sent is shared")
	}
	built := r.time(o.get("built_at"), "input.built_at")
	if built == nil {
		built = epoch
	}
	if ck := r.object(o.get("checked"), "input.checked", []string{"where", "by"}, []string{"where", "by"}); ck != nil {
		r.oneOf(ck.get("where"), "input.checked.where", []string{"builder"})
		r.str(ck.get("by"), "input.checked.by", 200)
	}
	if list, ok := o.get("rows").([]any); !ok || len(list) > 0 {
		r.refuse("input.rows", "must be empty: a card page reads its rows from its object")
	}
	if list, ok := o.get("checks").([]any); !ok || len(list) > 0 {
		r.refuse("input.checks", "must be empty: a card page shows capsulectl verify's checks")
	}
	var sample int64
	if o.has("sample") {
		sample, _ = r.count(o.get("sample"), "input.sample")
	}

	// The object and capsulectl verify's answer on it.
	machineKeys := []string{"file", "text", "verify"}
	mo := r.object(o.get("machine"), "input.machine", machineKeys, machineKeys)
	var file, text, verdict, digest string
	var fileOK, textOK, digestOK bool
	if mo != nil {
		file, fileOK = r.str(mo.get("file"), "input.machine.file", 160)
	}
	if fileOK && !fileJSONRE.MatchString(file) {
		r.refuse("input.machine.file", "is not a plain .json file name")
	}
	if mo != nil {
		text, textOK = r.str(mo.get("text"), "input.machine.text", 16_000_000)
	}
	var vo *object
	if mo != nil {
		vo = r.object(mo.get("verify"), "input.machine.verify",
			[]string{"verdict", "bundle_digest", "checks", "witness"},
			[]string{"verdict", "bundle_digest", "checks"})
	}
	if vo != nil {
		verdict, _ = r.oneOf(vo.get("verdict"), "input.machine.verify.verdict", []string{"VALID", "INVALID"})
		digest, digestOK = r.str(vo.get("bundle_digest"), "input.machine.verify.bundle_digest", 64)
	}
	if digestOK && !hex64RE.MatchString(digest) {
		r.refuse("input.machine.verify.bundle_digest", "is not 64 lowercase hex")
	}
	if textOK && digestOK && sha256Hex(text) != digest {
		r.refuse("input.machine.text",
			"is not the bundle capsulectl verify answered for (its SHA-256 is not the bundle_digest)")
	}
	proof := map[string]string{}
	if vo != nil {
		if cko := r.object(vo.get("checks"), "input.machine.verify.checks", append(append([]string{}, proofChecks...), "witnesses"), nil); cko != nil {
			for _, k := range cko.keys {
				if s, ok := r.oneOf(cko.get(k), "input.machine.verify.checks."+k, []string{"pass", "fail", "withheld"}); ok {
					proof[k] = s
				}
			}
		}
	}
	var witnessBy string
	var witnessAt *instant
	if vo != nil && vo.has("witness") {
		if wo := r.object(vo.get("witness"), "input.machine.verify.witness", []string{"by", "at"}, []string{"by", "at"}); wo != nil {
			witnessBy, _ = r.str(wo.get("by"), "input.machine.verify.witness.by", 200)
			witnessAt = r.time(wo.get("at"), "input.machine.verify.witness.at")
		}
	}
	if proof["witnesses"] == "pass" && witnessAt == nil {
		r.refuse("input.machine.verify.witness", "is missing (a passed witness check names its witness and time)")
	}
	if proof["witnesses"] != "pass" && vo != nil && vo.has("witness") {
		r.refuse("input.machine.verify.witness", "is only for a passed witness check")
	}

	var obj *cardObject
	if textOK {
		obj = readCardObject(r, text)
	}
	if obj != nil && reader_ == "recipient" && obj.hasDeals {
		r.refuse("input.machine.text", "carries the holder's deal entries; a card someone was sent never does")
	}
	if obj != nil && reader_ == "owner" && !obj.hasDeals {
		r.refuse("input.machine.text", "carries no deal entries; the holder's own page is drawn from its own copy")
	}

	// What the holder's own book adds per deal.
	extras := map[string]*dealExtra{}
	if o.has("deals") {
		if reader_ != "owner" {
			r.refuse("input.deals", "is only for the holder's own page")
		}
		var ids []string
		if obj != nil {
			for _, d := range obj.deals {
				ids = append(ids, d.id)
			}
		}
		if dm := r.object(o.get("deals"), "input.deals", ids, nil); dm != nil {
			for _, id := range dm.keys {
				path := "input.deals." + id
				e := r.object(dm.get(id), path,
					[]string{"item", "amount", "recorded", "time_stamped", "countersigned", "receipt"}, nil)
				if e == nil {
					continue
				}
				x := &dealExtra{}
				if e.has("receipt") {
					if s, ok := r.str(e.get("receipt"), path+".receipt", 160); ok {
						x.receipt = &s
						if !fileHTMLRE.MatchString(s) {
							r.refuse(path+".receipt", "is not a plain .html file name")
						}
					}
				}
				if e.has("item") {
					if s, ok := r.str(e.get("item"), path+".item", 300); ok {
						x.item = &s
					}
				}
				if e.has("amount") {
					x.amount = readAmount(r, e.get("amount"), path+".amount")
				}
				readOpt := func(key string, needBy bool) *slot {
					if !e.has(key) {
						return nil
					}
					s := readSlot(r, e.get(key), path+"."+key, needBy)
					return &s
				}
				x.recorded = readOpt("recorded", false)
				x.witness = readOpt("time_stamped", true)
				x.countersigned = readOpt("countersigned", true)
				extras[id] = x
			}
		}
	}

	if len(r.reasons) > 0 || obj == nil || !nameOK {
		if len(r.reasons) > 0 {
			return nil, r.reasons
		}
		return nil, []string{"input: no card"}
	}

	say := sayer(words)
	plural := func(key string, n int64, values ...string) string {
		suffix := "other"
		if n == 1 {
			suffix = "one"
		}
		// TS {n, ...values}: a value the caller names wins over n.
		vals := append(append([]string{}, values...), "n", grouped(strconv.FormatInt(n, 10)))
		return say(key+"."+suffix, vals...)
	}
	// A time the scripted page rewrites into the reader's zone.
	timeEl := func(t *instant) *element {
		return el("time", attrs("datetime", isoString(t), "data-time", "minute"), minuteOf(t))
	}
	owner := reader_ == "owner"
	failed := verdict != "VALID"
	pick := func(cond bool, a, b string) string {
		if cond {
			return a
		}
		return b
	}

	// Header: title, tag, download.
	download := el("a", attrs(
		"class", "cvh-button",
		"href", "data:application/json;charset=utf-8,"+encodeURIComponent(text),
		"download", file,
		"data-history", "download",
	), say("card.download"))
	title := say("card.title.owner")
	if !owner {
		title = say("card.title.recipient", "name", name)
	}
	header := el("header", attrs("class", "cvh-header", "data-history", "header"),
		el("h1", attrs("class", "cvh-title"), title),
		el("p", attrs("class", "cvh-tags"),
			el("span", attrs("class", "cvh-tag", "data-audience", pick(owner, "private", "shared")),
				say(pick(owner, "card.tag.private", "card.tag.shared"))),
			download))

	// The top line: the card's counts, as its holder reported them.
	var counts string
	switch {
	case obj.of == 0:
		counts = say("card.counts.none")
	case obj.didNotHold == 0 && obj.undecided == 0:
		counts = plural("card.counts", obj.of) + say(pick(obj.of == 1, "card.counts.all.one", "card.counts.all"))
	default:
		counts = plural("card.counts", obj.of) + say("card.counts.didnt", "k", grouped(strconv.FormatInt(obj.didNotHold, 10)))
		if obj.undecided > 0 {
			counts += say("card.counts.open", "u", grouped(strconv.FormatInt(obj.undecided, 10)))
		}
	}
	var heroLines []any
	if failed {
		heroLines = append(heroLines, el("p", attrs("class", "cvh-hero-line", "data-history", "top-line"), say("card.failed")))
	} else {
		heroLines = append(heroLines, el("p", attrs("class", "cvh-hero-line", "data-history", "top-line"), counts))
		if owner {
			heroLines = append(heroLines, el("p", attrs("class", "cvh-hero-note"), say("card.reported.owner")))
		} else {
			heroLines = append(heroLines, el("p", attrs("class", "cvh-hero-note"), say("card.reported", "name", name)))
		}
		if obj.waiting > 0 {
			heroLines = append(heroLines, el("p", attrs("class", "cvh-hero-note"), plural("card.waiting", obj.waiting)))
		}
		if sample > 0 {
			heroLines = append(heroLines, el("p", attrs("class", "cvh-hero-note", "data-history", "sample"), plural("card.sample", sample)))
		}
		if obj.asOf != nil {
			heroLines = append(heroLines, el("p", attrs("class", "cvh-hero-note"),
				say("card.as_of.before"), timeEl(obj.asOf), say("card.as_of.after")))
		}
	}
	hero := el("section", attrs("class", "cvh-hero", "data-history", "hero"), heroLines...)

	// The rows: the holder's own deals, newest first.
	var rowList *element
	if owner && !failed && len(obj.deals) > 0 {
		sorted := append([]cardDeal{}, obj.deals...)
		sort.SliceStable(sorted, func(i, j int) bool {
			a, b := sorted[i], sorted[j]
			if a.agreed.ms != b.agreed.ms {
				return a.agreed.ms > b.agreed.ms
			}
			return utf16Less(a.id, b.id)
		})
		stamp := func(nameKey, state string, line []any) *element {
			return el("li", attrs("class", "cvh-stamp", "data-filled", pick(state == "filled", "yes", "no"), "data-state", state),
				el("span", attrs("class", "cvh-stamp-name"), say(nameKey)),
				el("span", attrs("class", "cvh-stamp-line"), line...))
		}
		slotState := func(s *slot) string {
			switch {
			case s == nil || s.state == "not_checked":
				return "not_checked"
			case s.state == "passed" && s.through != nil && s.through[0] < s.through[1]:
				return "partial"
			case s.state == "passed":
				return "filled"
			case s.state == "failed":
				return "failed"
			}
			return "open"
		}
		termKey := func(holder bool) string { return pick(holder, "card.term.yours", "card.term.theirs") }
		var items []any
		for _, d := range sorted {
			x := extras[d.id]
			// No sealed record names the other side yet (evidencebook#1031), so
			// the row never names them (Sherlock2, #384 point 1).
			title := say(pick(d.role == "bought", "card.row.bought", "card.row.sold"))
			// The row's top line, from its term results (SH §11.2) or, on a /1
			// or /2 card, its outcome. A History row has no settlement facts, so
			// it never says "settled" and never draws the Done seal.
			var line string
			seal := false
			t := d.terms
			statedNotMet := func(x termResult) bool {
				return x.value == "not_met" && (x.status == "agreed" || x.status == "agreed_so_far" || x.status == "uncontested")
			}
			find := func(f func(termResult) bool) *termResult {
				for i := range t {
					if f(t[i]) {
						return &t[i]
					}
				}
				return nil
			}
			every := func(f func(termResult) bool) bool {
				for _, x := range t {
					if !f(x) {
						return false
					}
				}
				return true
			}
			hasStatus := func(s string) bool { return find(func(x termResult) bool { return x.status == s }) != nil }
			if len(t) > 0 {
				if ruled := find(func(x termResult) bool { return x.status == "ruled" && x.value == "not_met" }); ruled != nil {
					seal = true
					line = say("card.row.ruled", "term", say(termKey(ruled.holder)))
					if rm := deref(ruled.remedy); rm == "made" || rm == "due" || rm == "not_honoured" {
						line += say("card.row.remedy." + rm)
					}
				} else if hasStatus("in_dispute") {
					line = say("card.row.in_dispute")
				} else if hasStatus("in_disagreement") {
					line = say("card.row.in_disagreement")
				} else if stated := find(statedNotMet); stated != nil {
					line = say("card.row.not_met", "term", say(termKey(stated.holder)))
					if deref(stated.remedy) == "made" {
						line += say("card.row.remedy.made")
					}
				} else if every(func(x termResult) bool { return x.status == "agreed" && x.value == "met" }) {
					line = say("card.row.went")
				} else if every(func(x termResult) bool {
					return (x.status == "agreed" || x.status == "uncontested" || x.status == "ruled") && x.value == "met"
				}) {
					line = say("card.row.went.final")
				} else if every(func(x termResult) bool { return x.status == "not_due" }) {
					line = say("card.row.not_due")
				} else if every(func(x termResult) bool { return x.status == "not_reached" }) {
					line = say("card.row.not_reached")
				} else {
					line = say("card.row.open")
				}
			} else {
				switch d.outcome {
				case "held":
					line = say("card.row.outcome.held")
				case "did_not_hold":
					line = say("card.row.outcome.did_not_hold")
				default:
					line = say("card.row.outcome.undecided")
				}
			}
			amt := d.amount
			if x != nil && x.amount != nil {
				amt = x.amount
			}
			var facts []any
			if amt != nil {
				if (x != nil && x.amount != nil) || !d.hasTerms {
					facts = append(facts, amountText(amt))
				} else {
					facts = append(facts, say("card.row.amount.band", "amount", amountText(amt)))
				}
				facts = append(facts, " · ")
			}
			facts = append(facts, say("card.row.agreed"), " ", timeEl(d.agreed))
			var termLine *element
			if len(t) > 0 {
				byHolder := append([]termResult{}, t...)
				sort.SliceStable(byHolder, func(i, j int) bool { return byHolder[i].holder && !byHolder[j].holder })
				parts := make([]string, 0, len(byHolder))
				for _, x := range byHolder {
					statusKey := "card.status." + x.status
					if _, ok := base[statusKey+".not_met"]; ok && x.value == "not_met" {
						statusKey += ".not_met"
					}
					s := say(termKey(x.holder)+".label") + ": " + say(statusKey)
					if x.status == "ruled" && x.value != "" {
						s += say("card.status.ruled." + x.value)
					}
					parts = append(parts, s)
				}
				termLine = el("p", attrs("class", "cvh-row-detail"), strings.Join(parts, "; "))
			}
			var rec, ts, cs *slot
			var item, receipt *string
			if x != nil {
				rec, ts, cs, item, receipt = x.recorded, x.witness, x.countersigned, x.item, x.receipt
			}
			// A slot that covers part of the deal's steps says how far, and is
			// not drawn filled (the receipt's partial stamp; TS part).
			part := func(key string, s *slot) []any {
				if s == nil || s.through == nil || s.at == nil {
					return nil
				}
				return []any{say(key, "k", strconv.FormatInt(s.through[0], 10), "n", strconv.FormatInt(s.through[1], 10)),
					" · ", timeEl(s.at)}
			}
			recState := slotState(rec)
			var recLine []any
			switch {
			case recState == "partial":
				recLine = part("card.stamp.recorded.partial", rec)
			case recState == "filled" && rec.at != nil:
				recLine = []any{say("card.stamp.recorded.filled"), " · ", timeEl(rec.at)}
			default:
				recLine = []any{say("card.stamp.recorded." + recState)}
			}
			tsState := slotState(ts)
			var tsLine []any
			switch {
			case tsState == "partial":
				tsLine = append([]any{deref(ts.by) + " · "}, part("card.stamp.time_stamped.partial", ts)...)
			case tsState == "filled" && ts.at != nil:
				tsLine = []any{deref(ts.by) + " · ", timeEl(ts.at)}
			default:
				tsLine = []any{say("card.stamp.time_stamped." + tsState)}
			}
			csState := slotState(cs)
			var csLine []any
			switch {
			case csState == "partial":
				csLine = append([]any{say("card.stamp.countersigned.by", "signer", deref(cs.by)), " · "},
					part("card.stamp.countersigned.partial", cs)...)
			case csState == "filled" && cs.at != nil:
				csLine = []any{say("card.stamp.countersigned.by", "signer", deref(cs.by)), " · ",
					timeEl(cs.at), say("card.stamp.countersigned.clock")}
			default:
				csLine = []any{say("card.stamp.countersigned." + csState)}
			}
			var sealArt, srLine, itemLine, both, receiptLine *element
			if seal {
				sealArt = sealSvg("not_as_agreed")
				srLine = el("p", attrs("class", "cvh-sr"), say("card.seal.not_as_agreed"))
			}
			if item != nil {
				itemLine = el("p", attrs("class", "cvh-row-item"), *item)
			}
			if d.bothHalves {
				both = el("p", attrs("class", "cvh-row-detail", "data-history", "both-halves"), say("card.row.both_halves"))
			}
			if receipt != nil {
				receiptLine = el("p", nil,
					el("a", attrs("class", "cvh-link", "href", *receipt, "data-history", "receipt"), say("card.row.receipt")))
			}
			items = append(items, el("li",
				attrs("class", "cvh-row", "data-history", "row", "data-deal-state", pick(seal, "not_as_agreed", "plain")),
				el("div", attrs("class", "cvh-row-head"),
					sealArt,
					el("div", nil,
						el("p", attrs("class", "cvh-row-title"), title),
						itemLine,
						el("p", attrs("class", "cvh-row-line", "data-history", "row-line"), line),
						srLine)),
				el("p", attrs("class", "cvh-row-detail"), facts...),
				termLine,
				both,
				el("ul", attrs("class", "cvh-stamps"),
					stamp("card.stamp.recorded", recState, recLine),
					stamp("card.stamp.time_stamped", tsState, tsLine),
					stamp("card.stamp.countersigned", csState, csLine)),
				receiptLine))
		}
		rowList = el("section", attrs("class", "cvh-rows-block"),
			el("h2", nil, say("card.rows.heading")),
			el("ol", attrs("class", "cvh-rows", "data-history", "rows"), items...))
	}

	or := func(s, def string) string {
		if s == "" {
			return def
		}
		return s
	}

	// Who signed the card, and what that shows.
	signer := name
	if owner {
		signer = say("card.signed.you")
	}
	signedLine := []any{say("card.signed.by", "name", signer, "key", shortID(obj.keyID))}
	if obj.signedAt != nil {
		signedLine = append(signedLine, " · ", timeEl(obj.signedAt))
	}
	signedNote := "card.signed.unchecked"
	switch proof["producer_signatures"] {
	case "pass":
		signedNote = "card.signed.note"
	case "fail":
		signedNote = "card.signed.failed"
	}
	signed := el("section", attrs("class", "cvh-panel", "data-history", "signed"),
		el("h2", nil, say("card.signed.heading")),
		el("p", nil, signedLine...),
		// What the signature shows is said only when capsulectl verify
		// reported the signature check passed.
		el("p", attrs("class", "cvh-note", "data-signature", or(proof["producer_signatures"], "absent")),
			say(signedNote)))

	// "Is this record intact?": capsulectl verify's own answer per check.
	lede := "card.proof.lede.partial"
	anyFail, allPass := false, true
	for _, c := range proofChecks {
		if proof[c] == "fail" {
			anyFail = true
		}
		if proof[c] != "pass" {
			allPass = false
		}
	}
	switch {
	case failed || anyFail || proof["witnesses"] == "fail":
		lede = "card.proof.lede.failed"
	case allPass:
		lede = "card.proof.lede.passed"
	}
	proofRow := func(code, status string, label []any) *element {
		mark := "–"
		switch status {
		case "pass":
			mark = "✓"
		case "fail":
			mark = "✗"
		}
		return el("li", attrs("class", "cvh-proof-row", "data-check", code, "data-check-status", status),
			el("span", attrs("class", "cvh-mark", "data-status", status), mark),
			el("span", nil,
				el("span", attrs("class", "cvh-sr"), say("card.proof.status."+status)+": "),
				el("span", nil, label...),
				" ",
				el("code", attrs("class", "cvh-code"), strings.ReplaceAll(code, "_", " "))))
	}
	var proofRows []any
	for _, c := range proofChecks {
		proofRows = append(proofRows, proofRow(c, or(proof[c], "absent"), []any{say("card.proof." + c)}))
	}
	witnessStatus := or(proof["witnesses"], "absent")
	if witnessStatus == "pass" && witnessAt != nil {
		proofRows = append(proofRows, proofRow("witnesses", witnessStatus,
			[]any{say("card.proof.witness.filled", "witness", witnessBy), " ", timeEl(witnessAt)}))
	} else {
		proofRows = append(proofRows, proofRow("witnesses", witnessStatus,
			[]any{say(pick(witnessStatus == "fail", "card.proof.witness.failed", "card.proof.witness.open"))}))
	}
	command := "capsulectl verify --bundle " + file
	proofPanel := el("section", attrs("class", "cvh-panel", "data-history", "proof"),
		el("h2", nil, say("card.proof.heading")),
		el("p", attrs("class", "cvh-note", "data-proof", lede[strings.LastIndex(lede, ".")+1:]), say(lede)),
		el("ul", attrs("class", "cvh-proof-list"), proofRows...),
		el("div", attrs("class", "cvh-check", "data-history", "check"),
			el("p", attrs("class", "cvh-check-title"), say("card.check.title")),
			el("p", attrs("class", "cvh-note"), say("card.check.download")),
			el("pre", attrs("class", "cvh-command"), el("code", attrs("data-verify-command", "download"), command)),
			el("p", attrs("class", "cvh-note", "data-expect", digest),
				say("card.check.expect", "verdict", verdict, "fingerprint", shortID(digest)))))

	whose := func(key string) string {
		if owner {
			return say(key + ".owner")
		}
		return say(key, "name", name)
	}
	notProven := el("section", attrs("class", "cvh-panel cvh-callout", "data-history", "does-not-show"),
		el("h2", nil, say("card.not_proven.heading")),
		el("ul", nil,
			el("li", nil, whose("card.not_proven.true")),
			el("li", nil, whose("card.not_proven.who")),
			el("li", nil, say("card.not_proven.outside"))))

	dl := []any{
		el("dt", nil, say("card.technical.card")),
		el("dd", nil, el("code", nil, obj.derivation)),
		el("dt", nil, say("card.technical.key")),
		el("dd", nil, el("code", nil, obj.keyID)),
		el("dt", nil, say("card.technical.digest")),
		el("dd", nil, el("code", nil, digest)),
	}
	if owner && obj.hasDeals {
		var ids []any
		for _, d := range obj.deals {
			ids = append(ids, el("code", attrs("class", "cvh-id"), d.id))
		}
		dl = append(dl, el("dt", nil, say("card.technical.deals")), el("dd", nil, ids...))
	}
	technical := el("details", attrs("class", "cvh-technical", "data-history", "technical"),
		el("summary", nil, say("card.technical")),
		el("dl", nil, dl...))

	footerWhose := say("card.footer.private")
	if !owner {
		footerWhose = say("card.footer.shared", "name", name)
	}
	footer := el("footer", attrs("class", "cvh-footer", "data-history", "footer"),
		el("p", attrs("data-history", "times"), say("card.footer.utc")),
		el("p", nil, footerWhose),
		el("p", nil, say("card.footer.built.before"), timeEl(built), say("card.footer.built.after")))

	var mainSigned, sideSigned *element
	if owner {
		sideSigned = signed
	} else {
		mainSigned = signed
	}
	tree := el("section",
		attrs("class", "cv-history cvh-card", "data-history", "view", "data-kind", "deal",
			"data-surface", surface, "data-perspective", pick(owner, "yours", "theirs"),
			"data-verdict", pick(failed, "failed", "pass")),
		header,
		el("div", attrs("class", "cvh-main"), hero, rowList, mainSigned),
		el("div", attrs("class", "cvh-side"), proofPanel, notProven, sideSigned),
		el("div", attrs("class", "cvh-wide"), technical, footer))
	return tree, nil
}

type sealShape struct {
	tag   string
	attrs [][2]string
}

// sealBody and sealMoods are the harbour seal, as the receipt draws it: the
// TS SEAL_SHAPES, attributes in its key order.
var sealBody = []sealShape{
	{"path", attrs("d", "M22 106 C18 70 34 44 60 42 C86 44 102 70 98 106 Z", "fill", "#7F96A8")},
	{"ellipse", attrs("cx", "60", "cy", "88", "rx", "24", "ry", "19", "fill", "#C9D5DE")},
	{"circle", attrs("cx", "60", "cy", "40", "r", "26", "fill", "#8FA5B6")},
}

var sealMoods = map[string][]sealShape{
	"not_as_agreed": {
		{"path", attrs("d", "M45 31 L54 34 M75 31 L66 34", "stroke", "#13202B", "stroke-width", "1.8", "stroke-linecap", "round")},
		{"circle", attrs("cx", "50", "cy", "39", "r", "3.4", "fill", "#13202B")},
		{"circle", attrs("cx", "70", "cy", "39", "r", "3.4", "fill", "#13202B")},
		{"ellipse", attrs("cx", "60", "cy", "49", "rx", "9", "ry", "6", "fill", "#C9D5DE")},
		{"ellipse", attrs("cx", "60", "cy", "46.5", "rx", "3.2", "ry", "2.2", "fill", "#13202B")},
		{"path", attrs("d", "M56.5 53 Q60 50.5 63.5 53", "stroke", "#13202B", "stroke-width", "1.6", "fill", "none", "stroke-linecap", "round")},
		{"path", attrs("d", "M76 76 Q92 70 95 82 Q88 86 79 82 Z", "fill", "#6E8597")},
		{"circle", attrs("cx", "96", "cy", "78", "r", "14", "fill", "#D97A1E")},
		{"path", attrs("d", "M96 71 L96 79", "stroke", "#FFFFFF", "stroke-width", "2.8", "stroke-linecap", "round")},
		{"circle", attrs("cx", "96", "cy", "84.5", "r", "1.7", "fill", "#FFFFFF")},
	},
}

func sealSvg(mood string) *element {
	var kids []any
	for _, s := range append(append([]sealShape{}, sealBody...), sealMoods[mood]...) {
		kids = append(kids, el(s.tag, s.attrs))
	}
	return el("svg", attrs("viewBox", "0 0 120 120", "width", "48", "height", "48",
		"aria-hidden", "true", "focusable", "false", "class", "cvh-seal-art", "data-seal", mood), kids...)
}
