import { shallowRef } from 'vue';
import { useSettingsPreference } from './useSettingsPreference.js';
import { appErrorMessage } from '../utils/appErrors.js';
import { t } from '../utils/i18n.js';

const SOURCES = Object.freeze(['none', 'firefox', 'file']);

// Sign-in used only after anonymous download routes fail. The file itself is
// picked and stored by Main; this side only sees whether one is imported.
export function useYoutubeLoginSettings(options = {}) {
  const bridge = options.bridge ?? globalThis.window?.Utawakui;
  const source = useSettingsPreference({
    scope: bridge,
    key: 'youtube-login-source',
    initialValue: 'none',
    read: () => bridge.getYoutubeLoginSource(),
    write: (value) => bridge.setYoutubeLoginSource(value),
    validate: (value) => SOURCES.includes(value),
    readMessage: t('capabilities.youtubeLogin.readFailed'),
    saveMessage: t('capabilities.youtubeLogin.saveFailed'),
  });
  const status = shallowRef({ imported: false, noticeAcknowledged: false });
  const fileBusy = shallowRef(false);
  const fileError = shallowRef('');

  function applyStatus(next) {
    status.value = {
      imported: next?.imported === true,
      noticeAcknowledged: next?.noticeAcknowledged === true,
    };
  }

  async function runFileAction(action) {
    if (fileBusy.value) return;
    fileBusy.value = true;
    fileError.value = '';
    try {
      applyStatus(await action());
    } catch (error) {
      fileError.value = appErrorMessage(error);
    } finally {
      fileBusy.value = false;
    }
  }

  async function refresh() {
    await Promise.all([
      source.refresh(),
      runFileAction(() => bridge.getYoutubeLoginStatus()),
    ]);
  }

  const items = Object.freeze(
    SOURCES.map((value) => ({
      value,
      label: t(`capabilities.youtubeLogin.options.${value}`),
    })),
  );

  return {
    source: source.value,
    loaded: source.loaded,
    reading: source.reading,
    busy: source.busy,
    readError: source.readError,
    saveError: source.saveError,
    status,
    fileBusy,
    fileError,
    items,
    refresh,
    setSource: source.save,
    importFile: ({ acknowledgeNotice = false } = {}) =>
      runFileAction(() =>
        bridge.importYoutubeLoginFile(
          acknowledgeNotice ? { acknowledgeNotice: true } : {},
        ),
      ),
    removeFile: () => runFileAction(() => bridge.removeYoutubeLoginFile()),
  };
}
