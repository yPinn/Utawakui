import { effectScope, nextTick, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeVirtualSegments,
  useVirtualList,
  useVirtualRows,
} from './useVirtualRows.js';

const base = {
  count: 1000,
  rowHeight: 50,
  viewportStart: 0,
  viewportHeight: 500,
  overscan: 2,
};

function rowIndexes(segments) {
  return segments.filter((s) => s.kind === 'row').map((s) => s.index);
}

function totalHeight(segments, rowHeight) {
  return segments.reduce(
    (sum, s) => sum + (s.kind === 'row' ? rowHeight : s.height),
    0,
  );
}

describe('computeVirtualSegments', () => {
  it('returns nothing for an empty list', () => {
    expect(computeVirtualSegments({ ...base, count: 0 })).toEqual([]);
  });

  it('renders the first screen plus overscan and one trailing spacer', () => {
    const segments = computeVirtualSegments(base);

    expect(rowIndexes(segments)).toEqual(
      Array.from({ length: 12 }, (_, i) => i),
    );
    expect(segments.at(-1)).toEqual({
      kind: 'spacer',
      key: 'spacer-12',
      height: (1000 - 12) * 50,
    });
    expect(totalHeight(segments, 50)).toBe(1000 * 50);
  });

  it('follows the scroll position with overscan on both sides', () => {
    const segments = computeVirtualSegments({ ...base, viewportStart: 5000 });

    expect(rowIndexes(segments)).toEqual(
      Array.from({ length: 14 }, (_, i) => 98 + i),
    );
    expect(segments[0]).toEqual({
      kind: 'spacer',
      key: 'spacer-0',
      height: 98 * 50,
    });
    expect(totalHeight(segments, 50)).toBe(1000 * 50);
  });

  it('clamps at the end of the list', () => {
    const segments = computeVirtualSegments({
      ...base,
      viewportStart: 49_800,
    });

    expect(rowIndexes(segments).at(-1)).toBe(999);
    expect(segments.at(-1).kind).toBe('row');
    expect(totalHeight(segments, 50)).toBe(1000 * 50);
  });

  it('keeps pinned rows in place outside the window', () => {
    const segments = computeVirtualSegments({
      ...base,
      viewportStart: 5000,
      pinnedIndexes: [3, 500, 99, -1, 1000],
    });

    expect(rowIndexes(segments)).toEqual([
      3,
      ...Array.from({ length: 14 }, (_, i) => 98 + i),
      500,
    ]);
    expect(segments.map((s) => s.kind)).toEqual([
      'spacer',
      'row',
      'spacer',
      ...Array(14).fill('row'),
      'spacer',
      'row',
      'spacer',
    ]);
    expect(totalHeight(segments, 50)).toBe(1000 * 50);
  });

  it('renders a short list whole without spacers', () => {
    const segments = computeVirtualSegments({ ...base, count: 5 });

    expect(segments.map((s) => s.kind)).toEqual(Array(5).fill('row'));
  });

  it('renders the leading rows while the list sits below the viewport', () => {
    const segments = computeVirtualSegments({
      ...base,
      viewportStart: -2000,
    });

    expect(rowIndexes(segments)).toEqual([0, 1]);
    expect(totalHeight(segments, 50)).toBe(1000 * 50);
  });
});

function fakeDom({ listTop = 0, rootTop = 0, rootHeight = 500, rowHeight }) {
  const listeners = new Map();
  const root = {
    clientHeight: rootHeight,
    getBoundingClientRect: () => ({ top: rootTop }),
    addEventListener: vi.fn((type, handler) => listeners.set(type, handler)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
  };
  const row = rowHeight
    ? { getBoundingClientRect: () => ({ height: rowHeight }) }
    : null;
  const list = {
    top: listTop,
    closest: vi.fn(() => root),
    getBoundingClientRect() {
      return { top: this.top };
    },
    querySelector: vi.fn(() => row),
  };
  return { root, list, listeners };
}

function stubFrames() {
  const frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    },
  );
  return {
    observers,
    flush: () => frames.splice(0).forEach((callback) => callback()),
  };
}

function setup({ dom, count = 1000, enabled = true, pinned = [] }) {
  const listRef = shallowRef(null);
  const scope = effectScope();
  const result = scope.run(() =>
    useVirtualRows({
      listRef,
      count: () => count,
      enabled: () => enabled,
      pinnedIndexes: () => pinned,
      estimateRowHeight: () => 40,
      overscan: 2,
    }),
  );
  listRef.value = dom.list;
  return { ...result, scope };
}

