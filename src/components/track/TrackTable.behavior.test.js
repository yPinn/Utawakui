import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import TrackTable from './TrackTable.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import TrackCollectionRow from './TrackCollectionRow.vue';
import TrackTableColumnChooser from './TrackTableColumnChooser.vue';
import TrackArtistCredits from '../track/TrackArtistCredits.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTextButton from '../ui/UiTextButton.vue';
import TrackArtworkContent from '../ui/TrackArtworkContent.vue';
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
  [TrackTable, './TrackTable.vue'],
  [UiSkeleton, '../ui/UiSkeleton.vue'],
  [TrackCollectionRow, './TrackCollectionRow.vue'],
  [TrackTableColumnChooser, './TrackTableColumnChooser.vue'],
  [TrackArtistCredits, '../track/TrackArtistCredits.vue'],
  [UiCheckbox, '../ui/UiCheckbox.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiMarqueeText, '../ui/UiMarqueeText.vue'],
  [UiOverflowTooltip, '../ui/UiOverflowTooltip.vue'],
  [UiPopover, '../ui/UiPopover.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
  [UiTextButton, '../ui/UiTextButton.vue'],
  [TrackArtworkContent, '../ui/TrackArtworkContent.vue'],
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
    album: '專輯 A',
    duration: 181,
  },
  {
    id: 'track-b',
    title: '第二首歌',
    artist: '演出者 B',
    album: '專輯 B',
    duration: 239,
  },
];

const entries = tracks.map((track, visibleIndex) => ({
  track,
  visibleIndex,
  addedAt: `2026-10-0${visibleIndex + 1}T00:00:00.000Z`,
}));

const source = readFileSync(
  new URL('./TrackTable.vue', import.meta.url),
  'utf8',
);
const rowSource = readFileSync(
  new URL('./TrackCollectionRow.vue', import.meta.url),
  'utf8',
);

