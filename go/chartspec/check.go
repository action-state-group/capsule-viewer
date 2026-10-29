// SPDX-License-Identifier: Apache-2.0

package chartspec

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Row is one dataset row as the checker reads it: the row's own members
// and, when the bundle discloses it, the record header its digest names.
// A nil Header is a withheld row. RecordID is the bundle record that
// carries the header; the checker never reads it.
type Row struct {
	Seq        int64
	RecordType string
	Digest     string
	Header     map[string]interface{}
	RecordID   string
}

// Dataset is the sealed selection a chart is checked against: its plan and
// its rows, in seq order.
type Dataset struct {
	Plan map[string]interface{}
	Rows []Row
}

// Group is one drawn group: its key (channel to value; numbers as float64),
// its value (unset when not run) and the rows it counts.
type Group struct {
	Key    map[string]interface{}
	Value  float64
	NotRun bool
	Rows   []*Row
	// RunRows are, on a temporal chart with runs, the run records dated in
	// this group's unit.
	RunRows []*Row
}

// Chart is a checked chart: what the page draws.
type Chart struct {
	Mark     string
	Channels map[string]Channel
	// Aggregate is the channel that holds the number.
	Aggregate string
	// Keys are the key channels, in the order groups are sorted by.
	Keys []string
	// Temporal is the time-axis channel, or "".
	Temporal   string
	Population int
	Window     *Window
	// Runs is true only when the chart can say "not run": a temporal chart
	// with runs on a one-window plan.
	Runs   bool
	Groups []Group
}

// Values returns the chart's groups in the statement's values form: the key
// channels, then the aggregate channel's number or "not_run": true
// (groupsAsValues in chart-spec.ts).
func (c *Chart) Values() []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(c.Groups))
	for _, g := range c.Groups {
		v := make(map[string]interface{}, len(g.Key)+1)
		for k, x := range g.Key {
			v[k] = x
		}
		if g.NotRun {
			v["not_run"] = true
		} else {
			v[c.Aggregate] = g.Value
		}
		out = append(out, v)
	}
	return out
}

// sealedWindows reads the plan's traditional.window nodes' params: the
// sealed windows.
func sealedWindows(plan obj) []Window {
	nodes, ok := plan["nodes"].([]interface{})
	if !ok {
		refuse(ReasonDatasetInvalid, "the dataset plan has no nodes", "")
	}
	var out []Window
	for _, raw := range nodes {
		node, ok := isObj(raw)
		if !ok || node["operator"] != "traditional.window" {
			continue
		}
		p, ok := isObj(node["params"])
		field, fok := p["field"].(string)
		if !ok || !fok || !isCalendarDate(p["from"]) || !isCalendarDate(p["to"]) {
			refuse(ReasonDatasetInvalid, "a window node of the dataset plan has no {field, from, to}", "")
		}
		out = append(out, Window{Field: field, From: p["from"].(string), To: p["to"].(string)})
	}
	return out
}

func describe(w Window) string { return w.Field + " " + w.From + " to " + w.To }

// compareScalar orders two key values of one type: false before true,
// numbers by value, strings by code point (Go's byte order on UTF-8).
func compareScalar(a, b interface{}) bool {
	if x, ok := a.(float64); ok {
		return x < b.(float64)
	}
	if x, ok := a.(bool); ok {
		return !x && b.(bool)
	}
	return a.(string) < b.(string)
}

// jsNumber is JavaScript's Number::toString, as JSON.stringify writes a number.
func jsNumber(f float64) string {
	if !finite(f) {
		return "null"
	}
	if f == 0 {
		return "0"
	}
	if a := math.Abs(f); a >= 1e-7 && a < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	s := strconv.FormatFloat(f, 'e', -1, 64)
	mantissa, exp, _ := strings.Cut(s, "e")
	sign := exp[:1]
	exp = strings.TrimLeft(exp[1:], "0")
	return mantissa + "e" + sign + exp
}

// jsJSON is JSON.stringify of one value, close enough to compare keys: exact
// for strings, booleans and numbers; objects and arrays are never in a
// chart's domain, so any stable text serves for them.
func jsJSON(value interface{}) string {
	if f, ok := numberOf(value); ok {
		return jsNumber(f)
	}
	var b bytes.Buffer
	e := json.NewEncoder(&b)
	e.SetEscapeHTML(false)
	if err := e.Encode(value); err != nil {
		return fmt.Sprintf("%v", value)
	}
	return strings.TrimSuffix(b.String(), "\n")
}