describe('useVirtualRows', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('measures the list inside its scroll viewport and the first row', async () => {
    stubFrames();
    const dom = fakeDom({ listTop: 300, rootTop: 100, rowHeight: 50 });
    const { segments, rowHeight, scope } = setup({ dom });
    await nextTick();

    expect(dom.list.closest).toHaveBeenCalledWith(
      '.ui-scroll-region__viewport',
    );
    expect(rowHeight.value).toBe(50);
    // The list starts 200px below the viewport top: rows 0–7 plus overscan.
    expect(rowIndexes(segments.value)).toEqual(
      Array.from({ length: 8 }, (_, i) => i),
    );
    scope.stop();
  });

  it('adds the list row gap to the measured pitch', async () => {
    stubFrames();
    vi.stubGlobal('getComputedStyle', () => ({ rowGap: '4px' }));
    const { rowHeight, scope } = setup({ dom: fakeDom({ rowHeight: 50 }) });
    await nextTick();

    expect(rowHeight.value).toBe(54);
    scope.stop();
  });

  it('uses the estimate until a row can be measured', async () => {
    stubFrames();
    const { rowHeight, scope } = setup({ dom: fakeDom({}) });
    await nextTick();

    expect(rowHeight.value).toBe(40);
    scope.stop();
  });

  it('re-measures once per frame while scrolling', async () => {
    const frames = stubFrames();
    const dom = fakeDom({ rowHeight: 50 });
    const { segments, scope } = setup({ dom });
    await nextTick();

    dom.list.top = -5000;
    dom.listeners.get('scroll')();
    dom.listeners.get('scroll')();
    frames.flush();

    expect(rowIndexes(segments.value)[0]).toBe(98);
    scope.stop();
  });

  it('keeps pinned rows and stays inert when disabled', async () => {
    stubFrames();
    const pinnedDom = fakeDom({ rowHeight: 50 });
    const pinned = setup({ dom: pinnedDom, pinned: [900] });
    await nextTick();
    expect(rowIndexes(pinned.segments.value)).toContain(900);
    pinned.scope.stop();

    const dom = fakeDom({ rowHeight: 50 });
    const disabled = setup({ dom, enabled: false });
    await nextTick();
    expect(disabled.segments.value).toBeNull();
    expect(dom.root.addEventListener).not.toHaveBeenCalled();
    disabled.scope.stop();
  });

  it('detaches its listener and observer when the scope ends', async () => {
    const frames = stubFrames();
    const dom = fakeDom({ rowHeight: 50 });
    const { scope } = setup({ dom });
    await nextTick();

    scope.stop();
    expect(dom.root.removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
    );
    expect(frames.observers[0].disconnect).toHaveBeenCalled();
  });
});

describe('useVirtualList', () => {
  afterEach(() => vi.unstubAllGlobals());

  const items = Array.from({ length: 30 }, (_, index) => ({ id: `t${index}` }));

  function setupList({ threshold = 10, pinned = () => [] } = {}) {
    stubFrames();
    const dom = fakeDom({ rowHeight: 20 });
    dom.list.contains = vi.fn(() => false);
    const listRef = shallowRef(null);
    const scope = effectScope();
    const list = scope.run(() =>
      useVirtualList({
        listRef,
        items: () => items,
        keyOf: (item) => item.id,
        threshold: () => threshold,
        pinnedKeys: pinned,
        estimateRowHeight: () => 20,
        overscan: 2,
      }),
    );
    listRef.value = dom.list;
    return { ...list, scope };
  }

  it('renders plain rows without bindings up to the threshold', async () => {
    const list = setupList({ threshold: 30 });
    await nextTick();

    expect(list.virtualized.value).toBe(false);
    expect(list.rows.value).toHaveLength(30);
    expect(list.rowAttrs(list.rows.value[0])).toEqual({});
    expect(list.listStyle.value).toBeUndefined();
    list.scope.stop();
  });

  it('turns skipped rows into margins and the tail into list padding', async () => {
    const list = setupList({ pinned: () => ['t20'] });
    await nextTick();
    const rows = list.rows.value;

    // 500px viewport ÷ 20px rows + 2 overscan, plus the pinned t20.
    expect(rows.map((row) => row.key)).toEqual([
      ...items.slice(0, 27).map((item) => item.id),
    ]);
    expect(list.listStyle.value).toEqual({ paddingBlockEnd: `${3 * 20}px` });
    expect(list.rowAttrs(rows[1])).toMatchObject({
      'data-virtual-row': '',
      'data-virtual-key': 't1',
      'aria-setsize': 30,
      'aria-posinset': 2,
    });
    list.scope.stop();
  });

  it('keeps pinned and focused rows mounted in place', async () => {
    const list = setupList({ pinned: () => ['t29'] });
    await nextTick();
    let rows = list.rows.value;
    expect(rows.at(-1)).toMatchObject({ key: 't29', gap: 2 * 20 });

    list.scope.stop();
    const focused = setupList();
    await nextTick();
    focused.listListeners.focusin({
      target: { closest: () => ({ dataset: { virtualKey: 't28' } }) },
    });
    rows = focused.rows.value;
    expect(rows.at(-1)).toMatchObject({ key: 't28', gap: 1 * 20 });
    expect(focused.listStyle.value).toEqual({ paddingBlockEnd: '20px' });

    focused.listListeners.focusout({ relatedTarget: null });
    expect(focused.rows.value.at(-1).key).toBe('t26');
    focused.scope.stop();
  });
});
