// SPDX-License-Identifier: Apache-2.0

package historyview

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

// object is a decoded JSON object that keeps its members' first-seen order,
// so the reasons a refusal lists come in the same order as the TypeScript
// view's, which walks Object.keys.
type object struct {
	keys []string
	m    map[string]any
}

func (o *object) has(k string) bool { _, ok := o.m[k]; return ok }
func (o *object) get(k string) any  { return o.m[k] }

// decodeJSON reads one JSON value into nil, bool, string, json.Number,
// []any and *object. A repeated member keeps its first position and its last
// value, as JSON.parse does.
func decodeJSON(raw []byte) (any, error) {
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber()
	v, err := decodeValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errors.New("unexpected data after the value")
	}
	return v, nil
}

func decodeValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	d, isDelim := tok.(json.Delim)
	if !isDelim {
		return tok, nil
	}
	switch d {
	case '{':
		o := &object{m: map[string]any{}}
		for dec.More() {
			kt, err := dec.Token()
			if err != nil {
				return nil, err
			}
			k, _ := kt.(string)
			v, err := decodeValue(dec)
			if err != nil {
				return nil, err
			}
			if _, seen := o.m[k]; !seen {
				o.keys = append(o.keys, k)
			}
			o.m[k] = v
		}
		if _, err := dec.Token(); err != nil {
			return nil, err
		}
		o.keys = jsKeyOrder(o.keys)
		return o, nil
	case '[':
		list := []any{}
		for dec.More() {
			v, err := decodeValue(dec)
			if err != nil {
				return nil, err
			}
			list = append(list, v)
		}
		if _, err := dec.Token(); err != nil {
			return nil, err
		}
		return list, nil
	}
	return nil, fmt.Errorf("unexpected %v", d)
}

// jsKeyOrder is Object.keys order: keys that are array indexes (canonical
// decimal, below 2^32-1) first in numeric order, then the rest as written.
func jsKeyOrder(keys []string) []string {
	var idx, rest []string
	for _, k := range keys {
		if n, err := strconv.ParseUint(k, 10, 32); err == nil && n < 4294967295 && strconv.FormatUint(n, 10) == k {
			idx = append(idx, k)
		} else {
			rest = append(rest, k)
		}
	}
	sort.Slice(idx, func(i, j int) bool {
		a, _ := strconv.ParseUint(idx[i], 10, 32)
		b, _ := strconv.ParseUint(idx[j], 10, 32)
		return a < b
	})
	return append(idx, rest...)
}

// toValue turns a caller's argument into a decoded value. json.RawMessage and
// []byte are JSON text; anything else is encoded with encoding/json first.
func toValue(v any) (any, error) {
	switch t := v.(type) {
	case json.RawMessage:
		return decodeJSON(t)
	case []byte:
		return decodeJSON(t)
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return decodeJSON(raw)
}

// reader collects every reason an input is refused.
type reader struct{ reasons []string }

func (r *reader) refuse(path, why string) { r.reasons = append(r.reasons, path+": "+why) }

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func (r *reader) object(v any, path string, allowed, required []string) *object {
	o, ok := v.(*object)
	if !ok {
		r.refuse(path, "is not an object")
		return nil
	}
	for _, k := range o.keys {
		if !contains(allowed, k) {
			r.refuse(path+"."+k, "is not a member of history-view/v0")
		}
	}
	for _, k := range required {
		if !o.has(k) {
			r.refuse(path+"."+k, "is missing")
		}
	}
	return o
}

// utf16Len is JavaScript's String.length, which the contract's limits use.
func utf16Len(s string) int { return len(utf16.Encode([]rune(s))) }

func (r *reader) str(v any, path string, max int) (string, bool) {
	s, ok := v.(string)
	if !ok || s == "" || utf16Len(s) > max {
		r.refuse(path, fmt.Sprintf("is not a string of 1 to %d characters", max))
		return "", false
	}
	return s, true
}

func (r *reader) oneOf(v any, path string, values []string) (string, bool) {
	s, ok := v.(string)
	if !ok || !contains(values, s) {
		r.refuse(path, "is not one of "+strings.Join(values, ", "))
		return "", false
	}
	return s, true
}

func (r *reader) boolean(v any, path string) (bool, bool) {
	b, ok := v.(bool)
	if !ok {
		r.refuse(path, "is not true or false")
		return false, false
	}
	return b, true
}

func (r *reader) count(v any, path string) (int64, bool) {
	if n, ok := v.(json.Number); ok {
		f, err := strconv.ParseFloat(string(n), 64)
		if err == nil && !math.IsInf(f, 0) && f == math.Floor(f) && f >= 0 && f <= 9007199254740991 {
			return int64(f), true
		}
	}
	r.refuse(path, "is not a whole number of 0 or more")
	return 0, false
}

// instant is a parsed time: milliseconds since the epoch.
type instant struct {
	ms int64
}

var instantRE = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?([Zz]|[+-]\d{2}:\d{2})$`)
var dateRE = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func parseInstant(s string) *instant {
	m := instantRE.FindStringSubmatch(s)
	if m == nil {
		return nil
	}
	n := func(i int) int { v, _ := strconv.Atoi(m[i]); return v }
	year, month, day, hour, minute, sec := n(1), n(2), n(3), n(4), n(5), n(6)
	if month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || sec > 59 {
		return nil
	}
	// Date.UTC reads a year of 0 to 99 as 1900 to 1999.
	if year <= 99 {
		year += 1900
	}
	t := time.Date(year, time.Month(month), day, hour, minute, sec, 0, time.UTC)
	if t.Day() != day {
		return nil
	}
	ms := t.UnixMilli()
	if zone := m[8]; zone != "Z" && zone != "z" {
		sign := int64(1)
		if zone[0] == '-' {
			sign = -1
		}
		zh, _ := strconv.Atoi(zone[1:3])
		zm, _ := strconv.Atoi(zone[4:6])
		ms -= sign * int64(zh*60+zm) * 60000
	}
	return &instant{ms: ms}
}

func (r *reader) time(v any, path string) *instant {
	s, ok := r.str(v, path, 64)
	if !ok {
		return nil
	}
	t := parseInstant(s)
	if t == nil {
		r.refuse(path, "is not an RFC 3339 time")
	}
	return t
}

func (r *reader) date(v any, path string) *instant {
	s, ok := r.str(v, path, 64)
	if !ok {
		return nil
	}
	var t *instant
	if dateRE.MatchString(s) {
		t = parseInstant(s + "T00:00:00Z")
	} else {
		t = parseInstant(s)
	}
	if t == nil {
		r.refuse(path, "is not a date (YYYY-MM-DD) or an RFC 3339 time")
	}
	return t
}

var months = [...]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

func (t *instant) utc() time.Time { return time.UnixMilli(t.ms).UTC() }

func dateOf(t *instant) string {
	u := t.utc()
	return fmt.Sprintf("%s %d, %d", months[u.Month()-1], u.Day(), u.Year())
}

func minuteOf(t *instant) string {
	u := t.utc()
	return fmt.Sprintf("%s, %02d:%02d UTC", dateOf(t), u.Hour(), u.Minute())
}

func shortMinuteOf(t *instant) string {
	u := t.utc()
	return fmt.Sprintf("%s %d, %02d:%02d UTC", months[u.Month()-1], u.Day(), u.Hour(), u.Minute())
}
