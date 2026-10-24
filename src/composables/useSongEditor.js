import { computed, reactive, readonly, watch } from 'vue';
import { useAppConfirmation } from './useAppConfirmation.js';
import { useLibrary } from './useLibrary.js';
import { useTrackMetadataEditor } from './useTrackMetadataEditor.js';
import { useWorkOrganization } from './useWorkOrganization.js';

const work = useWorkOrganization();
const { refresh } = useLibrary();
const metadata = useTrackMetadataEditor({ refresh });
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
const isDirty = computed(() => metadata.isDirty.value || work.isDirty.value);
const busy = computed(
  () =>
    state.saving ||
    metadata.state.isSaving ||
    metadata.state.isArtworkPreparing ||
    work.state.saving,
);

watch(
  () => work.state.track?.id,
  (id) => {
    if (!id) {
      generation += 1;
      metadata.close();
      state.partialMessage = '';
    }
  },
);

function setSection(section) {
  if (['metadata', 'organization'].includes(section)) state.section = section;
}
async function close() {
  if (busy.value) return false;
  const current = generation;
  if (
    isDirty.value &&
    !(await confirm({
      title: '捨棄歌曲整理變更？',
      subject: work.state.track?.title,
      message: '尚未儲存的變更將會捨棄。',
      confirmLabel: '捨棄變更',
    }))
  )
    return false;
  if (current !== generation) return false;
  generation += 1;
  await work.close({ discardChanges: true });
  metadata.close();
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
      work.state.snapshot?.bindingStatus === 'changed'
    ) {
      if (!(await work.save({ reconfirm }))) {
        if (stillCurrent()) {
          setSection('organization');
          if (metadataSaved)
            state.partialMessage = '歌曲資訊已儲存；版本與連結尚未儲存。';
        }
        return false;
      }
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
  state.section = 'organization';
  state.partialMessage = '';
}
export function useSongEditor() {
  return {
    state: readonly(state),
    work,
    metadata,
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
