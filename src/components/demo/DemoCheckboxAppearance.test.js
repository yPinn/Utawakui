import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiField from '../ui/UiField.vue';
import { attachClientRender, findAll, mount } from '../ui/uiTestHost.js';
import DemoCheckboxAppearance from './DemoCheckboxAppearance.vue';
const demoInputsSource = readFileSync(
  new URL('./DemoInputs.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoCheckboxAppearance.vue', import.meta.url),
  'utf8',
);
const specimenStyles = readFileSync(
  new URL('../../styles/demoSpecimens.css', import.meta.url),
  'utf8',
);
for (const [component, filename] of [
  [DemoCheckboxAppearance, './DemoCheckboxAppearance.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiCheckbox, '../ui/UiCheckbox.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}
describe('DemoCheckboxAppearance', () => {
  it('keeps the accepted Checkbox phase mounted beside Range', () => {
    expect(demoInputsSource).toContain(
      "import DemoCheckboxAppearance from './DemoCheckboxAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoCheckboxAppearance v-else-if="section.key === \'checkbox\'" />',
    );
    expect(demoInputsSource).not.toContain(
      '<div v-else-if="section.key === \'checkbox\'" class="demo-checkbox-grid">',
    );
    expect(demoInputsSource).toContain(
      '<DemoRangeAppearance v-else-if="section.key === \'range\'" />',
    );
  });
  it('visualizes the approved 36 and 32 CSS px targets with the formal UiCheckbox', async () => {
    const html = await renderToString(createSSRApp(DemoCheckboxAppearance));
    for (const size of ['standard', 'compact']) {
      expect(html).toContain(`data-checkbox-size="${size}"`);
    }
    expect(html).toContain('Standard target · 36 CSS px');
    expect(html).toContain('Compact target · 32 CSS px');
    expect(html).toContain('Visual indicator · 16 CSS px');
    expect(html).toContain('Target · full label row');
    expect(html).toContain('Width · content／parent-owned');
    expect(specimenStyles).toContain(
      '.demo-specimens__density--standard {\n  --ui-control-height: 2.25rem;',
    );
    expect(specimenStyles).toContain(
      '.demo-specimens__density--compact {\n  --ui-control-height: 2rem;',
    );
    expect(componentSource).toContain(
      "import UiCheckbox from '../ui/UiCheckbox.vue';",
    );
    expect(componentSource).not.toContain('DemoCandidateCheckbox');
    expect(componentSource).toContain(
      ":not(:checked):not([aria-checked='mixed'])",
    );
  });
  it('keeps an accessible square target when a compound owner hides the visible label', async () => {
    const html = await renderToString(
      createSSRApp(UiCheckbox, {
        id: 'track-row-selection',
        label: '選取音樂分析候選',
        labelHidden: true,
        modelValue: true,
      }),
    );
    expect(html).toContain('has-hidden-label');
    expect(html).toContain('ui-field__label--hidden');
    expect(html).toContain('for="track-row-selection"');
    expect(html).toContain('選取音樂分析候選');
    expect(html).toContain('ui-checkbox__native');
    expect(html).toContain('aria-label="選取音樂分析候選"');
  });
  it('demonstrates Hint replacement and merged ARIA descriptions', () => {
    const { app, root } = mount(DemoCheckboxAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];
    const hint = inputById('demo-checkbox-validation-hint');
    const invalid = inputById('demo-checkbox-validation-error');
    expect(hint.props['aria-describedby']).toBe(
      'checkbox-external-note demo-checkbox-validation-hint-hint',
    );
    expect(hint.props).toMatchObject({
      name: 'demo-checkbox-consent',
      value: 'accepted',
      'data-contract': 'native-forwarding',
    });
    expect(hint.props['aria-invalid']).toBeUndefined();
    expect(invalid.props['aria-describedby']).toBe(
      'checkbox-external-note demo-checkbox-validation-error-error',
    );
    expect(invalid.props['aria-invalid']).toBe(true);
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-checkbox-validation-error-error' &&
          node.props.role === 'alert',
      ),
    ).toHaveLength(1);
    app.unmount();
  });
});
