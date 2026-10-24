import { h, nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import Monitor from './ImportActivityMonitor.vue';
vi.mock('../ui/UiTrackRow.vue', () => ({
  default: {
    props: ['track'],
    emits: ['rowClick'],
    setup:
      (props, { slots, emit }) =>
      () =>
        h('div', [
          h(
            'button',
            { id: 'review', onClick: () => emit('rowClick') },
            props.track.title,
          ),
          h('span', props.track.artist),
          slots.trail?.(),
        ]),
  },
}));
vi.mock('../ui/UiProgress.vue', () => ({
  default: {
    props: ['value', 'max', 'valueText'],
    setup: (props) => () =>
      h('progress', { value: props.value, max: props.max }, props.valueText),
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
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'disabled'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h('button', {
          'aria-label': props.label,
          disabled: props.disabled,
          onClick: (e) => emit('click', e),
        }),
  },
}));
vi.mock('../ui/UiStatusIcon.vue', () => ({
  default: { props: ['label'], setup: (props) => () => h('span', props.label) },
}));
attachClientRender(Monitor, './ImportActivityMonitor.vue', import.meta.url);
afterEach(() => vi.useRealTimers());
const batch = () =>
  reactive({
    id: 'one',
    kind: 'playlist',
    title: 'Accepted source',
    phase: 'running',
    tracks: [
      { id: 'a', downloadRequired: true, status: 'downloading' },
      { id: 'b', downloadRequired: true, status: 'pending' },
    ],
  });
describe('compact import monitoring', () => {
  it('keeps accepted release year and Chinese type in completed activity', () => {
    const source = batch();
    Object.assign(source, {
      phase: 'completed',
      collectionKind: 'album',
      releaseType: 'ep',
      releaseDate: { value: '2026', precision: 'year' },
    });
    const mounted = mount(Monitor, { batch: source });
    expect(textContent(mounted.root)).toContain('2026 · 迷你專輯');
    mounted.app.unmount();
  });
  it('avoids a progress flash for short jobs and retains their result', async () => {
    vi.useFakeTimers();
    const source = batch();
    const mounted = mount(Monitor, { batch: source });
    await nextTick();
    await vi.advanceTimersByTimeAsync(100);
    expect(textContent(mounted.root)).toBe('');
    source.phase = 'completed';
    source.tracks.forEach((t) => (t.status = 'done'));
    await nextTick();
    expect(textContent(mounted.root)).toContain('Accepted source');
    expect(findAll(mounted.root, (n) => n.type === 'progress')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(findAll(mounted.root, (n) => n.type === 'progress')).toHaveLength(0);
    mounted.app.unmount();
  });
  it('shows count progress only after the delay and reopens the same accepted batch', async () => {
    vi.useFakeTimers();
    const onReview = vi.fn();
    const source = batch();
    const mounted = mount(Monitor, { batch: source, onReview });
    await nextTick();
    await vi.advanceTimersByTimeAsync(180);
    await nextTick();
    const progress = findAll(mounted.root, (n) => n.type === 'progress')[0];
    expect(progress.props.max).toBe(2);
    expect(progress.props.value).toBe(0);
    trigger(
      findAll(mounted.root, (n) => n.props.id === 'review')[0],
      'onClick',
    );
    expect(onReview).toHaveBeenCalledWith('one');
    source.phase = 'failed';
    source.tracks[0].status = 'error';
    await nextTick();
    expect(textContent(mounted.root)).toContain('未完成');
    mounted.app.unmount();
  });
});
