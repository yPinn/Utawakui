import { computed, shallowRef } from 'vue';
import { t } from '../utils/i18n.js';

// Offered codes; saved codes outside this list are kept as they are.
export const TRACK_LANGUAGE_OPTIONS = Object.freeze([
  'cmn',
  'yue',
  'nan-TW',
  'ja',
  'ko',
  'en',
  'zh',
  'zxx',
]);
const NO_VOCALS = 'zxx';

export function useTrackLanguageEditor() {
  const snapshot = shallowRef(null);
  const languages = shallowRef([]);
  const primary = shallowRef(null);
  const pending = shallowRef(false);
  const error = shallowRef('');
  const confirmed = shallowRef(false);
  let trackId = null;
  let request = 0;

  const choices = computed(() => [
    ...TRACK_LANGUAGE_OPTIONS,
    ...(snapshot.value?.languages ?? []).filter(
      (code) => !TRACK_LANGUAGE_OPTIONS.includes(code),
    ),
  ]);
  const needsPrimary = computed(() => languages.value.length > 1);
  const needsConfirmation = computed(
    () => Boolean(snapshot.value?.needsReview) && !confirmed.value,
  );
  const isDirty = computed(
    () =>
      Boolean(snapshot.value) &&
      (confirmed.value ||
        JSON.stringify(languages.value) !==
          JSON.stringify(snapshot.value.languages) ||
        (needsPrimary.value && primary.value !== snapshot.value.primary)),
  );

  function setSnapshot(value) {
    snapshot.value = value;
    confirmed.value = false;
    languages.value = value.languages;
    primary.value = value.primary;
  }

  function reset() {
    request += 1;
    trackId = null;
    snapshot.value = null;
    languages.value = [];
    primary.value = null;
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

  // "No vocals" excludes every sung language, and vice versa. Choices order
  // keeps toggling back to a saved selection clean; the main language is
  // only chosen explicitly once two or more languages are ticked.
  function toggle(code, selected) {
    if (!snapshot.value || pending.value) return;
    const others = languages.value.filter((item) => item !== code);
    let next = others;
    if (selected)
      next =
        code === NO_VOCALS
          ? [NO_VOCALS]
          : [...others.filter((item) => item !== NO_VOCALS), code];
    const order = choices.value;
    next = [...next].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (
      next.length < 2 ||
      languages.value.length < 2 ||
      !next.includes(primary.value)
    )
      primary.value = null;
    languages.value = next;
  }

  function confirm() {
    if (snapshot.value?.needsReview) confirmed.value = true;
  }

  function setPrimary(code) {
    primary.value = languages.value.includes(code) ? code : null;
  }

  function save() {
    if (!isDirty.value) return true;
    return run(() =>
      window.Utawakui.saveTrackLanguages(
        trackId,
        snapshot.value.editToken,
        languages.value,
        needsPrimary.value ? primary.value : null,
      ),
    );
  }

  return {
    snapshot,
    languages,
    primary,
    choices,
    needsPrimary,
    pending,
    error,
    isDirty,
    needsConfirmation,
    load,
    confirm,
    reset,
    toggle,
    setPrimary,
    save,
  };
}
