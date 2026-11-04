import { computed, shallowRef } from 'vue';
import uiLocaleValues from '../../shared/uiLocaleValues.json';
import { useAppConfirmation } from './useAppConfirmation.js';
import { useSettingsPreference } from './useSettingsPreference.js';
import { catalogKey, t } from '../utils/i18n.js';
import { UI_LOCALE } from '../utils/uiLocale.js';

const { supportedLocales } = uiLocaleValues;
const PREFERENCES = Object.freeze(['system', ...supportedLocales]);

function isPreference(value) {
  return PREFERENCES.includes(value);
}

// Language names stay in their own language whatever the UI language is.
export function uiLanguageName(locale) {
  return t(`settings.language.names.${catalogKey(locale)}`);
}

// The UI language is fixed per launch: saving only changes the next launch,
// so a differing target offers a restart instead of switching in place.
export function useUiLanguageSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const currentLocale = options.currentLocale ?? UI_LOCALE;
  const { confirm } = options.confirmation ?? useAppConfirmation();
  const preference = useSettingsPreference({
    scope: bridge,
    key: 'ui-language',
    initialValue: 'system',
    read: () => bridge.getUiLanguage(),
    write: (value) => bridge.setUiLanguage(value),
    validate: isPreference,
    readMessage: t('settings.language.readFailed'),
    saveMessage: t('settings.language.saveFailed'),
  });
  const targetLocale = shallowRef(currentLocale);
  const relaunchError = shallowRef('');
  const relaunching = shallowRef(false);

  async function refreshTarget() {
    try {
      const locale = await bridge.getUiLanguageTarget();
      if (supportedLocales.includes(locale)) targetLocale.value = locale;
    } catch {
      // The pending hint is advisory; the saved preference is what matters.
    }
  }

  async function refresh() {
    await preference.refresh();
    await refreshTarget();
  }

  async function relaunch() {
    if (relaunching.value) return;
    relaunching.value = true;
    relaunchError.value = '';
    try {
      await bridge.relaunchApp();
    } catch {
      relaunchError.value = t('settings.language.relaunchFailed');
      relaunching.value = false;
    }
  }

  async function restartDetail() {
    let impact = {};
    try {
      impact = (await bridge.getRestartImpact()) ?? {};
    } catch {
      // Without the impact the generic warning still applies.
    }
    return [
      t('settings.language.restartDetail'),
      impact.separation ? t('settings.language.restartSeparation') : '',
      impact.output === 'resumes'
        ? t('settings.language.restartOutputResumes')
        : '',
      impact.output === 'stops'
        ? t('settings.language.restartOutputStops')
        : '',
    ]
      .filter(Boolean)
      .join(t('common.sentenceJoin'));
  }

  // Always asks first: a restart drops unsaved edits and running work.
  async function offerRestart() {
    if (relaunching.value) return;
    const confirmed = await confirm({
      title: t('settings.language.restartTitle'),
      message: t('settings.language.restartMessage', {
        language: uiLanguageName(targetLocale.value),
      }),
      detail: await restartDetail(),
      confirmLabel: t('settings.language.restartNow'),
      cancelLabel: t('settings.language.later'),
    });
    if (confirmed) await relaunch();
  }

  async function setPreference(next) {
    if (!(await preference.save(next))) return false;
    await refreshTarget();
    if (targetLocale.value !== currentLocale) await offerRestart();
    return true;
  }

  const items = Object.freeze([
    { value: 'system', label: t('settings.language.system') },
    ...supportedLocales.map((locale) => ({
      value: locale,
      label: uiLanguageName(locale),
    })),
  ]);

  return {
    preference: preference.value,
    loaded: preference.loaded,
    reading: preference.reading,
    busy: preference.busy,
    readError: preference.readError,
    saveError: preference.saveError,
    items,
    pendingMessage: computed(() =>
      targetLocale.value === currentLocale
        ? ''
        : t('settings.language.pending', {
            language: uiLanguageName(targetLocale.value),
          }),
    ),
    relaunching,
    relaunchError,
    refresh,
    setPreference,
    offerRestart,
  };
}
