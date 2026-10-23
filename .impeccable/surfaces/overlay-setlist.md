---
version: 1
slug: 'overlay-setlist'
primary_target: 'overlay/setlist'
related_targets: ['src/components/output/previews/ReceiptSetlistPreview.vue']
---

# Receipt setlist

Scope: independent public OBS setlist template in overlay/setlist, with matching Gallery and Workbench preview. Experience/Read surface; viewers need current and recent singing items at a glance.

## Direction contract

THESIS: a continuous thermal receipt prints each completed item into a bounded history window, with stable live text and complete semantic labels.

OWN-WORLD: near-white material, charcoal print, shallow roll lip and serrated tail; compact monospaced Latin headings, readable CJK song titles, fixed two-line title plus artist slots.

STORY: SETLIST identifies the list, NOW PLAYING identifies the current item, completed count remains separate from the bounded history. Completion feeds one item; periodic review revisits old available items.

FIRST VIEWPORT: 480×810 paper; SETLIST and source/count header remain at top. Downward default places NOW PLAYING above descending history; upward option places it below ascending history. Both reserve real two-line titles and retain five slots when typography permits.

FORM: user-pinned receipt/feed direction, no random seed; reference receipt-typography-v7.png plus explicit v8 behavior.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Approved intent: user explicitly authorized template implementation; v7 is a visual direction, not literal text metrics. Prior rejected slot-study is not authority. Existing DESIGN.md remains the renderer authority; this is a feature extension with independent overlay tokens.
