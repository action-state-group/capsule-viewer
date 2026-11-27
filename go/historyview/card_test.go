// SPDX-License-Identifier: Apache-2.0

package historyview

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The card page's helpers, held to what the TypeScript twin's JavaScript
// built-ins give (ts/src/history-view.ts, the card page section).

func TestEncodeURIComponentIsJavaScripts(t *testing.T) {
	// encodeURIComponent(`A-z_0.9!~*'() {"a":"é&🦭"}/?#+=`) in Node.
	assert.Equal(t,
		"A-z_0.9!~*'()%20%7B%22a%22%3A%22%C3%A9%26%F0%9F%A6%AD%22%7D%2F%3F%23%2B%3D",
		encodeURIComponent(`A-z_0.9!~*'() {"a":"é&🦭"}/?#+=`))
	assert.Empty(t, encodeURIComponent(""))
}

func TestGroupedAndAmountText(t *testing.T) {
	for in, want := range map[string]string{"0": "0", "12": "12", "123": "123", "1234": "1,234", "1234567": "1,234,567"} {
		assert.Equal(t, want, grouped(in), in)
	}
	for _, c := range []struct {
		a    amount
		want string
	}{
		{amount{"0", "BTC", 8}, "0 sat"},
		{amount{"1", "BTC", 11}, "1 msat"},
		{amount{"999", "BTC", 11}, "999 msat"},
		{amount{"1000", "BTC", 11}, "1 sat"},
		{amount{"7", "eip155:1/slip44:60", 18}, "0.000000000000000007 eip155:1/slip44:60"},
		{amount{"1500", "BTC", 11}, "1,500 msat"},
		{amount{"21000", "BTC", 8}, "21,000 sat"},
		{amount{"5", "BTC", 12}, "0.000000000005 BTC"},
		{amount{"1000", "USD", 0}, "1,000 USD"},
		{amount{"5", "USD", 2}, "0.05 USD"},
		{amount{"123456", "EUR", 2}, "1,234.56 EUR"},
	} {
		assert.Equal(t, c.want, amountText(&c.a), "%+v", c.a)
	}
}

func TestISOStringIsJavaScripts(t *testing.T) {
	at := parseInstant("2026-11-27T03:12:09.5-01:30")
	require.NotNil(t, at)
	// parseInstant keeps whole seconds, as the TS view's Date.UTC does.
	assert.Equal(t, "2026-11-27T04:42:09.000Z", isoString(at))
	assert.Equal(t, "1970-01-01T00:00:00.000Z", isoString(epoch))
}

func TestShortID(t *testing.T) {
	assert.Equal(t, "0123456789abcdef", shortID("0123456789abcdef"))
	assert.Equal(t, "01234567…ghij", shortID("0123456789abcdefghij"))
}

// Attribute values may hold caller-derived text, written with & escaped;
// the characters whose serialization differs between engines are refused.
func TestAttributes(t *testing.T) {
	var b strings.Builder
	serialize(&b, el("a", attrs("href", "x?a=1&b=2", "data-x", "it's")))
	assert.Equal(t, `<a href="x?a=1&amp;b=2" data-x="it's"></a>`, b.String())
	for _, bad := range [][2]string{{"data-x", `"`}, {"data-x", "<"}, {"data-x", ">"}, {"data-x", " "}, {"1x", "v"}, {"on click", "v"}} {
		assert.Panics(t, func() { el("a", attrs(bad[0], bad[1])) }, "%q", bad)
	}
}

func cardYours(t *testing.T) map[string]any {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal(cases(t)["card-yours"], &m))
	return m
}

func firstDeal(m map[string]any) map[string]any {
	for _, v := range m["deals"].(map[string]any) {
		return v.(map[string]any)
	}
	return nil
}

func TestCardItemWithMarkupIsText(t *testing.T) {
	m := cardYours(t)
	firstDeal(m)["item"] = `"><script>alert(1)</script> & <b>`
	html, err := Render(m, nil)
	require.NoError(t, err)
	assert.NotContains(t, html, "<script>")
	assert.Contains(t, html, `"&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;`)
}

func TestCardTimeCannotCarryMarkupIntoAnAttribute(t *testing.T) {
	m := cardYours(t)
	firstDeal(m)["recorded"] = map[string]any{"state": "passed", "at": `2026-11-27T03:12:00Z"><x`}
	_, err := Render(m, nil)
	var refused *Refused
	require.ErrorAs(t, err, &refused)
}

