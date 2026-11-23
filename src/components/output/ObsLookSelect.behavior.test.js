import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { OUTPUT_LOOK_PRESETS } from '../../../shared/outputAppearance.mjs';
import ObsLookSelect from './ObsLookSelect.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiField from '../ui/UiField.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(ObsLookSelect, './ObsLookSelect.vue', import.meta.url);
attachClientRender(UiCombobox, '../ui/UiCombobox.vue', import.meta.url);
attachClientRender(UiField, '../ui/UiField.vue', import.meta.url);
attachClientRender(UiScrollRegion, '../ui/UiScrollRegion.vue', import.meta.url);

const OPTIONS = [
  { id: 'original', label: '模板原色' },
  { id: 'warm', label: '暖調舞台' },
  { id: 'cool', label: '冷調舞台' },
  { id: 'warm-film', label: 'Fujifilm NOSTALGIC Neg.' },
  { id: 'cool-film', label: 'Fujifilm ETERNA' },
  { id: 'velvia-style', label: 'Fujifilm Velvia' },
  { id: 'kodak-gold-200-style', label: 'Kodak Gold 200' },
  { id: 'polaroid-600-style', label: 'Polaroid 600' },
  { id: 'monochrome', label: '黑白' },
  { id: 'high-contrast', label: '高對比' },
];

const outputStyles = readFileSync(
  new URL('../../styles/features/output.css', import.meta.url),
  'utf8',
);
const overlayFallbackStyles = readFileSync(
  new URL('../../../overlay/shared/fallback.css', import.meta.url),
  'utf8',
);

function propertyValue(source, property) {
  return source.match(new RegExp(`${property}:\\s*([^;]+);`, 'u'))?.[1].trim();
}

function combobox(root) {
  return findAll(root, (node) => node.props?.role === 'combobox')[0];
}

function options(overlayHost) {
  return findAll(overlayHost, (node) => node.props?.role === 'option');
}

