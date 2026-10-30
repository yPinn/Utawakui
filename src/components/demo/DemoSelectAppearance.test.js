import { readFileSync } from 'node:fs';
import { h, nextTick, shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';
import UiField from '../ui/UiField.vue';
import UiSelect from '../ui/UiSelect.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import DemoCandidateSelect from './DemoCandidateSelect.vue';
import DemoSelectAppearance from './DemoSelectAppearance.vue';
const demoInputsSource = readFileSync(
  new URL('./DemoInputs.vue', import.meta.url),
  'utf8',
);
const candidateSelectSource = readFileSync(
  new URL('./DemoCandidateSelect.vue', import.meta.url),
  'utf8',
);
const selectSource = readFileSync(
  new URL('../ui/UiSelect.vue', import.meta.url),
  'utf8',
);
for (const [component, filename] of [
  [DemoSelectAppearance, './DemoSelectAppearance.vue'],
  [DemoCandidateSelect, './DemoCandidateSelect.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}
describe('DemoSelectAppearance', () => {
  it('keeps the accepted Select contract mounted beside Checkbox and Range', () => {
    expect(demoInputsSource).toContain(
      "import DemoSelectAppearance from './DemoSelectAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoSelectAppearance v-else-if="section.key === \'select\'" />',
    );
    expect(demoInputsSource).not.toContain(
      '<div v-else-if="section.key === \'select\'" class="demo-sample-grid">',
    );
    expect(demoInputsSource).toContain(
      '<DemoCheckboxAppearance v-else-if="section.key === \'checkbox\'" />',
    );
    expect(demoInputsSource).toContain(
      '<DemoRangeAppearance v-else-if="section.key === \'range\'" />',
    );
  });
  it('keeps long Candidate values static, truncated, and recoverable on hover or focus', async () => {
    expect(candidateSelectSource).toContain('text-overflow: ellipsis;');
    expect(candidateSelectSource).toContain('white-space: nowrap;');
    expect(candidateSelectSource).toContain('data-value-overflow');
    expect(candidateSelectSource).toContain('role="tooltip"');
    expect(candidateSelectSource).toContain(
      ':aria-hidden="!isValueOverflowing"',
    );
    expect(candidateSelectSource).toContain('inset-inline: 0;');
    expect(candidateSelectSource).toContain('overflow-wrap: anywhere;');
    expect(candidateSelectSource).toContain(
      ".demo-candidate-select__control[data-value-overflow='true']:hover",
    );
    expect(candidateSelectSource).toContain(
      ".demo-candidate-select__control[data-value-overflow='true']:focus-within",
    );
    expect(candidateSelectSource).not.toContain('UiMarqueeText');
    expect(candidateSelectSource).not.toMatch(/@keyframes|animation:/u);
    expect(selectSource).not.toContain('data-value-overflow');
    const selectedValue = shallowRef('latin');
    const options = [
      {
        value: 'latin',
        label:
          'A deliberately long Latin option value for native clipping inspection',
      },
      {
        value: 'quick',
        label: '快速處理',
      },
    ];
    const Harness = {
      setup() {
        return () =>
          h(DemoCandidateSelect, {
            id: 'candidate-long-value',
            label: 'Long value',
            modelValue: selectedValue.value,
            options,
            'onUpdate:modelValue': (value) => {
              selectedValue.value = value;
            },
          });
      },
    };
    const { app, root } = mount(Harness);
    const select = findAll(root, (node) => node.type === 'select')[0];
    const tooltip = () =>
      findAll(root, (node) => node.props.role === 'tooltip')[0];
    expect(textContent(tooltip())).toBe(options[0].label);
    trigger(select, 'onChange', {
      target: {
        value: 'quick',
      },
    });
    await nextTick();
    expect(textContent(tooltip())).toBe('快速處理');
    app.unmount();
  });
  it('keeps specimens controlled and preserves typed native updates', async () => {
    const { app, root } = mount(DemoSelectAppearance);
    const selectById = (id) =>
      findAll(
        root,
        (node) => node.type === 'select' && node.props.id === id,
      )[0];
    const filledId = 'demo-select-state-filled';
    const numberId = 'demo-select-content-number';
    expect(selectById(filledId).props.value).toBe('general');
    trigger(selectById(filledId), 'onChange', {
      target: {
        value: 'quick',
      },
    });
    await nextTick();
    expect(selectById(filledId).props.value).toBe('quick');
    expect(selectById(numberId).props.value).toBe(72);
    trigger(selectById(numberId), 'onChange', {
      target: {
        value: '88',
      },
    });
    await nextTick();
    expect(selectById(numberId).props.value).toBe(88);
    expect(selectById('demo-select-state-required').props.required).toBe(true);
    expect(selectById('demo-select-state-disabled').props.disabled).toBe(true);
    app.unmount();
  });
  it('demonstrates Hint replacement and complete ARIA relationships', () => {
    const { app, root } = mount(DemoSelectAppearance);
    const selectById = (id) =>
      findAll(
        root,
        (node) => node.type === 'select' && node.props.id === id,
      )[0];
    const hint = selectById('demo-select-validation-hint');
    const invalid = selectById('demo-select-validation-error');
    expect(hint.props['aria-describedby']).toBe(
      'select-external-note demo-select-validation-hint-hint',
    );
    expect(hint.props).toMatchObject({
      name: 'demo-select-recipe',
      autocomplete: 'off',
      'data-contract': 'native-forwarding',
    });
    expect(hint.props['aria-invalid']).toBeUndefined();
    expect(invalid.props['aria-describedby']).toBe(
      'select-external-note demo-select-validation-error-error',
    );
    expect(invalid.props['aria-invalid']).toBe(true);
    expect(
      findAll(
        root,
        (node) => node.props.id === 'demo-select-validation-error-hint',
      ),
    ).toHaveLength(0);
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-select-validation-error-error' &&
          node.props.role === 'alert',
      ),
    ).toHaveLength(1);
    app.unmount();
  });
});
