import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiField from '../ui/UiField.vue';
import { attachClientRender, findAll, mount } from '../ui/uiTestHost.js';
import DemoCandidateCheckbox from './DemoCandidateCheckbox.vue';
import DemoCheckboxAppearance from './DemoCheckboxAppearance.vue';
const demoInputsSource = readFileSync(
  new URL('./DemoInputs.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoCheckboxAppearance.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateCheckbox.vue', import.meta.url),
  'utf8',
);
for (const [component, filename] of [
  [DemoCheckboxAppearance, './DemoCheckboxAppearance.vue'],
  [DemoCandidateCheckbox, './DemoCandidateCheckbox.vue'],
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
  it('visualizes the approved 36 and 32 CSS px targets in Candidate and production', async () => {
    const html = await renderToString(createSSRApp(DemoCheckboxAppearance));
    for (const size of ['standard', 'compact']) {
      expect(html).toContain(`data-checkbox-size="${size}"`);
    }
    expect(html).toContain('Standard target · 36 CSS px');
    expect(html).toContain('Compact target · 32 CSS px');
    expect(html).toContain('Visual indicator · 16 CSS px');
    expect(html).toContain('Target · full label row');
    expect(html).toContain('Width · content／parent-owned');
    expect(componentSource).toContain(
      '.demo-checkbox-size--standard {\n  --demo-checkbox-target-size: 2.25rem;',
    );
    expect(componentSource).toContain(
      '.demo-checkbox-size--compact {\n  --demo-checkbox-target-size: 2rem;',
    );
    expect(candidateSource).toMatch(
      /--demo-checkbox-resolved-target-size:\s*var\(\s*--demo-checkbox-target-size,\s*var\(--ui-control-height\)\s*\);/u,
    );
    expect(candidateSource).not.toContain(
      '--demo-checkbox-target-size: var(--ui-control-height);',
    );
    expect(candidateSource).toContain(
      'min-height: var(--demo-checkbox-resolved-target-size);',
    );
    expect(candidateSource).toContain('width: var(--ui-checkbox-size);');
    expect(candidateSource).toContain('height: var(--ui-checkbox-size);');
  });
  it('keeps an accessible square target when a compound owner hides the visible label', async () => {
    const html = await renderToString(
      createSSRApp(DemoCandidateCheckbox, {
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
    expect(candidateSource).toMatch(
      /\.demo-candidate-checkbox\.has-hidden-label\s*\{[\s\S]*?width:\s*var\(--demo-checkbox-resolved-target-size\);/u,
    );
  });
  it('demonstrates Hint replacement and merged ARIA descriptions', () => {
    const { app, root } = mount(DemoCheckboxAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];
    const hint = inputById('demo-checkbox-candidate-validation-hint');
    const invalid = inputById('demo-checkbox-candidate-validation-error');
    expect(hint.props['aria-describedby']).toBe(
      'checkbox-external-note demo-checkbox-candidate-validation-hint-hint',
    );
    expect(hint.props).toMatchObject({
      name: 'demo-checkbox-candidate-consent',
      value: 'accepted',
      'data-contract': 'native-forwarding',
    });
    expect(hint.props['aria-invalid']).toBeUndefined();
    expect(invalid.props['aria-describedby']).toBe(
      'checkbox-external-note demo-checkbox-candidate-validation-error-error',
    );
    expect(invalid.props['aria-invalid']).toBe(true);
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-checkbox-candidate-validation-error-error' &&
          node.props.role === 'alert',
      ),
    ).toHaveLength(1);
    app.unmount();
  });
});
