import { h, nextTick, reactive, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import BgmPlayer from './BgmPlayer.vue';
import { attachClientRender, findAll, mount } from '../ui/uiTestHost.js';

const fixture = vi.hoisted(() => {
  let resolve;
  return {
    ready: new Promise((done) => {
      resolve = done;
    }),
    resolve: () => resolve(),
    loads: 0,
    mounts: 0,
    unmounts: 0,
    initialize: vi.fn(),
    session: null,
  };
});
vi.mock('../../composables/useBgmSession.js', () => ({
  useBgmSession: () => fixture.session,
}));
vi.mock('./BgmPlayerPanel.vue', async () => {
  fixture.loads += 1;
  await fixture.ready;
  const { defineComponent, h, onMounted, onUnmounted } = await import('vue');
  return {
    __esModule: true,
    default: defineComponent({
      props: { open: Boolean },
      emits: ['requestClose'],
      setup(props, { emit }) {
        onMounted(() => {
          fixture.mounts += 1;
        });
        onUnmounted(() => {
          fixture.unmounts += 1;
        });
        return () =>
          props.open
            ? h('aside', { onClick: () => emit('requestClose') })
            : null;
      },
    }),
  };
});
attachClientRender(BgmPlayer, './BgmPlayer.vue', import.meta.url);

describe('BgmPlayer startup boundary', () => {
  it('restores and projects closed state before loading UI, retaining the panel across rapid disclosure', async () => {
    const state = reactive({ error: null });
    const handoffState = reactive({
      phase: 'idle',
      audibleLane: null,
      error: null,
    });
    fixture.session = {
      state,
      handoffState,
      deckState: reactive({ error: null }),
      initialize: fixture.initialize,
    };
    const open = ref(false);
    const statuses = vi.fn();
    const close = vi.fn();
    const { app, root } = mount({
      setup: () => () =>
        h(BgmPlayer, {
          open: open.value,
          id: 'bgm-test',
          class: 'shell-bgm',
          onStatusChange: statuses,
          onRequestClose: close,
        }),
    });
    const surfaces = () => findAll(root, (node) => node.type === 'aside');
    expect(fixture.initialize).toHaveBeenCalledTimes(1);
    expect(fixture.loads).toBe(0);
    expect(statuses).toHaveBeenLastCalledWith({ state: 'idle', label: '' });
    handoffState.phase = 'bgm-playing';
    handoffState.audibleLane = 'bgm';
    await nextTick();
    expect(statuses).toHaveBeenLastCalledWith({
      state: 'playing',
      label: 'BGM 播放中',
    });
    open.value = true;
    await nextTick();
    await vi.waitFor(() => expect(fixture.loads).toBe(1));
    open.value = false;
    await nextTick();
    fixture.resolve();
    await vi.waitFor(() => expect(fixture.mounts).toBe(1));
    expect(surfaces()).toHaveLength(0);
    expect(fixture.initialize).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 2; i += 1) {
      open.value = true;
      await nextTick();
      expect(surfaces()).toHaveLength(1);
      expect(surfaces()[0].props.id).toBe('bgm-test');
      expect(surfaces()[0].props.class).toBe('shell-bgm');
      surfaces()[0].props.onClick();
      open.value = false;
      await nextTick();
    }
    expect(close).toHaveBeenCalledTimes(2);
    expect(fixture.mounts).toBe(1);
    expect(fixture.unmounts).toBe(0);
    state.error = 'failed';
    await nextTick();
    expect(statuses).toHaveBeenLastCalledWith({
      state: 'attention',
      label: 'BGM 操作失敗',
    });
    expect(fixture.initialize).toHaveBeenCalledTimes(1);
    app.unmount();
    expect(fixture.unmounts).toBe(1);
  });
});
