import { readFileSync } from 'node:fs';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiField from '../ui/UiField.vue';
import UiTextField from '../ui/UiTextField.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import DemoTextFieldAppearance from './DemoTextFieldAppearance.vue';

const demoInputsSource = readFileSync(
  new URL('./DemoInputs.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoTextFieldAppearance.vue', import.meta.url),
  'utf8',
);
const textFieldSource = readFileSync(
  new URL('../ui/UiTextField.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [DemoTextFieldAppearance, './DemoTextFieldAppearance.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiTextField, '../ui/UiTextField.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('DemoTextFieldAppearance', () => {
  it('mounts a dedicated Text Field contract instead of the scenario grid', () => {
    expect(demoInputsSource).toContain(
      "import DemoTextFieldAppearance from './DemoTextFieldAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoTextFieldAppearance v-else-if="section.key === \'text-field\'" />',
    );
    expect(demoInputsSource).not.toContain(
      '<div v-else-if="section.key === \'text-field\'" class="demo-sample-grid">',
    );
  });

  it('separates candidate and current contracts in the correct order', async () => {
    const html = await renderToString(createSSRApp(DemoTextFieldAppearance));
    const candidateIndex = html.indexOf('data-text-field-source="candidate"');
    const currentIndex = html.indexOf('data-text-field-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 候選 Text Field');
    expect(html).toContain('現行 UiTextField');
    expect(html).toContain(
      'Text Field 只擁有單行輸入；Label、Hint／Error 沿用 Field。',
    );
  });

  it('visualizes inherited heights and parent-owned widths without new component tokens', async () => {
    const html = await renderToString(createSSRApp(DemoTextFieldAppearance));

    for (const [size, count] of [
      ['standard', 1],
      ['compact', 1],
      ['active', 1],
    ]) {
      expect(
        html.match(new RegExp(`data-text-field-size="${size}"`, 'gu')),
      ).toHaveLength(count);
    }
    for (const width of ['narrow', 'reference', 'fluid']) {
      expect(
        html.match(new RegExp(`data-text-field-width="${width}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Standard · 36 CSS px');
    expect(html).toContain('Compact · 32 CSS px');
    expect(html).toContain('Active default · 30 CSS px');
    expect(html).toContain('Default 100% parent');
    expect(html).toContain('Min 0 · layout floor');
    expect(html).toContain('Max none · parent owns');
    expect(html).toContain('No size prop · No min／max width token · No slots');
    expect(componentSource).not.toContain('--ui-text-field-min-width');
    expect(componentSource).not.toContain('--ui-text-field-max-width');

    for (const [selector, declaration] of [
      ['.demo-text-field-size--standard', '--ui-field-height: 2.25rem;'],
      ['.demo-text-field-size--compact', '--ui-field-height: 2rem;'],
      ['.demo-text-field-size--active', '--ui-field-height: 1.875rem;'],
      ['.demo-text-field-width-test--narrow', 'width: min(12rem, 100%);'],
      ['.demo-text-field-width-test--reference', 'width: min(20rem, 100%);'],
      ['.demo-text-field-width-test--fluid', 'width: 100%;'],
    ]) {
      const start = componentSource.indexOf(`${selector} {`);
      const end = componentSource.indexOf('\n}', start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(componentSource.slice(start, end)).toContain(declaration);
    }
  });

  it('keeps measurement copy outside the control and shows exact inline anatomy', async () => {
    const html = await renderToString(createSSRApp(DemoTextFieldAppearance));

    for (const part of ['start', 'content', 'end']) {
      expect(
        html.match(new RegExp(`data-text-field-anatomy="${part}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/>8 CSS px<\/span>/gu)).toHaveLength(4);
    expect(html).toContain('單行 text lane · fluid／min 0');
    expect(html).toContain('Inline anatomy · no slots');
    expect(componentSource).toContain(
      'grid-template-columns: 0.5rem minmax(0, 1fr) 0.5rem;',
    );
    expect(textFieldSource).toContain(
      'padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);',
    );
    expect(textFieldSource).not.toContain('<slot');
  });

  it('renders single-line content fixtures for empty, multilingual, bounded, and directional text', async () => {
    const html = await renderToString(createSSRApp(DemoTextFieldAppearance));
    const contentCases = [
      'placeholder',
      'short',
      'long',
      'maxlength',
      'direction',
    ];

    for (const content of contentCases) {
      expect(
        html.match(new RegExp(`data-text-field-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('LOVE YOURSELF 結 Answer');
    expect(html).toContain('사랑했지만');
    expect(html).toContain('تعليق تجريبي');
    expect(html).toContain('maxlength="12"');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('不換行 · native inline scroll');
  });

  it('shows the complete state sequence and candidate versus current coverage', async () => {
    const html = await renderToString(createSSRApp(DemoTextFieldAppearance));
    const states = [
      'default',
      'filled',
      'hover',
      'focus',
      'invalid',
      'disabled',
      'readonly',
    ];

    expect(html.match(/data-text-field-state-review/gu)).toHaveLength(2);
    for (const state of states) {
      expect(
        html.match(new RegExp(`data-text-field-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-text-field-coverage-matrix/gu)).toHaveLength(2);
    expect(html).toContain(
      'data-text-field-coverage="candidate-readonly-surface" data-coverage-status="complete"',
    );
    expect(html).toContain(
      'data-text-field-coverage="current-readonly-surface" data-coverage-status="pending"',
    );
    expect(html).toContain(
      'data-text-field-coverage="candidate-disabled-selection" data-coverage-status="complete"',
    );
    expect(html).toContain(
      'data-text-field-coverage="current-disabled-selection" data-coverage-status="pending"',
    );

    expect(componentSource).toMatch(
      /data-text-field-state='hover'[\s\S]*?border-color: var\(--ui-field-border-hover\);[\s\S]*?background: var\(--ui-field-bg-hover\);/u,
    );
    expect(componentSource).toMatch(
      /data-text-field-state='focus'[\s\S]*?outline: var\(--ui-focus-width\) solid var\(--ui-color-focus\);[\s\S]*?outline-offset: var\(--ui-focus-offset\);/u,
    );
    expect(componentSource).toMatch(
      /data-text-field-state='disabled'[\s\S]*?-webkit-user-select: none;[\s\S]*?user-select: none;/u,
    );
    expect(componentSource).toMatch(
      /data-text-field-state='readonly'[\s\S]*?background: var\(--ui-field-bg-readonly\);[\s\S]*?border-color: var\(--ui-field-border\);/u,
    );
  });

  it('keeps specimens controlled and preserves readonly and disabled native semantics', async () => {
    const { app, root } = mount(DemoTextFieldAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];
    const filledId = 'demo-text-field-candidate-state-filled';
    const filled = inputById(filledId);

    expect(filled.props.value).toBe('雨愛');
    trigger(filled, 'onInput', { target: { value: '新しい曲名' } });
    await nextTick();
    expect(inputById(filledId).props.value).toBe('新しい曲名');
    expect(
      inputById('demo-text-field-candidate-state-readonly').props.readonly,
    ).toBe(true);
    expect(
      inputById('demo-text-field-candidate-state-disabled').props.disabled,
    ).toBe(true);
    expect(
      inputById('demo-text-field-candidate-state-invalid').props[
        'aria-invalid'
      ],
    ).toBe(true);
    app.unmount();
  });

  it('keeps the candidate styling inside the F8 inspection component', () => {
    expect(textFieldSource).not.toContain('--ui-color-surface');
    expect(textFieldSource).not.toContain('data-text-field-state');
    expect(componentSource).toContain('.demo-text-field-layer--candidate');
    expect(componentSource).toContain('.demo-text-field-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-text-field-layer--current)",
    );
    expect(componentSource).not.toContain(
      '.ui-theme-light .demo-text-field-layer--current',
    );
    expect(componentSource).toContain('@container (max-width: 48rem)');
  });
});
