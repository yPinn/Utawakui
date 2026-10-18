import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoInputs from './DemoInputs.vue';

const sections = [
  { key: 'radio-group', title: '單選群組' },
  { key: 'switch', title: '開關' },
  { key: 'combobox', title: '可搜尋選單' },
];

describe('formal input catalogue state coverage', () => {
  it('keeps all control paint and interaction owned by the formal primitives', () => {
    for (const [demo, primitive] of [
      ['DemoRadioGroupAppearance', 'UiRadioGroup'],
      ['DemoSwitchAppearance', 'UiSwitch'],
      ['DemoComboboxAppearance', 'UiCombobox'],
    ]) {
      const source = readFileSync(
        new URL(`./${demo}.vue`, import.meta.url),
        'utf8',
      );
      expect(source).toContain(
        `import ${primitive} from '../ui/${primitive}.vue';`,
      );
      expect(source).not.toMatch(
        /<style|DemoCandidate|<input|role="(?:combobox|radio|switch)"/u,
      );
    }
    const layout = readFileSync(
      new URL('../../styles/demoInputStates.css', import.meta.url),
      'utf8',
    );
    expect(layout).not.toMatch(
      /ui-(?:switch|radio-group|combobox)__|:hover|:focus|:active|\bopacity:/u,
    );
    expect(layout).toContain('var(--ui-space-3)');
    expect(layout).toContain('var(--ui-type-caption-size)');
    expect(layout).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  });

  it('projects real checked, disabled, validation and trigger semantics in each specimen', async () => {
    const html = await renderToString(createSSRApp(DemoInputs, { sections }));
    const row = (component, key) =>
      html.match(
        new RegExp(
          `<article[^>]*data-${component}-state="${key}"[\\s\\S]*?</article>`,
          'u',
        ),
      )?.[0];
    for (const key of [
      'off',
      'on',
      'required-pristine',
      'invalid-off',
      'invalid-on',
      'explicit-invalid',
      'disabled-off',
      'disabled-on',
      'disabled-invalid-off',
      'disabled-invalid-on',
    ]) {
      const specimen = row('switch', key);
      expect(specimen, key).toBeDefined();
      expect(specimen.includes('aria-invalid="true"')).toBe(
        key.includes('invalid'),
      );
      expect(/\sdisabled(?:\s|=|>)/u.test(specimen)).toBe(
        key.startsWith('disabled'),
      );
      expect(/\schecked(?:\s|=|>)/u.test(specimen)).toBe(
        key === 'on' || key.endsWith('-on'),
      );
    }
    for (const key of [
      'editable-flat',
      'select-only-flat',
      'disabled-editable',
      'disabled-select-only',
      'invalid-editable',
      'invalid-select-only',
      'disabled-invalid-editable',
      'disabled-invalid-select-only',
      'required-pristine',
    ]) {
      const specimen = row('combobox', key);
      expect(specimen, key).toBeDefined();
      expect(specimen.includes('aria-invalid="true"')).toBe(
        key.includes('invalid'),
      );
      expect(/\sdisabled(?:\s|=|>)/u.test(specimen)).toBe(
        key.startsWith('disabled'),
      );
      expect(specimen).toMatch(
        key.includes('select-only')
          ? /<button[^>]*role="combobox"/u
          : /<input[^>]*role="combobox"/u,
      );
    }
    expect(row('radio', 'empty')).not.toContain('type="radio"');
    expect(row('radio', 'hidden-legend')).toContain(
      'ui-radio-group__legend--hidden',
    );
  });

  it('delegates all three entries to formal state compositions', () => {
    const source = readFileSync(
      new URL('./DemoInputs.vue', import.meta.url),
      'utf8',
    );
    for (const component of [
      'DemoRadioGroupAppearance',
      'DemoSwitchAppearance',
      'DemoComboboxAppearance',
    ]) {
      expect(source).toContain(
        `import ${component} from './${component}.vue';`,
      );
      expect(source).toContain(`<${component} v-else-if=`);
    }
  });

  it('renders production states and working recovery entries without Candidate paint', async () => {
    const html = await renderToString(createSSRApp(DemoInputs, { sections }));
    expect(html.match(/data-input-source="production"/gu)).toHaveLength(3);
    for (const state of [
      'list',
      'horizontal',
      'tiles',
      'disabled',
      'hidden-legend',
      'empty',
      'numeric',
    ]) {
      expect(html).toContain(`data-radio-state="${state}"`);
    }
    for (const state of [
      'off',
      'on',
      'required-pristine',
      'invalid-off',
      'invalid-on',
      'explicit-invalid',
      'disabled-off',
      'disabled-on',
      'disabled-invalid-off',
      'disabled-invalid-on',
    ]) {
      expect(html).toContain(`data-switch-state="${state}"`);
    }
    for (const state of [
      'editable-flat',
      'select-only-flat',
      'editable-grouped',
      'select-only-grouped',
      'disabled-editable',
      'disabled-select-only',
      'invalid-editable',
      'invalid-select-only',
      'disabled-invalid-editable',
      'disabled-invalid-select-only',
      'required-pristine',
      'hidden-label',
      'empty',
      'numeric',
    ]) {
      expect(html).toContain(`data-combobox-state="${state}"`);
    }
    for (const id of [
      'demo-radio-recovery',
      'demo-switch-recovery',
      'demo-combobox-recovery-editable',
      'demo-combobox-recovery-select-only',
    ]) {
      expect(html).toContain(id);
    }
    expect(html).not.toContain('demo-candidate');
  });
});
