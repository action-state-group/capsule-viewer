// SPDX-License-Identifier: Apache-2.0

package chartspec

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// The Go twin of ts/src/report-view.ts (capsule-viewer#156;
// docs/design/report-views.md): a view entry of the `charts` setting is
// ordinary chart specs laid out in a grid. Every number a view shows is a
// group Check recomputed from the dataset's rows; this file adds the rules
// that make several charts fit one grid and reads the entry's own members.
// The shared vectors in vectors/view-spec/ pin both implementations to the
// same reasons.

var viewID = regexp.MustCompile(`\A[a-z][a-z0-9_]{0,31}\z`)

// IsView reports whether an entry of the `charts` setting is a view, not a
// chart spec.
func IsView(value interface{}) bool {
	m, ok := isObj(value)
	return ok && has(m, "view")
}

// ViewChart is one checked chart of a view with its id and, for a calendar
// or timeline lane, the members that lane carries.
type ViewChart struct {
	ID      string
	Chart   *Chart
	Role    string
	Classes map[string]string
	Mark    string
}

// CoFailureCell is one cell of the co-failure matrix: the subjects failing
// both requirements, and the rows that say so.
type CoFailureCell struct {
	Subjects int
	Rows     []*Row
}

// View is a checked view entry. Kind is "calendar", "by-period", "timeline"
// or "co-failure"; the members each kind fills follow CheckedView in
// report-view.ts.
type View struct {
	Kind   string
	Window Window
	// Unplaced counts the distinct records dated on a day that did not run.
	Unplaced int
	// Lanes are a calendar's or timeline's lanes.
	Lanes []ViewChart
	// Count is a by-period's or co-failure's counted chart; Columns are a
	// by-period's other charts.
	Count   *ViewChart
	Columns []ViewChart
	// Subject, Requirements, Failing and Cells are a co-failure's matrix.
	Subject      string
	Requirements []interface{}
	Failing      int
	Cells        [][]CoFailureCell
}

// CheckView reads a view entry and checks every chart in it against the
// dataset. It returns a *Refusal: a view-* reason for the view's own rules,
// the chart's own reason (with the chart's id in the message) when a chart in
// it fails its check.
func CheckView(value interface{}, dataset *Dataset) (view *View, err error) {
	defer catch(&err)
	return checkView(value, dataset), nil
}

func keyChannelOf(c *Chart) string {
	for _, k := range c.Keys {
		if k != c.Temporal {
			return k
		}
	}
	return ""
}

func hasKeyBesidesX(c *Chart) int {
	n := 0
	for _, k := range c.Keys {
		if k != "x" {
			n++
		}
	}
	return n
}

type viewEntry struct {
	id      string
	spec    interface{}
	role    string
	classes map[string]string
	mark    string
}

var (
	laneRoles    = []string{"activity", "judgment", "adjudication"}
	valueClasses = []string{"good", "bad", "open"}
)

