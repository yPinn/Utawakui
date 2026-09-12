import { readFileSync } from 'node:fs';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiField from '../ui/UiField.vue';
import UiRange from '../ui/UiRange.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import DemoCandidateRange from './DemoCandidateRange.vue';
import DemoRangeAppearance from './DemoRangeAppearance.vue';

const demoInputsSource = readFileSync(
  new URL('./DemoInputs.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoRangeAppearance.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('./DemoCandidateRange.vue', import.meta.url),
  'utf8',
);
const rangeSource = readFileSync(
  new URL('../ui/UiRange.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [DemoRangeAppearance, './DemoRangeAppearance.vue'],
  [DemoCandidateRange, './DemoCandidateRange.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiRange, '../ui/UiRange.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

describe('DemoRangeAppearance', () => {
  it('mounts a dedicated Range phase after the accepted Checkbox phase', () => {
    expect(demoInputsSource).toContain(
      "import DemoCheckboxAppearance from './DemoCheckboxAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoCheckboxAppearance v-else-if="section.key === \'checkbox\'" />',
    );
    expect(demoInputsSource).toContain(
      "import DemoRangeAppearance from './DemoRangeAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoRangeAppearance v-else-if="section.key === \'range\'" />',
    );
    expect(demoInputsSource).not.toContain(
      '<div v-else-if="section.key === \'range\'" class="demo-sample-grid">',
    );
  });

  it('orders Candidate and Current from geometry through the public contract', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));
    const candidateIndex = html.indexOf('data-range-source="candidate"');
    const currentIndex = html.indexOf('data-range-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 候選 Range');
    expect(html).toContain('現行 UiRange');

    const sequence = [
      '尺寸與寬度責任',
      'Owned anatomy',
      '數值與格式內容',
      '離散 stops',
      '狀態外觀與覆蓋',
      'Hint → Error 與 ARIA',
      'Public contract',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-range-source="${source}"[\\s\\S]*?(?=<section[^>]*data-range-source=|$)`,
          'u',
        ),
      )?.[0];
      let previousIndex = -1;
      for (const label of sequence) {
        const index = layer.indexOf(label);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
    }
  });

  it('visualizes 36 and 32 CSS px Candidate targets against the Current 30px field row', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    for (const size of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-range-size="${size}"`);
    }
    for (const width of ['narrow', 'reference', 'fluid']) {
      expect(
        html.match(new RegExp(`data-range-width="${width}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Standard target · 36 CSS px');
    expect(html).toContain('Compact target · 32 CSS px');
    expect(html).toContain('Current field row · 30 CSS px');
    expect(html).toContain('Track · 6 CSS px');
    expect(html).toContain('Track／input box · 4 CSS px');
    expect(html).toContain('Thumb · 16 CSS px');
    expect(html).toContain('Width · 100% parent／min 0／max none');
    expect(componentSource).toContain(
      '.demo-range-size--standard {\n  --demo-range-target-size: 2.25rem;',
    );
    expect(componentSource).toContain(
      '.demo-range-size--compact {\n  --demo-range-target-size: 2rem;',
    );
    expect(componentSource).toContain(
      '.demo-range-size--active {\n  --demo-range-target-size: 1.875rem;',
    );
    expect(candidateSource).toContain(
      'height: var(--demo-range-target-size, var(--ui-control-height));',
    );
    expect(candidateSource).not.toContain(
      '--demo-range-target-size: var(--ui-control-height);',
    );
    expect(candidateSource).toContain('--demo-range-track-size: 0.375rem;');
    expect(candidateSource).toContain('height: var(--demo-range-track-size);');
    expect(rangeSource).toContain('width: 100%;');
    expect(rangeSource).toContain('min-width: 0;');
    expect(rangeSource).not.toContain('max-width:');
  });

  it('keeps one native input over a project-owned track, fill, thumb, and optional output', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    for (const part of [
      'input',
      'track',
      'fill',
      'thumb',
      'value',
      'support',
    ]) {
      expect(
        html.match(new RegExp(`data-range-anatomy="${part}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Native input · full 36／32px track target');
    expect(html).toContain('Project-owned 6px track／fill');
    expect(html).toContain('Project-owned 16px thumb');
    expect(html).toContain('Current Chromium native track／thumb');
    expect(candidateSource).toContain('type="range"');
    expect(candidateSource).toContain('appearance: none;');
    expect(candidateSource).toContain('position: absolute;');
    expect(candidateSource).toContain(
      'inset-inline: calc(var(--ui-range-thumb-size) / 2);',
    );
    expect(candidateSource).toContain('pointer-events: none;');
    expect(candidateSource).toContain('::-webkit-slider-thumb');
    expect(candidateSource).toContain('var(--ui-color-text-muted) 70%');
    expect(candidateSource).toContain(
      'background: var(--demo-range-track-rest);',
    );
    expect(rangeSource).not.toContain('appearance: none;');
  });

  it('shows native step snapping with optional in-track ticks and no reserved marks row', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    expect(html.match(/data-range-stops/gu)).toHaveLength(2);
    expect(html).toContain('0／25／50／75／100 · native step 25');
    expect(html).toContain('Candidate：5 個軌道內 ticks，不增加垂直預留');
    expect(html).toContain('Current：native step 吸附，沒有自訂 tick layer');
    expect(candidateSource).toContain(
      'marks: { type: Array, default: () => [] }',
    );
    expect(candidateSource).toContain('class="demo-candidate-range__stops"');
    expect(candidateSource).toContain('aria-hidden="true"');
    expect(candidateSource).toMatch(
      /\.demo-candidate-range__stops[\s\S]*?pointer-events: none;/u,
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-range__value[\s\S]*?min-inline-size: 2\.5rem;[\s\S]*?font-variant-numeric: tabular-nums;/u,
    );
    expect(candidateSource).not.toContain('min-width: 5ch;');
    expect(candidateSource).not.toContain('inline-size: 5ch;');
    expect(candidateSource).not.toContain('demo-candidate-range__marks-row');

    const { app, root } = mount(DemoRangeAppearance);
    const input = findAll(
      root,
      (node) =>
        node.type === 'input' &&
        node.props.id === 'demo-range-candidate-stops-equal',
    )[0];
    expect(input.props).toMatchObject({ min: 0, max: 100, step: 25 });
    const ticks = findAll(
      root,
      (node) => node.props['data-range-stop'] !== undefined,
    );
    expect(ticks).toHaveLength(5);
    expect(ticks.map((tick) => tick.props['data-range-stop'])).toEqual([
      0, 25, 50, 75, 100,
    ]);
    trigger(input, 'onInput', {
      target: { valueAsNumber: 75, value: '75' },
    });
    await nextTick();
    expect(input.props.value).toBe(75);
    app.unmount();
  });

  it('covers numeric boundaries, negative and fractional steps, long value text, and native fallback', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    for (const content of [
      'minimum',
      'maximum',
      'negative',
      'fractional',
      'long-value-text',
      'native-value',
    ]) {
      expect(
        html.match(new RegExp(`data-range-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('−12 dB');
    expect(html).toContain('0.65×');
    expect(html).toContain('標準速度／100.0 percent');
    expect(html).toContain('No valueText · native numeric announcement');
    expect(candidateSource).toContain("'--demo-range-ratio'");
    expect(candidateSource).toContain('Math.min(1, Math.max(0');
    expect(candidateSource).toContain('@container (max-width: 18rem)');
    expect(candidateSource).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(candidateSource).toMatch(
      /:deep\(\.ui-field__label\)[\s\S]*?overflow-wrap: anywhere;/u,
    );
    expect(componentSource).toMatch(
      /\.demo-range-anatomy__map span[\s\S]*?overflow-wrap: anywhere;/u,
    );
  });

  it('covers range-specific boundary and interaction states without empty, required, or readonly', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));
    const states = [
      'default',
      'minimum',
      'maximum',
      'hover',
      'focus',
      'invalid',
      'disabled',
    ];

    for (const state of states) {
      expect(
        html.match(new RegExp(`data-range-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-range-coverage-matrix/gu)).toHaveLength(2);
    expect(html).toContain('沒有 empty、required 或 readonly state。');
    expect(componentSource).not.toContain(':required');
    expect(componentSource).not.toContain(':readonly');
    expect(candidateSource).toMatch(
      /:focus-visible::-webkit-slider-thumb[\s\S]*?var\(--ui-color-focus\)/u,
    );
    expect(candidateSource).toMatch(
      /\[aria-invalid='true'\][\s\S]*?var\(--ui-color-danger\)/u,
    );
  });

  it('preserves controlled numeric updates, min/max/step, and forwarded native attributes', async () => {
    const { app, root } = mount(DemoRangeAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];
    const id = 'demo-range-candidate-content-fractional';

    expect(inputById(id).props).toMatchObject({
      value: 0.65,
      min: 0.5,
      max: 1.5,
      step: 0.05,
      'aria-valuetext': '0.65×',
    });
    trigger(inputById(id), 'onInput', {
      target: { valueAsNumber: 0.7, value: '0.7' },
    });
    await nextTick();
    expect(inputById(id).props.value).toBe(0.7);
    expect(inputById(id).props['aria-valuetext']).toBe('0.70×');
    expect(
      textContent(
        findAll(
          root,
          (node) => node.type === 'output' && node.props.for === id,
        )[0],
      ),
    ).toBe('0.70×');

    const nativeFallbackId = 'demo-range-candidate-content-native-value';
    trigger(inputById(nativeFallbackId), 'onInput', {
      target: { valueAsNumber: Number.NaN, value: '64' },
    });
    await nextTick();
    expect(inputById(nativeFallbackId).props.value).toBe(64);
    expect(
      inputById('demo-range-candidate-validation-hint').props,
    ).toMatchObject({
      name: 'demo-range-candidate-level',
      'data-contract': 'native-forwarding',
    });
    expect(
      inputById('demo-range-candidate-state-disabled').props.disabled,
    ).toBe(true);
    app.unmount();
  });

  it('demonstrates value text, Hint replacement, and merged ARIA descriptions', () => {
    const { app, root } = mount(DemoRangeAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];

    const hint = inputById('demo-range-candidate-validation-hint');
    const invalid = inputById('demo-range-candidate-validation-error');
    expect(hint.props['aria-describedby']).toBe(
      'range-external-note demo-range-candidate-validation-hint-hint',
    );
    expect(hint.props['aria-valuetext']).toBe('72%');
    expect(hint.props['aria-invalid']).toBeUndefined();
    expect(invalid.props['aria-describedby']).toBe(
      'range-external-note demo-range-candidate-validation-error-error',
    );
    expect(invalid.props['aria-invalid']).toBe(true);
    expect(invalid.props['aria-valuetext']).toBe('超過建議值：140%');
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-range-candidate-validation-error-hint',
      ),
    ).toHaveLength(0);
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-range-candidate-validation-error-error' &&
          node.props.role === 'alert',
      ),
    ).toHaveLength(1);
    app.unmount();
  });

  it('documents the bounded public contract and isolates Candidate styling', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    expect(html).toContain('Number modelValue → update:modelValue');
    expect(html).toContain('min · max · step · disabled · invalid');
    expect(html).toContain('valueText → output／aria-valuetext');
    expect(html).toContain('name · native attrs／listeners');
    expect(html).toContain('focus() · bounded native-control access');
    expect(html).toContain(
      'Candidate visual track／thumb／optional in-track ticks · Native range input · No production marks／required／readonly／size prop',
    );
    expect(componentSource).toContain('demo-range-layer--candidate');
    expect(componentSource).toContain('.demo-range-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-range-layer--current)",
    );
    expect(componentSource).toContain('@container (max-width: 48rem)');
    expect(rangeSource).not.toContain('data-range-state');
    expect(rangeSource).not.toContain('marks:');
  });
});
