import { readFileSync } from 'node:fs';
import { h, nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UiDisclosure from './UiDisclosure.vue';
import UiButtonGroup from './UiButtonGroup.vue';
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
  [UiDisclosure, 'UiDisclosure'],
  [UiButtonGroup, 'UiButtonGroup'],
  [UiButton, 'UiButton'],
  [UiTooltipSurface, 'tooltip/UiTooltipSurface'],
])
  attachClientRender(component, `./${file}.vue`, import.meta.url);
describe('Disclosure and ButtonGroup recovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('restores only owned body focus when its caller collapses the disclosure', async () => {
    const props = reactive({ label: '進階', open: true });
    const { root, app } = mount(UiDisclosure, props, {
      default: () => h('input'),
    });
    const input = findAll(root, (n) => n.type === 'input')[0];
    const summary = findAll(root, (n) => n.type === 'summary')[0];
    const body = findAll(root, (n) =>
      String(n.props.class || '').includes('ui-disclosure__body'),
    )[0];
    body.contains = (node) => node === input;
    const document = { activeElement: input, body: {} };
    vi.stubGlobal('document', document);
    props.open = false;
    await nextTick();
    await nextTick();
    expect(summary.focus).toHaveBeenCalledOnce();
    document.activeElement = {};
    props.open = true;
    await nextTick();
    props.open = false;
    await nextTick();
    await nextTick();
    expect(summary.focus).toHaveBeenCalledOnce();
    app.unmount();
  });
  it('updates summary/body content without replacing native details state or its body', async () => {
    const state = reactive({ label: '來源證據', text: '原始內容', open: true });
    const update = vi.fn((v) => (state.open = v));
    const { root, app } = mount({
      render: () =>
        h(
          UiDisclosure,
          { label: state.label, open: state.open, 'onUpdate:open': update },
          () => h('p', state.text),
        ),
    });
    const details = findAll(root, (n) => n.type === 'details')[0],
      body = findAll(root, (n) => n.type === 'p')[0];
    state.label = '日本語／UnbrokenLongSummary'.repeat(10);
    state.text = '更新內容'.repeat(20);
    await nextTick();
    expect(
      textContent(findAll(root, (n) => n.type === 'summary')[0]),
    ).toContain(state.label);
    expect(body).toBe(findAll(root, (n) => n.type === 'p')[0]);
    trigger(details, 'onToggle', { currentTarget: { open: false } });
    await nextTick();
    expect(state.open).toBe(false);
    expect(body).toBe(findAll(root, (n) => n.type === 'p')[0]);
    state.label = '短';
    state.text = '已恢復';
    state.open = true;
    await nextTick();
    expect(details.props.open).toBe(true);
    expect(textContent(body)).toBe('已恢復');
    app.unmount();
  });
  it('keeps child button identity, disabled state and semantics through group content recovery', async () => {
    const click = vi.fn(),
      state = reactive({
        items: [
          { id: 'a', label: '第一個', disabled: false },
          { id: 'b', label: '第二個', disabled: true },
        ],
        raised: true,
        radius: 'lg',
      });
    const { root, app } = mount({
      render: () =>
        h(
          UiButtonGroup,
          { label: '操作', raised: state.raised, radius: state.radius },
          () =>
            state.items.map((i) =>
              h(
                UiButton,
                { key: i.id, disabled: i.disabled, onClick: click },
                () => i.label,
              ),
            ),
        ),
    });
    const first = findAll(root, (n) => n.type === 'button')[0];
    state.items = [{ id: 'a', label: '長文字'.repeat(20), disabled: true }];
    state.raised = false;
    state.radius = 'md';
    await nextTick();
    expect(findAll(root, (n) => n.type === 'button')[0]).toBe(first);
    expect(first.props.disabled).toBe(true);
    const group = findAll(root, (n) => n.props.role === 'group')[0];
    expect(group.props['aria-label']).toBe('操作');
    expect(group.props.role).not.toBe('toolbar');
    state.items = [];
    await nextTick();
    expect(findAll(root, (n) => n.type === 'button')).toHaveLength(0);
    state.items = [{ id: 'c', label: '已恢復', disabled: false }];
    await nextTick();
    const restored = findAll(root, (n) => n.type === 'button')[0];
    trigger(restored, 'onClick', {});
    expect(click).toHaveBeenCalledOnce();
    expect(textContent(restored)).toBe('已恢復');
    app.unmount();
  });
  it('wraps summary tokens and keeps grouped focus inside the clipped shared boundary', () => {
    const disclosure = readFileSync(
        new URL('./UiDisclosure.vue', import.meta.url),
        'utf8',
      ),
      group = readFileSync(
        new URL('./UiButtonGroup.vue', import.meta.url),
        'utf8',
      );
    expect(disclosure).toMatch(
      /\.ui-disclosure__label\s*\{[^}]*overflow-wrap:\s*anywhere;/su,
    );
    expect(group).toContain('max-width: 100%');
    expect(group).toContain('min-width: 0');
    expect(group).toContain(':deep(.ui-btn:focus-visible)');
    expect(group).toContain('outline-offset: var(--ui-focus-offset-inset)');
    expect(group).toMatch(
      /\.ui-button-group :deep\(\.ui-btn\)\s*\{[^}]*border:\s*0;/su,
    );
  });
});
