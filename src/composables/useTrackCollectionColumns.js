import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  toValue,
  useTemplateRef,
  watch,
} from 'vue';
import { useResizeDrag } from './useResizeDrag.js';
import {
  TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS,
  resolveTrackCollectionLayout,
  resolveTrackCollectionResizeBounds,
  resolveTrackCollectionResizeWidth,
} from '../components/track/trackCollectionLayout.js';
import {
  normalizeTrackCollectionPreferences,
  trackCollectionColumnWidth,
} from '../components/track/trackCollectionProfiles.js';

function plainPreferences(preferences) {
  return {
    visibleAdvanced: [...preferences.visibleAdvanced],
    hiddenDefaultColumns: [...preferences.hiddenDefaultColumns],
    widths: { ...preferences.widths },
    ...(preferences.columnOrder
      ? { columnOrder: [...preferences.columnOrder] }
      : {}),
  };
}

export function useTrackCollectionColumns({
  collectionKind,
  preferences,
  onUpdatePreferences,
  gridVariable = '--library-track-table-grid',
}) {
  const tableRef = useTemplateRef('table');
  const headerRef = useTemplateRef('header');
  const availableWidth = shallowRef(Number.POSITIVE_INFINITY);
  const layoutMetrics = shallowRef({
    ...TRACK_COLLECTION_DEFAULT_LAYOUT_METRICS,
    direction: 'ltr',
  });
  const draftPreferences = shallowRef(null);
  const committedPreferences = shallowRef(null);
  const resizeRole = shallowRef('');
  const resizeStartWidth = shallowRef(0);
  const resizeBounds = shallowRef(null);
  const resizeHandle = shallowRef(null);
  const lockedRoles = shallowRef(null);
  const guideX = shallowRef(null);
  let resizeObserver = null;

  const normalizedPreferences = computed(() =>
    normalizeTrackCollectionPreferences(
      toValue(collectionKind),
      toValue(preferences),
    ),
  );
  const effectivePreferences = computed(
    () =>
      draftPreferences.value ??
      committedPreferences.value ??
      normalizedPreferences.value,
  );
  const layout = computed(() =>
    resolveTrackCollectionLayout({
      kind: toValue(collectionKind),
      preferences: effectivePreferences.value,
      availableWidth: availableWidth.value,
      lockedRoles: lockedRoles.value,
      columnGap: layoutMetrics.value.columnGap,
      inlinePadding: layoutMetrics.value.inlinePadding,
    }),
  );
  const gridStyle = computed(() => ({
    [gridVariable]: layout.value.gridTemplate,
  }));

  function emitPreferences(next, { retainUntilControlledUpdate = false } = {}) {
    const normalized = normalizeTrackCollectionPreferences(
      toValue(collectionKind),
      next,
    );
    if (retainUntilControlledUpdate) committedPreferences.value = normalized;
    onUpdatePreferences?.(plainPreferences(normalized));
  }

  function columnWidthContract(role) {
    return trackCollectionColumnWidth(
      toValue(collectionKind),
      role,
      effectivePreferences.value,
    );
  }

  function columnWidth(role) {
    return layout.value.widths[role] ?? columnWidthContract(role)?.width ?? 0;
  }

  function cssPixels(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function syncLayoutMetrics() {
    const element = headerRef.value;
    const readStyle = globalThis.getComputedStyle;
    if (!element || typeof readStyle !== 'function') return;
    const style = readStyle(element);
    const current = layoutMetrics.value;
    const next = {
      columnGap: cssPixels(style.columnGap, current.columnGap),
      inlinePadding:
        cssPixels(style.paddingInlineStart, current.inlinePadding / 2) +
        cssPixels(style.paddingInlineEnd, current.inlinePadding / 2),
      direction: style.direction === 'rtl' ? 'rtl' : 'ltr',
    };
    if (
      next.columnGap !== current.columnGap ||
      next.inlinePadding !== current.inlinePadding ||
      next.direction !== current.direction
    ) {
      layoutMetrics.value = next;
    }
  }

  function currentResizeBounds(role, startWidth = columnWidth(role)) {
    const contract = columnWidthContract(role);
    if (!contract) return null;
    return resolveTrackCollectionResizeBounds({
      startWidth,
      minWidth: contract.minWidth,
      maxWidth: contract.maxWidth,
      availableWidth: availableWidth.value,
      requiredWidth: layout.value.requiredWidth,
    });
  }

  function boundedWidth(role, value) {
    const contract = trackCollectionColumnWidth(toValue(collectionKind), role, {
      widths: { [role]: value },
    });
    return contract?.width ?? value;
  }

  function positionGuide(element) {
    const tableBounds = tableRef.value?.getBoundingClientRect?.();
    const handleBounds = element?.getBoundingClientRect?.();
    if (!tableBounds || !handleBounds) return;
    const handleWidth = Number.isFinite(handleBounds.width)
      ? handleBounds.width
      : handleBounds.right - handleBounds.left;
    guideX.value = handleBounds.left + handleWidth / 2 - tableBounds.left;
  }

  function updateDraftWidth(width) {
    const widths = Object.fromEntries(
      layout.value.columns
        .filter((column) => column.resizable)
        .map((column) => [column.role, columnWidth(column.role)]),
    );
    draftPreferences.value = normalizeTrackCollectionPreferences(
      toValue(collectionKind),
      {
        visibleAdvanced: normalizedPreferences.value.visibleAdvanced,
        hiddenDefaultColumns: normalizedPreferences.value.hiddenDefaultColumns,
        columnOrder: normalizedPreferences.value.columnOrder,
        widths: { ...widths, [resizeRole.value]: width },
      },
    );
  }

  function moveResize(delta) {
    if (!resizeRole.value || !resizeBounds.value) return;
    if (!lockedRoles.value) {
      lockedRoles.value = layout.value.columns
        .map((column) => column.role)
        .filter((role) => role !== 'spacer');
    }
    const nextWidth = resolveTrackCollectionResizeWidth({
      startWidth: resizeStartWidth.value,
      delta,
      direction: layoutMetrics.value.direction,
      ...resizeBounds.value,
    });
    updateDraftWidth(nextWidth);
    nextTick(() => positionGuide(resizeHandle.value));
  }

  function finishResize(commit) {
    if (commit && draftPreferences.value) {
      emitPreferences(draftPreferences.value, {
        retainUntilControlledUpdate: true,
      });
    }
    draftPreferences.value = null;
    resizeRole.value = '';
    resizeBounds.value = null;
    lockedRoles.value = null;
    resizeHandle.value = null;
    guideX.value = null;
  }

  const { isResizing, startResize } = useResizeDrag({
    onMove: moveResize,
    onCommit: () => finishResize(true),
    onCancel: () => finishResize(false),
  });
  const guideStyle = computed(() =>
    Number.isFinite(guideX.value)
      ? {
          transform: `translate3d(${guideX.value}px, 0, 0) translateX(-50%)`,
        }
      : {},
  );

  function startColumnResize(column, event) {
    syncLayoutMetrics();
    const contract = columnWidthContract(column.role);
    if (!contract?.resizable || (event.button != null && event.button !== 0)) {
      return;
    }
    resizeRole.value = column.role;
    resizeStartWidth.value = columnWidth(column.role);
    resizeBounds.value = currentResizeBounds(
      column.role,
      resizeStartWidth.value,
    );
    resizeHandle.value = event.currentTarget;
    positionGuide(resizeHandle.value);
    startResize(event);
  }

  function resizeColumnFromKeyboard(column, event) {
    syncLayoutMetrics();
    const contract = columnWidthContract(column.role);
    if (!contract?.resizable) return;
    const startWidth = columnWidth(column.role);
    const bounds = currentResizeBounds(column.role, startWidth);
    if (!bounds) return;
    let nextWidth;
    if (event.key === 'Home') nextWidth = bounds.minWidth;
    else if (event.key === 'End') nextWidth = bounds.maxWidth;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const step = event.shiftKey ? 24 : 8;
      nextWidth = resolveTrackCollectionResizeWidth({
        startWidth,
        delta: event.key === 'ArrowRight' ? step : -step,
        direction: layoutMetrics.value.direction,
        ...bounds,
      });
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation?.();
    const widths = Object.fromEntries(
      layout.value.columns
        .filter((candidate) => candidate.resizable)
        .map((candidate) => [candidate.role, columnWidth(candidate.role)]),
    );
    emitPreferences({
      visibleAdvanced: normalizedPreferences.value.visibleAdvanced,
      hiddenDefaultColumns: normalizedPreferences.value.hiddenDefaultColumns,
      columnOrder: normalizedPreferences.value.columnOrder,
      widths: {
        ...widths,
        [column.role]: boundedWidth(column.role, nextWidth),
      },
    });
  }

  function resetColumnWidth(column, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const widths = { ...normalizedPreferences.value.widths };
    delete widths[column.role];
    emitPreferences({
      visibleAdvanced: normalizedPreferences.value.visibleAdvanced,
      hiddenDefaultColumns: normalizedPreferences.value.hiddenDefaultColumns,
      columnOrder: normalizedPreferences.value.columnOrder,
      widths,
    });
  }

  watch(
    () => toValue(preferences),
    () => {
      committedPreferences.value = null;
    },
    { deep: true },
  );
  watch(collectionKind, () => {
    committedPreferences.value = null;
    finishResize(false);
  });

  onMounted(() => {
    const element = tableRef.value;
    if (!element) return;
    syncLayoutMetrics();
    const updateWidth = (width) => {
      if (Number.isFinite(width) && width > 0) availableWidth.value = width;
    };
    updateWidth(element.getBoundingClientRect?.().width);
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === element);
      syncLayoutMetrics();
      updateWidth(entry?.contentRect?.width);
    });
    resizeObserver.observe(element);
  });

  onBeforeUnmount(() => resizeObserver?.disconnect());

  return {
    columnResizeBounds: currentResizeBounds,
    columnWidth,
    columnWidthContract,
    gridStyle,
    guideStyle,
    isResizing,
    layout,
    resetColumnWidth,
    resizeColumnFromKeyboard,
    startColumnResize,
    tableRef,
  };
}
