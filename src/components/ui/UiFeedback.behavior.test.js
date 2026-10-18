import { readFileSync } from 'node:fs';
import { h, nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { Info } from '../../icons/index.js';
import UiNotice from './UiNotice.vue';
import UiHint from './UiHint.vue';
import UiChip from './UiChip.vue';
import UiStatusIcon from './UiStatusIcon.vue';
import UiButton from './UiButton.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from './uiTestHost.js';
for (const [component, file] of [
  [UiNotice, 'UiNotice'],
  [UiHint, 'UiHint'],
  [UiChip, 'UiChip'],
  [UiStatusIcon, 'UiStatusIcon'],
  [UiButton, 'UiButton'],
  [UiTooltipSurface, 'tooltip/UiTooltipSurface'],
])
  attachClientRender(component, `./${file}.vue`, import.meta.url);
const long = '中文／日本語／UnbrokenLongStatusText'.repeat(8);
describe('feedback content and tone recovery', () => {
  it('updates notice tone, action availability and empty content without stale states', async () => {
    const action = vi.fn(),
      props = reactive({
        tone: 'danger',
        title: long,
        message: long,
        actionLabel: '重試',
        actionDisabled: true,
        onAction: action,
      });
    const { root, app } = mount(UiNotice, props);
    const button = () => findAll(root, (n) => n.type === 'button')[0];
    trigger(button(), 'onClick');
    expect(action).not.toHaveBeenCalled();
    props.actionDisabled = false;
    props.tone = 'success';
    props.message = '完成';
    await nextTick();
    trigger(button(), 'onClick');
    expect(action).toHaveBeenCalledOnce();
    expect(findAll(root, (n) => n.props.role === 'alert')).toHaveLength(0);
    expect(findAll(root, (n) => n.props.role === 'status')).toHaveLength(1);
    props.title = '';
    props.message = '';
    await nextTick();
    expect(findAll(root, (n) => n.props.role === 'status')).toHaveLength(0);
    props.title = long;
    props.actionLabel = '';
    await nextTick();
    expect(textContent(root)).toContain(long);
    expect(findAll(root, (n) => n.type === 'button')).toHaveLength(0);
    app.unmount();
  });
  it('updates hint and chip slots/tone and clears explicit chip paint overrides', async () => {
    const state = reactive({
      text: long,
      tone: 'danger',
      background: 'var(--ui-color-surface)',
      color: 'var(--ui-color-text)',
    });
    const { root, app } = mount({
      render: () =>
        h('div', [
          h(UiHint, { tone: state.tone, role: 'status' }, () => state.text),
          h(
            UiChip,
            {
              tone: state.tone,
              background: state.background,
              color: state.color,
            },
            () => state.text,
          ),
        ]),
    });
    expect(textContent(root)).toContain(long);
    state.text = '短';
    state.tone = 'info';
    state.background = undefined;
    state.color = undefined;
    await nextTick();
    const chip = findAll(root, (n) =>
      String(n.props.class || '')
        .split(' ')
        .includes('ui-chip'),
    )[0];
    expect(chip.props.style['--ui-chip-bg']).toBeUndefined();
    expect(chip.props.style['--ui-chip-color']).toBeUndefined();
    expect(String(chip.props.class)).toContain('ui-chip--info');
    expect(textContent(chip)).toBe('短');
    state.text = long;
    await nextTick();
    expect(textContent(chip)).toBe(long);
    app.unmount();
  });
  it('preserves status caller events and descriptions alongside tooltip bindings through decorative recovery', async () => {
    const focus = vi.fn(),
      props = reactive({
        icon: Info,
        label: long,
        tone: 'danger',
        tabindex: 0,
        'aria-describedby': 'external-note',
        onFocusin: focus,
      });
    const { root, app } = mount(UiStatusIcon, props);
    const icon = () =>
      findAll(root, (n) =>
        String(n.props.class || '')
          .split(' ')
          .includes('ui-status-icon'),
      )[0];
    expect(icon().props['aria-describedby']).toContain('external-note');
    expect(icon().props['aria-describedby']).toContain('ui-tooltip-');
    trigger(icon(), 'onFocusin', {});
    expect(focus).toHaveBeenCalledOnce();
    props.decorative = true;
    await nextTick();
    expect(icon().props['aria-hidden']).toBe('true');
    expect(icon().props.role).toBeUndefined();
    props.decorative = false;
    props.label = '已恢復';
    props.tone = 'success';
    await nextTick();
    expect(icon().props['aria-label']).toBe('已恢復');
    expect(icon().props.role).toBe('img');
    app.unmount();
  });
  it('wraps prose, bounds chips and uses the semantic info soft token', () => {
    for (const file of ['UiNotice', 'UiHint'])
      expect(
        readFileSync(new URL(`./${file}.vue`, import.meta.url), 'utf8'),
      ).toContain('overflow-wrap: anywhere');
    const chip = readFileSync(new URL('./UiChip.vue', import.meta.url), 'utf8');
    expect(chip).toContain('text-overflow: ellipsis');
    expect(chip).toContain('--ui-chip-tone-bg: var(--ui-color-info-soft)');
    expect(chip).toMatch(
      /\.ui-chip--accent\s*\{[^}]*--ui-chip-tone-color:\s*var\(--ui-color-text\);/su,
    );
    const notice = readFileSync(
      new URL('./UiNotice.vue', import.meta.url),
      'utf8',
    );
    expect(notice).toContain('variant="secondary"');
    expect(notice).toMatch(
      /\.ui-notice__message\s*\{[^}]*color:\s*var\(--ui-color-text\);/su,
    );
  });
});
