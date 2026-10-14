import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DemoTrackCollectionColumnChooser from './DemoTrackCollectionColumnChooser.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiField from '../ui/UiField.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [DemoTrackCollectionColumnChooser, './DemoTrackCollectionColumnChooser.vue'],
  [UiCheckbox, '../ui/UiCheckbox.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiPopover, '../ui/UiPopover.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const chooserSource = readFileSync(
  new URL('./DemoTrackCollectionColumnChooser.vue', import.meta.url),
  'utf8',
);

beforeEach(() => {
  const body = hostNode('body');
  vi.stubGlobal('document', {
    body,
    querySelector: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getComputedStyle: () => ({
      direction: 'ltr',
      fontSize: '16px',
      getPropertyValue: () => '',
    }),
  });
});

describe('DemoTrackCollectionColumnChooser', () => {
  it('keeps the trigger icon-only and toggles Playlist defaults in Spotify order', async () => {
    const onUpdateColumnPreferences = vi.fn();
    const mounted = mount(DemoTrackCollectionColumnChooser, {
      collectionKind: 'playlist',
      preferences: {
        visibleAdvanced: [],
        widths: { identity: 400 },
        columnOrder: ['membership', 'release', 'usage', 'releaseYear'],
      },
      onUpdateColumnPreferences,
    });
    const triggerButton = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' && textContent(node).includes('選擇顯示欄位'),
    )[0];

    expect(textContent(triggerButton)).toBe('選擇顯示欄位');
    expect(chooserSource).toContain('Columns3');
    expect(chooserSource).not.toContain('ListChecks');

    trigger(triggerButton, 'onClick');
    await nextTick();
    expect(textContent(mounted.overlayHost)).toContain('顯示欄位');
    const choices = findAll(
      mounted.overlayHost,
      (node) => node.type === 'input' && node.props.type === 'checkbox',
    );
    expect(choices.map((choice) => choice.props.id)).toEqual([
      'demo-track-column-playlist-release',
      'demo-track-column-playlist-membership',
      'demo-track-column-playlist-usage',
      'demo-track-column-playlist-releaseYear',
    ]);
    expect(choices.every((choice) => choice.props.disabled === false)).toBe(
      true,
    );
    expect(choices.map((choice) => choice.props.checked)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    trigger(choices[0], 'onChange', { target: { checked: true } });
    expect(onUpdateColumnPreferences).toHaveBeenLastCalledWith({
      visibleAdvanced: ['release'],
      hiddenDefaultColumns: [],
      widths: {},
      columnOrder: ['membership', 'release', 'usage', 'releaseYear'],
    });
    mounted.app.unmount();
  });

  it('labels temporarily collapsed choices without adding a redundant profile reset', async () => {
    const onUpdateColumnPreferences = vi.fn();
    const mounted = mount(DemoTrackCollectionColumnChooser, {
      collectionKind: 'artist',
      preferences: {
        visibleAdvanced: ['usage'],
        widths: { identity: 500, usage: 120 },
      },
      hiddenForWidth: ['usage'],
      onUpdateColumnPreferences,
    });
    const triggerButton = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' && textContent(node).includes('選擇顯示欄位'),
    )[0];

    trigger(triggerButton, 'onClick');
    await nextTick();
    expect(textContent(mounted.overlayHost)).toContain('空間不足，暫時隱藏');
    const reset = findAll(
      mounted.overlayHost,
      (node) =>
        node.type === 'button' && textContent(node).includes('重設欄位'),
    );
    expect(reset).toHaveLength(0);
    expect(onUpdateColumnPreferences).not.toHaveBeenCalled();
    mounted.app.unmount();
  });

  it('shows Artist defaults as selected locked choices', async () => {
    const mounted = mount(DemoTrackCollectionColumnChooser, {
      collectionKind: 'artist',
    });
    const triggerButton = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' && textContent(node).includes('選擇顯示欄位'),
    )[0];

    trigger(triggerButton, 'onClick');
    await nextTick();
    const choices = findAll(
      mounted.overlayHost,
      (node) => node.type === 'input' && node.props.type === 'checkbox',
    );
    expect(choices.map((choice) => choice.props.id)).toEqual([
      'demo-track-column-artist-usage',
      'demo-track-column-artist-release',
      'demo-track-column-artist-releaseYear',
      'demo-track-column-artist-imported',
    ]);
    expect(
      choices.map(({ props }) => ({
        checked: props.checked,
        disabled: props.disabled,
      })),
    ).toEqual([
      { checked: true, disabled: true },
      { checked: false, disabled: false },
      { checked: false, disabled: false },
      { checked: false, disabled: false },
    ]);
    mounted.app.unmount();
  });

  it('shows the Album play-count default as selected and locked', async () => {
    const mounted = mount(DemoTrackCollectionColumnChooser, {
      collectionKind: 'album',
    });
    const triggerButton = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' && textContent(node).includes('選擇顯示欄位'),
    )[0];

    trigger(triggerButton, 'onClick');
    await nextTick();
    const usage = findAll(
      mounted.overlayHost,
      (node) =>
        node.type === 'input' &&
        node.props.id === 'demo-track-column-album-usage',
    )[0];
    expect(usage.props.checked).toBe(true);
    expect(usage.props.disabled).toBe(true);
    mounted.app.unmount();
  });
});