func jsTypeof(value interface{}, present bool) string {
	if !present {
		return "undefined"
	}
	switch value.(type) {
	case string:
		return "string"
	case bool:
		return "boolean"
	}
	if _, ok := numberOf(value); ok {
		return "number"
	}
	return "object"
}

// keyText is a group key's identity and its text in messages:
// JSON.stringify of [typeof, value] per key channel, as chart-spec.ts writes it.
func keyText(keys []string, key map[string]interface{}) string {
	parts := make([]string, len(keys))
	for i, k := range keys {
		v, ok := key[k]
		value := "null"
		if ok {
			value = jsJSON(v)
		}
		parts[i] = `["` + jsTypeof(v, ok) + `",` + value + `]`
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func valueText(g *Group) string {
	if g.NotRun {
		return "not run"
	}
	return jsNumber(g.Value)
}

// Check checks one spec against the dataset (nil when the Result names none
// or the bundle does not disclose it) and returns what the page draws, or a
// *Refusal. The checks run in the design note's order (section 3), each with
// its own reason: the subset; the dataset; withheld rows; fields; window;
// runs; population; values.
func Check(value interface{}, dataset *Dataset) (chart *Chart, err error) {
	defer catch(&err)
	return check(value, dataset), nil
}

func check(value interface{}, dataset *Dataset) *Chart {
	spec := readChartSpec(value)
	if dataset == nil {
		refuse(ReasonNoDataset, "the report's Result names no dataset (dataset_ref), or the bundle does not disclose it", "")
	}
	rows := make([]*Row, len(dataset.Rows))
	for i := range dataset.Rows {
		rows[i] = &dataset.Rows[i]
	}
	for _, row := range rows {
		if row.Header == nil {
			refuse(ReasonRowWithheld, rowName(row)+": the bundle does not disclose its record to this audience, so the population can't be counted", "")
		}
	}
	st, chans, keys, temporal := spec.statement, spec.channels, spec.keys, spec.temporal
	aggregate := chans[spec.aggregate]

	// 1. Fields exist and have a type, on the rows they apply to.
	var selected []*Row
	for _, row := range rows {
		pass := true
		for _, p := range spec.transform {
			if !evaluate(p, row) {
				pass = false
				break
			}
		}
		if pass {
			selected = append(selected, row)
		}
	}
	timestamp := func(row *Row, field string) string {
		v, ok := resolveField(row.Header, field)
		if !ok {
			refuse(ReasonFieldMissing, rowName(row)+" has no "+field, "")
		}
		day, ok := utcDateOf(v)
		if !ok {
			refuse(ReasonFieldType, rowName(row)+": "+field+" is not an RFC 3339 date-time with an offset", "")
		}
		return day
	}
	keyOf := map[*Row]map[string]interface{}{}
	amountOf := map[*Row]float64{}
	for _, row := range selected {
		key := map[string]interface{}{}
		for _, name := range keys {
			c := chans[name]
			if c.Type == "temporal" {
				key[name] = unitOf(timestamp(row, c.Field), c.TimeUnit)
				continue
			}
			v, ok := resolveField(row.Header, c.Field)
			if !ok {
				refuse(ReasonFieldMissing, rowName(row)+" has no "+c.Field, "")
			}
			if c.Type == "quantitative" {
				// typeof v === "number": a non-finite number passes, as in TypeScript.
				if _, isNumber := numberOf(v); !isNumber {
					refuse(ReasonFieldType, rowName(row)+": "+c.Field+" is not a number", "")
				}
			} else if !isScalar(v) {
				refuse(ReasonFieldType, rowName(row)+": "+c.Field+" is not a string, number or boolean", "")
			}
			key[name] = normalize(v)
		}
		keyOf[row] = key
		if aggregate.Aggregate == "sum" {
			v, ok := resolveField(row.Header, aggregate.Field)
			if !ok {
				refuse(ReasonFieldMissing, rowName(row)+" has no "+aggregate.Field, "")
			}
			f, isNumber := numberOf(v)
			if !isNumber || !finite(f) {
				refuse(ReasonFieldType, rowName(row)+": "+aggregate.Field+" is not a number, so it can't be summed", "")
			}
			amountOf[row] = f
		}
		if st.window != nil {
			timestamp(row, st.window.Field)
		}
	}
	for _, name := range keys {
		seen := map[string]bool{}
		for _, row := range selected {
			seen[jsTypeof(keyOf[row][name], true)] = true
		}
		if len(seen) > 1 {
			refuse(ReasonFieldType, chans[name].Field+" holds values of more than one type", "")
		}
	}

	// 2. Window: the statement, the transform's range filter and the seal agree.
	windows := sealedWindows(dataset.Plan)
	window := st.window
	if temporal != "" && window == nil {
		refuse(ReasonWindowMismatch, "a temporal chart states its window (usermeta.capsule.window)", "/usermeta/capsule")
	}
	if window != nil {
		restated := false
		for _, p := range spec.transform {
			restated = restated || (p.kind == "range" && p.field == window.Field && p.from == window.From && p.to == window.To)
		}
		if !restated {
			refuse(ReasonWindowMismatch, "the transform has no range filter over "+describe(*window)+" with timeUnit utcyearmonthdate", "/transform")
		}
		if temporal != "" && chans[temporal].Field != window.Field {
			refuse(ReasonWindowMismatch, "the time axis reads "+chans[temporal].Field+", the window "+window.Field, pointerOf(pointerOf("/encoding", temporal), "field"))
		}
		if len(windows) == 1 && windows[0] != *window {
			refuse(ReasonWindowMismatch, "the chart's window is "+describe(*window)+", the sealed window "+describe(windows[0]), "/usermeta/capsule/window")
		}
		for _, sealed := range windows {
			if sealed.Field == window.Field && (window.From < sealed.From || window.To > sealed.To) {
				refuse(ReasonWindowMismatch, "the chart's window "+describe(*window)+" is not inside the sealed window "+describe(sealed), "/usermeta/capsule/window")
			}
		}
	}
	var timeUnits []string
	if temporal != "" {
		timeUnits = unitsOf(window, chans[temporal].TimeUnit)
	}

	// Runs: only a plan with exactly one window node can tell "not run" from
	// zero (spec/evidence-plan-ir-v0.md §5.1), by that node's own field.
	runs := st.runs
	if len(windows) != 1 {
		if runs != nil {
			refuse(ReasonRunsUnsealed, fmt.Sprintf(`the dataset plan has %d window nodes, so no day can read "not run"; this chart states runs`, len(windows)), "/usermeta/capsule/runs")
		}
	} else if temporal != "" && runs == nil {
		refuse(ReasonRunsMissing, "a temporal chart over a windowed plan names its run records (usermeta.capsule.runs)", "/usermeta/capsule")
	}
	if runs != nil && len(windows) == 1 {
		if runs.field != windows[0].Field {
			refuse(ReasonRunsFieldMismatch, "runs are dated by "+runs.field+"; the sealed window field is "+windows[0].Field, "/usermeta/capsule/runs/field")
		}
		if temporal == "" {
			refuse(ReasonRunsUnsealed, "only a temporal chart can say a unit was not run; this chart has no time axis", "/usermeta/capsule/runs")
		}
	}
	runRowsOf := map[string][]*Row{}
	drawsRuns := runs != nil && len(windows) == 1 && temporal != ""
	if drawsRuns {
		unit := chans[temporal].TimeUnit
		for _, row := range rows {
			if !evaluate(runs.filter, row) {
				continue
			}
			day := timestamp(row, runs.field)
			if day < window.From || day > window.To {
				continue
			}
			u := unitOf(day, unit)
			runRowsOf[u] = append(runRowsOf[u], row)
		}
	}

	// 3. Population.
	if float64(len(selected)) != st.population {
		refuse(ReasonPopulationMismatch, fmt.Sprintf("%d rows pass the transform; the chart states %s", len(selected), jsNumber(st.population)), "/usermeta/capsule/population/count")
	}

	// 4. Values: every group of the domain, recomputed.
	domains := make([][]interface{}, len(keys))
	for i, name := range keys {
		if name == temporal {
			for _, u := range timeUnits {
				domains[i] = append(domains[i], u)
			}
			continue
		}
		seen := map[string]bool{}
		for _, row := range selected {
			v := keyOf[row][name]
			if text := jsJSON(v); !seen[text] {
				seen[text] = true
				domains[i] = append(domains[i], v)
			}
		}
		d := domains[i]
		sort.SliceStable(d, func(a, b int) bool { return compareScalar(d[a], d[b]) })
	}
	// The stated values list every group, so a domain of another size
	// refuses before it is enumerated.
	size := 1
	for _, d := range domains {
		size *= len(d)
	}
	if size != len(st.values) {
		refuse(ReasonAggregateMismatch, fmt.Sprintf("the chart's domain has %d groups; the statement lists %d", size, len(st.values)), "/usermeta/capsule/values")
	}
	rowsOf := map[string][]*Row{}
	for _, row := range selected {
		text := keyText(keys, keyOf[row])
		rowsOf[text] = append(rowsOf[text], row)
	}
	var groups []Group
	var product func(i int, key map[string]interface{})
	product = func(i int, key map[string]interface{}) {
		if i == len(keys) {
			counted := rowsOf[keyText(keys, key)]
			var runRows []*Row
			if temporal != "" {
				runRows = runRowsOf[key[temporal].(string)]
			}
			g := Group{Key: key, NotRun: drawsRuns && len(runRows) == 0, Rows: counted, RunRows: runRows}
			if !g.NotRun {
				if aggregate.Aggregate == "count" {
					g.Value = float64(len(counted))
				} else {
					for _, row := range counted {
						g.Value += amountOf[row]
					}
				}
			}
			groups = append(groups, g)
			return
		}
		for _, v := range domains[i] {
			next := make(map[string]interface{}, len(key)+1)
			for k, x := range key {
				next[k] = x
			}
			next[keys[i]] = v
			product(i+1, next)
		}
	}
	// A unit with rows but no run record is still not run (§5.1: "a day
	// without a run row was not run"); its rows stay in the population.
	product(0, map[string]interface{}{})

	var statedOrder []string
	stated := map[string]obj{}
	for i, v := range st.values {
		key := map[string]interface{}{}
		for _, name := range keys {
			if x, ok := v[name]; ok {
				key[name] = x
			}
		}
		text := keyText(keys, key)
		if _, dup := stated[text]; dup {
			refuse(ReasonAggregateMismatch, "the group "+text+" is listed twice", indexOf("/usermeta/capsule/values", i))
		}
		stated[text] = v
		statedOrder = append(statedOrder, text)
	}
	want := map[string]*Group{}
	var wantOrder []string
	for i := range groups {
		text := keyText(keys, groups[i].Key)
		if _, dup := want[text]; !dup {
			wantOrder = append(wantOrder, text)
		}
		want[text] = &groups[i]
	}
	isKey := map[string]bool{}
	for _, k := range keys {
		isKey[k] = true
	}
	for _, text := range statedOrder {
		v := stated[text]
		g := want[text]
		extra := false
		for k := range v {
			extra = extra || (k != "not_run" && k != spec.aggregate && !isKey[k])
		}
		ok := g != nil && !extra
		if ok {
			if g.NotRun {
				ok = v["not_run"] == true && !has(v, spec.aggregate)
			} else {
				stated, isNumber := numberOf(v[spec.aggregate])
				ok = !has(v, "not_run") && isNumber && stated == g.Value
			}
		}
		if !ok {
			message := "the stated group " + text + " is not in the chart's domain"
			if g != nil {
				message = "the stated group " + text + " does not match the data (" + valueText(g) + ")"
			}
			refuse(ReasonAggregateMismatch, message, "/usermeta/capsule/values")
		}
	}
	for _, text := range wantOrder {
		if _, ok := stated[text]; !ok {
			refuse(ReasonAggregateMismatch, "the group "+text+" ("+valueText(want[text])+") is missing from the stated values", "/usermeta/capsule/values")
		}
	}

	out := &Chart{
		Mark:       spec.mark,
		Channels:   map[string]Channel{},
		Aggregate:  spec.aggregate,
		Keys:       keys,
		Temporal:   temporal,
		Population: len(selected),
		Window:     window,
		Runs:       drawsRuns,
		Groups:     groups,
	}
	for name, c := range chans {
		out.Channels[name] = *c
	}
	return out
}
