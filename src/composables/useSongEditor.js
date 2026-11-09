import { computed, reactive, readonly, watch } from 'vue';
import { useAppConfirmation } from './useAppConfirmation.js';
import { useLibrary } from './useLibrary.js';
import { useTrackMetadataEditor } from './useTrackMetadataEditor.js';
import { useTrackStyleEditor } from './useTrackStyleEditor.js';
import { useWorkOrganization } from './useWorkOrganization.js';
import { t } from '../utils/i18n.js';

const work = useWorkOrganization();
const { refresh } = useLibrary();
const metadata = useTrackMetadataEditor({ refresh });
const style = useTrackStyleEditor();
const { confirm } = useAppConfirmation();
const state = reactive({
  section: 'organization',
  saving: false,
  partialMessage: '',
});
let generation = 0;
const canEditMetadata = computed(
  () => work.state.track?.sourceType === 'local-file',
);
const isDirty = computed(
  () => metadata.isDirty.value || work.isDirty.value || style.isDirty.value,
);
const busy = computed(
  () =>
    state.saving ||
    metadata.state.isSaving ||
    metadata.state.isArtworkPreparing ||
    work.state.saving ||
    style.pending.value,
);

watch(
  () => work.state.track?.id,
  (id) => {
    if (!id) {
      generation += 1;
      metadata.close();
      style.reset();
      state.partialMessage = '';
    }
  },
);
watch([() => state.section, () => work.state.track?.id], ([section, id]) => {
  if (section === 'metadata' && id) void style.load(id);
});

function setSection(section) {
  if (['metadata', 'organization'].includes(section)) state.section = section;
}
async function close() {
  if (busy.value) return false;
  const current = generation;
  if (
    isDirty.value &&
    !(await confirm({
      title: t('workOrganize.discardTitle'),
      subject: work.state.track?.title,
      message: t('workOrganize.discardMessage'),
      confirmLabel: t('workOrganize.discardConfirm'),
    }))
  )
    return false;
  if (current !== generation) return false;
  generation += 1;
  await work.close({ discardChanges: true });
  metadata.close();
  style.reset();
  state.partialMessage = '';
  return true;
}
async function open(track, { section = 'metadata' } = {}) {
  if (!track?.id || busy.value) return false;
  if (work.state.track?.id === track.id) {
    setSection(section);
    return true;
  }
  if (work.isOpen.value && !(await close())) return false;
  generation += 1;
  state.partialMessage = '';
  setSection(section);
  metadata.open(track, { discoverArtwork: track.sourceType === 'local-file' });
  return work.open(track);
}
async function save({ reconfirm = false } = {}) {
  if (busy.value || !work.state.track) return false;
  const current = generation;
  const trackId = work.state.track.id;
  const stillCurrent = () =>
    current === generation && work.state.track?.id === trackId;
  state.saving = true;
  state.partialMessage = '';
  let metadataSaved = false;
  try {
    if (canEditMetadata.value && metadata.isDirty.value) {
      const saved = await metadata.save({ keepOpen: true });
      if (!stillCurrent()) {
        metadata.close();
        return false;
      }
      if (!saved) {
        setSection('metadata');
        return false;
      }
      metadataSaved = true;
      work.updateTrack(saved);
    }
    if (
      work.isDirty.value ||
      work.hasSuggestions?.value ||
      work.state.snapshot?.bindingStatus === 'changed'
    ) {
      if (!(await work.save({ reconfirm }))) {
        if (stillCurrent()) {
          setSection('organization');
          if (metadataSaved)
            state.partialMessage = t('workOrganize.partialSaved');
        }
        return false;
      }
    }
    if (style.isDirty.value && !(await style.save())) {
      if (stillCurrent()) setSection('metadata');
      return false;
    }
    return stillCurrent();
  } finally {
    state.saving = false;
  }
}
function dispose() {
  generation += 1;
  work.dispose();
  metadata.close();
  style.reset();
  state.section = 'organization';
  state.partialMessage = '';
}
export function useSongEditor() {
  return {
    state: readonly(state),
    work,
    metadata,
    style,
    canEditMetadata,
    isDirty,
    busy,
    isOpen: work.isOpen,
    open,
    close,
    save,
    setSection,
    dispose,
  };
}