// readViewEntry reads `{id, chart}` (a calendar lane also role and classes,
// a timeline lane also mark and classes): an id the page draws as code, and a
// chart spec. lane is "calendar", "timeline" or "".
func readViewEntry(value interface{}, at string, seen map[string]bool, lane string) viewEntry {
	m, ok := isObj(value)
	if !ok {
		refuse(ReasonViewUnsupportedMember, at+" must be an object", at)
	}
	allowed := []string{"id", "chart"}
	switch lane {
	case "calendar":
		allowed = []string{"id", "chart", "role", "classes"}
	case "timeline":
		allowed = []string{"id", "chart", "mark", "classes"}
	}
	viewOnlyKeys(m, allowed, at)
	id, isString := m["id"].(string)
	if !isString || !viewID.MatchString(id) {
		refuse(ReasonViewUnsupportedMember, at+"/id must match "+viewID.String(), at+"/id")
	}
	if seen[id] {
		refuse(ReasonViewUnsupportedMember, at+"/id "+id+" is repeated", at)
	}
	seen[id] = true
	chart, present := m["chart"]
	if !present {
		refuse(ReasonViewUnsupportedMember, at+"/chart is missing", at+"/chart")
	}
	out := viewEntry{id: id, spec: chart}
	if v, present := m["role"]; present {
		role, _ := v.(string)
		if !contains(laneRoles, role) {
			refuse(ReasonViewUnsupportedMember, at+"/role must be one of "+strings.Join(laneRoles, ", "), at+"/role")
		}
		out.role = role
	}
	if v, present := m["mark"]; present {
		if v != "tick" && v != "diamond" {
			refuse(ReasonViewUnsupportedMember, at+"/mark must be tick or diamond", at+"/mark")
		}
		out.mark = v.(string)
	}
	if v, present := m["classes"]; present {
		c, ok := isObj(v)
		if !ok || len(c) == 0 {
			refuse(ReasonViewUnsupportedMember, at+"/classes must be a non-empty object", at+"/classes")
		}
		names := make([]string, 0, len(c))
		for k := range c {
			names = append(names, k)
		}
		sort.Strings(names)
		out.classes = map[string]string{}
		for _, k := range names {
			class, _ := c[k].(string)
			if !contains(valueClasses, class) {
				refuse(ReasonViewUnsupportedMember, at+"/classes/"+k+" must be one of "+strings.Join(valueClasses, ", "), at+"/classes/"+k)
			}
			out.classes[k] = class
		}
	}
	return out
}

// viewOnlyKeys is onlyKeys with the view's reason.
func viewOnlyKeys(value obj, allowed []string, at string) {
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if !contains(allowed, key) {
			refuse(ReasonViewUnsupportedMember, at+"/"+key+" is not in the accepted subset", at+"/"+key)
		}
	}
}

func viewList(value interface{}, at string, min int) []interface{} {
	list, ok := value.([]interface{})
	if !ok || len(list) < min {
		refuse(ReasonViewUnsupportedMember, at+" must be a list of at least "+strconv.Itoa(min), at)
	}
	return list
}

// wholeMonths: the window runs from a month's first day to a month's last day.
func wholeMonths(w Window) bool {
	ty, tm, td := parseDay(w.To)
	return strings.HasSuffix(w.From, "-01") && td == monthDays(ty, tm)
}

// daysOf is each day of a checked chart and whether it was not run.
func daysOf(c *Chart) map[string]bool {
	out := make(map[string]bool, len(c.Units))
	for _, u := range c.Units {
		out[u.Unit] = u.NotRun
	}
	return out
}

// unplacedOf counts the distinct records dated on a day that did not run.
func unplacedOf(parts []ViewChart) int {
	seqs := map[int64]bool{}
	for _, p := range parts {
		for _, g := range p.Chart.Groups {
			if g.NotRun {
				for _, row := range g.Rows {
					seqs[row.Seq] = true
				}
			}
		}
	}
	return len(seqs)
}

// checkFit refuses a chart that does not fit a view's grid: one UTC day per x
// unit, a count, a plan that can say "not run".
func checkFit(id string, c *Chart, keysOK func(n int) bool, what string) {
	x, hasX := c.Channels["x"]
	if c.Temporal != "x" || !hasX || x.TimeUnit != "utcyearmonthdate" {
		refuse(ReasonViewChartShape, id+": x must be a temporal field in the unit utcyearmonthdate, so each group is one UTC day", "")
	}
	if c.Channels[c.Aggregate].Aggregate != "count" {
		refuse(ReasonViewChartShape, id+": the aggregate must be count", "")
	}
	if !keysOK(hasKeyBesidesX(c)) {
		refuse(ReasonViewChartShape, id+": "+what+" besides x, or the chart fits no grid", "")
	}
	if !c.Runs || c.Window == nil {
		refuse(ReasonViewRunsUnsealed, id+": the plan does not say which days ran (it needs exactly one window node and the chart's runs), so a day nothing ran would read 0", "")
	}
}