describe('initial table loading', () => {
  it('preserves local table rows, selection and playback identity when only separation completes', async () => {
    const props = reactive({
      entries: tracks.map((track) => ({ track: { ...track } })),
      collectionKind: 'album',
      selectedTrackId: tracks[0].id,
      currentTrackId: tracks[1].id,
      playingTrackId: tracks[1].id,
    });
    const view = mount(TrackTable, props);
    const before = findAll(view.root, (node) =>
      classIncludes(node, 'library-track-row'),
    );
    props.entries = tracks.map((track, index) => ({
      track: { ...track, hasSeparation: index === 0 },
    }));
    await nextTick();
    const after = findAll(view.root, (node) =>
      classIncludes(node, 'library-track-row'),
    );
    expect(after.map((row, index) => row === before[index])).toEqual(
      before.map(() => true),
    );
    expect(classIncludes(after[0], 'library-track-row--selected')).toBe(true);
    expect(classIncludes(after[1], 'library-track-row--current')).toBe(true);
    expect(
      findAll(
        view.root,
        (node) => node.props['aria-label'] === `已有伴奏：${tracks[0].title}`,
      ),
    ).toHaveLength(1);
    expect(
      findAll(after[1], (node) =>
        String(node.props['aria-label'] ?? '').startsWith('已有伴奏：'),
      ),
    ).toHaveLength(0);
    view.app.unmount();
  });
  it('keeps the standard album density and source order without lead badges', () => {
    const { root, app } = mount(TrackTable, {
      entries,
      collectionKind: 'album',
      leadTrackId: tracks[1].id,
    });
    const rows = findAll(root, (node) =>
      classIncludes(node, 'library-track-row__copy'),
    );
    expect(rows.map(textContent)).toEqual([
      expect.stringContaining('第一首歌'),
      expect.stringContaining('第二首歌'),
    ]);
    expect(textContent(rows[0])).not.toContain('主打');
    expect(textContent(rows[1])).not.toContain('主打');
    app.unmount();
  });
  afterEach(() => vi.useRealTimers());
  it('reveals delayed placeholders and keeps the existing header when content arrives', async () => {
    vi.useFakeTimers();
    const props = reactive({
      loading: true,
      entries: [],
      density: 'compact',
      collectionKind: 'artist',
    });
    const { root, app } = mount(TrackTable, props);
    const header = findAll(root, (node) =>
      classIncludes(node, 'library-track-table__header'),
    )[0];
    expect(
      findAll(root, (node) =>
        classIncludes(node, 'library-track-table__body--waiting'),
      ),
    ).toHaveLength(1);
    vi.advanceTimersByTime(180);
    await nextTick();
    expect(
      findAll(root, (node) =>
        classIncludes(node, 'library-track-table__body--waiting'),
      ),
    ).toHaveLength(0);
    const row = findAll(root, (node) =>
      classIncludes(node, 'library-track-table__skeleton-row'),
    )[0];
    expect(rowRoles(row)).toEqual(rowRoles(header));
    props.entries = entries;
    props.loading = false;
    await nextTick();
    expect(
      findAll(root, (node) =>
        classIncludes(node, 'library-track-table__header'),
      )[0],
    ).toBe(header);
    expect(
      findAll(root, (node) =>
        classIncludes(node, 'library-track-table__skeleton-row'),
      ),
    ).toHaveLength(0);
    expect(textContent(root)).toContain('第一首歌');
    const body = findAll(root, (node) =>
      classIncludes(node, 'library-track-table__body'),
    )[0];
    expect(classIncludes(body, 'ui-loading-content-enter')).toBe(true);
    expect(classIncludes(header, 'ui-loading-content-enter')).toBe(false);
    trigger(body, 'onAnimationend', { target: body, currentTarget: body });
    await nextTick();
    expect(classIncludes(body, 'ui-loading-content-enter')).toBe(false);
    props.loading = true;
    props.entries = [...entries];
    await nextTick();
    expect(classIncludes(body, 'ui-loading-content-enter')).toBe(false);
    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not fade a new destination using the previous destination placeholder', async () => {
    vi.useFakeTimers();
    const props = reactive({
      loading: true,
      entries: [],
      contentKey: 'artist:a',
    });
    const { root, app } = mount(TrackTable, props);
    vi.advanceTimersByTime(180);
    await nextTick();
    props.contentKey = 'artist:b';
    props.loading = false;
    props.entries = entries;
    await nextTick();
    expect(textContent(root)).toContain('第一首歌');
    expect(
      findAll(root, (node) => classIncludes(node, 'ui-loading-content-enter')),
    ).toHaveLength(0);
    app.unmount();
  });
  it('reserves non-interactive rows with the same column projection and removes them for real data', () => {
    const { root, app } = mount(TrackTable, { loading: true, entries: [] });
    expect(
      findAll(root, (node) => node.props?.['aria-busy'] === true),
    ).toHaveLength(1);
    const placeholders = findAll(root, (node) =>
      String(node.props?.class ?? '').includes(
        'library-track-table__skeleton-row',
      ),
    );
    expect(placeholders).toHaveLength(6);
    expect(
      placeholders.every((node) => node.props['aria-hidden'] === 'true'),
    ).toBe(true);
    expect(
      findAll(placeholders[0], (node) => node.type === 'button'),
    ).toHaveLength(0);
    const header = findAll(root, (node) =>
      classIncludes(node, 'library-track-table__header'),
    )[0];
    expect(rowRoles(placeholders[0])).toEqual(rowRoles(header));
    app.unmount();
    const loaded = mount(TrackTable, { loading: true, entries });
    expect(textContent(loaded.root)).toContain('第一首歌');
    expect(
      findAll(loaded.root, (node) => node.props?.['aria-busy'] === true),
    ).toHaveLength(0);
    loaded.app.unmount();
  });
});

function classIncludes(node, className) {
  return String(node.props?.class ?? '')
    .split(/\s+/u)
    .includes(className);
}

function mountTable(overrides = {}) {
  return mount(TrackTable, {
    entries,
    variant: 'playlist',
    sort: { key: null, direction: 'asc' },
    selectedTrackId: 'track-a',
    currentTrackId: 'track-b',
    albumJumpableTrackIds: new Set(['track-a']),
    ...overrides,
  });
}

