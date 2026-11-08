import { computed, shallowRef } from 'vue';
import { t } from '../utils/i18n.js';

const labelKey = (label) => label.trim().normalize('NFKC').toLowerCase();

export function useTrackStyleEditor() {
  const snapshot = shallowRef(null);
  const rows = shallowRef([]);
  const dismissed = shallowRef([]);
  const pending = shallowRef(false);
  const error = shallowRef('');
  let trackId = null;
  let request = 0;
  let rowId = 0;

  const tags = computed(() => rows.value.map(({ label }) => label.trim()));
  const keys = computed(() => new Set(tags.value.map(labelKey)));
  const rejected = computed(() => [
    ...new Map(
      [...dismissed.value, ...rows.value.map(({ original }) => original)]
        .filter((label) => label && !keys.value.has(labelKey(label)))
        .map((label) => [labelKey(label), label]),
    ).values(),
  ]);
  const visibleCandidates = computed(() => {
    const hidden = new Set([...keys.value, ...rejected.value.map(labelKey)]);
    return (snapshot.value?.candidates ?? []).filter(
      ({ label }) => !hidden.has(labelKey(label)),
    );
  });
  const isDirty = computed(
    () =>
      Boolean(snapshot.value) &&
      (JSON.stringify(tags.value) !== JSON.stringify(snapshot.value.tags) ||
        JSON.stringify(rejected.value) !==
          JSON.stringify(snapshot.value.dismissed)),
  );
  const valid = computed(
    () =>
      tags.value.every(Boolean) &&
      keys.value.size === tags.value.length &&
      rejected.value.length <= 128,
  );

  function reset() {
    request += 1;
    trackId = null;
    snapshot.value = null;
    rows.value = [];
    dismissed.value = [];
    pending.value = false;
    error.value = '';
  }

  function setSnapshot(value) {
    snapshot.value = value;
    rows.value = value.tags.map((label) => ({
      id: ++rowId,
      label,
      original: label,
    }));
    dismissed.value = value.dismissed;
  }

  async function run(action, onSuccess) {
    if (pending.value) return false;
    const active = ++request;
    pending.value = true;
    error.value = '';
    try {
      const result = await action();
      if (request !== active) return false;
      if (!result?.ok) {
        const status = result?.status;
        error.value = t(
          {
            invalid: 'trackStyle.invalid',
            stale: 'trackStyle.stale',
            missing: 'trackStyle.missing',
          }[status] ?? 'trackStyle.failed',
        );
        return false;
      }
      onSuccess(result);
      return request === active;
    } catch {
      if (request === active) error.value = t('trackStyle.failed');
      return false;
    } finally {
      if (request === active) pending.value = false;
    }
  }

  function load(id) {
    if (id === trackId && (snapshot.value || pending.value)) return;
    reset();
    if (!id) return;
    trackId = id;
    return run(() => window.Utawakui.getTrackStyleTags(id), setSnapshot);
  }

  function add(label = '') {
    if (!snapshot.value || pending.value || rows.value.length >= 24) return;
    rows.value = [...rows.value, { id: ++rowId, label, original: label }];
  }

  function change(id, label) {
    rows.value = rows.value.map((row) =>
      row.id === id ? { ...row, label } : row,
    );
  }

  function dismiss(label) {
    if (
      label &&
      !dismissed.value.some((item) => labelKey(item) === labelKey(label))
    )
      dismissed.value = [...dismissed.value, label];
  }

  function remove(row) {
    dismiss(row.original);
    rows.value = rows.value.filter(({ id }) => id !== row.id);
  }

  function save() {
    if (!isDirty.value) return true;
    if (!valid.value) {
      error.value = t('trackStyle.unique');
      return false;
    }
    return run(
      () =>
        window.Utawakui.saveTrackStyleTags(
          trackId,
          snapshot.value.editToken,
          tags.value,
          rejected.value,
        ),
      setSnapshot,
    );
  }

  return {
    snapshot,
    rows,
    visibleCandidates,
    pending,
    error,
    isDirty,
    load,
    reset,
    add,
    change,
    remove,
    save,
  };
}
