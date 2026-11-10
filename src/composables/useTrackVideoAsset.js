import { onScopeDispose, shallowRef, toValue, watch } from 'vue';

export function useTrackVideoAsset({ trackId, enabled }) {
  const asset = shallowRef(null);
  const pending = shallowRef(false);
  const api = globalThis.window?.Utawakui;
  let revision = 0;

  async function load() {
    const request = ++revision;
    const id = toValue(trackId);
    pending.value = Boolean(toValue(enabled) && id && api?.getTrackVideo);
    asset.value = null;
    if (!pending.value) return;
    try {
      const result = await api.getTrackVideo(id);
      if (request === revision && result?.video?.available)
        asset.value = result.video;
    } catch {
      // The optional video does not change the song's playback availability.
    } finally {
      if (request === revision) pending.value = false;
    }
  }

  watch([() => toValue(trackId), () => toValue(enabled)], load, {
    immediate: true,
  });
  const unsubscribe = api?.onTrackVideoChanged?.((id) => {
    if (id === null || id === toValue(trackId)) void load();
  });
  onScopeDispose(() => {
    revision += 1;
    unsubscribe?.();
  });
  return { asset, pending };
}