describe('ObsLookSelect', () => {
  it('keeps original swatches aligned with the generic overlay fallback', () => {
    for (const [previewRole, sourceRole] of [
      ['ink', 'ink'],
      ['paper', 'paper'],
      ['accent', 'coral'],
    ]) {
      expect(
        propertyValue(outputStyles, `--ui-output-look-original-${previewRole}`),
      ).toBe(
        propertyValue(
          overlayFallbackStyles,
          `--ovl-primitive-color-${sourceRole}`,
        ),
      );
    }
  });

  it('collapses the selected Look into one named combobox with a visual preview', () => {
    const { app, overlayHost, root } = mount(ObsLookSelect, {
      id: 'output-appearance-paletteId',
      label: 'Look',
      modelValue: 'cool',
      options: OPTIONS,
    });
    const trigger = combobox(root);

    expect(trigger.props).toMatchObject({
      id: 'output-appearance-paletteId',
      'aria-label': 'Look',
      'aria-expanded': false,
      'aria-haspopup': 'listbox',
    });
    expect(textContent(trigger)).toContain('冷調舞台');
    expect(
      findAll(trigger, (node) => node.props?.['data-look'] === 'cool'),
    ).toHaveLength(1);
    expect(options(overlayHost)).toHaveLength(0);
    app.unmount();
  });

  it('groups text-only options and keeps the shared swatch on the selected value', async () => {
    const { app, overlayHost, root } = mount(ObsLookSelect, {
      id: 'output-appearance-paletteId',
      label: 'Look',
      modelValue: 'warm',
      options: OPTIONS,
    });
    const triggerNode = combobox(root);

    trigger(triggerNode, 'onClick');
    await nextTick();

    const listbox = findAll(
      overlayHost,
      (node) => node.props?.role === 'listbox',
    )[0];
    const optionNodes = options(overlayHost);
    expect(triggerNode.props['aria-expanded']).toBe(true);
    expect(listbox.props['aria-label']).toBe('Look');
    const groups = findAll(listbox, (node) => node.props?.role === 'group');
    expect(
      groups.map((group) => [
        group.props['aria-label'],
        options(group).map((node) => textContent(node).trim()),
      ]),
    ).toEqual([
      ['基本配色', ['模板原色', '冷調舞台', '高對比', '黑白', '暖調舞台']],
      [
        '底片風格',
        [
          'Fujifilm ETERNA',
          'Fujifilm NOSTALGIC Neg.',
          'Fujifilm Velvia',
          'Kodak Gold 200',
          'Polaroid 600',
        ],
      ],
    ]);
    expect(
      optionNodes.find((node) => textContent(node).trim() === '暖調舞台').props[
        'aria-selected'
      ],
    ).toBe(true);
    expect(findAll(listbox, (node) => 'data-look' in node.props)).toHaveLength(
      0,
    );
    const [swatch] = findAll(
      triggerNode,
      (node) => node.props['data-look'] === 'warm',
    );
    const { colors } = OUTPUT_LOOK_PRESETS.warm;
    expect(swatch.props.style).toEqual({
      '--ui-output-look-preview-ink': colors.ink,
      '--ui-output-look-preview-paper': colors.paper,
      '--ui-output-look-preview-accent': colors.current,
    });
    app.unmount();
  });

  it('browses without committing, then commits the highlighted option with Enter', async () => {
    const update = vi.fn();
    const { app, root } = mount(ObsLookSelect, {
      id: 'output-appearance-paletteId',
      label: 'Look',
      modelValue: 'high-contrast',
      options: OPTIONS,
      'onUpdate:modelValue': update,
    });
    const triggerNode = combobox(root);
    trigger(triggerNode, 'onClick');
    await nextTick();

    const arrowEvent = { key: 'ArrowUp', preventDefault: vi.fn() };
    trigger(triggerNode, 'onKeydown', arrowEvent);
    await nextTick();

    expect(arrowEvent.preventDefault).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(triggerNode.props['aria-activedescendant']).toContain('option-cool');

    const enterEvent = { key: 'Enter', preventDefault: vi.fn() };
    trigger(triggerNode, 'onKeydown', enterEvent);
    await nextTick();

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('cool');
    expect(triggerNode.props['aria-expanded']).toBe(false);
    expect(triggerNode.focus).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('does not commit the selected Look again, and closes browsing on Tab', async () => {
    const update = vi.fn();
    const { app, root } = mount(ObsLookSelect, {
      id: 'dedup-look',
      label: 'Look',
      modelValue: 'warm',
      options: OPTIONS,
      'onUpdate:modelValue': update,
    });
    const control = combobox(root);
    trigger(control, 'onClick');
    trigger(control, 'onKeydown', { key: 'Enter', preventDefault: vi.fn() });
    await nextTick();
    expect(update).not.toHaveBeenCalled();
    trigger(control, 'onClick');
    trigger(control, 'onKeydown', {
      key: 'ArrowDown',
      preventDefault: vi.fn(),
    });
    trigger(control, 'onKeydown', { key: 'Tab' });
    await nextTick();
    expect(update).not.toHaveBeenCalled();
    expect(control.props['aria-expanded']).toBe(false);
    app.unmount();
  });

  it('cancels keyboard browsing with Escape without changing the Look', async () => {
    const update = vi.fn();
    const { app, root } = mount(ObsLookSelect, {
      id: 'output-appearance-paletteId',
      label: 'Look',
      modelValue: 'warm',
      options: OPTIONS,
      'onUpdate:modelValue': update,
    });
    const triggerNode = combobox(root);
    trigger(triggerNode, 'onClick');
    await nextTick();
    trigger(triggerNode, 'onKeydown', {
      key: 'End',
      preventDefault: vi.fn(),
    });
    trigger(triggerNode, 'onKeydown', {
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    await nextTick();

    expect(update).not.toHaveBeenCalled();
    expect(triggerNode.props['aria-expanded']).toBe(false);
    expect(textContent(triggerNode)).toContain('暖調舞台');
    expect(triggerNode.focus).toHaveBeenCalledOnce();
    app.unmount();
  });
});
