import { h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PERFORMER_GUIDE } from '../../utils/outputPerformerGuide.js';
import UiButton from '../ui/UiButton.vue';
import UiField from '../ui/UiField.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiStack from '../ui/UiStack.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import ObsPerformerGuideControls from './ObsPerformerGuideControls.vue';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsPropertySection from './ObsPropertySection.vue';

vi.mock('./ObsPhantomPortraitImageModal.vue', () => ({
  default: {
    props: ['photo', 'previewCrop', 'savePhoto'],
    setup: (props) => () => h('image-editor', { ...props }),
  },
}));

afterEach(() => vi.unstubAllGlobals());

for (const [component, file] of [
  [ObsPerformerGuideControls, './ObsPerformerGuideControls.vue'],
  [ObsAppearanceControlRow, './ObsAppearanceControlRow.vue'],
  [ObsPropertySection, './ObsPropertySection.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
  [UiStack, '../ui/UiStack.vue'],
  [UiTextField, '../ui/UiTextField.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, file, import.meta.url);
}

describe('model placement controls', () => {
  it('shows image and position controls together and opens the shared editor at the current mask ratio', async () => {
    const save = vi.fn();
    const draft = {
      status: 'ok',
      id: 'photo',
      mimeType: 'image/png',
      bytes: new Uint8Array(),
    };
    const choose = vi.fn().mockResolvedValue(draft);
    const discard = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      Utawakui: {
        chooseOutputPortrait: choose,
        discardOutputPortrait: discard,
      },
    });
    const { app, root } = mount(ObsPerformerGuideControls, {
      available: true,
      customImage: true,
      guide: DEFAULT_PERFORMER_GUIDE,
      saveImage: save,
    });
    try {
      expect(findAll(root, (node) => node.props.role === 'tab')).toHaveLength(
        0,
      );
      const [imageSection, placementSection] = findAll(
        root,
        (node) => node.props.class === 'obs-property-section',
      );
      expect(
        findAll(root, (node) => node.type === 'h3').map(textContent),
      ).toEqual(['圖片', '遮罩與位置']);
      expect(
        findAll(imageSection, (node) => node.type === 'select'),
      ).toHaveLength(0);
      expect(
        findAll(placementSection, (node) => node.type === 'select'),
      ).toHaveLength(1);
      const numberFields = findAll(
        placementSection,
        (node) => node.props.type === 'number',
      );
      expect(numberFields).toHaveLength(4);
      for (const input of numberFields) {
        expect(
          findAll(
            placementSection,
            (node) =>
              node.type === 'label' && node.props.for === input.props.id,
          ),
        ).toHaveLength(1);
      }
      expect(
        findAll(placementSection, (node) => node.type === 'button'),
      ).toHaveLength(0);
      const [useDefault] = findAll(
        root,
        (node) =>
          node.type === 'button' && textContent(node).includes('預設圖'),
      );
      trigger(useDefault, 'onClick');
      expect(save).toHaveBeenLastCalledWith(null);
      const [picker] = findAll(
        root,
        (node) => node.type === 'button' && textContent(node) === '換圖',
      );
      trigger(picker, 'onClick');
      await vi.waitFor(() => {
        const [editor] = findAll(root, (node) => node.type === 'image-editor');
        expect(editor?.props.previewCrop).toEqual({
          aspect: expect.closeTo(0.75),
          radius: '50%',
        });
        expect(editor.props.photo).toBe(draft);
        expect(editor.props.savePhoto).toBe(save);
      });
      expect(choose).toHaveBeenCalledWith('performer-guide');
    } finally {
      app.unmount();
    }
    expect(discard).toHaveBeenCalledWith('photo');
  });

  it('uses the position section action to reset changed placement geometry', () => {
    const commit = vi.fn();
    const save = vi.fn();
    const { app, root } = mount(ObsPerformerGuideControls, {
      available: true,
      guide: { ...DEFAULT_PERFORMER_GUIDE, x: 0.6 },
      saveImage: save,
      onCommit: commit,
    });
    try {
      const [, placement] = findAll(
        root,
        (node) => node.props.class === 'obs-property-section',
      );
      const [reset] = findAll(placement, (node) => node.type === 'button');
      trigger(reset, 'onClick');
      expect(commit).toHaveBeenCalledWith(DEFAULT_PERFORMER_GUIDE);
      expect(save).not.toHaveBeenCalled();
    } finally {
      app.unmount();
    }
  });

  it('shows mask ratios from square to tall while keeping the default selection', () => {
    const commit = vi.fn();
    const { app, root } = mount(ObsPerformerGuideControls, {
      available: true,
      guide: DEFAULT_PERFORMER_GUIDE,
      onCommit: commit,
      saveImage: vi.fn(),
    });

    const [select] = findAll(root, (node) => node.type === 'select');
    expect(select.props.value).toBe('ellipse');
    const options = findAll(select, (node) => node.type === 'option');
    expect(options.map((node) => node.props.value)).toEqual([
      'circle',
      'square',
      'ellipse',
      'roundedRectangle',
      'rectangle',
    ]);
    expect(options.map(textContent)).toEqual([
      '正圓形（1:1）',
      '正方形（1:1）',
      '直橢圓（3:4）',
      '圓角矩形（5:8）',
      '直長方形（9:16）',
    ]);
    trigger(select, 'onChange', { target: { value: 'square' } });
    expect(commit).toHaveBeenCalledWith({
      shape: 'square',
      x: 0.5,
      y: 0.58,
      width: expect.closeTo((0.84 * 9) / 16),
      height: expect.closeTo(0.84),
    });
    app.unmount();
  });
});
