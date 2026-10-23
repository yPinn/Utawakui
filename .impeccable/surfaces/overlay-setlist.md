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

OWN-WORLD: near-white material, charcoal print, shallow roll lip and serrated tail; compact monospaced Latin headings, readable CJK song titles. Short titles use one line; long titles grow to at most two, with an artist line directly below.

MATERIAL: user-approved faint matte micrograin uses receipt-grain.png at0.32 multiply opacity, masked by the unchanged receipt-paper.png alpha. One nonrepeating layer sits beneath live text; the layer strength matches the approved480px/270px study.

TYPE: centered SETLIST22/30 weight600 with0.04em tracking; left NOW PLAYING16/22. Current26/34 weight600, history20/26 weight400, artist18/22. No playlist name or count line. Right-aligned ordinals share the first title baseline; continuation and artist text keep the title's left edge. Verify at480×810 and270×456; fonts remain the existing local stacks.

STORY: SETLIST identifies the list, NOW PLAYING identifies the current item. Completion feeds one item; source identity/count remain internal. Periodic review continuously scrolls the existing list in a fixed viewport, holds1 second, then smoothly reverses to latest. No page swap or viewport resize precedes animation.

HANDOFF: current title and artist fade out160ms, commit the latest pending frame only while faded, then fade in260ms. Reuse the existing setlist current controller in fade-only mode; label/paper stay fixed. Recovery/inactive settle, reduced motion uses120/180ms, and clock-only updates do not replay the fade.

FIRST VIEWPORT: 480×810 paper; compact SETLIST header stays beyond the roll-shadow safe area. Downward default places NOW PLAYING above descending history; upward option places it below ascending history. Latest position fits measured whole rows; moving review can cross row boundaries naturally. Review defaults to15 seconds, adjustable5–60 in5-second steps; each continuous pass lasts0.8–6 seconds based on distance, with the next interval starting after return completes.

FORM: user-pinned receipt/feed direction, no random seed; reference receipt-typography-v7.png plus explicit v8 behavior.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Approved intent: user explicitly authorized template implementation; v7 is a visual direction, not literal text metrics. Prior rejected slot-study is not authority. Existing DESIGN.md remains the renderer authority; this is a feature extension with independent overlay tokens.
