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
        h('li', [slots.lead?.(), props.track.title, slots.trail?.()]),
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
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
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
  [UiChip, '../ui/UiChip.vue'],
  [UiHint, '../ui/UiHint.vue'],
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
const button = (name) => {
  const buttons = findAll(mounted.root, (node) => node.type === 'button');
  return (
    buttons.find((node) => textContent(node) === name) ||
    buttons.find((node) => textContent(node).includes(name))
  );
};
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

it('explains the EP code in the shared Chinese release type option without changing its value', async () => {
  trigger(field('release-type-mode'), 'onChange', {
    target: { value: 'manual' },
  });
  await settle();
  const option = findAll(
    mounted.root,
    (node) => node.type === 'option' && node.props.value === 'ep',
  )[0];
  expect(textContent(option)).toBe('迷你專輯（EP）');
});

it('shows source facts once in the source options and keeps the three useful fields', () => {
  const sourceOptions = findAll(
    mounted.root,
    (node) => node.type === 'option' && node.props.value === 'source',
  );
  expect(sourceOptions.map(textContent)).toEqual([
    '沿用來源：單曲',
    '沿用來源：2026',
    '沿用來源：無資料',
  ]);
  expect(field('release-type-mode')).toBeTruthy();
  expect(field('release-date-mode')).toBeTruthy();
  expect(field('release-count-mode')).toBeTruthy();
  expect(textContent(mounted.root)).not.toContain('來源記錄：');
  expect(textContent(mounted.root)).not.toContain('更換音源後需重新確認');
});

it('separates editable release data from the member list in two labelled scroll panes', () => {
  expect(
    findAll(
      mounted.root,
      (node) =>
        node.props['aria-label'] === '發行資料' &&
        String(node.props.class || '').includes('release-info-editor__pane'),
    ),
  ).toHaveLength(1);
  expect(
    findAll(
      mounted.root,
      (node) =>
        node.props['aria-label'] === '收錄曲目' &&
        String(node.props.class || '').includes('release-info-editor__pane'),
    ),
  ).toHaveLength(1);
  expect(
    findAll(mounted.root, (node) =>
      String(node.props.class || '').includes('release-info-editor__workspace'),
    ),
  ).toHaveLength(1);
  expect(button('儲存')).toBeTruthy();
});
afterEach(() => {
  mounted?.app.unmount();
  owner.dispose();
  vi.unstubAllGlobals();
});

