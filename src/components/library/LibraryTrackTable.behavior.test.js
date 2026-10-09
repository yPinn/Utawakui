import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import LibraryTrackTable from './LibraryTrackTable.vue';
import TrackArtistCredits from '../track/TrackArtistCredits.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [LibraryTrackTable, './LibraryTrackTable.vue'],
  [TrackArtistCredits, '../track/TrackArtistCredits.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

vi.stubGlobal('requestAnimationFrame', (callback) => {
  callback();
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('document', {});

const tracks = [
  {
    id: 'track-a',
    title: '第一首歌',
    artist: '演出者 A',
    duration: 181,
  },
  {
    id: 'track-b',
    title: '第二首歌',
    artist: '演出者 B',
    duration: 239,
  },
];

const entries = tracks.map((track, visibleIndex) => ({
  track,
  visibleIndex,
  addedAt: `2026-10-0${visibleIndex + 1}T00:00:00.000Z`,
}));

const source = readFileSync(
  new URL('./LibraryTrackTable.vue', import.meta.url),
  'utf8',
);

function classIncludes(node, className) {
  return String(node.props?.class ?? '')
    .split(/\s+/u)
    .includes(className);
}

function mountTable(overrides = {}) {
  return mount(LibraryTrackTable, {
    entries,
    variant: 'playlist',
    sort: { key: null, direction: 'asc' },
    sortable: true,
    selectedTrackId: 'track-a',
    currentTrackId: 'track-b',
    jumpableTrackIds: new Set(['track-a']),
    ...overrides,
  });
}

function rowRoles(row) {
  return findAll(row, (node) => Boolean(node.props?.['data-track-column'])).map(
    (node) => node.props['data-track-column'],
  );
}

describe('LibraryTrackTable canonical grid', () => {
  it('forms one continuous ledger sheet with functional row rules', () => {
    const headerRule = source.match(
      /\.library-track-table__header\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;
    const bodyRule = source.match(
      /\.library-track-table__body\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;
    const rowRule = [
      ...source.matchAll(/^\.library-track-row\s*\{(?<body>[\s\S]*?)\n\}/gmu),
    ]
      .map((match) => match.groups?.body ?? '')
      .find((body) => body.includes('min-height:'));

    expect(headerRule).toMatch(
      /border-bottom:\s*var\(--ui-border-width\) solid\s*var\(--ui-folder-ledger-rule-strong,\s*var\(--ui-color-border\)\);/u,
    );
    expect(bodyRule).toContain('gap: 0;');
    expect(bodyRule).toContain('padding: 0;');
    expect(rowRule).toMatch(
      /border-bottom:\s*var\(--ui-border-width\) solid\s*var\(--ui-folder-ledger-rule,\s*var\(--ui-color-border\)\);/u,
    );
    expect(rowRule).toContain('border-radius: 0;');
    expect(source).not.toContain('background-image:');
  });

  it('uses the same semantic column sequence for header and rows', () => {
    const { app, root } = mountTable();
    const header = findAll(root, (node) =>
      classIncludes(node, 'library-track-table__header'),
    )[0];
    const row = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    )[0];

    expect(rowRoles(header)).toEqual([
      'reorder',
      'index',
      'identity',
      'context-primary',
      'duration',
      'actions',
    ]);
    expect(rowRoles(row)).toEqual(rowRoles(header));
    expect(header.props.style).toBe(row.props.style);
    const titleSort = findAll(
      header,
      (node) => node.props?.['aria-label'] === '曲目排序',
    )[0];
    expect(titleSort.type).toBe('button');
    expect(titleSort.props.role).toBeUndefined();
    app.unmount();
  });

  it.each([
    ['library', false, true, true],
    ['playlist', true, true, true],
    ['album', false, false, true],
    ['artist', false, true, false],
  ])(
    'adapts the %s identity without changing outer column alignment',
    (variant, hasReorder, hasArtwork, hasArtist) => {
      const { app, root } = mountTable({ variant });
      const roles = rowRoles(
        findAll(root, (node) => classIncludes(node, 'library-track-row'))[0],
      );
      const thumbs = findAll(root, (node) =>
        classIncludes(node, 'library-track-row__thumb'),
      );
      const artists = findAll(root, (node) =>
        classIncludes(node, 'library-track-row__subtitle'),
      );

      expect(roles.includes('reorder')).toBe(hasReorder);
      expect(thumbs.length > 0).toBe(hasArtwork);
      expect(artists.length > 0).toBe(hasArtist);
      expect(roles.slice(-3)).toEqual([
        'context-primary',
        'duration',
        'actions',
      ]);
      app.unmount();
    },
  );

  it('centralizes role alignment, numeric treatment, and responsive priority', () => {
    expect(source).toMatch(
      /\[data-track-column='(?:reorder|index|actions)'\][\s\S]*?justify-self:\s*center;/u,
    );
    expect(source).toMatch(
      /\[data-track-column='duration'\][\s\S]*?justify-self:\s*end;/u,
    );
    expect(source).toMatch(
      /\[data-track-column='(?:index|context-primary|duration)'\][\s\S]*?font-variant-numeric:\s*tabular-nums;/u,
    );
    expect(source).toContain('data-column-priority="secondary"');
    expect(source).toContain('@container library-track-table');
  });
});

describe('LibraryTrackTable shared row behavior', () => {
  it('uses the shared quiet selection surface and reserves the outline for keyboard focus', () => {
    const selectedRule = source.match(
      /\.library-track-row--selected\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;

    expect(selectedRule).toContain(
      'background: var(--ui-track-row-selected-surface);',
    );
    expect(selectedRule).not.toContain('box-shadow');
    expect(source).not.toContain('--ui-color-surface-selected');
    expect(source).not.toContain('--ui-row-active-shadow');
    expect(source).toMatch(
      /\.library-track-row:has\(\.library-track-row__action:focus-visible\)\s*\{[^}]*outline:\s*var\(--ui-focus-width\) solid var\(--ui-color-focus\);/su,
    );
  });

  it('keeps selected and current independent', () => {
    const { app, root } = mountTable();
    const rows = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    );
    const actions = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        String(node.props?.['aria-label'] ?? '').startsWith('選取：'),
    );

    expect(classIncludes(rows[0], 'library-track-row--selected')).toBe(true);
    expect(classIncludes(rows[0], 'library-track-row--current')).toBe(false);
    expect(classIncludes(rows[1], 'library-track-row--selected')).toBe(false);
    expect(classIncludes(rows[1], 'library-track-row--current')).toBe(true);
    expect(rows[1].props['aria-current']).toBe('true');
    expect(actions[0].props['aria-pressed']).toBe(true);
    app.unmount();
  });

  it('selects on click or Space and activates on double click or Enter', () => {
    const onSelectTrack = vi.fn();
    const onActivateTrack = vi.fn();
    const { app, root } = mountTable({ onSelectTrack, onActivateTrack });
    const action = findAll(
      root,
      (node) => node.props?.['aria-label'] === '選取：第一首歌',
    )[0];

    trigger(action, 'onClick', { stopPropagation: vi.fn() });
    trigger(action, 'onDblclick', { stopPropagation: vi.fn() });
    trigger(action, 'onKeydown', {
      key: ' ',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    trigger(action, 'onKeydown', {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onSelectTrack).toHaveBeenCalledTimes(2);
    expect(onActivateTrack).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('uses one menu intent for the trailing button and right click', () => {
    const onOpenMenu = vi.fn();
    const { app, root } = mountTable({ onOpenMenu });
    const row = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    )[0];
    const more = findAll(
      row,
      (node) =>
        node.type === 'button' && textContent(node).includes('更多：第一首歌'),
    )[0];
    const buttonEvent = { currentTarget: more, stopPropagation: vi.fn() };
    const contextEvent = {
      clientX: 12,
      clientY: 24,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    trigger(more, 'onClick', buttonEvent);
    trigger(row, 'onContextmenu', contextEvent);

    expect(more.props.role).toBeUndefined();
    expect(onOpenMenu).toHaveBeenNthCalledWith(1, tracks[0], buttonEvent);
    expect(onOpenMenu).toHaveBeenNthCalledWith(2, tracks[0], contextEvent);
    app.unmount();
  });

  it('exposes reorder only for playlist custom order and supports arrows', () => {
    const onMoveTrack = vi.fn();
    const { app, root } = mountTable({ canDrag: true, onMoveTrack });
    const handle = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        textContent(node).includes('調整順序：第一首歌'),
    )[0];

    expect(handle.props.draggable).toBe(true);
    expect(handle.props.role).toBeUndefined();
    trigger(handle, 'onKeydown', {
      key: 'ArrowUp',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    trigger(handle, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(onMoveTrack).toHaveBeenNthCalledWith(1, 'track-a', -1);
    expect(onMoveTrack).toHaveBeenNthCalledWith(2, 'track-a', 1);
    app.unmount();
  });
});
