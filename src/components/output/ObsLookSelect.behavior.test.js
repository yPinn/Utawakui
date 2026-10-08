import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ObsLookSelect from './ObsLookSelect.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(ObsLookSelect, './ObsLookSelect.vue', import.meta.url);
attachClientRender(UiScrollRegion, '../ui/UiScrollRegion.vue', import.meta.url);

const OPTIONS = [
  { id: 'original', label: '模板原色' },
  { id: 'warm', label: '暖色舞台' },
  { id: 'cool', label: '冷色舞台' },
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
const overlayAppearanceStyles = readFileSync(
  new URL('../../../overlay/shared/appearance.css', import.meta.url),
  'utf8',
);

function propertyValue(source, property) {
  return source.match(new RegExp(`${property}:\\s*([^;]+);`, 'u'))?.[1].trim();
}

function lookBlock(lookId) {
  return overlayAppearanceStyles.match(
    new RegExp(`:root\\[data-ovl-palette='${lookId}'\\]\\s*\\{([^}]+)\\}`, 'u'),
  )?.[1];
}

function combobox(root) {
  return findAll(root, (node) => node.props?.role === 'combobox')[0];
}

function options(overlayHost) {
  return findAll(overlayHost, (node) => node.props?.role === 'option');
}

describe('ObsLookSelect', () => {
  it('keeps representative swatches aligned with the full-strength Overlay Look roles', () => {
    const sources = {
      original: {
        block: overlayFallbackStyles,
        roles: [
          'primitive-color-ink',
          'primitive-color-paper',
          'primitive-color-coral',
        ],
      },
      warm: {
        block: lookBlock('warm'),
        roles: ['look-color-ink', 'look-color-paper', 'look-color-current'],
      },
      cool: {
        block: lookBlock('cool'),
        roles: ['look-color-ink', 'look-color-paper', 'look-color-current'],
      },
      monochrome: {
        block: lookBlock('monochrome'),
        roles: ['look-color-ink', 'look-color-paper', 'look-color-current'],
      },
      contrast: {
        block: lookBlock('high-contrast'),
        roles: ['look-color-ink', 'look-color-paper', 'look-color-current'],
      },
    };

    for (const [lookId, { block, roles }] of Object.entries(sources)) {
      for (const [index, previewRole] of ['ink', 'paper', 'accent'].entries()) {
        expect(
          propertyValue(
            outputStyles,
            `--ui-output-look-${lookId}-${previewRole}`,
          ),
        ).toBe(propertyValue(block, `--ovl-${roles[index]}`));
      }
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
    expect(textContent(trigger)).toContain('冷色舞台');
    expect(
      findAll(trigger, (node) => node.props?.['data-look'] === 'cool'),
    ).toHaveLength(1);
    expect(options(overlayHost)).toHaveLength(0);
    app.unmount();
  });

  it('opens five rich options and marks the persisted Look as selected', async () => {
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
    expect(optionNodes).toHaveLength(5);
    expect(optionNodes[1].props['aria-selected']).toBe(true);
    expect(textContent(overlayHost)).toContain('高對比');
    expect(
      findAll(
        optionNodes[4],
        (node) => node.props?.['data-look'] === 'high-contrast',
      ),
    ).toHaveLength(1);
    app.unmount();
  });

  it('browses without committing, then commits the highlighted option with Enter', async () => {
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

    const arrowEvent = { key: 'ArrowDown', preventDefault: vi.fn() };
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
    expect(textContent(triggerNode)).toContain('暖色舞台');
    expect(triggerNode.focus).toHaveBeenCalledOnce();
    app.unmount();
  });
});
