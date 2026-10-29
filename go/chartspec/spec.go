// SPDX-License-Identifier: Apache-2.0

// Package chartspec checks a chart spec against the sealed dataset a
// report's Result names (capsule-viewer#82; docs/design/chart-spec.md). It is
// the Go twin of ts/src/chart-spec.ts (Check) and ts/src/chart-dataset.ts
// (DatasetOf): the same closed Vega-Lite v5 subset, the same checks in the
// same order and the same refusal reasons. Both run the shared vectors in
// vectors/chart-spec/. It touches no page; the offline builder calls it
// before it writes one.
package chartspec

import (
	"encoding/json"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// The refusal reasons, one per check (ChartRefusalReason in chart-spec.ts).
const (
	ReasonUnsupportedMember  = "chart-unsupported-member"
	ReasonAggregateShape     = "chart-aggregate-shape"
	ReasonNoDataset          = "chart-no-dataset"
	ReasonDatasetInvalid     = "chart-dataset-invalid"
	ReasonRowWithheld        = "chart-row-withheld"
	ReasonFieldMissing       = "chart-field-missing"
	ReasonFieldType          = "chart-field-type"
	ReasonWindowMismatch     = "chart-window-mismatch"
	ReasonRunsMissing        = "chart-runs-missing"
	ReasonRunsFieldMismatch  = "chart-runs-field-mismatch"
	ReasonRunsUnsealed       = "chart-runs-unsealed"
	ReasonPopulationMismatch = "chart-population-mismatch"
	ReasonAggregateMismatch  = "chart-aggregate-mismatch"
)

// Refusal is a refused chart: its reason, the JSON pointer into the spec it
// names (empty when none) and why.
type Refusal struct {
	Reason  string
	Pointer string
	Message string
}

func (r *Refusal) Error() string { return r.Reason + ": " + r.Message }

// refuse aborts the check; Check and DatasetOf recover it as their error,
// the way the TypeScript checker throws a ChartRefusal.
func refuse(reason, message, pointer string) {
	panic(&Refusal{Reason: reason, Pointer: pointer, Message: message})
}

// catch turns a refusal raised by refuse into *err and re-panics anything else.
func catch(err *error) {
	if r := recover(); r != nil {
		refusal, ok := r.(*Refusal)
		if !ok {
			panic(r)
		}
		*err = refusal
	}
}

type obj = map[string]interface{}

func isObj(value interface{}) (obj, bool) {
	m, ok := value.(map[string]interface{})
	return m, ok && m != nil
}

func has(m obj, key string) bool {
	_, ok := m[key]
	return ok
}

// numberOf reads a JSON number as JavaScript does: a float64. A json.Number
// beyond float64's range is ±Inf, as JSON.parse makes it.
func numberOf(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case json.Number:
		f, err := strconv.ParseFloat(v.String(), 64)
		if err != nil && !math.IsInf(f, 0) {
			return 0, false
		}
		return f, true
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case int32:
		return float64(v), true
	}
	return 0, false
}

func finite(f float64) bool { return !math.IsInf(f, 0) && !math.IsNaN(f) }

// integerOf is Number.isInteger.
func integerOf(value interface{}) (float64, bool) {
	f, ok := numberOf(value)
	return f, ok && finite(f) && f == math.Trunc(f)
}

func isScalar(value interface{}) bool {
	switch value.(type) {
	case string, bool:
		return true
	}
	f, ok := numberOf(value)
	return ok && finite(f)
}

// normalize stores a number as float64, so keys and values compare as JS
// numbers do; strings and booleans are kept.
func normalize(value interface{}) interface{} {
	if f, ok := numberOf(value); ok {
		return f
	}
	return value
}

// strictEqual is JavaScript === on JSON values: numbers by value, strings
// and booleans by value, anything else never equal.
func strictEqual(a, b interface{}) bool {
	if x, ok := numberOf(a); ok {
		y, ok := numberOf(b)
		return ok && x == y
	}
	switch x := a.(type) {
	case string:
		y, ok := b.(string)
		return ok && x == y
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	}
	return false
}

