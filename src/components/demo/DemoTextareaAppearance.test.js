import { readFileSync } from 'node:fs';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
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
const componentSource = readFileSync(
  new URL('./DemoTextareaAppearance.vue', import.meta.url),
  'utf8',
);
const textareaSource = readFileSync(
  new URL('../ui/UiTextarea.vue', import.meta.url),
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

  it('orders candidate and current contracts from foundations through public API', async () => {
    const html = await renderToString(createSSRApp(DemoTextareaAppearance));
    const candidateIndex = html.indexOf('data-textarea-source="candidate"');
    const currentIndex = html.indexOf('data-textarea-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 候選 Textarea');
    expect(html).toContain('現行 UiTextarea');
    expect(html.indexOf('基礎性質')).toBeLessThan(html.indexOf('內容行為'));
    expect(html.indexOf('內容行為')).toBeLessThan(
      html.indexOf('狀態外觀與覆蓋'),
    );
    expect(html.indexOf('狀態外觀與覆蓋')).toBeLessThan(
      html.indexOf('Public contract'),
    );
  });

  it('visualizes rows, hard floor, parent width, padding, wrapping, and resize ownership', async () => {
    const html = await renderToString(createSSRApp(DemoTextareaAppearance));

    for (const [rows, count] of [
      ['2', 3],
      ['3', 2],
      ['5', 2],
    ]) {
      expect(
        html.match(new RegExp(`data-textarea-rows="${rows}"`, 'gu')),
      ).toHaveLength(count);
    }
    for (const heightCase of [
      'standard-floor',
      'compact-floor',
      'active-floor',
    ]) {
      expect(html).toContain(`data-textarea-height-case="${heightCase}"`);
    }
    for (const widthCase of ['narrow', 'reference', 'fluid']) {
      expect(
        html.match(new RegExp(`data-textarea-width="${widthCase}"`, 'gu')),
      ).toHaveLength(2);
    }
    for (const part of ['top', 'content', 'bottom', 'inline']) {
      expect(
        html.match(new RegExp(`data-textarea-anatomy="${part}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Hard floor · 2 × Field height');
    expect(html).toContain('Default rows · 3');
    expect(html).toContain('Width · 100% parent／min 0／max none');
    expect(html).toContain('4 CSS px block · 8 CSS px inline');
    expect(html).toContain('Soft wrap · native vertical overflow');
    expect(html).toContain('Resize · vertical／consumer may constrain');
    expect(componentSource).not.toContain('--ui-textarea-min-width');
    expect(componentSource).not.toContain('--ui-textarea-max-width');
    expect(componentSource).toContain('.demo-textarea-height--compact-floor {');
    expect(componentSource).toContain('--ui-field-height: 2rem;');
    expect(componentSource).toContain('width: min(12rem, 100%);');
    expect(componentSource).toContain('width: min(20rem, 100%);');
    expect(textareaSource).toContain(
      'min-height: calc(var(--ui-field-height) * 2);',
    );
    expect(textareaSource).toContain('resize: vertical;');
  });

  it('renders multiline content and the complete state sequence', async () => {
    const html = await renderToString(createSSRApp(DemoTextareaAppearance));

    for (const content of [
      'placeholder',
      'line-breaks',
      'wrap',
      'maxlength',
      'direction',
    ]) {
      expect(
        html.match(new RegExp(`data-textarea-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    for (const state of [
      'default',
      'filled',
      'hover',
      'focus',
      'invalid',
      'disabled',
      'readonly',
    ]) {
      expect(
        html.match(new RegExp(`data-textarea-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('顯式換行＋自動換行');
    expect(html).toContain('maxlength="24"');
    expect(html).toContain('dir="auto"');
    expect(html).toContain(
      'data-textarea-coverage="candidate-readonly-surface" data-coverage-status="review"',
    );
    expect(html).toContain(
      'data-textarea-coverage="current-readonly-surface" data-coverage-status="pending"',
    );
    expect(componentSource).toMatch(
      /data-textarea-state='disabled'[\s\S]*?-webkit-user-select: none;[\s\S]*?user-select: none;/u,
    );
    expect(componentSource).not.toMatch(
      /data-textarea-state='readonly'[\s\S]*?background:/u,
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
      target: { value: '更新後\n仍保留換行' },
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

  it('keeps candidate styles isolated to the F8 inspection component', () => {
    expect(textareaSource).not.toContain('data-textarea-state');
    expect(componentSource).toContain('.demo-textarea-layer--candidate');
    expect(componentSource).toContain('.demo-textarea-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-textarea-layer--current)",
    );
    expect(componentSource).toContain('@container (max-width: 48rem)');
  });
});
