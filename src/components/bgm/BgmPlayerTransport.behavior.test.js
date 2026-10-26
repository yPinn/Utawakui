import { h, nextTick, reactive } from 'vue';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import BgmPlayerTransport from './BgmPlayerTransport.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const fixture = vi.hoisted(() => ({ ranges: [] }));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['icon', 'label', 'active', 'disabled'],
    setup:
      (props, { attrs }) =>
      () =>
        h('button', { ...attrs, disabled: props.disabled }, props.label),
  },
}));
vi.mock('../ui/range/UiRangeControl.vue', () => ({
  default: {
    props: ['modelValue'],
    setup(props, { emit }) {
      fixture.ranges.push({ props, emit });
      return () => h('range-probe');
    },
  },
}));
beforeAll(() =>
  attachClientRender(
    BgmPlayerTransport,
    './BgmPlayerTransport.vue',
    import.meta.url,
  ),
);
const button = (root, label) =>
  findAll(root, (n) => n.type === 'button' && textContent(n) === label)[0];

describe('BGM transport user intents', () => {
  it('keeps guide, attenuation, and mute independent and follows confirmed props', async () => {
    const guide = vi.fn(),
      dim = vi.fn(),
      mute = vi.fn(),
      play = vi.fn();
    const props = reactive({
      phase: 'bgm-playing',
      currentTrack: { id: 'a' },
      hasGuideVocal: true,
      guideVocalOn: false,
      isDimmed: false,
      isMuted: false,
      onSetGuideVocalOn: guide,
      onSetDimmed: dim,
      onSetMuted: mute,
      onPlay: play,
    });
    const view = mount(BgmPlayerTransport, props);
    try {
      trigger(button(view.root, '開啟 BGM 導唱'), 'onClick');
      trigger(button(view.root, '壓低 BGM（降低 12 dB）'), 'onClick');
      trigger(button(view.root, 'BGM 靜音'), 'onClick');
      expect(guide).toHaveBeenCalledExactlyOnceWith(true);
      expect(dim).toHaveBeenCalledExactlyOnceWith(true);
      expect(mute).toHaveBeenCalledExactlyOnceWith(true);
      expect(play).not.toHaveBeenCalled();
      Object.assign(props, {
        guideVocalOn: true,
        isDimmed: true,
        isMuted: true,
      });
      await nextTick();
      trigger(button(view.root, '關閉 BGM 導唱'), 'onClick');
      trigger(button(view.root, '壓低 BGM（按下恢復 BGM 音量）'), 'onClick');
      trigger(button(view.root, '取消 BGM 靜音'), 'onClick');
      expect(guide).toHaveBeenLastCalledWith(false);
      expect(dim).toHaveBeenLastCalledWith(false);
      expect(mute).toHaveBeenLastCalledWith(false);
    } finally {
      view.app.unmount();
    }
  });

  it('retains transport locking and commits the user volume draft separately from previews', async () => {
    fixture.ranges = [];
    const play = vi.fn(),
      pause = vi.fn(),
      preview = vi.fn(),
      commit = vi.fn(),
      seek = vi.fn(),
      position = vi.fn(),
      cut = vi.fn();
    const props = reactive({
      phase: 'idle',
      currentTrack: { id: 'a' },
      volume: 0.2,
      onPlay: play,
      onPause: pause,
      onPreviewVolume: preview,
      onCommitVolume: commit,
      onSeek: seek,
      onCommitPosition: position,
      onCut: cut,
    });
    const view = mount(BgmPlayerTransport, props);
    try {
      trigger(button(view.root, '播放 BGM'), 'onClick');
      expect(play).toHaveBeenCalledOnce();
      props.phase = 'track-active';
      await nextTick();
      trigger(button(view.root, '播放 BGM'), 'onClick');
      expect(play).toHaveBeenCalledOnce();
      props.phase = 'bgm-playing';
      await nextTick();
      trigger(button(view.root, '暫停 BGM'), 'onClick');
      expect(pause).toHaveBeenCalledOnce();
      fixture.ranges[1].emit('update:modelValue', 0.35);
      await nextTick();
      expect(preview).toHaveBeenCalledWith(0.35);
      fixture.ranges[1].emit('change');
      expect(commit).toHaveBeenCalledWith(0.35);
      props.volume = 0.6;
      await nextTick();
      expect(fixture.ranges[1].props.modelValue).toBe(0.6);
      fixture.ranges[0].emit('update:modelValue', '12');
      fixture.ranges[0].emit('change');
      expect(seek).toHaveBeenCalledWith(12);
      expect(position).toHaveBeenCalledOnce();
      trigger(button(view.root, '立即停止 BGM（不淡出）'), 'onClick');
      expect(cut).toHaveBeenCalledOnce();
    } finally {
      view.app.unmount();
    }
  });
});