describe('ReleaseInfoEditor mounted operations', () => {
  it('hides lead-track editing and preserves the existing value when saving another field', async () => {
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({ leadTrackId: 'a' }),
    });
    await owner.reload();
    await settle();
    expect(field('release-lead-track')).toBeUndefined();
    expect(textContent(mounted.root)).not.toContain('主打曲目');
    expect(owner.state.draft.leadTrackId).toBe('a');
    trigger(field('release-date-mode'), 'onChange', {
      target: { value: 'clear' },
    });
    await settle();
    trigger(button('儲存'), 'onClick');
    await settle();
    const intent = bridge.saveReleaseInfo.mock.calls[0][0];
    expect(intent.set).toEqual({ date: null });
    expect(intent).not.toHaveProperty('leadTrackId');
  });
  it('uses semantic chips for each binding state and only offers local repair where allowed', async () => {
    const states = [
      'current',
      'changed',
      'unresolved',
      'missing',
      'unverified',
      'unknown',
    ];
    const members = states.map((bindingStatus, index) => ({
      trackId: `state-${index}`,
      bindingStatus,
    }));
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({
        sourceBacked: false,
        memberCount: members.length,
        memberTrackIds: members.map((m) => m.trackId),
        members,
      }),
    });
    await owner.reload();
    await settle();
    const chips = () =>
      findAll(mounted.root, (node) =>
        String(node.props.class || '')
          .split(',')
          .some((c) => c.includes('ui-chip--')),
      );
    expect(
      chips().map((node) => [textContent(node), String(node.props.class)]),
    ).toEqual([
      ['已確認', expect.stringContaining('ui-chip--success')],
      ['音源已變更', expect.stringContaining('ui-chip--warning')],
      ['待確認音源', expect.stringContaining('ui-chip--warning')],
      ['音源不存在', expect.stringContaining('ui-chip--danger')],
      ['尚未確認', expect.stringContaining('ui-chip--muted')],
      ['尚未確認', expect.stringContaining('ui-chip--muted')],
    ]);
    const boxes = () =>
      findAll(
        mounted.root,
        (node) => node.type === 'input' && node.props.type === 'checkbox',
      );
    expect(boxes()).toHaveLength(3);
    expect(boxes()[0].props['aria-label']).toContain('無法使用的曲目 2');
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({ members }),
    });
    await owner.reload();
    await settle();
    expect(chips()).toHaveLength(6);
    expect(boxes()).toHaveLength(0);
  });
  it('keeps the bounded edit dialog and an explicit empty member state', async () => {
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({ members: [], memberTrackIds: [], memberCount: 0 }),
    });
    await owner.reload();
    await settle();
    const dialog = findAll(
      mounted.root,
      (node) => node.props.role === 'dialog',
    )[0];
    expect(dialog.props['data-max-block-size']).toBe('small');
    expect(textContent(mounted.root)).toContain('尚無收錄曲目');
    expect(
      findAll(
        mounted.root,
        (node) => node.props.role === 'region' && node.props.tabindex === '0',
      ),
    ).toHaveLength(2);
  });
  it('limits local reconfirmation to 100 selected tracks and retains access to existing selections', async () => {
    const members = Array.from({ length: 101 }, (_, index) => ({
      trackId: `local-${index}`,
      bindingStatus: 'changed',
    }));
    bridge.getReleaseInfo.mockResolvedValueOnce({
      status: 'ok',
      libraryEpoch: 1,
      release: release({
        sourceBacked: false,
        memberCount: 101,
        memberTrackIds: members.map((m) => m.trackId),
        members,
      }),
    });
    await owner.reload();
    await settle();
    const boxes = () =>
      findAll(
        mounted.root,
        (node) => node.type === 'input' && node.props.type === 'checkbox',
      );
    for (let i = 0; i < 100; i++)
      trigger(boxes()[i], 'onChange', { target: { checked: true } });
    await settle();
    expect(boxes()[100].props.disabled).toBe(true);
    expect(boxes()[0].props.disabled).toBe(false);
    trigger(boxes()[100], 'onChange', { target: { checked: true } });
    trigger(button('確認選取並儲存'), 'onClick');
    await settle();
    expect(bridge.saveReleaseInfo.mock.calls[0][0].reconfirmTrackIds).toEqual(
      members.slice(0, 100).map((m) => m.trackId),
    );
  });
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
    expect(button('儲存').props.disabled).toBe(true);
    expect(
      findAll(
        mounted.root,
        (node) => node.type === 'input' && node.props.type === 'checkbox',
      ),
    ).toHaveLength(0);
    trigger(button('確認音源並儲存'), 'onClick');
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
    trigger(button('載入更多'), 'onClick');
    await settle();
    trigger(button('確認選取並儲存'), 'onClick');
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
    trigger(button('儲存'), 'onClick');
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
    trigger(button('儲存'), 'onClick');
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
    trigger(button('確認選取並儲存'), 'onClick');
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
    trigger(button('儲存'), 'onClick');
    await settle();
    expect(field('release-date-mode').props.value).toBe('clear');
    expect(button('重新載入')).toBeTruthy();
  });
  it('keeps status messages outside both scroll panes while reloading an existing draft', async () => {
    let finish;
    bridge.getReleaseInfo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = owner.reload();
    await settle();
    const status = findAll(mounted.root, (node) =>
      String(node.props.class).includes('release-info-editor__status'),
    )[0];
    expect(textContent(status)).toContain('讀取中');
    expect(field('release-type-mode').props.disabled).toBe(true);
    expect(
      findAll(mounted.root, (node) =>
        String(node.props.class).includes('release-info-editor__workspace'),
      ),
    ).toHaveLength(1);
    finish({ status: 'conflict' });
    await pending;
    await settle();
    expect(textContent(status)).toContain('資料已變更');
    expect(field('release-type-mode')).toBeTruthy();
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
    trigger(button('建立'), 'onClick');
    await settle();
    expect(bridge.createLocalRelease).toHaveBeenCalledWith({
      trackId: 'a',
      name: 'Acoustic Single',
      libraryEpoch: 1,
    });
    expect(field('release-type-mode')).toBeTruthy();
    expect(dialog().props['data-size']).toBe('wide');
    expect(dialog().props['data-fixed-height']).toBe(true);
    expect(dialog().props['data-max-block-size']).toBe('small');
    expect(bridge.saveReleaseInfo).not.toHaveBeenCalled();
  });
});
