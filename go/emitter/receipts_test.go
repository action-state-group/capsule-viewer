package emitter

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// capsule-viewer#228: the deal receipts a report page carries reach the page's
// bootstrap as the `receipts` option, each as the text it was given, and a
// page without them is the page it was before.
func TestBuildOfflineHTMLCarriesReceiptsAsGivenText(t *testing.T) {
	bundle := chartBundle(t)
	receipt := `{"bundle_kind":"evidence-bundle/v2","note":"</script><b>"}`
	got, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Receipts: map[string]string{"d1": receipt}})
	require.NoError(t, err)
	// The text is one JSON string in the options: its quotes are escaped, its
	// content is the bytes given, and "</script" is escaped so it cannot end the element.
	require.Contains(t, got, `"receipts":{"d1":"{\"bundle_kind\":\"evidence-bundle/v2\",\"note\":\"`+"\\u003c/script\\u003e\\u003cb\\u003e")
	require.NotContains(t, got, `</script><b>`)

	embedded, err := BuildEmbeddedHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Receipts: map[string]string{"d1": receipt}})
	require.NoError(t, err)
	require.Contains(t, embedded.HTML, `"receipts":{"d1":`)

	// An empty, non-nil map still says the page is a deal report.
	empty, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Receipts: map[string]string{}})
	require.NoError(t, err)
	require.Contains(t, empty, `"receipts":{}`)

	// None: the default page, as before.
	plain, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*"})
	require.NoError(t, err)
	require.NotContains(t, plain, `"receipts"`)
	require.Contains(t, plain, DefaultBootstrap)
}

func TestBuildOfflineHTMLRefusesAReceiptItCannotCarry(t *testing.T) {
	bundle := chartBundle(t)
	for name, receipts := range map[string]map[string]string{
		"not JSON":      {"d1": "this is not json"},
		"empty deal id": {"": `{}`},
		"__proto__":     {"__proto__": `{}`},
	} {
		_, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Receipts: receipts})
		require.Error(t, err, name)
		_, err = BuildEmbeddedHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", Receipts: receipts})
		require.Error(t, err, name)
	}
}

func TestBuildOfflineHTMLCarriesAWithheldReceiptAsNull(t *testing.T) {
	bundle := chartBundle(t)
	got, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{
		Audience:         "*",
		Receipts:         map[string]string{"d1": `{}`},
		ReceiptsWithheld: []string{"d2"},
	})
	require.NoError(t, err)
	require.Contains(t, got, `"receipts":{"d1":"{}","d2":null}`)

	// Withheld alone still marks the page as a deal report.
	only, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", ReceiptsWithheld: []string{"d2"}})
	require.NoError(t, err)
	require.Contains(t, only, `"receipts":{"d2":null}`)

	// A deal is carried or withheld, not both; a withheld id is checked like a carried one.
	for name, o := range map[string]OfflineOptions{
		"both":          {Audience: "*", Receipts: map[string]string{"d1": `{}`}, ReceiptsWithheld: []string{"d1"}},
		"__proto__":     {Audience: "*", ReceiptsWithheld: []string{"__proto__"}},
		"empty deal id": {Audience: "*", ReceiptsWithheld: []string{""}},
	} {
		_, err := BuildOfflineHTML(bundle, []byte(marker), o)
		require.Error(t, err, name)
	}
}

