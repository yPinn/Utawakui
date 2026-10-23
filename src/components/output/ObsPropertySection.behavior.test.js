import { h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ObsPropertySection from './ObsPropertySection.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  ObsPropertySection,
  './ObsPropertySection.vue',
  import.meta.url,
);
attachClientRender(UiIconButton, '../ui/UiIconButton.vue', import.meta.url);
attachClientRender(
  UiTooltipSurface,
  '../ui/tooltip/UiTooltipSurface.vue',
  import.meta.url,
);

const buttons = (root) => findAll(root, (node) => node.type === 'button');

describe('ObsPropertySection', () => {
  it('shows no reset action while every field is at its default', () => {
    const { app, root } = mount(
      ObsPropertySection,
      { title: '文字' },
      { default: () => h('p', '欄位') },
    );

    expect(textContent(root)).toContain('文字');
    expect(textContent(root)).toContain('欄位');
    expect(buttons(root)).toHaveLength(0);
    app.unmount();
  });

  it('offers a labelled group reset once a field is modified', () => {
    const reset = vi.fn();
    const { app, root } = mount(
      ObsPropertySection,
      { title: '文字', modified: true, onReset: reset },
      {
        description: () => h('p', '說明'),
        default: () => h('p', '欄位'),
      },
    );

    const [button] = buttons(root);
    expect(textContent(button)).toContain('恢復「文字」預設');
    expect(textContent(root).indexOf('說明')).toBeLessThan(
      textContent(root).indexOf('欄位'),
    );
    trigger(button, 'onClick', {});
    expect(reset).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});
