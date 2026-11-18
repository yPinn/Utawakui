import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOutputWorkbenchData } from '../../constants/outputTemplates.js';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import ObsSlotWorkbench from './ObsSlotWorkbench.vue';

vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({ state: { track: null } }),
}));

vi.mock('../ui/UiFolderInspector.vue', () => ({
  default: {
    props: ['items'],
    setup:
      (props, { slots }) =>
      () =>
        h('section', [
          slots.tools(),
          slots.side({
            active: true,
            item: props.items.find(({ id }) => id === 'portrait'),
          }),
        ]),
  },
}));

vi.mock('./ObsPhantomPortraitGrid.vue', () => ({
  default: {
    emits: ['add', 'edit', 'select'],
    setup(_, { emit, expose }) {
      expose({ focusAfterEdit: vi.fn() });
      return () =>
        h('section', [
          ...['add', 'edit'].map((action) =>
            h('button', { id: action, onClick: () => emit(action) }),
          ),
          h('button', { id: 'fallback', onClick: () => emit('select', '') }),
        ]);
    },
  },
}));

const { guest } = vi.hoisted(() => ({
  guest: {
    phantomArtistName: 'Guest',
    phantomPortraitPhoto: '00000000-0000-4000-8000-000000000011',
    phantomPortraitColor: '#4466aa',
  },
}));

vi.mock('./ObsPhantomPortraitEditor.vue', () => ({
  default: {
    props: ['values'],
    emits: ['save', 'cancel'],
    setup:
      (props, { emit }) =>
      () =>
        h('form', { id: 'editor', startValues: props.values }, [
          h('button', { id: 'cancel', onClick: () => emit('cancel') }),
          h('button', { id: 'save', onClick: () => emit('save', guest) }),
        ]),
  },
}));

attachClientRender(ObsSlotWorkbench, './ObsSlotWorkbench.vue', import.meta.url);

describe('workbench portrait preset editing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates and applies a preset only on save, starting from template defaults', async () => {
    const getPropertyValue = vi.fn(() => '#a5b3d8');
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue }));
    const { templates, slotDefaults } = getOutputWorkbenchData();
    const preset = templates.find(({ id }) => id === 'phantom-thieves');
    const onChangeSettings = vi.fn();
    const { app, root } = mount(ObsSlotWorkbench, {
      preset,
      activeKind: 'lyrics',
      outputSlot: {
        ...slotDefaults.lyrics,
        templateId: preset.id,
        settings: {
          ...slotDefaults.lyrics.settings,
          phantomArtistName: 'Current singer',
          phantomPortraitColor: '#770011',
        },
      },
      onChangeSettings,
    });
    const byId = (id) => findAll(root, (node) => node.props.id === id)[0];
    const click = async (id) => {
      trigger(byId(id), 'onClick');
      await nextTick();
    };

    await click('edit');
    expect(byId('editor').props.startValues.phantomArtistName).toBe(
      'Current singer',
    );
    await click('cancel');
    await click('add');
    expect(byId('editor').props.startValues).toEqual({
      phantomArtistName: '',
      phantomPortraitPhoto: '',
      phantomPortraitColor: '#a5b3d8',
    });
    expect(getPropertyValue).toHaveBeenCalledWith(
      '--ui-output-portrait-indigo',
    );
    expect(onChangeSettings).not.toHaveBeenCalled();
    await click('cancel');
    expect(byId('editor')).toBeUndefined();
    expect(onChangeSettings).not.toHaveBeenCalled();

    await click('add');
    await click('save');
    expect(byId('editor')).toBeUndefined();
    expect(onChangeSettings).toHaveBeenCalledOnce();
    const [{ settings, mode }] = onChangeSettings.mock.calls[0];
    expect(mode).toBe('immediate');
    expect(settings.phantomArtistName).toBe('');
    const { activeId, items } = settings.phantomPortraitSets;
    expect(activeId).toBeTruthy();
    expect(items).toEqual([
      expect.objectContaining({
        phantomArtistName: 'Current singer',
        phantomPortraitColor: '#770011',
      }),
      { id: activeId, ...guest },
    ]);

    await click('edit');
    expect(byId('editor').props.startValues).toEqual(items[1]);
    await click('cancel');
    await click('fallback');
    expect(onChangeSettings).toHaveBeenLastCalledWith({
      mode: 'immediate',
      settings: expect.objectContaining({
        phantomArtistName: '',
        phantomPortraitPhoto: '',
        phantomPortraitColor: '',
        phantomPortraitSets: { activeId: '', items },
      }),
    });
    await click('edit');
    expect(byId('editor')).toBeUndefined();
    app.unmount();
  });
});
