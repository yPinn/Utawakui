import { onScopeDispose, shallowRef, toValue, watch } from 'vue';

export function useTrackVideoAsset({ trackId, enabled }) {
  const asset = shallowRef(null);
  const pending = shallowRef(false);
  const api = globalThis.window?.Utawakui;
  let revision = 0;

  async function load(keepAsset = false) {
    const request = ++revision;
    const id = toValue(trackId);
    pending.value = Boolean(toValue(enabled) && id && api?.getTrackVideo);
    if (!keepAsset || !pending.value) asset.value = null;
    if (!pending.value) return;
    try {
      const result = await api.getTrackVideo(id);
      if (request === revision)
        asset.value = result?.video?.available ? result.video : null;
    } catch {
      // The optional video does not change the song's playback availability.
      if (request === revision) asset.value = null;
    } finally {
      if (request === revision) pending.value = false;
    }
  }

  watch([() => toValue(trackId), () => toValue(enabled)], () => load(), {
    immediate: true,
  });
  const unsubscribe = api?.onTrackVideoChanged?.((id) => {
    if (id === null || id === toValue(trackId)) void load(id !== null);
  });
  onScopeDispose(() => {
    revision += 1;
    unsubscribe?.();
  });
  return { asset, pending };
}