// checkTogether checks across the charts of one view: one set of days not
// run and (when disjoint) no row counted by two charts.
func checkTogether(parts []ViewChart, disjoint bool) Window {
	first := parts[0]
	window := *first.Chart.Window
	days := daysOf(first.Chart)
	// Days are compared in the order of the first chart's units.
	order := make([]string, 0, len(first.Chart.Units))
	for _, u := range first.Chart.Units {
		order = append(order, u.Unit)
	}
	owner := map[int64]string{}
	for _, p := range parts {
		mine := daysOf(p.Chart)
		for _, day := range order {
			if notRun, ok := mine[day]; !ok || notRun != days[day] {
				refuse(ReasonViewRunsMismatch, p.ID+" and "+first.ID+" disagree on whether "+day+" ran", "")
			}
		}
		if !disjoint {
			continue
		}
		for _, g := range p.Chart.Groups {
			for _, row := range g.Rows {
				if was, ok := owner[row.Seq]; ok && was != p.ID {
					refuse(ReasonViewOverlap, "record seq "+strconv.FormatInt(row.Seq, 10)+" is counted by both "+was+" and "+p.ID, "")
				}
				owner[row.Seq] = p.ID
			}
		}
	}
	return window
}

// checkClasses refuses a value with no class: it would be counted as nothing.
func checkClasses(lanes []ViewChart) {
	for i, lane := range lanes {
		if lane.Classes == nil {
			continue
		}
		at := "/lanes/" + strconv.Itoa(i)
		if hasKeyBesidesX(lane.Chart) == 0 {
			refuse(ReasonViewLaneRole, lane.ID+": classes name the values of a key channel, and this lane has none", at+"/classes")
		}
		key := keyChannelOf(lane.Chart)
		for _, g := range lane.Chart.Groups {
			v := jsString(g.Key[key])
			if _, ok := lane.Classes[v]; !ok {
				refuse(ReasonViewLaneRole, lane.ID+": the value "+v+" has no class", at+"/classes")
			}
		}
	}
}

// jsString is String(value) of a key value.
func jsString(value interface{}) string {
	switch v := value.(type) {
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	}
	if f, ok := numberOf(value); ok {
		return jsNumber(f)
	}
	return ""
}

func viewCheckOne(id string, spec interface{}, at string, dataset *Dataset) ViewChart {
	var part ViewChart
	func() {
		defer func() {
			if r := recover(); r != nil {
				refusal, ok := r.(*Refusal)
				if !ok {
					panic(r)
				}
				// The chart's pointer is relative to the chart; make it the entry's.
				pointer := at
				if refusal.Pointer != "" {
					pointer = at + refusal.Pointer
				}
				panic(&Refusal{Reason: refusal.Reason, Pointer: pointer, Message: id + ": " + refusal.Message})
			}
		}()
		part = ViewChart{ID: id, Chart: check(spec, dataset)}
	}()
	return part
}

