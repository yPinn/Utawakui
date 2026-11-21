import { effectScope } from 'vue';
import outputTemplates from '../../../shared/outputTemplateValues.json';
import { sanitizePhantomPortraitSets } from '../../../shared/outputAppearance.mjs';
import {
  companionOutputSettingsPatch,
  projectCompanionOutputSlot,
} from '../../../shared/companionOutput.mjs';
import { buildOutputSlotPayload } from '../../utils/outputSlotPayload.js';
import { t } from '../../utils/i18n.js';
import { useOutputAppearanceAutosave } from './useOutputAppearanceAutosave.js';

// Output slot reads, serialized writes and per-kind appearance autosave.
export function createOutputSlotStore({
  state,
  bridgeMethod,
  reportOutputError,
  applyPreferences,
  isOutputEnabled,
}) {
  let slotsLoad = null;
  let slotWrite = Promise.resolve();

  const appearanceAutosaves = effectScope(true).run(
    () =>
      new Map(
        outputTemplates.slots.map(({ id }) => [
          id,
          useOutputAppearanceAutosave({
            save: ({ settings, seedSlot }) =>
              saveSlotSettings(id, settings, seedSlot),
          }),
        ]),
      ),
  );

  function applySlots(document = {}) {
    state.slots =
      typeof document.slots === 'object' && document.slots !== null
        ? { ...document.slots }
        : {};
    applyPreferences(document);
    state.slotsLoaded = true;
  }

  function loadSlots(seedSlots = {}) {
    if (slotsLoad) {
      return slotsLoad.then(() => {
        if (Object.keys(seedSlots).some((kind) => !state.slots[kind])) {
          return loadSlots(seedSlots);
        }
      });
    }
    state.isLoadingSlots = true;
    slotsLoad = (async () => {
      try {
        let document = await bridgeMethod('listOutputSlots')();
        for (const [kind, seedSlot] of Object.entries(seedSlots)) {
          if (document.slots?.[kind]) continue;
          const payload = buildOutputSlotPayload(seedSlot);
          if (payload) {
            document = await bridgeMethod('upsertOutputSlot')(kind, payload);
          }
        }
        applySlots(document);
        state.error = '';
      } catch (error) {
        state.error = reportOutputError(
          error,
          'load-slots',
          t('outputPanel.runtime.settingsReadFailed'),
        );
      }
    })().finally(() => {
      state.isLoadingSlots = false;
      slotsLoad = null;
    });
    return slotsLoad;
  }

  function queueSlotWrite(apply) {
    const write = slotWrite.then(apply);
    slotWrite = write.catch(() => {});
    return write;
  }

  function saveOutputSlot(kind, changes, seedSlot = null) {
    return queueSlotWrite(() => persistOutputSlot(kind, changes, seedSlot));
  }

  function applyCompanionOutputOption(
    published,
    { templateId, fieldKey, value },
  ) {
    const kind = outputTemplates.templateKinds[templateId];
    return queueSlotWrite(async () => {
      if (!isOutputEnabled()) return 'unavailable';
      if (!published || !kind) return 'stale';
      if (appearanceAutosaves.get(kind).status.value !== 'saved') return 'busy';
      const current = projectCompanionOutputSlot(state.slots[kind]);
      if (!current || JSON.stringify(current) !== JSON.stringify(published))
        return 'stale';
      const settings = companionOutputSettingsPatch(
        current,
        { templateId, fieldKey, value },
        state.slots[kind].settings,
      );
      if (!settings) return 'unavailable';
      if (!Object.keys(settings).length) return 'applied';
      const saved = await persistOutputSlot(kind, { settings });
      return saved ? 'applied' : 'failed';
    });
  }

  async function persistOutputSlot(kind, changes, seedSlot) {
    const slot = state.slots[kind] ?? seedSlot;
    const switching =
      changes.templateId && changes.templateId !== slot?.templateId;
    const payload = buildOutputSlotPayload(
      switching
        ? { ...slot, templateId: changes.templateId, settings: {} }
        : slot,
      changes,
    );
    if (!payload) return false;
    const request = switching
      ? { ...payload, recallAppearance: true }
      : payload;

    state.isSavingSlot = true;
    try {
      const document = await bridgeMethod('upsertOutputSlot')(kind, request);
      applySlots(document);
      state.error = '';
      return true;
    } catch (error) {
      state.error = reportOutputError(
        error,
        'save-slot',
        t('outputPanel.runtime.styleNotSaved'),
      );
      return false;
    } finally {
      state.isSavingSlot = false;
    }
  }

  function saveTemplateSelection(kind, templateId, seedSlot = null, settings) {
    return saveOutputSlot(kind, { templateId, settings }, seedSlot);
  }

  function saveSlotSettings(kind, settings, seedSlot = null) {
    return saveOutputSlot(kind, { settings }, seedSlot);
  }

  async function followSingerAfterPlayback() {
    if (!isOutputEnabled()) return;
    if (!state.slotsLoaded) await loadSlots();
    const autosave = appearanceAutosaves.get('lyrics');
    const queued = autosave.getLatestSnapshot();
    const settings = queued?.settings ?? state.slots.lyrics?.settings;
    const sets = sanitizePhantomPortraitSets(settings?.phantomPortraitSets);
    if (!sets.activeId) return;
    await autosave.schedule(
      {
        ...queued,
        settings: {
          ...settings,
          phantomPortraitSets: { ...sets, activeId: '' },
        },
      },
      { immediate: true },
    );
  }

  return {
    loadSlots,
    saveOutputSlot,
    saveTemplateSelection,
    saveSlotSettings,
    applyCompanionOutputOption,
    followSingerAfterPlayback,
    appearanceAutosaveFor: (kind) =>
      appearanceAutosaves.get(kind) ?? appearanceAutosaves.get('lyrics'),
  };
}