function rowRoles(row) {
  return findAll(row, (node) => Boolean(node.props?.['data-track-column'])).map(
    (node) => node.props['data-track-column'],
  );
}

describe('TrackTable canonical grid', () => {
  it('keeps occurrence identity for repeated tracks and renders an inert archive ledger', async () => {
    const props = reactive({
      collectionKind: 'performance-archive',
      entries: [
        {
          key: 'first',
          visibleIndex: 0,
          track: tracks[0],
          performanceStatusText: '完成',
        },
        {
          key: 'repeat',
          visibleIndex: 1,
          track: tracks[0],
          performanceStatusText: '完成',
        },
        {
          key: 'manual',
          visibleIndex: 2,
          track: { id: 'manual', title: '清唱', artist: '現場' },
          performanceStatusText: '手動曲目 · 完成',
        },
      ],
    });
    const { root, app } = mount(TrackTable, props);
    const occurrences = () =>
      findAll(root, (node) => Boolean(node.props?.['data-occurrence-id']));
    const repeated = occurrences()[1];
    expect(
      occurrences().map((node) => node.props['data-occurrence-id']),
    ).toEqual(['first', 'repeat', 'manual']);
    expect(findAll(root, (node) => node.type === 'button')).toHaveLength(0);
    expect(textContent(root)).toContain('手動曲目 · 完成');
    props.entries = props.entries.slice(1);
    await nextTick();
    expect(occurrences()[0]).toBe(repeated);
    expect(
      occurrences().map((node) => node.props['data-occurrence-id']),
    ).toEqual(['repeat', 'manual']);
    app.unmount();
  });
  it('forms one continuous ledger sheet with functional row rules', () => {
    const headerRule = source.match(
      /\.library-track-table__header\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;
    const bodyRule = source.match(
      /\.library-track-table__body\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;
    const rowRule = [
      ...rowSource.matchAll(
        /^\.library-track-row\s*\{(?<body>[\s\S]*?)\n\}/gmu,
      ),
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
      'ordinal',
      'identity',
      'spacer',
      'duration',
      'actions',
    ]);
    expect(rowRoles(row)).toEqual(rowRoles(header));
    expect(header.props.style).toEqual(row.props.style);
    const titleSort = findAll(
      header,
      (node) => node.props?.['aria-label'] === '曲目排序',
    )[0];
    expect(titleSort.type).toBe('button');
    expect(titleSort.props.role).toBeUndefined();
    app.unmount();
  });

  it.each([
    ['library', true, true],
    ['playlist', true, true],
    ['album', false, true],
    ['artist', true, false],
  ])(
    'adapts the %s identity without changing outer column alignment',
    (variant, hasArtwork, hasArtist) => {
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

      expect(roles).not.toContain('reorder');
      expect(roles[0]).toBe('ordinal');
      expect(thumbs.length > 0).toBe(hasArtwork);
      expect(artists.length > 0).toBe(hasArtist);
      expect(roles.slice(-3)).toEqual(['spacer', 'duration', 'actions']);
      app.unmount();
    },
  );

  it('centralizes role alignment, numeric treatment, and responsive priority', () => {
    const productionSource = `${source}\n${rowSource}`;
    expect(productionSource).toMatch(
      /\[data-column-align='center'\][\s\S]*?justify-self:\s*center;/u,
    );
    expect(productionSource).toMatch(
      /\[data-column-align='end'\][\s\S]*?justify-self:\s*end;/u,
    );
    expect(productionSource).toMatch(
      /\[data-column-numeric='true'\][\s\S]*?font-variant-numeric:\s*tabular-nums;/u,
    );
    expect(source).toContain(
      ':data-column-align="column.headerAlign ?? column.align"',
    );
    expect(source).toContain(':data-column-priority=');
    expect(source).toContain('useTrackCollectionColumns');
  });

  it('keeps accompaniment status immediately before time in one right-aligned trailing group', () => {
    expect(rowSource).toMatch(
      /\.library-track-row__duration\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--ui-track-row-utility-size\) auto;[^}]*gap:\s*var\(--ui-space-4\);[^}]*justify-content:\s*end;/su,
    );
    expect(rowSource).not.toMatch(
      /\.library-track-row__duration\s*\{[^}]*grid-template-columns:[^}]*minmax\(0,\s*1fr\)/su,
    );
    expect(rowSource.indexOf('library-track-row__status')).toBeLessThan(
      rowSource.indexOf('library-track-row__duration-text'),
    );
  });

  it('stays scoped to browse tables rather than import review rows', () => {
    expect(source).toContain("['library', 'playlist', 'album', 'artist']");
    expect(source).not.toContain("props.variant === 'review'");
    expect(source).not.toContain('isReviewVariant');
    expect(source).not.toContain('<slot name="row-leading"');
    expect(source).not.toContain('<slot name="row-trailing"');
    expect(source).not.toContain('library-track-row--review');
  });
});