// coFailureOf recomputes the co-failure matrix from the rows of one counted
// chart: a subject fails a requirement when a row of that requirement names
// it, and cell (i, j) counts the subjects failing both. The rows of a day
// that did not run are not counted.
func coFailureOf(part ViewChart, subject string, window Window) *View {
	key := keyChannelOf(part.Chart)
	var requirements []interface{}
	type failure struct {
		order []int
		rows  map[int][]*Row
	}
	failures := map[string]*failure{}
	var failureOrder []string
	for gi := range part.Chart.Groups {
		g := &part.Chart.Groups[gi]
		if g.NotRun || g.Value == 0 {
			continue
		}
		requirement := g.Key[key]
		at := -1
		for i, r := range requirements {
			if r == requirement {
				at = i
				break
			}
		}
		if at < 0 {
			requirements = append(requirements, requirement)
			at = len(requirements) - 1
		}
		for _, row := range g.Rows {
			var who interface{}
			found := false
			if row.Header != nil {
				who, found = resolveField(row.Header, subject)
			}
			kind := jsTypeof(who, found)
			if !found || (kind != "string" && kind != "number") {
				refuse(ReasonViewChartShape, part.ID+": row seq "+strconv.FormatInt(row.Seq, 10)+" has no "+subject+" to name its subject", "")
			}
			id := kind + ":" + jsString(who)
			f := failures[id]
			if f == nil {
				f = &failure{rows: map[int][]*Row{}}
				failures[id] = f
				failureOrder = append(failureOrder, id)
			}
			if _, ok := f.rows[at]; !ok {
				f.order = append(f.order, at)
			}
			f.rows[at] = append(f.rows[at], row)
		}
	}
	// Sort the requirements as the checker sorts a domain, keeping each one's index.
	order := make([]int, len(requirements))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool { return compareScalar(requirements[order[a]], requirements[order[b]]) })
	rank := map[int]int{}
	sorted := make([]interface{}, len(order))
	for n, i := range order {
		rank[i] = n
		sorted[n] = requirements[i]
	}
	n := len(order)
	subjects := make([][]int, n)
	rows := make([][]map[int64]*Row, n)
	for a := range subjects {
		subjects[a] = make([]int, n)
		rows[a] = make([]map[int64]*Row, n)
		for b := range rows[a] {
			rows[a][b] = map[int64]*Row{}
		}
	}
	for _, id := range failureOrder {
		f := failures[id]
		mine := make([]int, len(f.order))
		for i, r := range f.order {
			mine[i] = rank[r]
		}
		for _, a := range mine {
			for _, b := range mine {
				subjects[a][b]++
				for _, row := range f.rows[order[a]] {
					rows[a][b][row.Seq] = row
				}
				for _, row := range f.rows[order[b]] {
					rows[a][b][row.Seq] = row
				}
			}
		}
	}
	cells := make([][]CoFailureCell, n)
	for a := range cells {
		cells[a] = make([]CoFailureCell, n)
		for b := range cells[a] {
			list := make([]*Row, 0, len(rows[a][b]))
			for _, row := range rows[a][b] {
				list = append(list, row)
			}
			sort.Slice(list, func(x, y int) bool { return list[x].Seq < list[y].Seq })
			cells[a][b] = CoFailureCell{Subjects: subjects[a][b], Rows: list}
		}
	}
	count := part
	return &View{
		Kind:         "co-failure",
		Window:       window,
		Unplaced:     unplacedOf([]ViewChart{part}),
		Count:        &count,
		Subject:      subject,
		Requirements: sorted,
		Failing:      len(failures),
		Cells:        cells,
	}
}

