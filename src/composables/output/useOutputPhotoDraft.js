import { computed, onBeforeUnmount, shallowRef } from 'vue';

export function useOutputPhotoDraft(target) {
  const draft = shallowRef(null);
  const choosing = shallowRef(false);
  const busy = computed(() => choosing.value || Boolean(draft.value));
  const error = shallowRef('');
  let mounted = true;

  function discard(id) {
    void window.Utawakui?.discardOutputPortrait?.(id)?.catch(() => undefined);
  }

  function close() {
    if (!draft.value) return;
    discard(draft.value.id);
    draft.value = null;
  }

  onBeforeUnmount(() => {
    mounted = false;
    close();
  });

  async function choose() {
    if (busy.value) return;
    choosing.value = true;
    error.value = '';
    try {
      const result = target
        ? await window.Utawakui?.chooseOutputPortrait?.(target)
        : await window.Utawakui?.chooseOutputPortrait?.();
      if (!mounted) {
        if (result?.status === 'ok') discard(result.id);
        return;
      }
      if (result?.status === 'ok') draft.value = result;
      else if (result?.status !== 'cancelled') {
        error.value =
          result?.status === 'invalid-image'
            ? 'outputPanel.portrait.invalidImage'
            : 'outputPanel.portrait.importFailed';
      }
    } catch {
      if (mounted) error.value = 'outputPanel.portrait.importFailed';
    } finally {
      choosing.value = false;
    }
  }

  return { draft, choosing, busy, error, choose, close };
}
