import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import UiField from '../ui/UiField.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import DemoTextareaAppearance from './DemoTextareaAppearance.vue';
const demoInputsSource = readFileSync(
  new URL('./DemoInputs.vue', import.meta.url),
  'utf8',
);
for (const [component, filename] of [
  [DemoTextareaAppearance, './DemoTextareaAppearance.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiTextarea, '../ui/UiTextarea.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}
describe('DemoTextareaAppearance', () => {
  it('mounts a dedicated Textarea contract instead of the scenario grid', () => {
    expect(demoInputsSource).toContain(
      "import DemoTextareaAppearance from './DemoTextareaAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoTextareaAppearance v-else-if="section.key === \'textarea\'" />',
    );
    expect(demoInputsSource).not.toContain(
      '<div v-else-if="section.key === \'textarea\'" class="demo-sample-grid">',
    );
  });
  it('keeps specimens controlled and native semantics intact', async () => {
    const { app, root } = mount(DemoTextareaAppearance);
    const textareaById = (id) =>
      findAll(
        root,
        (node) => node.type === 'textarea' && node.props.id === id,
      )[0];
    const filledId = 'demo-textarea-candidate-state-filled';
    expect(textareaById(filledId).props.value).toContain('第二段');
    trigger(textareaById(filledId), 'onInput', {
      target: {
        value: '更新後\n仍保留換行',
      },
    });
    await nextTick();
    expect(textareaById(filledId).props.value).toBe('更新後\n仍保留換行');
    expect(
      textareaById('demo-textarea-candidate-state-readonly').props.readonly,
    ).toBe(true);
    expect(
      textareaById('demo-textarea-candidate-state-disabled').props.disabled,
    ).toBe(true);
    expect(
      textareaById('demo-textarea-candidate-state-invalid').props[
        'aria-invalid'
      ],
    ).toBe(true);
    app.unmount();
  });
});