func checkView(value interface{}, dataset *Dataset) *View {
	m, ok := isObj(value)
	if !ok {
		refuse(ReasonViewUnsupportedMember, "a view must be an object", "")
	}
	seen := map[string]bool{}
	kind := m["view"]
	switch kind {
	case "calendar":
		viewOnlyKeys(m, []string{"view", "lanes"}, "")
		entries := viewList(m["lanes"], "/lanes", 1)
		lanes := make([]viewEntry, len(entries))
		for i, raw := range entries {
			lanes[i] = readViewEntry(raw, indexOf("/lanes", i), seen, "calendar")
		}
		checked := make([]ViewChart, len(lanes))
		for i, l := range lanes {
			part := viewCheckOne(l.id, l.spec, indexOf("/lanes", i)+"/chart", dataset)
			part.Role, part.Classes = l.role, l.classes
			checked[i] = part
		}
		roles := map[string]bool{}
		for i, lane := range checked {
			at := indexOf("/lanes", i)
			keyed := hasKeyBesidesX(lane.Chart) > 0
			if lane.Role == "" {
				continue
			}
			if roles[lane.Role] {
				refuse(ReasonViewLaneRole, lane.ID+": role "+lane.Role+" is on two lanes", at+"/role")
			}
			roles[lane.Role] = true
			if lane.Role == "activity" && keyed {
				refuse(ReasonViewLaneRole, lane.ID+": the activity lane counts per day and has no key channel", at+"/role")
			}
			if lane.Role == "judgment" && (!keyed || lane.Classes == nil) {
				refuse(ReasonViewLaneRole, lane.ID+": the judgment lane needs a key channel and classes for its values", at+"/role")
			}
			if lane.Role == "adjudication" && keyed && lane.Classes == nil {
				refuse(ReasonViewLaneRole, lane.ID+": a keyed adjudication lane needs classes for its values", at+"/role")
			}
		}
		for _, lane := range checked {
			checkFit(lane.ID, lane.Chart, func(n int) bool { return n <= 1 }, "at most one key channel")
		}
		checkClasses(checked)
		window := checkTogether(checked, false)
		if !wholeMonths(window) {
			refuse(ReasonViewWindowNotMonths, "a calendar's window runs from a month's first day to a month's last day; "+window.From+" to "+window.To+" does not", "")
		}
		return &View{Kind: "calendar", Window: window, Unplaced: unplacedOf(checked), Lanes: checked}
	case "timeline":
		viewOnlyKeys(m, []string{"view", "lanes"}, "")
		entries := viewList(m["lanes"], "/lanes", 1)
		lanes := make([]viewEntry, len(entries))
		for i, raw := range entries {
			lanes[i] = readViewEntry(raw, indexOf("/lanes", i), seen, "timeline")
		}
		checked := make([]ViewChart, len(lanes))
		for i, l := range lanes {
			part := viewCheckOne(l.id, l.spec, indexOf("/lanes", i)+"/chart", dataset)
			part.Mark, part.Classes = l.mark, l.classes
			if part.Mark == "" {
				part.Mark = "tick"
			}
			checked[i] = part
		}
		for _, lane := range checked {
			checkFit(lane.ID, lane.Chart, func(n int) bool { return n <= 1 }, "at most one key channel")
		}
		checkClasses(checked)
		window := checkTogether(checked, false)
		return &View{Kind: "timeline", Window: window, Unplaced: unplacedOf(checked), Lanes: checked}
	case "co-failure":
		viewOnlyKeys(m, []string{"view", "count", "subject"}, "")
		count := readViewEntry(m["count"], "/count", seen, "")
		part := viewCheckOne(count.id, count.spec, "/count/chart", dataset)
		checkFit(part.ID, part.Chart, func(n int) bool { return n == 1 }, "exactly one key channel, the requirement,")
		subject, isString := m["subject"].(string)
		if !isString || !fieldPath.MatchString(subject) {
			refuse(ReasonViewUnsupportedMember, "/subject must be a field path", "/subject")
		}
		window := checkTogether([]ViewChart{part}, false)
		return coFailureOf(part, subject, window)
	case "by-period":
		viewOnlyKeys(m, []string{"view", "count", "columns"}, "")
		count := readViewEntry(m["count"], "/count", seen, "")
		var columns []viewEntry
		if raw, present := m["columns"]; present {
			for i, c := range viewList(raw, "/columns", 0) {
				columns = append(columns, readViewEntry(c, indexOf("/columns", i), seen, ""))
			}
		}
		all := []ViewChart{viewCheckOne(count.id, count.spec, "/count/chart", dataset)}
		for i, e := range columns {
			all = append(all, viewCheckOne(e.id, e.spec, indexOf("/columns", i)+"/chart", dataset))
		}
		for _, part := range all {
			checkFit(part.ID, part.Chart, func(n int) bool { return n == 1 }, "exactly one key channel, the requirement,")
		}
		field := all[0].Chart.Channels[keyChannelOf(all[0].Chart)].Field
		for _, part := range all {
			mine := part.Chart.Channels[keyChannelOf(part.Chart)]
			if mine.Field != field {
				refuse(ReasonViewChartShape, part.ID+" groups by "+mine.Field+", not "+field, "")
			}
		}
		typeSet := map[string]bool{}
		for _, p := range all {
			key := keyChannelOf(p.Chart)
			for _, g := range p.Chart.Groups {
				v, present := g.Key[key]
				typeSet[jsTypeof(v, present)] = true
			}
		}
		if len(typeSet) > 1 {
			types := make([]string, 0, len(typeSet))
			for t := range typeSet {
				types = append(types, t)
			}
			sort.Strings(types)
			refuse(ReasonViewChartShape, "the charts' "+field+" values are of more than one type ("+strings.Join(types, ", ")+"), so a row would join unlike values", "")
		}
		window := checkTogether(all, true)
		first := all[0]
		return &View{Kind: "by-period", Window: window, Unplaced: unplacedOf(all), Count: &first, Columns: all[1:]}
	}
	refuse(ReasonViewUnsupportedMember, `view must be "calendar", "timeline", "co-failure" or "by-period"`, "/view")
	return nil
}
