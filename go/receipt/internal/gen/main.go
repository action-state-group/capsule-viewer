// SPDX-License-Identifier: Apache-2.0

// Command gen writes the receipt package's generated files (go generate in
// go/receipt): each module's script and manifest, from receipt_core.js, the
// hand-edited manifests, wording-en.json and the kit stylesheet.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/action-state-group/capsule-viewer/go/receipt/internal/writer"
)

func main() {
	dir, err := os.Getwd()
	if err != nil {
		fail(err)
	}
	out, err := writer.Outputs(writer.DefaultSources(dir))
	if err != nil {
		fail(err)
	}
	names := make([]string, 0, len(out))
	for name := range out {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if err := os.WriteFile(filepath.Join(dir, name), out[name], 0o644); err != nil {
			fail(err)
		}
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "receipt gen:", err)
	os.Exit(1)
}