const schemaURL = "https://vega.github.io/schema/vega-lite/v5.json"

var (
	marks    = []string{"bar", "line", "point", "rect"}
	types    = []string{"quantitative", "ordinal", "nominal", "temporal"}
	units    = []string{"utcyearmonthdate", "utcyearmonth"}
	channels = []string{"x", "y", "color"}
	// The same grammar as agent-action-capsule's dataset plan field paths
	// (§5.1); \z, so a trailing newline is no part of a path.
	fieldPath = regexp.MustCompile(`\A[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*\z`)
)

func contains(list []string, value interface{}) bool {
	s, ok := value.(string)
	if !ok {
		return false
	}
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func pointerOf(base, key string) string {
	return base + "/" + strings.ReplaceAll(strings.ReplaceAll(key, "~", "~0"), "/", "~1")
}

func indexOf(base string, i int) string { return pointerOf(base, strconv.Itoa(i)) }

func orRoot(at string) string {
	if at == "" {
		return "/"
	}
	return at
}

// onlyKeys refuses a member outside allowed. Keys are visited in sorted
// order: when several are outside, the one named may differ from
// TypeScript's (which visits them in source order); the reason is the same.
func onlyKeys(value obj, allowed []string, at string) {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if !contains(allowed, key) {
			refuse(ReasonUnsupportedMember, orRoot(pointerOf(at, key))+" is not in the accepted subset", pointerOf(at, key))
		}
	}
}

