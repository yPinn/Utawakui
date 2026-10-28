import { computed, onScopeDispose, shallowRef, watch } from 'vue';

// Ordered row／spacer segments for a uniform-height list. Pinned rows stay
// rendered in place; spacers keep the total height equal to count × rowHeight.
export function computeVirtualSegments({
  count,
  rowHeight,
  viewportStart,
  viewportHeight,
  overscan,
  pinnedIndexes = [],
}) {
  if (count <= 0) return [];
  const clamp = (value) => Math.min(count, Math.max(0, value));
  const first = clamp(Math.floor(viewportStart / rowHeight) - overscan);
  // Keep a few leading rows even off-screen so a row stays measurable.
  const end = clamp(
    Math.max(
      Math.ceil((viewportStart + viewportHeight) / rowHeight) + overscan,
      overscan,
    ),
  );
  const indexes = new Set();
  for (let index = first; index < end; index += 1) indexes.add(index);
  for (const index of pinnedIndexes) {
    if (Number.isInteger(index) && index >= 0 && index < count) {
      indexes.add(index);
    }
  }

  const segments = [];
  let next = 0;
  for (const index of [...indexes].sort((a, b) => a - b)) {
    if (index > next) {
      segments.push({
        kind: 'spacer',
        key: `spacer-${next}`,
        height: (index - next) * rowHeight,
      });
    }
    segments.push({ kind: 'row', index });
    next = index + 1;
  }
  if (next < count) {
    segments.push({
      kind: 'spacer',
      key: `spacer-${next}`,
      height: (count - next) * rowHeight,
    });
  }
  return segments;
}

// Windowed rendering inside the nearest UiScrollRegion viewport (same lookup
// as useScrolledPast). Rows must carry data-virtual-row so one can be measured.
export function useVirtualRows({
  listRef,
  count,
  enabled,
  pinnedIndexes = () => [],
  estimateRowHeight,
  overscan = 8,
}) {
  const viewportStart = shallowRef(0);
  const viewportHeight = shallowRef(0);
  const measuredRowHeight = shallowRef(0);
  let root = null;
  let resizeObserver = null;
  let frame = 0;

  function measure() {
    frame = 0;
    const list = listRef.value;
    if (!list) return;
    const listTop = list.getBoundingClientRect().top;
    const rootTop = root ? root.getBoundingClientRect().top : 0;
    viewportStart.value = rootTop - listTop;
    viewportHeight.value = root
      ? root.clientHeight
      : (globalThis.innerHeight ?? 0);
    const row = list.querySelector?.(':scope > [data-virtual-row]');
    const height = row?.getBoundingClientRect().height ?? 0;
    if (height > 0) measuredRowHeight.value = height;
  }

  function schedule() {
    if (frame) return;
    frame = globalThis.requestAnimationFrame?.(measure) ?? 0;
    if (!frame) measure();
  }

  function detach() {
    if (frame) globalThis.cancelAnimationFrame?.(frame);
    frame = 0;
    root?.removeEventListener('scroll', schedule);
    resizeObserver?.disconnect();
    root = null;
    resizeObserver = null;
  }

  watch(
    [listRef, () => Boolean(enabled())],
    ([list, isEnabled]) => {
      detach();
      if (!list || !isEnabled) return;
      root = list.closest?.('.ui-scroll-region__viewport') ?? null;
      root?.addEventListener('scroll', schedule, { passive: true });
      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(schedule);
        if (root) resizeObserver.observe(root);
        resizeObserver.observe(list);
      }
      measure();
    },
    { flush: 'post' },
  );

  watch(count, () => {
    if (enabled() && listRef.value) schedule();
  });

  onScopeDispose(detach);

  const rowHeight = computed(
    () => measuredRowHeight.value || estimateRowHeight(),
  );

  const segments = computed(() =>
    enabled()
      ? computeVirtualSegments({
          count: count(),
          rowHeight: rowHeight.value,
          viewportStart: viewportStart.value,
          viewportHeight: viewportHeight.value,
          overscan,
          pinnedIndexes: pinnedIndexes(),
        })
      : null,
  );

  return { segments, rowHeight, remeasure: schedule };
}
