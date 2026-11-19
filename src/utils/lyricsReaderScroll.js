export function scrollToLyric(viewport, text, behavior) {
  if (
    !viewport?.scrollTo ||
    !viewport.getBoundingClientRect ||
    !text?.getBoundingClientRect
  )
    return;
  const padding =
    Number.parseFloat(globalThis.getComputedStyle?.(text).paddingBlockStart) ||
    0;
  viewport.scrollTo({
    top: Math.max(
      0,
      viewport.scrollTop +
        text.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top -
        viewport.clientHeight / 3 +
        padding,
    ),
    behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
      .matches
      ? 'auto'
      : behavior,
  });
}
