import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { Download } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from '../ui/uiTestHost.js';
import DemoButtonAppearance from './DemoButtonAppearance.vue';
const actionsSource = readFileSync(
  new URL('./DemoActions.vue', import.meta.url),
  'utf8',
);
const buttonAppearanceSource = readFileSync(
  new URL('./DemoButtonAppearance.vue', import.meta.url),
  'utf8',
);
for (const [component, filename] of [
  [DemoButtonAppearance, './DemoButtonAppearance.vue'],
  [UiButton, '../ui/UiButton.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}
describe('DemoButtonAppearance', () => {
  it('shows focusable ARIA-disabled specimens through the formal primitive', async () => {
    const html = await renderToString(createSSRApp(DemoButtonAppearance));
    const row = html.match(
      /<article[^>]*data-button-state="aria-disabled"[\s\S]*?<\/article>/u,
    )?.[0];
    expect(row).toBeDefined();
    expect(row.match(/aria-disabled="true"/gu)).toHaveLength(2);
    expect(row).not.toMatch(/\sdisabled(?:\s|=|>)/u);
  });
  it('replaces only the Buttons sample with the staged appearance review', () => {
    expect(actionsSource).toContain(
      "import DemoButtonAppearance from './DemoButtonAppearance.vue';",
    );
    expect(actionsSource).toContain(
      '<DemoButtonAppearance v-if="section.key === \'buttons\'" />',
    );
    expect(actionsSource).not.toContain(
      '<div v-if="section.key === \'buttons\'" class="demo-sample-stack">',
    );
    expect(actionsSource).toMatch(
      /<DemoIconButtonAppearance\s+v-else-if="section\.key === 'icon-buttons'"\s+\/>/u,
    );
    expect(actionsSource).toMatch(
      /<DemoTextButtonAppearance\s+v-else-if="section\.key === 'text-button'"\s+\/>/u,
    );
  });
  it('keeps async and toggle semantics explicit on the native button', () => {
    const loading = mount(
      UiButton,
      {
        type: 'submit',
        loading: true,
        loadingLabel: '正在保存',
        name: 'save-action',
        'data-contract': 'native-forwarding',
      },
      {
        default: () => '保存',
      },
    );
    const loadingButton = findAll(
      loading.root,
      (node) => node.type === 'button',
    )[0];
    expect(loadingButton.props).toMatchObject({
      type: 'submit',
      disabled: true,
      'aria-busy': true,
      name: 'save-action',
      'data-contract': 'native-forwarding',
    });
    expect(textContent(loadingButton)).toContain('正在保存');
    expect(textContent(loadingButton)).not.toContain('保存保存');
    loading.app.unmount();
    const toggle = mount(
      UiButton,
      {
        icon: Download,
        active: true,
        'aria-pressed': true,
      },
      {
        default: () => '自動匯出',
      },
    );
    const toggleButton = findAll(
      toggle.root,
      (node) => node.type === 'button',
    )[0];
    expect(toggleButton.props['aria-pressed']).toBe(true);
    expect(String(toggleButton.props.class)).toContain('ui-btn--active');
    toggle.app.unmount();
  });

  it('shows grouped-button ownership alongside the base button contract', () => {
    expect(buttonAppearanceSource).toContain(
      "import UiButtonGroup from '../ui/UiButtonGroup.vue';",
    );
    expect(buttonAppearanceSource).toContain('<UiButtonGroup');
    expect(buttonAppearanceSource).toContain('label="Button group anatomy"');
  });
});
