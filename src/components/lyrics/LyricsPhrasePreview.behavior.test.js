import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, reactive } from 'vue';
import Component from './LyricsPhrasePreview.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import {
  attachClientRender,
  mount,
  findAll,
  textContent,
} from '../ui/uiTestHost.js';
vi.mock('../ui/UiSelect.vue', () => ({
  default: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    setup:
      (p, { emit }) =>
      () =>
        h(
          'select',
          {
            value: p.modelValue,
            onChange: (e) => emit('update:modelValue', e.target.value),
          },
          p.options.map((o) => h('option', { value: o.value }, o.label)),
        ),
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
const a = '把所有回憶都留在今晚，',
  b = 'we will find our way back home';
let mounted;
beforeEach(() => {
  attachClientRender(UiDisclosure, '../ui/UiDisclosure.vue', import.meta.url);
  attachClientRender(Component, './LyricsPhrasePreview.vue', import.meta.url);
});
afterEach(() => mounted?.app.unmount());
describe('source-bound mixed phrase preview', () => {
  it('starts collapsed, follows the existing clock and drops stale timing on source change', async () => {
    const props = reactive({
      document: {
        documentId: 'one',
        lines: [
          {
            text: a + b,
            startMs: 1000,
            endMs: 12000,
            segments: [
              { text: a, startMs: 1200, endMs: 5500 },
              { text: b, startMs: 6000, endMs: 11000 },
            ],
          },
        ],
      },
      positionMs: 2000,
    });
    mounted = mount(Component, props);
    const details = findAll(mounted.root, (n) => n.type === 'details')[0];
    expect(details.props.open).toBe(false);
    details.props.onToggle({ currentTarget: { open: true } });
    await nextTick();
    expect(textContent(mounted.root)).toContain('第 1 / 2 段');
    props.positionMs = 6000;
    await nextTick();
    expect(textContent(mounted.root)).toContain('第 2 / 2 段');
    props.document = {
      documentId: 'two',
      lines: [{ text: a + b, startMs: 1000, endMs: 12000 }],
    };
    await nextTick();
    await nextTick();
    expect(
      findAll(mounted.root, (n) => n.type === 'details')[0].props.open,
    ).toBe(false);
    findAll(mounted.root, (n) => n.type === 'details')[0].props.onToggle({
      currentTarget: { open: true },
    });
    await nextTick();
    expect(textContent(mounted.root)).toContain('缺少精確切換時間，維持整句');
    expect(textContent(mounted.root)).not.toContain('第 2 / 2 段');
  });
  it('does not add a preview for short or monolingual ordinary lines', () => {
    mounted = mount(Component, {
      document: { lines: [{ text: '今晚一起唱歌' }] },
    });
    expect(findAll(mounted.root, (n) => n.type === 'details')).toHaveLength(0);
  });
  it('lets the operator choose another candidate without creating a playback clock', async () => {
    const props = reactive({
      document: {
        lines: [
          { text: a + b, startMs: 1000, endMs: 12000 },
          {
            text: a + b,
            startMs: 20000,
            endMs: 32000,
            estimatedStarts: {
              version: 1,
              segments: [
                { text: a, startMs: 21000 },
                { text: b, startMs: 26000 },
              ],
            },
          },
        ],
      },
      positionMs: null,
    });
    mounted = mount(Component, props);
    findAll(mounted.root, (n) => n.type === 'details')[0].props.onToggle({
      currentTarget: { open: true },
    });
    await nextTick();
    expect(
      findAll(mounted.root, (n) => n.type === 'select')[0].props.value,
    ).toBe('0');
    findAll(mounted.root, (n) => n.type === 'select')[0].props.onChange({
      target: { value: '1' },
    });
    await nextTick();
    expect(textContent(mounted.root)).toContain('已套用 T1+');
    expect(textContent(mounted.root)).toContain('播放此句時切換');
    props.positionMs = 26500;
    await nextTick();
    expect(textContent(mounted.root)).toContain('第 2 / 2 段');
    props.positionMs = 50000;
    await nextTick();
    expect(textContent(mounted.root)).toContain('播放此句時切換');
  });
});