func TestBuildOfflineHTMLCarriesANotClosedReceiptAsAStateObject(t *testing.T) {
	bundle := chartBundle(t)
	got, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{
		Audience:          "*",
		Receipts:          map[string]string{"d1": `{}`},
		ReceiptsWithheld:  []string{"d2"},
		ReceiptsNotClosed: []string{"d3"},
	})
	require.NoError(t, err)
	require.Contains(t, got, `"receipts":{"d1":"{}","d2":null,"d3":{"state":"not-closed"}}`)

	// Not closed alone still marks the page as a deal report.
	only, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", ReceiptsNotClosed: []string{"d3"}})
	require.NoError(t, err)
	require.Contains(t, only, `"receipts":{"d3":{"state":"not-closed"}}`)

	// A deal is in one set, once; a not-closed id is checked like the others.
	for name, o := range map[string]OfflineOptions{
		"carried too":    {Audience: "*", Receipts: map[string]string{"d1": `{}`}, ReceiptsNotClosed: []string{"d1"}},
		"withheld too":   {Audience: "*", ReceiptsWithheld: []string{"d1"}, ReceiptsNotClosed: []string{"d1"}},
		"twice":          {Audience: "*", ReceiptsNotClosed: []string{"d1", "d1"}},
		"withheld twice": {Audience: "*", ReceiptsWithheld: []string{"d1", "d1"}},
		"__proto__":      {Audience: "*", ReceiptsNotClosed: []string{"__proto__"}},
		"empty deal id":  {Audience: "*", ReceiptsNotClosed: []string{""}},
	} {
		_, err := BuildOfflineHTML(bundle, []byte(marker), o)
		require.Error(t, err, name)
		_, err = BuildEmbeddedHTML(bundle, []byte(marker), o)
		require.Error(t, err, name)
	}
}

// evidencebook#116: a deal is its claims' subject id, which may contain "::",
// so the page carries it as given in each of the three entries.
func TestBuildOfflineHTMLCarriesADealIDWithColons(t *testing.T) {
	bundle := chartBundle(t)
	got, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{
		Audience:          "*",
		Receipts:          map[string]string{"deal::1": `{}`},
		ReceiptsWithheld:  []string{"deal::2"},
		ReceiptsNotClosed: []string{"deal::3"},
	})
	require.NoError(t, err)
	require.Contains(t, got, `"receipts":{"deal::1":"{}","deal::2":null,"deal::3":{"state":"not-closed"}}`)
}

// evidencebook#116: the builder files each claim under its deal; the page
// reads receiptDeals in place of the claim id's prefix.
func TestBuildOfflineHTMLCarriesReceiptDeals(t *testing.T) {
	bundle := chartBundle(t)
	o := OfflineOptions{Audience: "*", ReceiptsWithheld: []string{"deal::1"}, ReceiptDeals: map[string]string{"conv-1::paid": "deal::1"}}
	got, err := BuildOfflineHTML(bundle, []byte(marker), o)
	require.NoError(t, err)
	require.Contains(t, got, `"receiptDeals":{"conv-1::paid":"deal::1"}`)
	embedded, err := BuildEmbeddedHTML(bundle, []byte(marker), o)
	require.NoError(t, err)
	require.Contains(t, embedded.HTML, `"receiptDeals":{"conv-1::paid":"deal::1"}`)

	plain, err := BuildOfflineHTML(bundle, []byte(marker), OfflineOptions{Audience: "*", ReceiptsWithheld: []string{"d1"}})
	require.NoError(t, err)
	require.NotContains(t, plain, `receiptDeals`, "no deals given: the page reads the prefix, as before")

	for name, o := range map[string]OfflineOptions{
		"no receipts":       {Audience: "*", ReceiptDeals: map[string]string{"c": "d"}},
		"empty claim id":    {Audience: "*", ReceiptsWithheld: []string{"d"}, ReceiptDeals: map[string]string{"": "d"}},
		"__proto__ claim":   {Audience: "*", ReceiptsWithheld: []string{"d"}, ReceiptDeals: map[string]string{"__proto__": "d"}},
		"empty deal id":     {Audience: "*", ReceiptsWithheld: []string{"d"}, ReceiptDeals: map[string]string{"c": ""}},
		"__proto__ deal id": {Audience: "*", ReceiptsWithheld: []string{"d"}, ReceiptDeals: map[string]string{"c": "__proto__"}},
	} {
		_, err := BuildOfflineHTML(bundle, []byte(marker), o)
		require.Error(t, err, name)
		_, err = BuildEmbeddedHTML(bundle, []byte(marker), o)
		require.Error(t, err, name)
	}
}
