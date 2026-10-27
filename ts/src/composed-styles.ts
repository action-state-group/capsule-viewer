// SPDX-License-Identifier: BSD-3-Clause
/**
 * The composition section's own stylesheet, inserted as the first child of
 * its `<section>` (composed-view.ts). Member, observer and pair cells carry
 * unbroken 64-hex ids, which made the ten-column members table wider than
 * the page at 1280px and in print (capsule-viewer#57). A value cell may
 * break anywhere, so a table's narrowest width no longer includes a whole
 * id; the full value is still the cell's text. On screen each table also
 * sits in a container that scrolls sideways rather than widening the page;
 * in print it does not scroll, so nothing is clipped. Every selector is
 * scoped to the section.
 */
export const COMPOSED_CSS = `
[data-section=composition] .cv-composed-table{max-width:100%}
@media screen{[data-section=composition] .cv-composed-table{overflow-x:auto}}
[data-section=composition] table{font-size:.875em}
[data-section=composition] :is(th,td){text-align:left;vertical-align:top}
[data-section=composition] :is(td,dd){overflow-wrap:anywhere}
`;
