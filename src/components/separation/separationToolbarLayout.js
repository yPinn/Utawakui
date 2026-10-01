const VIEWPORT_INLINE_LIMIT =
  'calc(100vw - (2 * var(--ui-floating-viewport-inset)))';
const VIEWPORT_BLOCK_LIMIT =
  'calc(100vh - (2 * var(--ui-floating-viewport-inset)))';

const PANEL_GEOMETRY = Object.freeze({
  compact: Object.freeze({
    minInlineSize: `min(17rem, ${VIEWPORT_INLINE_LIMIT})`,
    inlineSize: 'clamp(17rem, 26vw, 20rem)',
    maxInlineSize: `min(20rem, ${VIEWPORT_INLINE_LIMIT})`,
    minBlockSize: `min(14rem, ${VIEWPORT_BLOCK_LIMIT})`,
    blockSize: 'clamp(14rem, 46vh, 21rem)',
    maxBlockSize: `min(21rem, ${VIEWPORT_BLOCK_LIMIT})`,
  }),
  standard: Object.freeze({
    minInlineSize: `min(20rem, ${VIEWPORT_INLINE_LIMIT})`,
    inlineSize: 'clamp(20rem, 28vw, 24rem)',
    maxInlineSize: `min(24rem, ${VIEWPORT_INLINE_LIMIT})`,
    minBlockSize: `min(18rem, ${VIEWPORT_BLOCK_LIMIT})`,
    blockSize: 'clamp(18rem, 60vh, 32rem)',
    maxBlockSize: `min(32rem, ${VIEWPORT_BLOCK_LIMIT})`,
  }),
});

export function separationToolbarPanelStyle(density) {
  return PANEL_GEOMETRY[density] ?? PANEL_GEOMETRY.compact;
}
