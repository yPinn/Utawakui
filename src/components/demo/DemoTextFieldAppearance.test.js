import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
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
  it('keeps specimens controlled and preserves readonly and disabled native semantics', async () => {
    const { app, root } = mount(DemoTextFieldAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];
    const filledId = 'demo-text-field-state-filled';
    const filled = inputById(filledId);
    expect(filled.props.value).toBe('雨愛');
    trigger(filled, 'onInput', {
      target: {
        value: '新しい曲名',
      },
    });
    await nextTick();
    expect(inputById(filledId).props.value).toBe('新しい曲名');
    expect(inputById('demo-text-field-state-readonly').props.readonly).toBe(
      true,
    );
    expect(inputById('demo-text-field-state-disabled').props.disabled).toBe(
      true,
    );
    expect(
      inputById('demo-text-field-state-invalid').props['aria-invalid'],
    ).toBe(true);
    app.unmount();
  });
});
