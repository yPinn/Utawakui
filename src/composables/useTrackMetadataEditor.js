import { computed, reactive, readonly } from 'vue';

const REQUIRED_TITLE_MESSAGE = '歌名必填';
const RESTART_REQUIRED_MESSAGE = '需要重新啟動應用程式';

export function useTrackMetadataEditor({ refresh = null } = {}) {
  const state = reactive({
    track: null,
    titleDraft: '',
    artistDraft: '',
    isSaving: false,
    error: null,
  });

  const isOpen = computed(() => Boolean(state.track));

  function reset() {
    state.track = null;
    state.titleDraft = '';
    state.artistDraft = '';
    state.error = null;
  }

  function open(track) {
    state.track = track;
    state.titleDraft = track?.title ?? '';
    state.artistDraft = track?.artist ?? '';
    state.error = null;
  }

  function close() {
    if (state.isSaving) return;
    reset();
  }

  function setTitleDraft(value) {
    state.titleDraft = value;
  }

  function setArtistDraft(value) {
    state.artistDraft = value;
  }

  async function save() {
    if (!state.track) return null;

    const title = state.titleDraft.trim();
    const artist = state.artistDraft.trim();
    if (!title) {
      state.error = REQUIRED_TITLE_MESSAGE;
      return null;
    }

    if (
      typeof window === 'undefined' ||
      typeof window.Utawakui?.updateTrackMetadata !== 'function'
    ) {
      state.error = RESTART_REQUIRED_MESSAGE;
      return null;
    }

    state.isSaving = true;
    state.error = null;
    try {
      const updated = await window.Utawakui.updateTrackMetadata(
        state.track.id,
        {
          title,
          artist,
        },
      );
      if (!updated) {
        state.error = '找不到曲目';
        return null;
      }
      await refresh?.();
      reset();
      return updated;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
      return null;
    } finally {
      state.isSaving = false;
    }
  }

  return {
    state: readonly(state),
    isOpen,
    open,
    close,
    save,
    setTitleDraft,
    setArtistDraft,
  };
}
