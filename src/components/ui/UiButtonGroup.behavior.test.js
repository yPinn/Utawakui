import { h } from 'vue';
import { describe, expect, it } from 'vitest';
import UiButton from './UiButton.vue';
import UiButtonGroup from './UiButtonGroup.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from './uiTestHost.js';

for (const [component, filename] of [
  [UiButton, './UiButton.vue'],
  [UiButtonGroup, './UiButtonGroup.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('UiButtonGroup', () => {
  it('owns the accessible group boundary while preserving button semantics', () => {
    const { app, root } = mount(
      UiButtonGroup,
      {
        label: '歌詞時間偏移',
        radius: 'lg',
        raised: true,
      },
      {
        default: () => [
          h(UiButton, null, () => '延後'),
          h(UiButton, null, () => '提前'),
        ],
      },
    );
    const group = findAll(root, (node) => node.props?.role === 'group')[0];
    const buttons = findAll(root, (node) => node.type === 'button');

    expect(group.props['aria-label']).toBe('歌詞時間偏移');
    expect(String(group.props.class)).toContain('ui-button-group--radius-lg');
    expect(String(group.props.class)).toContain('ui-button-group--raised');
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => textContent(button))).toEqual([
      '延後',
      '提前',
    ]);
    app.unmount();
  });
});