func TestCardTextChangedAfterVerifyIsRefused(t *testing.T) {
	m := cardYours(t)
	mo := m["machine"].(map[string]any)
	mo["text"] = mo["text"].(string) + " "
	assert.Equal(t, []string{
		"input.machine.text: is not the bundle capsulectl verify answered for (its SHA-256 is not the bundle_digest)",
	}, reasons(t, m, nil))
}

func TestCardTextNotJSON(t *testing.T) {
	// Without an object no deal id is known, so input.deals would be refused
	// too, as in the TypeScript view; this case leaves it out.
	m := cardYours(t)
	delete(m, "deals")
	mo := m["machine"].(map[string]any)
	mo["text"] = "{"
	mo["verify"].(map[string]any)["bundle_digest"] = sha256Hex("{")
	assert.Equal(t, []string{"input.machine.text: is not JSON"}, reasons(t, m, nil))
}

// withText swaps the card's object text for edit's version of it, with the
// bundle digest that matches, so only the edit is refused.
func withText(t *testing.T, m map[string]any, edit func(doc map[string]any)) {
	t.Helper()
	mo := m["machine"].(map[string]any)
	var doc map[string]any
	require.NoError(t, json.Unmarshal([]byte(mo["text"].(string)), &doc))
	edit(doc)
	raw, err := json.Marshal(doc)
	require.NoError(t, err)
	mo["text"] = string(raw)
	mo["verify"].(map[string]any)["bundle_digest"] = sha256Hex(string(raw))
}

func TestCardOutcomesWithAnUnknownMemberAreRefused(t *testing.T) {
	m := cardYours(t)
	delete(m, "deals")
	withText(t, m, func(doc map[string]any) {
		cid := doc["records"].([]any)[0].(map[string]any)["capsule_id"].(string)
		card := doc["disclosures"].(map[string]any)[cid].(map[string]any)["agent_input"].(map[string]any)
		card["outcomes"].(map[string]any)["settled"] = 0
	})
	assert.Equal(t, []string{"input.machine.text: its card's outcomes carry a member SH §4 does not have"}, reasons(t, m, nil))
}

func TestCardAmountCodes(t *testing.T) {
	for code, ok := range map[string]bool{
		"USD": true, "eip155:1/slip44:60": true, "BTCX": false, "usd": false, "": false,
	} {
		m := cardYours(t)
		firstDeal(m)["amount"] = map[string]any{"value": "1", "assetCode": code, "assetScale": 255}
		_, err := Render(m, nil)
		if ok {
			assert.NoError(t, err, code)
			continue
		}
		var refused *Refused
		require.ErrorAs(t, err, &refused, code)
		assert.Contains(t, refused.Reasons[0], "is not an amount (an integer value, an ISO 4217 or CAIP-19 assetCode, assetScale 0 to 255)")
	}
}

// The signed panel's note follows capsulectl verify's producer_signatures
// check, and a failed witnesses check makes the proof lede say failed.
func TestCardSignedNoteAndLedeFollowTheChecks(t *testing.T) {
	for status, key := range map[string]string{"pass": "card.signed.note", "fail": "card.signed.failed", "withheld": "card.signed.unchecked"} {
		m := cardYours(t)
		m["machine"].(map[string]any)["verify"].(map[string]any)["checks"].(map[string]any)["producer_signatures"] = status
		html, err := Render(m, nil)
		require.NoError(t, err)
		assert.Contains(t, html, `data-signature="`+status+`">`+textEscaper.Replace(base[key])+`</p>`, status)
	}
	m := cardYours(t)
	v := m["machine"].(map[string]any)["verify"].(map[string]any)
	v["checks"].(map[string]any)["witnesses"] = "fail"
	delete(v, "witness")
	html, err := Render(m, nil)
	require.NoError(t, err)
	assert.Contains(t, html, `data-proof="failed"`)
}

// A passed slot that covers only part of the deal's steps is drawn partial,
// not filled, on every stamp.
func TestCardPartialSlots(t *testing.T) {
	m := cardYours(t)
	through := map[string]any{"k": 1, "n": 2}
	d := firstDeal(m)
	d["time_stamped"] = map[string]any{"state": "passed", "by": "W", "at": "2026-11-27T03:13:00Z", "through": through}
	d["countersigned"] = map[string]any{"state": "passed", "by": "C", "at": "2026-11-27T03:14:00Z", "through": through}
	html, err := Render(m, nil)
	require.NoError(t, err)
	assert.Equal(t, 3, strings.Count(html, `data-filled="no" data-state="partial"`))
}