describe('TrackTable shared row behavior', () => {
  it('uses the shared quiet selection surface and reserves the outline for keyboard focus', () => {
    const selectedRule = rowSource.match(
      /\.library-track-row--selected\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;

    expect(selectedRule).toContain(
      'background: var(--ui-track-row-selected-background);',
    );
    expect(selectedRule).not.toContain('box-shadow');
    expect(rowSource).not.toContain('--ui-color-surface-selected');
    expect(rowSource).not.toContain('--ui-row-active-shadow');
    expect(rowSource).toMatch(
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

  it('projects the current title cue through the marquee component boundary', () => {
    expect(rowSource).toMatch(
      /<span class="library-track-row__title">\s*<UiMarqueeText\s+:text="displayTrack\.title"\s*\/>\s*<\/span>/u,
    );
    expect(rowSource).toMatch(
      /\.library-track-row--current\s+\.library-track-row__title\s*\{[^}]*color:\s*var\(--ui-color-current\);/su,
    );
    expect(rowSource).not.toContain(':deep(');
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

  it('keeps title static and attaches album navigation only to the release cell', () => {
    const onNavigateAlbum = vi.fn();
    const { app, root } = mountTable({
      onNavigateAlbum,
      columnPreferences: { visibleAdvanced: ['release'] },
    });
    const firstRow = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    )[0];
    const titleDestination = findAll(
      firstRow,
      (node) => node.props?.['aria-label'] === '前往專輯：第一首歌',
    );
    const albumDestination = findAll(
      firstRow,
      (node) => node.props?.['aria-label'] === '前往專輯：專輯 A',
    )[0];

    expect(titleDestination).toHaveLength(0);
    expect(albumDestination.type).toBe('button');
    trigger(albumDestination, 'onClick', { stopPropagation: vi.fn() });
    expect(onNavigateAlbum).toHaveBeenCalledWith(tracks[0]);
    app.unmount();

    const album = mountTable({
      collectionKind: 'album',
      albumJumpableTrackIds: new Set(['track-a']),
      onNavigateAlbum,
    });
    expect(
      findAll(
        album.root,
        (node) => node.props?.['aria-label'] === '前往專輯：專輯 A',
      ),
    ).toHaveLength(0);
    album.app.unmount();
  });

  it('tags the identity copy and release cell with the track content language', () => {
    const japanese = [
      {
        id: 'ja-link',
        title: 'アイドル',
        artist: 'YOASOBI',
        album: 'THE BOOK 3',
      },
      { id: 'ja-text', title: '勇者', artist: 'YOASOBI', album: 'ハルカ' },
    ];
    const { app, root } = mountTable({
      entries: [...japanese, ...tracks].map((track, visibleIndex) => ({
        track,
        visibleIndex,
      })),
      albumJumpableTrackIds: new Set(['ja-link']),
      columnPreferences: { visibleAdvanced: ['release'] },
    });
    const rows = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    );
    const langOf = (row, predicate) => findAll(row, predicate)[0]?.props?.lang;
    const copyLang = (row) =>
      langOf(row, (node) => classIncludes(node, 'library-track-row__copy'));
    const releaseLang = (row) =>
      langOf(row, (node) => node.props?.['data-track-column'] === 'release');

    // Jumpable album renders a button, the rest an overflow cell.
    for (const row of rows.slice(0, 2)) {
      expect(copyLang(row)).toBe('ja');
      expect(releaseLang(row)).toBe('ja');
    }
    expect(copyLang(rows[2])).toBeUndefined();
    expect(releaseLang(rows[2])).toBeUndefined();
    app.unmount();
  });

  it('keeps the accompaniment command inside the duration cell and overflow after it', () => {
    const onQueueSeparation = vi.fn();
    const { app, root } = mountTable({
      columnPreferences: {
        hiddenDefaultColumns: ['release', 'membership'],
      },
      onQueueSeparation,
    });
    const firstRow = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    )[0];
    const roles = rowRoles(firstRow);
    const vsButton = findAll(
      firstRow,
      (node) =>
        node.type === 'button' &&
        textContent(node).includes('加入伴奏處理佇列：第一首歌'),
    )[0];
    const moreButton = findAll(
      firstRow,
      (node) =>
        node.type === 'button' && textContent(node).includes('更多：第一首歌'),
    )[0];

    expect(roles).not.toContain('release');
    expect(roles).not.toContain('membership');
    expect(roles.indexOf('actions')).toBeGreaterThan(roles.indexOf('duration'));
    expect(roles).not.toContain('separation');
    expect(roles).toContain('actions');
    expect(vsButton).toBeTruthy();
    const durationCell = findAll(firstRow, (node) =>
      classIncludes(node, 'library-track-row__duration'),
    )[0];
    expect(
      findAll(
        durationCell,
        (node) =>
          node.type === 'button' &&
          textContent(node).includes('加入伴奏處理佇列：第一首歌'),
      ),
    ).toHaveLength(1);
    expect(moreButton).toBeTruthy();
    trigger(vsButton, 'onClick', { stopPropagation: vi.fn() });
    expect(onQueueSeparation).toHaveBeenCalledWith(tracks[0]);
    app.unmount();
  });

  it('projects existing and queued accompaniment truth as non-command row states', () => {
    const ready = mountTable({
      entries: [
        { ...entries[0], track: { ...tracks[0], hasSeparation: true } },
      ],
    });
    expect(
      findAll(
        ready.root,
        (node) => node.props?.['aria-label'] === '已有伴奏：第一首歌',
      ),
    ).toHaveLength(1);
    expect(
      findAll(ready.root, (node) =>
        textContent(node).includes('加入伴奏處理佇列：第一首歌'),
      ),
    ).toHaveLength(0);
    ready.app.unmount();

    const queued = mountTable({ vsQueuedTrackIds: new Set(['track-a']) });
    expect(
      findAll(
        queued.root,
        (node) => node.props?.['aria-label'] === '伴奏處理中：第一首歌',
      ),
    ).toHaveLength(1);
    expect(rowSource).not.toMatch(/已有 VS|VS 處理|加入 VS/u);
    queued.app.unmount();
  });

  it('exposes whole-row reorder only for playlist custom order and supports arrows', () => {
    const onMoveTrack = vi.fn();
    const { app, root } = mountTable({
      canReorderPlaylistTracks: true,
      onMoveTrack,
    });
    const row = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    )[0];
    const action = findAll(
      root,
      (node) =>
        node.type === 'button' &&
        node.props?.['aria-label'] === '選取：第一首歌',
    )[0];

    expect(row.props.draggable).toBe(true);
    expect(rowRoles(row)).not.toContain('reorder');
    expect(action.props['aria-description']).toContain('方向鍵調整順序');
    trigger(action, 'onKeydown', {
      key: 'ArrowUp',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    trigger(action, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(onMoveTrack).toHaveBeenNthCalledWith(1, 'track-a', -1);
    expect(onMoveTrack).toHaveBeenNthCalledWith(2, 'track-a', 1);
    app.unmount();
  });
});

describe('TrackTable density and sticky header', () => {
  it('drops artwork and joins title and artist on one line in compact density', () => {
    const { app, root } = mountTable({
      variant: 'library',
      density: 'compact',
    });
    const table = findAll(root, (node) =>
      classIncludes(node, 'library-track-table'),
    )[0];

    expect(classIncludes(table, 'library-track-table--compact')).toBe(true);
    expect(
      findAll(root, (node) => classIncludes(node, 'library-track-row__thumb')),
    ).toHaveLength(0);
    expect(rowSource).toMatch(
      /\.library-track-row--compact \{\s*min-height: var\(--ui-track-row-compact-min-height\);/u,
    );
    expect(rowSource).toMatch(
      /\.library-track-row--compact \.library-track-row__copy \{\s*flex-direction: row;/u,
    );
    app.unmount();
  });

  it('keeps artwork in the default list density', () => {
    const { app, root } = mountTable({ variant: 'library' });
    expect(
      findAll(root, (node) => classIncludes(node, 'library-track-row__thumb'))
        .length,
    ).toBeGreaterThan(0);
    app.unmount();
  });

  it('sticks the opaque header below the page compact bar', () => {
    expect(source).toMatch(
      /\.library-track-table__header \{[^}]*position: sticky;[^}]*top: var\(--ui-folder-sticky-offset, 0\);[^}]*z-index: var\(--ui-layer-overlay\);[^}]*background: var\(--ui-folder-page-background/su,
    );
  });
});

describe('TrackTable production collection contract', () => {
  it.each([
    [
      'library-all',
      [
        'ordinal',
        'identity',
        'release',
        'usage',
        'spacer',
        'duration',
        'actions',
      ],
    ],
    [
      'library-local',
      [
        'ordinal',
        'identity',
        'release',
        'usage',
        'spacer',
        'duration',
        'actions',
      ],
    ],
    ['playlist', ['ordinal', 'identity', 'spacer', 'duration', 'actions']],
    [
      'album',
      ['ordinal', 'identity', 'usage', 'spacer', 'duration', 'actions'],
    ],
    [
      'artist',
      ['ordinal', 'identity', 'usage', 'spacer', 'duration', 'actions'],
    ],
  ])(
    'uses one descriptor sequence for %s header and rows',
    (collectionKind, roles) => {
      const { app, root } = mountTable({ collectionKind });
      const header = findAll(root, (node) =>
        classIncludes(node, 'library-track-table__header'),
      )[0];
      const row = findAll(root, (node) =>
        classIncludes(node, 'library-track-row'),
      )[0];

      expect(rowRoles(header)).toEqual(roles);
      expect(rowRoles(row)).toEqual(roles);
      app.unmount();
    },
  );

  it.each([
    ['library-all', true],
    ['library-local', true],
    ['playlist', true],
    ['album', true],
    ['artist', true],
  ])(
    'sets semantic column reorder affordances for %s to %s',
    (collectionKind, canReorderColumns) => {
      const { app, root } = mountTable({
        collectionKind,
        columnPreferences:
          collectionKind === 'playlist'
            ? { visibleAdvanced: ['release', 'membership'] }
            : undefined,
      });
      const header = findAll(root, (node) =>
        classIncludes(node, 'library-track-table__header'),
      )[0];
      const semanticHeaders = findAll(
        header,
        (node) =>
          ['release', 'membership', 'usage'].includes(
            node.props?.['data-track-column'],
          ) && node.type !== 'button',
      );

      expect(semanticHeaders.length).toBeGreaterThan(0);
      expect(
        semanticHeaders.every(
          (node) => (node.props.draggable === true) === canReorderColumns,
        ),
      ).toBe(true);
      expect(
        semanticHeaders.every(
          (node) => (node.props.tabindex === 0) === canReorderColumns,
        ),
      ).toBe(true);
      app.unmount();
    },
  );

  it.each([
    ['library-all', true],
    ['library-local', true],
    ['playlist', true],
    ['album', false],
    ['artist', false],
  ])(
    'sets track-row sort controls for %s to %s',
    (collectionKind, canSortTrackRows) => {
      const { app, root } = mountTable({ collectionKind });
      const header = findAll(root, (node) =>
        classIncludes(node, 'library-track-table__header'),
      )[0];
      const rowSortButtons = findAll(
        header,
        (node) =>
          node.type === 'button' &&
          ['曲目排序', '時長排序'].includes(node.props?.['aria-label']),
      );

      expect(rowSortButtons.map((node) => node.props['aria-label'])).toEqual(
        canSortTrackRows ? ['曲目排序', '時長排序'] : [],
      );
      app.unmount();
    },
  );

  it('uses the playlist row as the drag source without a reorder column', () => {
    const onMoveTrack = vi.fn();
    const onTrackDragStart = vi.fn();
    const { app, root } = mountTable({
      collectionKind: 'playlist',
      canReorderPlaylistTracks: true,
      onMoveTrack,
      onTrackDragStart,
    });
    const row = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    )[0];
    const action = findAll(
      row,
      (node) => node.props?.['aria-label'] === '選取：第一首歌',
    )[0];
    const dragEvent = { dataTransfer: {} };

    expect(row.props.draggable).toBe(true);
    expect(rowRoles(row)).not.toContain('reorder');
    trigger(row, 'onDragstart', dragEvent);
    trigger(action, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(onTrackDragStart).toHaveBeenCalledWith(tracks[0], dragEvent);
    expect(onMoveTrack).toHaveBeenCalledWith('track-a', 1);
    app.unmount();
  });

  it('lets ordinal presentation pass pointer hits through to row selection', () => {
    for (const selector of [
      '.library-track-row__ordinal',
      '.library-track-row__ordinal-text',
    ]) {
      const rules = [...rowSource.matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
      expect(
        rules.some(
          ([, selectors, declarations]) =>
            selectors
              .split(',')
              .map((value) => value.trim())
              .includes(selector) &&
            /pointer-events:\s*none;/u.test(declarations),
        ),
      ).toBe(true);
    }
    expect(rowSource).toMatch(
      /\.library-track-row:hover \.library-track-row__playback-control,[^{}]+\{[^}]*pointer-events:\s*auto;/u,
    );
  });

  it('shares the centered ordinal slot between number and playback control', () => {
    const onTogglePlayback = vi.fn();
    const { app, root } = mountTable({
      collectionKind: 'playlist',
      playingTrackId: 'track-a',
      onTogglePlayback,
    });
    const firstRow = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    )[0];
    const ordinal = findAll(
      firstRow,
      (node) => node.props?.['data-track-column'] === 'ordinal',
    )[0];
    const playback = findAll(
      ordinal,
      (node) =>
        node.type === 'button' && textContent(node).includes('暫停：第一首歌'),
    )[0];

    expect(ordinal.props['data-column-align']).toBe('center');
    trigger(playback, 'onClick', { stopPropagation: vi.fn() });
    expect(onTogglePlayback).toHaveBeenCalledWith(tracks[0]);
    app.unmount();
  });

  it('does not advertise local-usage sorting until truthful values exist', () => {
    const unavailable = mountTable({ collectionKind: 'library-all' });
    expect(
      findAll(
        unavailable.root,
        (node) => node.props?.['aria-label'] === '播放次數排序',
      ),
    ).toHaveLength(0);
    unavailable.app.unmount();

    const available = mountTable({
      collectionKind: 'library-all',
      entries: [{ ...entries[0], playCount: 0 }],
    });
    expect(
      findAll(
        available.root,
        (node) => node.props?.['aria-label'] === '播放次數排序',
      ),
    ).toHaveLength(1);
    available.app.unmount();
  });

  it('right-aligns grouped local-usage values and their header', () => {
    const { app, root } = mountTable({
      collectionKind: 'library-all',
      entries: [{ ...entries[0], playCount: 1_234 }],
    });
    const header = findAll(root, (node) =>
      classIncludes(node, 'library-track-table__header'),
    )[0];
    const row = findAll(root, (node) =>
      classIncludes(node, 'library-track-row'),
    )[0];
    const usageHeader = findAll(
      header,
      (node) => node.props?.['data-track-column'] === 'usage',
    )[0];
    const usageCell = findAll(
      row,
      (node) => node.props?.['data-track-column'] === 'usage',
    )[0];

    expect(usageHeader.props['data-column-align']).toBe('end');
    expect(usageHeader.props['data-column-numeric']).toBe('true');
    expect(usageCell.props['data-column-align']).toBe('end');
    expect(usageCell.props['data-column-numeric']).toBe('true');
    expect(textContent(usageCell)).toContain('1,234');
    app.unmount();
  });

  it('keeps album-cell navigation and canonical artist credits without deep overrides', () => {
    expect(rowSource).toContain('<TrackArtistCredits');
    expect(rowSource).toContain("emit('navigateAlbum', entry.track)");
    expect(rowSource).not.toContain("emit('titleClick', entry.track)");
    expect(`${source}\n${rowSource}`).not.toContain(':deep(');
  });
});

describe('TrackTable virtualization', () => {
  const manyEntries = Array.from({ length: 10 }, (_, index) => ({
    track: { id: `track-${index}`, title: `第 ${index} 首`, duration: 60 },
  }));

  function tableBody(root) {
    return findAll(root, (node) =>
      classIncludes(node, 'library-track-table__body'),
    )[0];
  }

  function bodyRows(root) {
    return tableBody(root).children.filter((node) => node.type === 'li');
  }

  it('renders every row without window attributes up to the threshold', () => {
    const view = mount(TrackTable, {
      entries: manyEntries,
      collectionKind: 'library-all',
      virtualizeAbove: 10,
    });
    const rows = bodyRows(view.root);

    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.props['aria-setsize'] === undefined)).toBe(
      true,
    );
    expect(tableBody(view.root).props.style?.paddingBlockEnd).toBeUndefined();
  });

  it('windows long lists and pads the list to its full height', () => {
    const view = mount(TrackTable, {
      entries: manyEntries,
      collectionKind: 'library-all',
      virtualizeAbove: 5,
    });
    const rows = bodyRows(view.root);

    // No measurable viewport here: only the leading overscan rows render.
    expect(rows).toHaveLength(8);
    expect(rows[0].props['aria-setsize']).toBe(10);
    expect(rows[7].props['aria-posinset']).toBe(8);
    expect(tableBody(view.root).props.style).toEqual({
      paddingBlockEnd: `${2 * 46}px`,
    });
  });

  it('keeps a focused row mounted in place after it leaves the window', async () => {
    const props = reactive({
      entries: manyEntries,
      collectionKind: 'library-all',
      virtualizeAbove: 5,
    });
    const view = mount(TrackTable, props);
    const focusedRow = bodyRows(view.root)[0];

    trigger(tableBody(view.root), 'onFocusin', {
      target: { closest: () => ({ dataset: { virtualKey: 'track-0' } }) },
    });
    // New tracks ahead push the focused row to index 9, outside the window.
    // (Prepending avoids moving nodes, which the test host cannot do.)
    const added = Array.from({ length: 9 }, (_, index) => ({
      track: { id: `added-${index}`, title: `新 ${index}`, duration: 60 },
    }));
    props.entries = [...added, ...manyEntries];
    await nextTick();
    let rows = bodyRows(view.root);
    expect(rows).toHaveLength(9);
    expect(rows.at(-1)).toBe(focusedRow);
    expect(rows.at(-1).props['aria-posinset']).toBe(10);
    expect(rows.at(-1).props.style).toMatchObject({
      marginBlockStart: '46px',
    });
    expect(tableBody(view.root).props.style).toEqual({
      paddingBlockEnd: `${9 * 46}px`,
    });

    trigger(tableBody(view.root), 'onFocusout', { relatedTarget: null });
    await nextTick();
    rows = bodyRows(view.root);
    expect(rows).not.toContain(focusedRow);
    expect(rows).toHaveLength(8);
  });
});
