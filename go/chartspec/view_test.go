// SPDX-License-Identifier: Apache-2.0

package chartspec

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestViewEntriesAreRefused: a calendar, timeline, co-failure or by-period entry
// (docs/design/report-views.md section 4) is not a chart spec, so this
// package refuses it as an unsupported member. A Go-built page given one in
// `charts` therefore stops at build time and can never draw a view unchecked;
// the Go twin of the view checks is a follow-up.
func TestViewEntriesAreRefused(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "ts", "test", "testdata", "views", "views.json"))
	require.NoError(t, err)
	var views []interface{}
	require.NoError(t, json.Unmarshal(raw, &views))
	require.Len(t, views, 5)
	for _, view := range views {
		_, err := Check(view, nil)
		var refusal *Refusal
		require.True(t, errors.As(err, &refusal), "%v", err)
		assert.Equal(t, "chart-unsupported-member", refusal.Reason)
	}
}
