import { computed, shallowRef } from 'vue';
import { t } from '../utils/i18n.js';
import { TRACK_LANGUAGE_OPTIONS } from '../utils/trackLanguageNames.js';
import { useTrackLanguageIndex } from './useTrackLanguageIndex.js';

export { TRACK_LANGUAGE_OPTIONS };
const NO_VOCALS = 'zxx';

export function useTrackLanguageEditor() {
  const snapshot = shallowRef(null);
  const languages = shallowRef([]);
  const pending = shallowRef(false);
  const error = shallowRef('');
  const confirmed = shallowRef(false);
  let trackId = null;
  let request = 0;

  const needsConfirmation = computed(
    () => Boolean(snapshot.value?.needsReview) && !confirmed.value,
  );
  const isDirty = computed(
    () =>
      Boolean(snapshot.value) &&
      (confirmed.value ||
        JSON.stringify(languages.value) !==
          JSON.stringify(snapshot.value.languages)),
  );

  function setSnapshot(value) {
    snapshot.value = value;
    confirmed.value = false;
    languages.value = value.languages;
  }

  function reset() {
    request += 1;
    trackId = null;
    snapshot.value = null;
    languages.value = [];
    pending.value = false;
    error.value = '';
    confirmed.value = false;
  }

  async function run(action) {
    if (pending.value) return false;
    const active = ++request;
    pending.value = true;
    error.value = '';
    try {
      const result = await action();
      if (request !== active) return false;
      if (!result?.ok) {
        error.value = t(
          {
            invalid: 'trackLanguage.invalid',
            stale: 'trackLanguage.stale',
            missing: 'trackLanguage.missing',
          }[result?.status] ?? 'trackLanguage.failed',
        );
        return false;
      }
      setSnapshot(result);
      return true;
    } catch {
      if (request === active) error.value = t('trackLanguage.failed');
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
    return run(() => window.Utawakui.getTrackLanguages(id));
  }

  // "No vocals" excludes every sung language, and vice versa. Display order
  // keeps toggling back to a saved selection clean.
  function toggle(code, selected) {
    if (!snapshot.value || pending.value) return;
    const others = languages.value.filter((item) => item !== code);
    let next = others;
    if (selected)
      next =
        code === NO_VOCALS
          ? [NO_VOCALS]
          : [...others.filter((item) => item !== NO_VOCALS), code];
    languages.value = TRACK_LANGUAGE_OPTIONS.filter((item) =>
      next.includes(item),
    );
  }

  function confirm() {
    if (snapshot.value?.needsReview) confirmed.value = true;
  }

  function save() {
    if (!isDirty.value) return true;
    return run(() =>
      window.Utawakui.saveTrackLanguages(
        trackId,
        snapshot.value.editToken,
        languages.value,
      ),
    ).then((saved) => {
      if (saved) void useTrackLanguageIndex().refresh();
      return saved;
    });
  }

  return {
    snapshot,
    languages,
    pending,
    error,
    isDirty,
    needsConfirmation,
    load,
    confirm,
    reset,
    toggle,
    save,
  };
}
