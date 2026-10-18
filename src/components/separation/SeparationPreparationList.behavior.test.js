import { h, nextTick, shallowReactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import List from './SeparationPreparationList.vue';

vi.mock('../track/TrackIdentityRow.vue', () => ({
  default: {
    props: ['track', 'navigation', 'hideDuration', 'overflow', 'thumbLoading'],
    setup:
      (props, { slots }) =>
      () =>
        h('li', { 'data-track': props.track.id }, [
          h('span', props.track.title),
          slots.trail?.(),
        ]),
  },
}));
vi.mock('../layout/AppRightDockSection.vue', () => ({
  default: {
    props: ['heading'],
    setup:
      (props, { slots }) =>
      () =>
        h('section', [
          h('h3', props.heading),
          slots.trailing?.(),
          slots.default?.(),
        ]),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['icon', 'label', 'disabled'],
    emits: ['click', 'dblclick'],
    setup:
      (props, { emit }) =>
      () =>
        h('button', {
          disabled: props.disabled,
          'aria-label': props.label,
          onClick: (event) => emit('click', event),
        }),
  },
}));
vi.mock('../ui/UiStatusIcon.vue', () => ({
  default: { props: ['label'], setup: (props) => () => h('span', props.label) },
}));
attachClientRender(List, './SeparationPreparationList.vue', import.meta.url);

describe('preview per-track accompaniment action', () => {
  it('adds a trailing action only to unprepared rows, emits that track ID, and disables while busy', async () => {
    const start = vi.fn();
    const props = shallowReactive({
      unpreparedTracks: [
        { id: 'one', title: 'One' },
        { id: 'two', title: 'Two' },
      ],
      preparedTracks: [{ id: 'ready', title: 'Ready' }],
      busy: false,
      onStartTrack: start,
    });
    const { root, app } = mount(List, props);
    const row = (id) =>
      findAll(root, (node) => node.props?.['data-track'] === id)[0];
    const actions = () =>
      findAll(
        root,
        (node) =>
          node.type === 'button' &&
          node.props['aria-label']?.startsWith('加入伴奏處理佇列'),
      );
    expect(actions()).toHaveLength(2);
    expect(textContent(row('one').children[0])).toBe('One');
    expect(
      findAll(row('ready'), (node) => node.type === 'button'),
    ).toHaveLength(0);
    const button = findAll(row('two'), (node) => node.type === 'button')[0];
    expect(button.props['aria-label']).toBe('加入伴奏處理佇列：Two');
    const stopPropagation = vi.fn();
    trigger(button, 'onClick', { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledExactlyOnceWith('two');
    props.busy = true;
    await nextTick();
    expect(actions().every((button) => button.props.disabled)).toBe(true);
    app.unmount();
  });
});
