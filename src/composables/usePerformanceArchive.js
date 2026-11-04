import { onScopeDispose, readonly, shallowRef, toValue, watch } from 'vue';
import { t } from '../utils/i18n.js';

// Per-view reader; it never changes the current plan or playback.
export function usePerformanceArchive(sessionId) {
  const session = shallowRef(null),
    loading = shallowRef(false),
    error = shallowRef('');
  let revision = 0;
  async function refresh() {
    const id = toValue(sessionId),
      request = ++revision;
    if (session.value?.id !== id) session.value = null;
    error.value = '';
    loading.value = true;
    try {
      const result = await window.Utawakui.getPerformanceSession(id);
      if (request !== revision) return;
      if (result?.ok !== true || result.plan?.id !== id) {
        error.value = result?.error?.message || t('session.archiveLoad.failed');
        return;
      }
      session.value = result.plan;
    } catch {
      if (request === revision) error.value = t('session.archiveLoad.failed');
    } finally {
      if (request === revision) loading.value = false;
    }
  }
  watch(() => toValue(sessionId), refresh, { immediate: true });
  onScopeDispose(() => {
    revision++;
  });
  return {
    session: readonly(session),
    loading: readonly(loading),
    error: readonly(error),
    refresh,
  };
}
