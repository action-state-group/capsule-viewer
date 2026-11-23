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
		"not JSON":        {"d1": "this is not json"},
		"empty deal id":   {"": `{}`},
		"deal id with ::": {"d1::req": `{}`},
		"__proto__":       {"__proto__": `{}`},
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
		"bad id":        {Audience: "*", ReceiptsWithheld: []string{"d1::req"}},
		"__proto__":     {Audience: "*", ReceiptsWithheld: []string{"__proto__"}},
		"empty deal id": {Audience: "*", ReceiptsWithheld: []string{""}},
	} {
		_, err := BuildOfflineHTML(bundle, []byte(marker), o)
		require.Error(t, err, name)
	}
}