func need(ok bool, at, what string) {
	if !ok {
		refuse(ReasonUnsupportedMember, orRoot(at)+" must be "+what, at)
	}
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

type predicate struct {
	kind     string // equal, oneOf, range, and, or, not
	field    string
	value    interface{}
	values   []interface{}
	from, to string
	items    []*predicate
}

func readField(value interface{}, at string) string {
	s, ok := value.(string)
	need(ok && fieldPath.MatchString(s), at, "a field path (name, dot-separated)")
	return s
}

// readDay reads a Vega-Lite DateTime {year, month, date, utc: true} naming a
// real day, as YYYY-MM-DD. Checking the numbers is the TypeScript's
// zero-padded string through isCalendarDate: both accept exactly a real day
// in years 1-9999.
func readDay(value interface{}, at string) string {
	if m, ok := isObj(value); ok {
		onlyKeys(m, []string{"year", "month", "date", "utc"}, at)
		year, yok := integerOf(m["year"])
		month, mok := integerOf(m["month"])
		date, dok := integerOf(m["date"])
		if m["utc"] == true && yok && mok && dok && year >= 1 && year <= 9999 &&
			month >= 1 && month <= 12 && date >= 1 && date <= float64(monthDays(int(year), int(month))) {
			return dayText(int(year), int(month), int(date))
		}
	}
	refuse(ReasonUnsupportedMember, at+" must be a UTC DateTime {year, month, date, utc: true} naming a real day", at)
	return ""
}

func readPredicate(value interface{}, at string) *predicate {
	p, ok := isObj(value)
	need(ok, at, "a predicate object")
	for _, kind := range []string{"and", "or"} {
		if has(p, kind) {
			onlyKeys(p, []string{kind}, at)
			items, ok := p[kind].([]interface{})
			need(ok && len(items) > 0, pointerOf(at, kind), "a non-empty list of predicates")
			out := &predicate{kind: kind}
			for i, item := range items {
				out.items = append(out.items, readPredicate(item, indexOf(pointerOf(at, kind), i)))
			}
			return out
		}
	}
	if has(p, "not") {
		onlyKeys(p, []string{"not"}, at)
		return &predicate{kind: "not", items: []*predicate{readPredicate(p["not"], pointerOf(at, "not"))}}
	}
	if has(p, "equal") {
		onlyKeys(p, []string{"field", "equal"}, at)
		field := readField(p["field"], pointerOf(at, "field"))
		need(isScalar(p["equal"]), pointerOf(at, "equal"), "a string, number or boolean")
		return &predicate{kind: "equal", field: field, value: p["equal"]}
	}
	if has(p, "oneOf") {
		onlyKeys(p, []string{"field", "oneOf"}, at)
		field := readField(p["field"], pointerOf(at, "field"))
		values, ok := p["oneOf"].([]interface{})
		every := ok && len(values) > 0
		for _, v := range values {
			every = every && isScalar(v)
		}
		need(every, pointerOf(at, "oneOf"), "a non-empty list of strings, numbers or booleans")
		return &predicate{kind: "oneOf", field: field, values: values}
	}
	if has(p, "range") {
		onlyKeys(p, []string{"field", "range", "timeUnit"}, at)
		field := readField(p["field"], pointerOf(at, "field"))
		need(p["timeUnit"] == "utcyearmonthdate", pointerOf(at, "timeUnit"), `"utcyearmonthdate"`)
		r, ok := p["range"].([]interface{})
		need(ok && len(r) == 2, pointerOf(at, "range"), "a list of two days")
		from := readDay(r[0], indexOf(pointerOf(at, "range"), 0))
		to := readDay(r[1], indexOf(pointerOf(at, "range"), 1))
		if from > to {
			refuse(ReasonUnsupportedMember, at+": the range ends before it starts", pointerOf(at, "range"))
		}
		return &predicate{kind: "range", field: field, from: from, to: to}
	}
	refuse(ReasonUnsupportedMember, at+" is not an accepted predicate (equal, oneOf, range, and, or, not)", at)
	return nil
}

// resolveField resolves a field path on a record header: each name an own
// member of the object before it.
func resolveField(header obj, path string) (interface{}, bool) {
	var at interface{} = header
	for _, name := range strings.Split(path, ".") {
		m, ok := isObj(at)
		if !ok {
			return nil, false
		}
		v, ok := m[name]
		if !ok {
			return nil, false
		}
		at = v
	}
	return at, true
}

func rowName(row *Row) string {
	return "row seq " + strconv.FormatInt(row.Seq, 10) + " (" + row.RecordType + ")"
}

func evaluate(p *predicate, row *Row) bool {
	switch p.kind {
	case "and":
		for _, item := range p.items {
			if !evaluate(item, row) {
				return false
			}
		}
		return true
	case "or":
		for _, item := range p.items {
			if evaluate(item, row) {
				return true
			}
		}
		return false
	case "not":
		return !evaluate(p.items[0], row)
	}
	// A predicate is false on a row that lacks its field, as in Vega-Lite:
	// that is how a filter selects one record type.
	value, ok := resolveField(row.Header, p.field)
	if !ok {
		return false
	}
	if p.kind == "range" {
		day, ok := utcDateOf(value)
		if !ok {
			refuse(ReasonFieldType, rowName(row)+": "+p.field+" is not an RFC 3339 date-time with an offset", "")
		}
		return day >= p.from && day <= p.to
	}
	if !isScalar(value) {
		refuse(ReasonFieldType, rowName(row)+": "+p.field+" is not a string, number or boolean", "")
	}
	if p.kind == "equal" {
		return strictEqual(value, p.value)
	}
	for _, v := range p.values {
		if strictEqual(v, value) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// The spec
// ---------------------------------------------------------------------------

// Channel is one encoding channel as read. Field is empty only on a count.
type Channel struct {
	Field     string
	Type      string
	Aggregate string // "", "count" or "sum"
	TimeUnit  string // "", "utcyearmonthdate" or "utcyearmonth"
}

// Window is a window of UTC calendar days, both ends inclusive, on a field.
type Window struct {
	Field string
	From  string
	To    string
}

type runsStatement struct {
	filter *predicate
	field  string
}

type statement struct {
	population float64
	window     *Window
	runs       *runsStatement
	values     []obj
}

type chartSpec struct {
	mark      string
	transform []*predicate
	channels  map[string]*Channel
	aggregate string
	keys      []string
	temporal  string
	statement statement
}

func readChannel(value interface{}, at string) *Channel {
	c, ok := isObj(value)
	need(ok, at, "an encoding object")
	onlyKeys(c, []string{"field", "type", "aggregate", "timeUnit", "title"}, at)
	need(contains(types, c["type"]), pointerOf(at, "type"), "quantitative, ordinal, nominal or temporal")
	out := &Channel{Type: c["type"].(string)}
	if has(c, "aggregate") {
		need(c["aggregate"] == "count" || c["aggregate"] == "sum", pointerOf(at, "aggregate"), "count or sum")
		out.Aggregate = c["aggregate"].(string)
	}
	if has(c, "field") {
		if out.Aggregate == "count" {
			refuse(ReasonUnsupportedMember, at+": a count names no field", pointerOf(at, "field"))
		}
		out.Field = readField(c["field"], pointerOf(at, "field"))
	} else if out.Aggregate != "count" {
		refuse(ReasonUnsupportedMember, at+" must name a field", pointerOf(at, "field"))
	}
	if out.Aggregate != "" && out.Type != "quantitative" {
		refuse(ReasonUnsupportedMember, at+": an aggregate is quantitative", pointerOf(at, "type"))
	}
	if has(c, "timeUnit") {
		need(out.Type == "temporal" && contains(units, c["timeUnit"]), pointerOf(at, "timeUnit"), "utcyearmonthdate or utcyearmonth, on a temporal field")
		out.TimeUnit = c["timeUnit"].(string)
	} else if out.Type == "temporal" {
		refuse(ReasonUnsupportedMember, at+": a temporal field needs a timeUnit (utcyearmonthdate or utcyearmonth)", pointerOf(at, "timeUnit"))
	}
	return out
}

func readWindow(value interface{}, at string) *Window {
	w, ok := isObj(value)
	need(ok, at, "{field, from, to}")
	onlyKeys(w, []string{"field", "from", "to"}, at)
	field := readField(w["field"], pointerOf(at, "field"))
	need(isCalendarDate(w["from"]), pointerOf(at, "from"), "a calendar day YYYY-MM-DD")
	need(isCalendarDate(w["to"]), pointerOf(at, "to"), "a calendar day YYYY-MM-DD")
	from, to := w["from"].(string), w["to"].(string)
	if from > to {
		refuse(ReasonUnsupportedMember, at+": the window ends before it starts", at)
	}
	return &Window{Field: field, From: from, To: to}
}

func readStatement(value interface{}, at string) statement {
	s, ok := isObj(value)
	need(ok, at, "an object")
	onlyKeys(s, []string{"population", "window", "runs", "values"}, at)
	pop, ok := isObj(s["population"])
	need(ok, pointerOf(at, "population"), "{count}")
	onlyKeys(pop, []string{"count"}, pointerOf(at, "population"))
	count, ok := integerOf(pop["count"])
	need(ok && count >= 0, pointerOf(pointerOf(at, "population"), "count"), "a non-negative integer")
	out := statement{population: count, values: []obj{}}
	if has(s, "window") {
		out.window = readWindow(s["window"], pointerOf(at, "window"))
	}
	if has(s, "runs") {
		rat := pointerOf(at, "runs")
		r, ok := isObj(s["runs"])
		need(ok, rat, "{filter, field}")
		onlyKeys(r, []string{"filter", "field"}, rat)
		filter := readPredicate(r["filter"], pointerOf(rat, "filter"))
		out.runs = &runsStatement{filter: filter, field: readField(r["field"], pointerOf(rat, "field"))}
	}
	values, ok := s["values"].([]interface{})
	need(ok, pointerOf(at, "values"), "a list of groups")
	for i, v := range values {
		vat := indexOf(pointerOf(at, "values"), i)
		group, ok := isObj(v)
		need(ok, vat, "a group object")
		onlyKeys(group, append(append([]string{}, channels...), "not_run"), vat)
		if has(group, "not_run") {
			need(group["not_run"] == true, pointerOf(vat, "not_run"), "true")
		}
		out.values = append(out.values, group)
	}
	return out
}

// readChartSpec reads a spec in the closed subset, or refuses it (structure
// only; no data is read).
func readChartSpec(value interface{}) *chartSpec {
	spec, ok := isObj(value)
	need(ok, "", "a Vega-Lite object")
	onlyKeys(spec, []string{"$schema", "data", "mark", "transform", "encoding", "usermeta", "title", "description"}, "")
	need(spec["$schema"] == schemaURL, "/$schema", schemaURL)
	data, ok := isObj(spec["data"])
	need(ok, "/data", `{"name": "dataset"}`)
	onlyKeys(data, []string{"name"}, "/data")
	need(data["name"] == "dataset", "/data/name", `"dataset"`)

	var mark string
	if m, ok := isObj(spec["mark"]); ok {
		onlyKeys(m, []string{"type"}, "/mark")
		need(contains(marks, m["type"]), "/mark/type", "bar, line, point or rect")
		mark = m["type"].(string)
	} else {
		need(contains(marks, spec["mark"]), "/mark", "bar, line, point or rect")
		mark = spec["mark"].(string)
	}

	transform := []*predicate{}
	if has(spec, "transform") {
		list, ok := spec["transform"].([]interface{})
		need(ok, "/transform", "a list of filters")
		for i, t := range list {
			at := indexOf("/transform", i)
			tm, ok := isObj(t)
			need(ok, at, "{filter: predicate}")
			onlyKeys(tm, []string{"filter"}, at)
			need(has(tm, "filter"), at, "{filter: predicate}")
			transform = append(transform, readPredicate(tm["filter"], pointerOf(at, "filter")))
		}
	}

	encoding, ok := isObj(spec["encoding"])
	need(ok, "/encoding", "an object")
	onlyKeys(encoding, channels, "/encoding")
	chans := map[string]*Channel{}
	for _, name := range channels {
		if has(encoding, name) {
			chans[name] = readChannel(encoding[name], pointerOf("/encoding", name))
		}
	}

	usermeta, ok := isObj(spec["usermeta"])
	need(ok, "/usermeta", "{capsule: statement}")
	onlyKeys(usermeta, []string{"capsule"}, "/usermeta")
	st := readStatement(usermeta["capsule"], "/usermeta/capsule")

	// Exactly one channel aggregates: y for bar, line and point; color for rect.
	var aggregating []string
	for _, c := range channels {
		if ch := chans[c]; ch != nil && ch.Aggregate != "" {
			aggregating = append(aggregating, c)
		}
	}
	want := "y"
	required := []string{"x", "y"}
	if mark == "rect" {
		want = "color"
		required = []string{"x", "y", "color"}
	}
	missing := false
	for _, c := range required {
		missing = missing || chans[c] == nil
	}
	if len(aggregating) != 1 || aggregating[0] != want || missing {
		message := "a " + mark + " chart encodes x and aggregates y, and nothing else aggregates"
		if mark == "rect" {
			message = "a rect chart encodes x and y and aggregates color, and nothing else aggregates"
		}
		refuse(ReasonAggregateShape, message, "/encoding")
	}
	var keys, temporals []string
	for _, c := range channels {
		if chans[c] != nil && c != want {
			keys = append(keys, c)
			if chans[c].Type == "temporal" {
				temporals = append(temporals, c)
			}
		}
	}
	if len(temporals) > 1 {
		refuse(ReasonUnsupportedMember, "a chart has at most one temporal channel", pointerOf("/encoding", temporals[1]))
	}
	out := &chartSpec{mark: mark, transform: transform, channels: chans, aggregate: want, keys: keys, statement: st}
	if len(temporals) == 1 {
		out.temporal = temporals[0]
	}
	return out
}
