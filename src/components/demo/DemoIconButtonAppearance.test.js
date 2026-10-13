import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { Play, Repeat } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import { attachClientRender, findAll, mount } from '../ui/uiTestHost.js';
import DemoIconButtonAppearance from './DemoIconButtonAppearance.vue';
const actionsSource = readFileSync(
  new URL('./DemoActions.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('../ui/UiIconButton.vue', import.meta.url),
  'utf8',
);
for (const [component, filename] of [
  [DemoIconButtonAppearance, './DemoIconButtonAppearance.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}
describe('DemoIconButtonAppearance', () => {
  it('replaces only the Icon Button sample with the staged appearance review', () => {
    expect(actionsSource).toContain(
      "import DemoIconButtonAppearance from './DemoIconButtonAppearance.vue';",
    );
    expect(actionsSource).toMatch(
      /<DemoIconButtonAppearance\s+v-else-if="section\.key === 'icon-buttons'"\s+\/>/u,
    );
    expect(actionsSource).not.toContain(
      '<div v-else-if="section.key === \'icon-buttons\'" class="demo-sample-stack">',
    );
    expect(actionsSource).toContain(
      '<DemoButtonAppearance v-if="section.key === \'buttons\'" />',
    );
    expect(actionsSource).toMatch(
      /<DemoTextButtonAppearance\s+v-else-if="section\.key === 'text-button'"\s+\/>/u,
    );
  });
  it('keeps native button semantics and caller-owned ARIA state', () => {
    const fallbackTitle = mount(UiIconButton, {
      icon: Play,
      label: '播放目前曲目',
      disabled: true,
      name: 'transport-action',
      'data-contract': 'native-forwarding',
    });
    const fallbackButton = findAll(
      fallbackTitle.root,
      (node) => node.type === 'button',
    )[0];
    expect(fallbackButton.props).toMatchObject({
      type: 'button',
      disabled: true,
      name: 'transport-action',
      'data-contract': 'native-forwarding',
    });
    expect(fallbackButton.props['aria-label']).toBeUndefined();
    expect(fallbackButton.props.title).toBeUndefined();
    const fallbackIcon = findAll(
      fallbackButton,
      (node) => node.props?.['aria-hidden'] === 'true',
    )[0];
    expect(fallbackIcon).toBeTruthy();
    fallbackTitle.app.unmount();
    const toggle = mount(UiIconButton, {
      icon: Repeat,
      label: '重複播放',
      title: '重複播放 (R)',
      active: true,
      'aria-pressed': true,
    });
    const toggleButton = findAll(
      toggle.root,
      (node) => node.type === 'button',
    )[0];
    expect(toggleButton.props.title).toBeUndefined();
    expect(toggleButton.props['aria-pressed']).toBe(true);
    expect(String(toggleButton.props.class)).toContain('ui-icon-btn--active');
    toggle.app.unmount();
  });
  it('documents the bounded public contract and its shared async state', async () => {
    const html = await renderToString(createSSRApp(DemoIconButtonAppearance));
    expect(html).toContain('icon · required；fixed 16-unit decorative glyph');
    expect(html).toContain('label · required accessible name');
    expect(html).toContain('title · optional；defaults to label');
    expect(html).toContain('variant · ghost／accent／command／overlay');
    expect(html).toContain('intent · neutral／danger');
    expect(html).toContain('size · md／lg；density owns routine md');
    expect(html).toContain('shape · square／circle／inherit');
    expect(html).toContain(
      'active · visual only；caller supplies aria-pressed',
    );
    expect(html).toContain(
      'stretch · parent-owned hit area；fill · glyph only',
    );
    expect(html).toContain('native disabled · attrs／events fallthrough');
    expect(html).toContain(
      'loading · shared async progress；loadingLabel · announced status',
    );
    expect(html).toContain('No readonly · No permission · No emergency prop');
    expect(html).toContain('data-icon-button-state="loading"');
    expect(candidateSource).not.toMatch(/readonly|permission/u);
  });
});
