import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const viewSource = readSource('../../views/SettingsView.vue');
const librarySource = readSource('./SettingsLibrarySection.vue');
const audioSource = readSource('./SettingsAudioSection.vue');
const applicationSource = readSource('./SettingsApplicationSection.vue');
const capabilitiesSource = readSource('./SettingsCapabilitiesSection.vue');
const supportSource = readSource('./SettingsSupportSection.vue');

describe('Settings document section ownership', () => {
  it('keeps SettingsView as the ordered document composer', () => {
    const sectionComponents = [
      'SettingsLibrarySection',
      'SettingsAudioSection',
      'SettingsApplicationSection',
      'SettingsCapabilitiesSection',
      'SettingsSupportSection',
    ];
    let previousPosition = -1;

    for (const component of sectionComponents) {
      expect(viewSource).toContain(`import ${component}`);
      const position = viewSource.indexOf(`<${component}`);
      expect(position, component).toBeGreaterThan(previousPosition);
      previousPosition = position;
    }

    expect(viewSource).not.toContain('../composables/');
    expect(viewSource).not.toContain('Modal');
    expect(viewSource).not.toContain('onMounted');
  });

  it('keeps library filesystem and maintenance behavior with the library section', () => {
    expect(librarySource).toContain('title="曲庫與儲存"');
    expect(librarySource).toContain('useImportSession');
    expect(librarySource).toContain('useLibraryStorage');
    expect(librarySource).toContain('usePlaybackHistory');
    expect(librarySource).toContain('<LibraryStorageSettingsRow');
    expect(librarySource).toContain('<PlaybackHistorySettingsRow');
    expect(librarySource).toContain("title: '清除去人聲版本？'");
    expect(librarySource).toContain("title: '清除最近播放紀錄？'");
  });

  it('keeps capture-device selection and its dialog with the audio section', () => {
    expect(audioSource).toContain('title="音訊輸出"');
    expect(audioSource).toContain('usePlayer');
    expect(audioSource).toContain('useAudioOutput');
    expect(audioSource).toContain('<AudioOutputSettingsBlock');
    expect(audioSource).toContain('<CaptureDeviceModal');
  });

  it('keeps update and Windows behavior lifecycle with the application section', () => {
    expect(applicationSource).toContain('title="應用程式"');
    expect(applicationSource).toContain('useAppInfo');
    expect(applicationSource).toContain('useAppUpdate');
    expect(applicationSource).toContain('useWindowsIntegrationSettings');
    expect(applicationSource).toContain('<WindowsBackgroundSettingsRow');
    expect(applicationSource).toContain('<AppUpdateSettingsRow');
  });

  it('keeps gate, dependency, optional-tool, and deep-link behavior together', () => {
    expect(capabilitiesSource).toContain("title: '外部來源與歌詞'");
    expect(capabilitiesSource).toContain('<SettingsSection');
    expect(capabilitiesSource).toContain('useFeatureGates');
    expect(capabilitiesSource).toContain('useFeatureDependencies');
    expect(capabilitiesSource).toContain('useFeatureGateAccess');
    expect(capabilitiesSource).toContain('revealSettingsTarget');
    expect(capabilitiesSource).toContain('<SettingsFeatureGateRow');
    expect(capabilitiesSource).toContain('<FfmpegSourceModal');
    expect(capabilitiesSource).not.toContain('<ObsSessionExportModal');
  });

  it('keeps feedback, announcements, and diagnostics with the support section', () => {
    expect(supportSource).toContain('title="支援與維護"');
    expect(supportSource).toContain('usePersistentDiagnostics');
    expect(supportSource).toContain('useFeedbackReport');
    expect(supportSource).toContain('useAppAnnouncement');
    expect(supportSource).toContain('<FeedbackReportSettingsRow');
    expect(supportSource).toContain('<DiagnosticsSettingsRow');
    expect(supportSource).not.toContain('<FeedbackReportModal');
  });
});
