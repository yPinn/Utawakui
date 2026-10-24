import { expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
  textContent,
} from '../ui/uiTestHost.js';
import LibrarySourceTracklist from './LibrarySourceTracklist.vue';

vi.mock('../../composables/usePlaybackHistory.js', () => ({
  usePlaybackHistory: () => ({ playCountOf: () => 7 }),
}));
for (const filename of [
  './LibrarySourceTracklist.vue',
  '../track/TrackTable.vue',
  '../track/TrackCollectionRow.vue',
  '../track/TrackTableColumnChooser.vue',
  '../track/TrackArtistCredits.vue',
  '../ui/UiCheckbox.vue',
  '../ui/UiIconButton.vue',
  '../ui/UiMarqueeText.vue',
  '../ui/UiOverflowTooltip.vue',
  '../ui/UiPopover.vue',
  '../ui/UiStatusIcon.vue',
  '../ui/UiTextButton.vue',
  '../ui/TrackArtworkContent.vue',
  '../ui/UiTrackThumb.vue',
  '../ui/tooltip/UiTooltipSurface.vue',
  '../ui/UiSkeleton.vue',
]) {
  const component = (await import(filename)).default;
  attachClientRender(component, filename, import.meta.url);
}
vi.stubGlobal('requestAnimationFrame', (callback) => {
  callback();
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('document', {});
const local = {
  id: 'local',
  title: 'Canonical',
  artist: 'Artist',
  duration: 181,
};
const sourceRows = [
  {
    key: 'slot-1',
    position: 1,
    title: 'Not imported',
    artist: 'Artist',
    duration: 180,
    state: 'not-imported',
    sourceAvailable: true,
  },
  {
    key: 'slot-5',
    position: 5,
    title: 'Owned',
    state: 'available',
    localTrackId: 'local',
    linkedTrackId: 'local',
    sourceAvailable: true,
  },
  {
    key: 'slot-6',
    position: 6,
    title: 'Changed',
    state: 'needs-confirmation',
    linkedTrackId: 'local',
    sourceAvailable: true,
  },
  {
    key: 'slot-7',
    position: 7,
    title: 'Done',
    state: 'available',
    localTrackId: 'done',
    sourceAvailable: true,
  },
  {
    key: 'slot-8',
    position: 8,
    title: 'Owned again',
    state: 'available',
    localTrackId: 'local',
    sourceAvailable: true,
  },
  {
    key: 'slot-9',
    position: 9,
    title: 'Removed',
    state: 'not-imported',
    sourceAvailable: false,
  },
];
const tracksById = new Map([
  ['local', local],
  ['done', { ...local, id: 'done', title: 'Done', hasSeparation: true }],
]);
const cls = (node, name) =>
  String(node.props.class ?? '')
    .split(' ')
    .includes(name);
const buttons = (root, label) =>
  findAll(
    root,
    (node) =>
      node.type === 'button' &&
      (node.props['aria-label'] === label || textContent(node) === label),
  );

it('keeps source rows and selection mounted when separation updates the matching badges', async () => {
  const props = reactive({
    catalog: { rows: sourceRows },
    tracksById,
    selectedTrackId: 'local',
    currentTrackId: 'done',
  });
  const view = mount(LibrarySourceTracklist, props);
  const table = findAll(view.root, (node) =>
    cls(node, 'library-track-table'),
  )[0];
  const before = findAll(view.root, (node) => cls(node, 'library-track-row'));
  const completed = () =>
    findAll(view.root, (node) =>
      String(node.props['aria-label'] ?? '').startsWith('已有伴奏：'),
    );
  expect(completed()).toHaveLength(1);
  props.tracksById = new Map(
    [...tracksById].map(([id, track]) => [
      id,
      { ...track, ...(id === 'local' ? { hasSeparation: true } : {}) },
    ]),
  );
  await nextTick();
  const after = findAll(view.root, (node) => cls(node, 'library-track-row'));
  expect(
    findAll(view.root, (node) => cls(node, 'library-track-table'))[0] === table,
  ).toBe(true);
  expect(after.map((row, index) => row === before[index])).toEqual(
    before.map(() => true),
  );
  expect(
    after
      .filter((row) => cls(row, 'library-track-row--selected'))
      .map((row) => row.props['data-source-slot']),
  ).toEqual(['slot-5', 'slot-8']);
  expect(
    after.filter((row) => row.props['aria-disabled'] === 'true'),
  ).toHaveLength(3);
  expect(completed()).toHaveLength(3);
  expect(buttons(view.root, '下載 Not imported')).toHaveLength(1);
  view.app.unmount();
});

it('uses the source position without inheriting a disc number from another local release', () => {
  const view = mount(LibrarySourceTracklist, {
    catalog: { rows: [{ ...sourceRows[1], key: 'slot-1', position: 1 }] },
    tracksById: new Map([
      ['local', { ...local, discNumber: 2, trackNumber: 8 }],
    ]),
  });
  const ordinal = findAll(view.root, (node) =>
    cls(node, 'library-track-row__ordinal-text'),
  )[0];
  expect(textContent(ordinal)).toBe('1');
  view.app.unmount();
});

it('labels an untitled source slot without changing its raw download intent', () => {
  const onDownload = vi.fn();
  const view = mount(LibrarySourceTracklist, {
    catalog: { rows: [{ ...sourceRows[0], title: '' }] },
    tracksById,
    onDownload,
  });
  expect(textContent(view.root)).toContain('來源未提供曲名');
  const download = buttons(view.root, '下載 來源未提供曲名')[0];
  expect(download).toBeTruthy();
  trigger(download, 'onClick', { stopPropagation() {} });
  expect(onDownload).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'slot-1', title: '', track: null }),
  );
  view.app.unmount();
});

