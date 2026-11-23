import { h, nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../../utils/i18n.js';
import { useOutputTemplateFavorites } from '../../composables/output/useOutputTemplateFavorites.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import ObsTemplateGallery from './ObsTemplateGallery.vue';
import ObsTemplateTile from './ObsTemplateTile.vue';

vi.mock('./ObsOutputSplitLayout.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h(
          'div',
          Object.values(slots).map((slot) => slot({ open: true })),
        ),
  },
}));
vi.mock('../ui/UiScrollLayout.vue', () => ({
  default: {
    setup(_, { expose, slots }) {
      expose({ scrollTo: vi.fn() });
      return () => h('div', slots.default());
    },
  },
}));
vi.mock('./ObsTemplatePreviewStage.vue', () => ({
  default: { render: () => null },
}));
vi.mock('./ObsTemplateThumbnail.vue', () => ({
  default: { render: () => null },
}));

for (const [component, source] of [
  [ObsTemplateGallery, './ObsTemplateGallery.vue'],
  [ObsTemplateTile, './ObsTemplateTile.vue'],
  [UiSearchBox, '../ui/UiSearchBox.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiTooltip, '../ui/UiTooltip.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, source, import.meta.url);
}

const templateGroups = [
  {
    kind: 'lyrics',
    templates: [
      { id: 'karaoke-stack', kind: 'lyrics', name: 'Classic Karaoke' },
      {
        id: 'ornate-vertical',
        kind: 'lyrics',
        name: 'Japanese Vertical',
        facts: [{ key: 'direction', label: 'Layout', value: 'Vertical' }],
      },
      { id: 'centered-vertical', kind: 'lyrics', name: 'Centered Vertical' },
    ],
  },
  {
    kind: 'setlist',
    templates: [{ id: 'queue-board', kind: 'setlist', name: 'Vertical List' }],
  },
];

const tileButtons = (root) =>
  findAll(
    root,
    (node) =>
      node.type === 'button' &&
      node.props.class?.includes('obs-template-thumb'),
  );

describe('Output Gallery browsing', () => {
  it('keeps the category order and restores the selection after it is filtered out', async () => {
    const apply = vi.fn();
    const props = reactive({
      activeKind: 'lyrics',
      selectedPresetId: 'karaoke-stack',
      templateGroups,
      'onUpdate:selectedPresetId': (id) => {
        props.selectedPresetId = id;
      },
      onApplyPreset: apply,
    });
    const { app, root } = mount(ObsTemplateGallery, props);
    const buttons = () => findAll(root, (node) => node.type === 'button');
    const tiles = () => tileButtons(root);
    const names = () => tiles().map((node) => textContent(node));
    const applyButton = () =>
      buttons().find(
        (node) => textContent(node) === t('outputPanel.gallery.apply'),
      );
    const input = findAll(root, (node) => node.type === 'input')[0];
    const search = async (value) => {
      trigger(input, 'onInput', { target: { value } });
      await nextTick();
    };

    try {
      await search('  ＶＥＲＴｉｃａｌ  ');
      expect(names()).toEqual(['Japanese Vertical', 'Centered Vertical']);
      expect(props.selectedPresetId).toBe('karaoke-stack');
      expect(textContent(root)).toContain(t('outputPanel.gallery.choose'));
      expect(applyButton()).toBeUndefined();
      expect(apply).not.toHaveBeenCalled();

      const clear = buttons().find(
        (node) => node.props['aria-label'] === t('ui.searchBox.clear'),
      );
      trigger(clear, 'onClick');
      await nextTick();
      expect(names()).toEqual([
        'Classic Karaoke',
        'Japanese Vertical',
        'Centered Vertical',
      ]);
      expect(tiles()[0].props['aria-pressed']).toBe(true);
      expect(input.focus).toHaveBeenCalledOnce();

      await search('Classic');
      expect(names()).toEqual(['Classic Karaoke']);
      await search('Layout');
      expect(names()).toEqual(['Japanese Vertical']);
      await search('vertical');
      trigger(tiles()[0], 'onClick');
      await nextTick();
      expect(applyButton().props.class).toContain('ui-btn--secondary');
      trigger(applyButton(), 'onClick');
      expect(apply).toHaveBeenCalledExactlyOnceWith('ornate-vertical');

      await search('missing');
      expect(names()).toEqual([]);
      expect(textContent(root)).toContain(t('outputPanel.gallery.noMatch'));
      expect(applyButton()).toBeUndefined();
    } finally {
      app.unmount();
    }
  });

  it('persists the star, puts favorites first, and keeps preview and applied state independent', async () => {
    let stored = JSON.stringify(['unknown-id', 'centered-vertical']);
    vi.stubGlobal('localStorage', {
      getItem: () => stored,
      setItem: (_, value) => {
        stored = value;
      },
    });
    const props = {
      activeKind: 'lyrics',
      selectedPresetId: 'ornate-vertical',
      appliedPresetIds: { lyrics: 'karaoke-stack' },
      templateGroups,
      onApplyPreset: vi.fn(),
    };
    const gallery = {
      setup() {
        const { favorites, toggleFavorite } = useOutputTemplateFavorites();
        return () =>
          h(ObsTemplateGallery, {
            ...props,
            favoriteIds: favorites.value,
            onToggleFavorite: toggleFavorite,
          });
      },
    };
    let view = mount(gallery);
    const names = () => tileButtons(view.root).map((node) => textContent(node));
    const star = () =>
      findAll(
        view.root,
        (node) =>
          node.type === 'button' && node.props.class?.includes('ui-icon-btn'),
      ).find((node) => textContent(node) === t('outputPanel.gallery.favorite'));

    try {
      await nextTick();
      expect(names()).toEqual([
        'Centered Vertical',
        'Classic Karaoke',
        'Japanese Vertical',
      ]);
      expect(textContent(view.root)).toContain(
        t('outputPanel.gallery.favorites'),
      );
      expect(star().props.class).toContain('ui-icon-btn--ghost');
      expect(star().props['aria-pressed']).toBe(false);
      trigger(star(), 'onClick');
      await nextTick();
      expect(star().props['aria-pressed']).toBe(true);
      expect(star().props.class).toContain('ui-icon-btn--active');
      expect(names()).toEqual([
        'Japanese Vertical',
        'Centered Vertical',
        'Classic Karaoke',
      ]);
      const [selected, , applied] = tileButtons(view.root);
      expect(selected.props.class).toContain('obs-template-thumb--active');
      expect(selected.props.class).not.toContain('obs-template-thumb--applied');
      expect(applied.props.class).toContain('obs-template-thumb--applied');
      expect(props.onApplyPreset).not.toHaveBeenCalled();
      expect(JSON.parse(stored)).toEqual([
        'centered-vertical',
        'ornate-vertical',
      ]);

      view.app.unmount();
      view = mount(gallery);
      await nextTick();
      expect(star().props['aria-pressed']).toBe(true);
      trigger(star(), 'onClick');
      await nextTick();
      expect(star().props['aria-pressed']).toBe(false);
      expect(JSON.parse(stored)).toEqual(['centered-vertical']);
    } finally {
      view.app.unmount();
      vi.unstubAllGlobals();
    }
  });
});
