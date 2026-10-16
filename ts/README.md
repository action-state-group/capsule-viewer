# @action-state-group/capsule-viewer

capsule-viewer's page emitter and presentation builder: they turn an
[Agent Action Capsule](https://github.com/action-state-group/agent-action-capsule)
Evidence Bundle into a self-contained HTML page under AAC's presentation
contract (`spec/presentation-contract-v0.md`). The Go twin,
`github.com/action-state-group/capsule-viewer/go/emitter`, emits the same
bytes; both are held to shared goldens in `go/emitter/testdata`.

```ts
import {
  buildPresentation,
  emitEvidenceGraphHtml,
} from "@action-state-group/capsule-viewer";
```

The browser condition of the same specifier exports the in-browser renderer
(`renderEvidenceGraph`). `dist/evidence-graph.iife.js` is that renderer
bundled for a page's core runtime slot. Bundle verification comes from
`@action-state-group/agent-action-capsule`.

The code moved here from agent-action-capsule (agent-action-capsule#281) and
keeps its BSD-3-Clause license (`LICENSE-BSD-3-Clause`); the rest of the
package is Apache-2.0 (`LICENSE`).

Releases follow [RELEASING.md](https://github.com/action-state-group/capsule-viewer/blob/main/RELEASING.md).
