// SPDX-License-Identifier: Apache-2.0

package chartspec

import (
	"fmt"
	"regexp"
	"strconv"
	"time"
)

// The timestamp and calendar-day grammars are agent-action-capsule's
// utcDateOf and isCalendarDate (ts/src/result-root.ts, shipped in
// @action-state-group/agent-action-capsule 0.9.0 dist/result-root.js),
// which the TypeScript checker imports. The Go module (v0.14.0) has no
// exported equivalent, so they are copied here: RFC 3339 section 5.6 with a
// required offset (Z or ±hh:mm, T and Z in either case), a real date and
// time, no leap second, hour and offset hour at most 23, ASCII digits only,
// and a UTC date in years 0001-9999.
var (
	calendarDate  = regexp.MustCompile(`\A([0-9]{4})-([0-9]{2})-([0-9]{2})\z`)
	rfc3339Offset = regexp.MustCompile(`\A([0-9]{4})-([0-9]{2})-([0-9]{2})[Tt]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]+)?(?:[Zz]|([+-])([0-9]{2}):([0-9]{2}))\z`)
)

// monthDays is the days in a month of the proleptic Gregorian calendar.
func monthDays(year, month int) int {
	switch month {
	case 2:
		if (year%4 == 0 && year%100 != 0) || year%400 == 0 {
			return 29
		}
		return 28
	case 4, 6, 9, 11:
		return 30
	}
	return 31
}

func realDate(year, month, day int) bool {
	return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays(year, month)
}

func dayText(year, month, day int) string {
	return fmt.Sprintf("%04d-%02d-%02d", year, month, day)
}

func atoi(groups []string) []int {
	out := make([]int, len(groups))
	for i, g := range groups {
		out[i], _ = strconv.Atoi(g) // the grammar admits only ASCII digits
	}
	return out
}

// isCalendarDate is YYYY-MM-DD naming a real date from year 0001.
func isCalendarDate(value interface{}) bool {
	s, ok := value.(string)
	if !ok {
		return false
	}
	m := calendarDate.FindStringSubmatch(s)
	if m == nil {
		return false
	}
	n := atoi(m[1:4])
	return realDate(n[0], n[1], n[2])
}

// utcDateOf is the UTC calendar date of an RFC 3339 date-time with an
// offset, as YYYY-MM-DD; false when it is not one.
func utcDateOf(value interface{}) (string, bool) {
	s, ok := value.(string)
	if !ok {
		return "", false
	}
	m := rfc3339Offset.FindStringSubmatch(s)
	if m == nil {
		return "", false
	}
	n := atoi(m[1:7])
	year, month, day, hours, minutes, seconds := n[0], n[1], n[2], n[3], n[4], n[5]
	offsetHours, offsetMinutes := 0, 0
	if m[7] != "" {
		o := atoi(m[8:10])
		offsetHours, offsetMinutes = o[0], o[1]
	}
	if !realDate(year, month, day) || hours > 23 || minutes > 59 || seconds > 59 ||
		offsetHours > 23 || offsetMinutes > 59 {
		return "", false
	}
	offset := time.Duration(offsetHours*60+offsetMinutes) * time.Minute
	if m[7] == "-" {
		offset = -offset
	}
	utc := time.Date(year, time.Month(month), day, hours, minutes, seconds, 0, time.UTC).Add(-offset)
	if utc.Year() < 1 || utc.Year() > 9999 {
		return "", false
	}
	return dayText(utc.Year(), int(utc.Month()), utc.Day()), true
}

// unitOf is the unit a UTC day falls in, named by its first day.
func unitOf(day, unit string) string {
	if unit == "utcyearmonth" {
		return day[:8] + "01"
	}
	return day
}

func parseDay(day string) (int, int, int) {
	n := atoi(calendarDate.FindStringSubmatch(day)[1:4])
	return n[0], n[1], n[2]
}

// unitsOf lists every unit of the window, in order, and refuses a window the
// units don't tile. TypeScript walks days by comparing YYYY-MM-DD strings,
// which never ends for a window ending 9999-12-31 (the next day is
// "10000-01-01", which sorts before it); this walk compares dates and ends.
func unitsOf(window *Window, unit string) []string {
	ty, tm, td := parseDay(window.To)
	if unit == "utcyearmonth" {
		if window.From[8:] != "01" || td != monthDays(ty, tm) {
			refuse(ReasonWindowMismatch, fmt.Sprintf("a utcyearmonth chart's window runs from a month's first day to a month's last day; %s to %s does not", window.From, window.To), "/usermeta/capsule/window")
		}
	}
	var out []string
	y, m, d := parseDay(window.From)
	for y < ty || (y == ty && (m < tm || (m == tm && d <= td))) {
		u := unitOf(dayText(y, m, d), unit)
		if len(out) == 0 || out[len(out)-1] != u {
			out = append(out, u)
		}
		if d == monthDays(y, m) {
			d = 1
			if m == 12 {
				m, y = 1, y+1
			} else {
				m++
			}
		} else {
			d++
		}
	}
	return out
}