it('uses the shared album table, no repeated cover, unlink or footer, and preserves duplicate source occurrences', () => {
  const view = mount(LibrarySourceTracklist, {
    catalog: { rows: sourceRows },
    tracksById,
  });
  const rows = findAll(view.root, (node) => cls(node, 'library-track-row'));
  expect(rows).toHaveLength(6);
  expect(rows.map((row) => row.props['data-source-slot'])).toEqual(
    sourceRows.map((row) => row.key),
  );
  expect(
    findAll(view.root, (node) => cls(node, 'library-track-table__header')),
  ).toHaveLength(1);
  expect(
    findAll(view.root, (node) => cls(node, 'library-track-row__thumb')),
  ).toHaveLength(0);
  expect(textContent(view.root)).toContain('播放次數');
  expect(textContent(view.root)).not.toMatch(
    /解除關聯|解除連結|曲序依來源|本地可用/,
  );
  view.app.unmount();
});

it('keeps unowned and changed rows disabled while download occupies the same status lane as separation and badge', () => {
  const onDownload = vi.fn(),
    onSeparate = vi.fn(),
    onPlay = vi.fn(),
    onSelect = vi.fn(),
    onTogglePlayback = vi.fn();
  const view = mount(LibrarySourceTracklist, {
    catalog: { rows: sourceRows },
    tracksById,
    onDownload,
    onSeparate,
    onPlay,
    onSelect,
    onTogglePlayback,
  });
  const rows = findAll(view.root, (node) => cls(node, 'library-track-row'));
  for (const index of [0, 2, 5]) {
    expect(rows[index].props['aria-disabled']).toBe('true');
    expect(
      buttons(rows[index], `播放：${sourceRows[index].title}`),
    ).toHaveLength(0);
    const action = findAll(rows[index], (node) =>
      cls(node, 'library-track-row__action'),
    )[0];
    expect(action.props.disabled).toBe(true);
    trigger(action, 'onClick', { stopPropagation() {} });
    trigger(action, 'onDblclick', { stopPropagation() {} });
    trigger(action, 'onKeydown', {
      key: 'Enter',
      preventDefault() {},
      stopPropagation() {},
    });
    trigger(rows[index], 'onContextmenu', { preventDefault() {} });
  }
  expect(onPlay).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
  for (const [index, label] of [
    [0, '下載 Not imported'],
    [1, '加入伴奏處理佇列：Canonical'],
  ]) {
    const lane = findAll(rows[index], (node) =>
      cls(node, 'library-track-row__status'),
    )[0];
    const button = buttons(lane, label)[0];
    expect(button).toBeTruthy();
    expect(button.props.disabled).toBe(false);
    trigger(button, 'onClick', { stopPropagation() {} });
  }
  expect(onDownload).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'slot-1', track: null }),
  );
  expect(onSeparate).toHaveBeenCalledWith(local);
  expect(
    findAll(rows[3], (node) => node.props['aria-label'] === '已有伴奏：Done'),
  ).toHaveLength(1);
  expect(buttons(rows[3], '加入伴奏處理佇列：Done')).toHaveLength(0);
  expect(buttons(rows[5], '下載 Removed')).toHaveLength(0);
  trigger(buttons(rows[1], '播放：Canonical')[0], 'onClick', {
    stopPropagation() {},
  });
  expect(onTogglePlayback).toHaveBeenCalledWith(local);
  const localAction = findAll(rows[1], (node) =>
    cls(node, 'library-track-row__action'),
  )[0];
  trigger(localAction, 'onDblclick', { stopPropagation() {} });
  expect(onPlay).toHaveBeenCalledWith(local);
  view.app.unmount();
});

it('disables only downloads during acquisition and retains the shared pending separation state', () => {
  const view = mount(LibrarySourceTracklist, {
    catalog: { rows: sourceRows },
    tracksById,
    downloadDisabled: true,
    queuedTrackIds: new Set(['local']),
  });
  expect(buttons(view.root, '下載 Not imported')[0].props.disabled).toBe(true);
  expect(
    findAll(
      view.root,
      (node) => node.props['aria-label'] === '伴奏處理中：Canonical',
    ),
  ).toHaveLength(2);
  expect(buttons(view.root, '加入伴奏處理佇列：Canonical')).toHaveLength(0);
  view.app.unmount();
});

it('offers explicit local inclusion for excluded audio and never turns it into a playable row', () => {
  const onDownload = vi.fn(),
    onPlay = vi.fn();
  const view = mount(LibrarySourceTracklist, {
    catalog: {
      rows: [
        { ...sourceRows[0], state: 'excluded', localCandidateTrackId: 'local' },
      ],
    },
    tracksById,
    onDownload,
    onPlay,
  });
  const include = buttons(view.root, '納入本地曲目：Not imported')[0];
  expect(include).toBeTruthy();
  expect(buttons(view.root, '下載 Not imported')).toHaveLength(0);
  trigger(include, 'onClick', { stopPropagation() {} });
  expect(onDownload).toHaveBeenCalledWith(
    expect.objectContaining({
      state: 'excluded',
      localCandidateTrackId: 'local',
      track: null,
    }),
  );
  expect(onPlay).not.toHaveBeenCalled();
  view.app.unmount();
});
