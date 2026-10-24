import { h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
const mocks = vi.hoisted(() => ({
  tracks: new Map([['a', { id: 'a', title: 'RASEN' }]]),
  refresh: vi.fn(),
  play: vi.fn(),
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => ({ tracksById: { __v_isRef: true, value: mocks.tracks } }),
}));
vi.mock('../../composables/usePlaylists.js', () => ({
  usePlaylists: () => ({ refresh: mocks.refresh }),
}));
vi.mock('../../composables/useReleaseMembers.js', () => ({
  useReleaseMembers: () => ({
    initialize: vi.fn(),
    dispose: vi.fn(),
    admitTrackReleases: vi.fn(),
  }),
}));
vi.mock('../ui/UiModal.vue', () => ({
  default: {
    props: ['open', 'size', 'fixedHeight', 'maxBlockSize'],
    setup:
      (props, { slots }) =>
      () =>
        props.open
          ? h(
              'div',
              {
                role: 'dialog',
                'data-size': props.size,
                'data-fixed-height': props.fixedHeight,
                'data-max-block-size': props.maxBlockSize,
              },
              [slots.default?.(), slots.footer?.()],
            )
          : null,
  },
}));
vi.mock('../ui/UiScrollLayout.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}));
vi.mock('../track/TrackIdentityRow.vue', () => ({
  default: {
    props: ['track'],
    setup:
      (props, { slots }) =>
      () =>
        h('li', [props.track.title, slots.trail?.()]),
  },
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    props: ['disabled', 'loading'],
    emits: ['click'],
    setup:
      (props, { slots, emit }) =>
      () =>
        h(
          'button',
          {
            disabled: props.disabled || props.loading,
            onClick: () => {
              if (!props.disabled && !props.loading) emit('click');
            },
          },
          slots.default?.(),
        ),
  },
}));
import UiTextField from '../ui/UiTextField.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiField from '../ui/UiField.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import ReleaseInfoFields from './ReleaseInfoFields.vue';
import ReleaseMembersPanel from './ReleaseMembersPanel.vue';
import ReleaseInfoEditor from './ReleaseInfoEditor.vue';
import { useReleaseOrganization } from '../../composables/useReleaseOrganization.js';
for (const [component, path] of [
  [UiTextField, '../ui/UiTextField.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiCheckbox, '../ui/UiCheckbox.vue'],
  [ReleaseInfoFields, './ReleaseInfoFields.vue'],
  [ReleaseMembersPanel, './ReleaseMembersPanel.vue'],
  [ReleaseInfoEditor, './ReleaseInfoEditor.vue'],
])
  attachClientRender(component, path, import.meta.url);
const release = (extra = {}) => ({
  id: 'r',
  name: 'RASEN',
  revision: 2,
  sourceBacked: true,
  effective: {
    type: 'single',
    date: { value: '2026', precision: 'year' },
    totalTrackCount: 1,
  },
  overrides: {},
  sourceValues: { type: 'single', date: { value: '2026', precision: 'year' } },
  leadTrackId: null,
  memberCount: 1,
  memberTrackIds: ['a'],
  members: [{ trackId: 'a', bindingStatus: 'current' }],
  ...extra,
});
let bridge;
let mounted;
const owner = useReleaseOrganization();
const field = (id) =>
  findAll(
    mounted.root,
    (node) => ['input', 'select'].includes(node.type) && node.props.id === id,
  )[0];
const button = (name) =>
  findAll(mounted.root, (node) => node.type === 'button').find((node) =>
    textContent(node).includes(name),
  );
async function settle() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}
beforeEach(async () => {
  vi.clearAllMocks();
  bridge = {
    getReleaseInfo: vi.fn(() =>
      Promise.resolve({ status: 'ok', libraryEpoch: 1, release: release() }),
    ),
    saveReleaseInfo: vi.fn(() =>
      Promise.resolve({
        status: 'ok',
        libraryEpoch: 1,
        release: release({ revision: 3 }),
      }),
    ),
    createLocalRelease: vi.fn(() =>
      Promise.resolve({
        status: 'ok',
        libraryEpoch: 1,
        release: release({ sourceBacked: false }),
      }),
    ),
    getTrackReleases: vi.fn(() =>
      Promise.resolve({ status: 'ok', libraryEpoch: 1, releases: [] }),
    ),
    onReleaseOrganizationChanged: vi.fn(() => vi.fn()),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
  mounted = mount(ReleaseInfoEditor);
  await owner.open('r');
  await settle();
});
afterEach(() => {
  mounted?.app.unmount();
  owner.dispose();
  vi.unstubAllGlobals();
});

describe('ReleaseInfoEditor mounted operations', () => {
  it('requires the explicit whole-release initialization before an ordinary legacy save', async () => {
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({
        sourceBacked: false,
        canInitializeBindings: true,
        members: [{ trackId: 'a', bindingStatus: 'unresolved' }],
      }),
    });
    await owner.reload();
    await settle();
    trigger(field('release-date-mode'), 'onChange', {
      target: { value: 'clear' },
    });
    await settle();
    expect(button('儲存發行資訊').props.disabled).toBe(true);
    expect(
      findAll(
        mounted.root,
        (node) => node.type === 'input' && node.props.type === 'checkbox',
      ),
    ).toHaveLength(0);
    trigger(button('確認本機發行音源'), 'onClick');
    await settle();
    expect(bridge.saveReleaseInfo.mock.calls[0][0]).toMatchObject({
      initializeBindings: true,
      set: { date: null },
    });
  });
  it('preserves selections across a same-revision member page append', async () => {
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({
        sourceBacked: false,
        members: [{ trackId: 'a', bindingStatus: 'changed' }],
        hasMore: true,
        nextOffset: 100,
      }),
    });
    await owner.reload();
    await settle();
    const checkbox = findAll(
      mounted.root,
      (node) => node.type === 'input' && node.props.type === 'checkbox',
    )[0];
    trigger(checkbox, 'onChange', { target: { checked: true } });
    await settle();
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({
        sourceBacked: false,
        members: [{ trackId: 'b', bindingStatus: 'missing' }],
        hasMore: false,
      }),
    });
    trigger(button('載入更多成員'), 'onClick');
    await settle();
    trigger(button('確認選取音源'), 'onClick');
    await settle();
    expect(bridge.saveReleaseInfo.mock.calls[0][0].reconfirmTrackIds).toEqual([
      'a',
    ]);
  });
  it('changes classification and clears a source date without erasing source facts', async () => {
    trigger(field('release-type-mode'), 'onChange', {
      target: { value: 'manual' },
    });
    await settle();
    trigger(field('release-type-value'), 'onChange', {
      target: { value: 'ep' },
    });
    trigger(field('release-date-mode'), 'onChange', {
      target: { value: 'clear' },
    });
    await settle();
    trigger(button('儲存發行資訊'), 'onClick');
    await settle();
    expect(bridge.saveReleaseInfo.mock.calls[0][0]).toMatchObject({
      set: { type: 'ep', date: null },
      remove: [],
    });
    expect(mocks.play).not.toHaveBeenCalled();
  });
  it('restores source data with remove rather than a null override', async () => {
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({
        overrides: { date: null },
        effective: { type: 'single', date: null, totalTrackCount: 1 },
      }),
    });
    await owner.reload();
    await settle();
    trigger(field('release-date-mode'), 'onChange', {
      target: { value: 'source' },
    });
    await settle();
    trigger(button('儲存發行資訊'), 'onClick');
    await settle();
    expect(bridge.saveReleaseInfo.mock.calls[0][0]).toMatchObject({
      set: {},
      remove: ['date'],
    });
  });
  it('offers explicit source-free repair for selected changed members only', async () => {
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({
        sourceBacked: false,
        members: [{ trackId: 'a', bindingStatus: 'changed' }],
      }),
    });
    await owner.reload();
    await settle();
    const checkbox = findAll(
      mounted.root,
      (node) => node.type === 'input' && node.props.type === 'checkbox',
    )[0];
    trigger(checkbox, 'onChange', { target: { checked: true } });
    await settle();
    trigger(button('確認選取音源'), 'onClick');
    await settle();
    expect(bridge.saveReleaseInfo.mock.calls[0][0].reconfirmTrackIds).toEqual([
      'a',
    ]);
  });
  it('keeps conflict draft values visible with a reload entry', async () => {
    trigger(field('release-date-mode'), 'onChange', {
      target: { value: 'clear' },
    });
    await settle();
    bridge.saveReleaseInfo.mockResolvedValueOnce({ status: 'conflict' });
    trigger(button('儲存發行資訊'), 'onClick');
    await settle();
    expect(field('release-date-mode').props.value).toBe('clear');
    expect(button('重新載入')).toBeTruthy();
  });
  it('creates one local single and then presents its saved editor', async () => {
    await owner.openCreate({
      id: 'a',
      title: 'RASEN',
      sourceType: 'local-file',
    });
    await settle();
    trigger(field('release-create-name'), 'onInput', {
      target: { value: 'Acoustic Single' },
    });
    await settle();
    const dialog = () =>
      findAll(mounted.root, (node) => node.props.role === 'dialog')[0];
    expect(dialog().props['data-size']).toBe('default');
    expect(dialog().props['data-fixed-height']).toBe(false);
    expect(dialog().props['data-max-block-size']).toBe('small');
    trigger(button('建立本機單曲'), 'onClick');
    await settle();
    expect(bridge.createLocalRelease).toHaveBeenCalledWith({
      trackId: 'a',
      name: 'Acoustic Single',
      libraryEpoch: 1,
    });
    expect(field('release-type-mode')).toBeTruthy();
    expect(dialog().props['data-size']).toBe('wide');
    expect(dialog().props['data-fixed-height']).toBe(true);
    expect(dialog().props['data-max-block-size']).toBe('large');
    expect(bridge.saveReleaseInfo).not.toHaveBeenCalled();
  });
});
