import { nextTick, reactive } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import LyricsLineTimingEditor from './LyricsLineTimingEditor.vue';
import { mount } from '../ui/uiTestHost.js';
let app;
afterEach(() => app?.unmount());
function setup(extra = {}) {
  const props = reactive({
    draft: {
      lineId: 'one',
      text: '句級',
      startMs: 1234,
      endMs: 4567,
      segments: [],
    },
    positionMs: 2876.7,
    onSetStart: vi.fn(),
    onSetEnd: vi.fn(),
    ...extra,
  });
  const mounted = mount(
    { ...LyricsLineTimingEditor, render: () => null },
    props,
  );
  app = mounted.app;
  return { props, vm: app._instance.subTree.component.setupState };
}
it('preserves milliseconds in field edits and uses the existing canonical clock without seeking', () => {
  const f = setup();
  expect(f.vm.startText).toBe('1.234');
  f.vm.startText = '2.015';
  f.vm.commit('start');
  expect(f.props.onSetStart).toHaveBeenCalledWith(2015);
  f.vm.record('end');
  expect(f.props.onSetEnd).toHaveBeenCalledWith(2877);
  f.vm.endText = '';
  f.vm.commit('end');
  expect(f.props.onSetEnd).toHaveBeenLastCalledWith(NaN);
});
it('disables position recording when another track is linked, retains out-of-media evidence and resets fields on undo', async () => {
  const f = setup({ positionMs: null, offsetMs: 2000 });
  expect(f.vm.outsideMedia).toBe(true);
  expect(f.vm.canRecord).toBe(false);
  f.vm.record('start');
  expect(f.props.onSetStart).not.toHaveBeenCalled();
  f.vm.startText = 'invalid';
  f.props.draft = { ...f.props.draft, startMs: 3000 };
  await nextTick();
  expect(f.vm.startText).toBe('3.000');
  f.props.disabled = true;
  await nextTick();
  f.vm.commit('start');
  expect(f.props.onSetStart).not.toHaveBeenCalled();
});
