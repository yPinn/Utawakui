import {
  computed,
  getCurrentScope,
  onScopeDispose,
  readonly,
  shallowRef,
  toValue,
  watch,
} from 'vue';
import { isLyricsVocalSection } from '../../../shared/presentation/lyricsTextProcessing.mjs';
// One source owns saved role choices. Filtering remains a separate session choice.
export function useLyricsVocalRoles({
  document,
  trackId,
  getBridge = () => globalThis.window?.Utawakui,
  reportError = () => {},
}) {
  const assignments = shallowRef([]),
    status = shallowRef('idle'),
    error = shallowRef(''),
    saving = shallowRef(false);
  let revision = 0,
    generation = 0,
    disposed = false,
    saved = [],
    pending = null,
    flushing = null;
  const identity = computed(() =>
    JSON.stringify([
      toValue(trackId),
      toValue(document)?.source?.filename,
      toValue(document)?.documentId,
    ]),
  );
  async function reload() {
    const id = toValue(trackId),
      doc = toValue(document),
      key = identity.value,
      ticket = ++generation,
      bridge = getBridge();
    assignments.value = saved = [];
    revision = 0;
    pending = flushing = null;
    error.value = '';
    saving.value = false;
    if (
      !id ||
      !doc?.source?.filename ||
      !doc?.lines?.length ||
      typeof bridge?.getLyricsVocalRoles !== 'function'
    ) {
      status.value = 'unavailable';
      return;
    }
    // Main binds roles to the source SHA; a text-only id is still loading timing.
    if (!doc.source.sha256) {
      status.value = 'idle';
      return;
    }
    status.value = 'loading';
    try {
      const result = await bridge.getLyricsVocalRoles(
        id,
        doc.source.filename,
        doc.documentId,
      );
      if (disposed || ticket !== generation || key !== identity.value) return;
      const ids = new Set(doc.lines.map((line) => line.lineId));
      assignments.value = saved = (result.assignments ?? []).filter((item) =>
        ids.has(item.lineId),
      );
      revision = result.revision;
      status.value = 'ready';
    } catch (e) {
      if (disposed || ticket !== generation) return;
      status.value = 'error';
      error.value = '聲部標註讀取失敗，請再試一次。';
      reportError(e, 'load-vocal-roles', error.value);
    }
  }
  function canSave(role) {
    return (
      status.value === 'ready' &&
      ['auto', 'male', 'female', 'group'].includes(role) &&
      typeof getBridge()?.saveLyricsVocalRoles === 'function'
    );
  }
  // Highlighter strokes: name markers start a section, other rows mark one line.
  function paint(lineIds, role) {
    const ids = new Set(lineIds);
    const lines = (toValue(document)?.lines ?? []).filter((line) =>
      ids.has(line.lineId),
    );
    if (!lines.length || !canSave(role)) return Promise.resolve(false);
    const rows = assignments.value.filter((item) => !ids.has(item.lineId));
    if (role !== 'auto')
      for (const line of lines)
        rows.push({
          lineId: line.lineId,
          role,
          scope: isVocalSection(line.text) ? 'section' : 'line',
        });
    // Strokes show at once; saves run in order and coalesce to the latest.
    assignments.value = pending = rows;
    return (flushing ??= flush());
  }
  async function flush() {
    const doc = toValue(document),
      bridge = getBridge(),
      key = identity.value,
      ticket = generation;
    error.value = '';
    saving.value = true;
    try {
      while (pending) {
        const rows = pending;
        pending = null;
        const result = await bridge.saveLyricsVocalRoles(
          toValue(trackId),
          doc.source.filename,
          doc.documentId,
          revision,
          rows,
        );
        if (disposed || ticket !== generation || key !== identity.value)
          return false;
        saved = result.assignments;
        revision = result.revision;
      }
      assignments.value = saved;
      return true;
    } catch (e) {
      if (disposed || ticket !== generation) return false;
      pending = null;
      assignments.value = saved;
      error.value = '聲部標註未儲存，請重新載入後再試。';
      reportError(e, 'save-vocal-roles', error.value);
      return false;
    } finally {
      if (ticket === generation) {
        saving.value = false;
        flushing = null;
      }
    }
  }
  // Pre-flush skips half-switched track/source states inside one selection change.
  watch(identity, reload, { immediate: true });
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      generation++;
    });
  return {
    assignments: readonly(assignments),
    status: readonly(status),
    error: readonly(error),
    saving: readonly(saving),
    paint,
    reload,
  };
}
export const isVocalSection = isLyricsVocalSection;
