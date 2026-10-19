import { h, nextTick, reactive, shallowRef } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
const fixture = vi.hoisted(() => ({}));
vi.mock('../../composables/useImportSession.js', () => ({
  useImportSession: () => fixture.session,
}));
vi.mock('../../composables/useLocalImport.js', () => ({
  useLocalImport: () => ({
    state: { imported: [], skipped: [] },
    importFiles: vi.fn(),
  }),
}));
vi.mock('../layout/AppRightDockSection.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('section', [slots.trailing?.(), slots.default?.()]),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h('button', {
          'aria-label': props.label,
          onClick: () => emit('click'),
        }),
  },
}));
vi.mock('../ui/UiHint.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('p', slots.default?.()),
  },
}));
vi.mock('../ui/UiNotice.vue', () => ({ default: { setup: () => () => null } }));
vi.mock('./ImportSourceRow.vue', () => ({
  default: {
    props: ['actionLabel', 'actionDisabled'],
    emits: ['action'],
    setup:
      (props, { emit }) =>
      () =>
        h(
          'button',
          {
            id: 'source',
            disabled: props.actionDisabled,
            onClick: () => emit('action'),
          },
          props.actionLabel,
        ),
  },
}));
vi.mock('./ImportSourceField.vue', () => ({
  default: {
    props: { busy: Boolean },
    setup: (props) => () =>
      h('input', { id: 'source-input', disabled: props.busy }),
  },
}));
vi.mock('./ImportActivityMonitor.vue', () => ({
  default: {
    props: ['batch'],
    emits: ['review'],
    setup:
      (props, { emit }) =>
      () =>
        h(
          'button',
          {
            id: 'monitor-' + props.batch.id,
            onClick: () => emit('review', props.batch.id),
          },
          props.batch.title,
        ),
  },
}));
vi.mock('./ImportReviewModal.vue', () => ({
  default: {
    props: ['open', 'batch', 'closeDisabled'],
    emits: ['close', 'submitted'],
    setup: (props, { emit }) => {
      fixture.completeSubmission = (id) => emit('submitted', id);
      return () =>
        props.open
          ? h('dialog', { 'data-batch': props.batch?.id }, [
              props.batch?.title,
              h('button', {
                id: 'close',
                disabled: props.closeDisabled,
                onClick: () => {
                  if (!props.closeDisabled) emit('close');
                },
              }),
            ])
          : null;
    },
  },
}));
import Dock from './ImportDockContent.vue';
attachClientRender(Dock, './ImportDockContent.vue', import.meta.url);
const node = (root, id) => findAll(root, (n) => n.props.id === id)[0];
beforeEach(() => {
  const state = reactive({
    input: 'a',
    sourceKind: 'playlist',
    playlistTitle: 'Draft A',
    collectionKind: 'playlist',
    isImporting: true,
    isResolving: false,
    isOpeningDiscovery: false,
  });
  fixture.session = {
    state,
    activity: reactive({
      batches: [
        { id: 'accepted', title: 'Accepted A', phase: 'running', tracks: [] },
      ],
    }),
    currentBatchId: shallowRef('accepted'),
    playlistStats: shallowRef({ total: 2 }),
    cancelBatch: vi.fn(),
    retryBatch: vi.fn(),
    dismissBatch: vi.fn(),
    setInput: vi.fn((value) => {
      state.input = value;
      state.playlistTitle = 'Draft B';
      state.isImporting = false;
    }),
    getTrackStatusClass: () => 'pending',
  };
});
describe('Import Dock accepted work', () => {
  it('closes and reopens the current running batch without cancelling its work', async () => {
    const mounted = mount(Dock, { active: true });
    trigger(node(mounted.root, 'monitor-accepted'), 'onClick');
    await nextTick();
    trigger(node(mounted.root, 'close'), 'onClick');
    await nextTick();
    expect(findAll(mounted.root, (n) => n.type === 'dialog')).toHaveLength(0);
    expect(fixture.session.cancelBatch).not.toHaveBeenCalled();
    expect(fixture.session.state.isImporting).toBe(true);
    trigger(node(mounted.root, 'source'), 'onClick');
    await nextTick();
    expect(
      findAll(mounted.root, (n) => n.type === 'dialog')[0].props['data-batch'],
    ).toBe('accepted');
    mounted.app.unmount();
  });
  it('does not reopen a closed review when submission finishes after leaving its tab', async () => {
    const props = reactive({ active: true });
    const mounted = mount(Dock, props);
    trigger(node(mounted.root, 'source'), 'onClick');
    await nextTick();
    props.active = false;
    await nextTick();
    fixture.completeSubmission('accepted');
    props.active = true;
    await nextTick();
    expect(findAll(mounted.root, (n) => n.type === 'dialog')).toHaveLength(0);
    trigger(node(mounted.root, 'monitor-accepted'), 'onClick');
    await nextTick();
    expect(
      findAll(mounted.root, (n) => n.type === 'dialog')[0].props['data-batch'],
    ).toBe('accepted');
    mounted.app.unmount();
  });
  it('keeps source input available and can reopen accepted work after leaving and changing drafts', async () => {
    const props = reactive({ active: true });
    const mounted = mount(Dock, props);
    expect(node(mounted.root, 'source-input').props.disabled).toBe(false);
    trigger(node(mounted.root, 'monitor-accepted'), 'onClick');
    await nextTick();
    expect(
      findAll(mounted.root, (n) => n.type === 'dialog')[0].props['data-batch'],
    ).toBe('accepted');
    props.active = false;
    await nextTick();
    expect(findAll(mounted.root, (n) => n.type === 'dialog')).toHaveLength(0);
    fixture.session.setInput('b');
    props.active = true;
    await nextTick();
    trigger(node(mounted.root, 'monitor-accepted'), 'onClick');
    await nextTick();
    expect(
      textContent(findAll(mounted.root, (n) => n.type === 'dialog')[0]),
    ).toContain('Accepted A');
    trigger(node(mounted.root, 'close'), 'onClick');
    await nextTick();
    expect(fixture.session.cancelBatch).not.toHaveBeenCalled();
    trigger(node(mounted.root, 'monitor-accepted'), 'onClick');
    await nextTick();
    expect(findAll(mounted.root, (n) => n.type === 'dialog')).toHaveLength(1);
    mounted.app.unmount();
  });
});
