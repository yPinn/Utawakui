import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SettingsView.vue', import.meta.url),
  'utf8',
);
const basicPanelStart = source.indexOf('id="settings-basic-panel"');
const optionalPanelStart = source.indexOf('id="settings-optional-panel"');
const supportPanelStart = source.indexOf('id="settings-support-panel"');
const basicPanelSource = source.slice(basicPanelStart, optionalPanelStart);
const optionalPanelSource = source.slice(optionalPanelStart, supportPanelStart);
const supportPanelSource = source.slice(supportPanelStart);
const applicationSectionStart = source.indexOf(
  '<SettingsBlock title="應用程式">',
);
const librarySectionStart = source.indexOf(
  '<SettingsBlock title="曲庫與儲存">',
);
const librarySource = source.slice(
  librarySectionStart,
  source.indexOf('</SettingsBlock>', librarySectionStart) +
    '</SettingsBlock>'.length,
);
const applicationSource = source.slice(
  applicationSectionStart,
  source.indexOf('</SettingsBlock>', applicationSectionStart) +
    '</SettingsBlock>'.length,
);
const supportSectionStart = source.indexOf(
  '<SettingsBlock title="支援與維護">',
);
const supportSource = source.slice(
  supportSectionStart,
  source.indexOf('</SettingsBlock>', supportSectionStart) +
    '</SettingsBlock>'.length,
);

describe('SettingsView version and maintenance sections', () => {
  it('delegates the page heading to the utility frame and exposes three top-level tabs', () => {
    expect(source).not.toContain('<h1 class="settings-view__title">設定</h1>');
    expect(source).not.toContain('settings-view__header');
    expect(source).not.toContain('settings-view__column-header');
    expect(source).toContain(
      "import UiTabs from '../components/ui/UiTabs.vue';",
    );
    expect(source).toContain("{ id: 'basic', label: '基本設定' }");
    expect(source).toContain("{ id: 'optional', label: '選用功能' }");
    expect(source).toContain("{ id: 'support', label: '支援與維護' }");
    expect(source).toContain('aria-label="設定分類"');
    expect(source).toContain('tab-id-prefix="settings"');
    expect(source).toContain('panel-id-prefix="settings"');
    expect(source).toContain('variant="bar"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain('id="settings-basic-panel"');
    expect(source).toContain('id="settings-optional-panel"');
    expect(source).toContain('id="settings-support-panel"');
  });

  it('keeps core, optional, and support content in their intended panels', () => {
    expect(basicPanelStart).toBeGreaterThan(-1);
    expect(optionalPanelStart).toBeGreaterThan(basicPanelStart);
    expect(supportPanelStart).toBeGreaterThan(optionalPanelStart);

    expect(basicPanelSource).toContain('<SettingsBlock title="曲庫與儲存">');
    expect(basicPanelSource).toContain('<AudioOutputSettingsBlock');
    expect(basicPanelSource).toContain('<SettingsBlock title="應用程式">');
    expect(basicPanelSource).not.toContain('<SettingsFeatureGateRow');
    expect(basicPanelSource).not.toContain('<FeedbackReportSettingsRow');

    expect(optionalPanelSource).toContain('<SettingsFeatureGateRow');
    expect(optionalPanelSource).toContain('<MusicAnalysisSettingsRow');
    expect(optionalPanelSource).toContain('<ObsIntegrationSettingsBlock');
    expect(optionalPanelSource).not.toContain('<AppUpdateSettingsRow');

    expect(supportPanelSource).toContain('<FeedbackReportSettingsRow');
    expect(supportPanelSource).toContain('<DiagnosticsSettingsRow');
    expect(supportPanelSource).not.toContain('<SettingsFeatureGateRow');
  });

  it('explains the optional boundary once and groups gates by user-facing purpose', () => {
    expect(source).toContain('使用前請閱讀各功能說明，再選擇是否啟用。');
    expect(source).toContain("title: '來源與內容'");
    expect(source).toContain("title: '本機音訊處理'");
    expect(source).toContain("title: '公開輸出與 OBS'");
    expect(optionalPanelSource).toContain(
      'v-for="group in optionalFeatureGroups"',
    );
    expect(source).not.toContain('enabledGateCount');
    expect(source).not.toContain('額外元件只在需要時下載。');
  });

  it('opens setup requests on the optional-features tab', () => {
    expect(source).toContain('featureGateAccessState.request?.featureId');
    expect(source).toContain("activeSettingsTab.value = 'optional'");
  });

  it('keeps library location recovery copy short and actionable', () => {
    expect(source).toContain('無法建立預設資料夾。請選擇其他位置。');
    expect(source).toContain('設定已保留。請重新連接磁碟，或選擇其他位置。');
    expect(source).toContain('下載與匯入的曲目會存放在這裡。');
  });

  it('owns playback-history clearing under library and storage settings', () => {
    expect(source).toContain(
      "import PlaybackHistorySettingsRow from '../components/settings/PlaybackHistorySettingsRow.vue';",
    );
    expect(source).toContain(
      "import { usePlaybackHistory } from '../composables/usePlaybackHistory.js';",
    );
    expect(librarySource).toContain('<PlaybackHistorySettingsRow');
    expect(librarySource).toContain(':record-count="recentItems.length"');
    expect(librarySource).toContain('@clear="handleClearPlaybackHistory"');
    expect(source).toContain('initializePlaybackHistory();');
    expect(source).toContain('useAppConfirmation');
    expect(source).toContain("title: '清除最近播放紀錄？'");
    expect(source).toContain(
      '這不會影響播放佇列、播放清單、OBS 場次紀錄或錯誤紀錄。',
    );
  });

  it('composes one concise library-storage row under library and storage settings', () => {
    expect(source).toContain(
      "import LibraryStorageSettingsRow from '../components/settings/LibraryStorageSettingsRow.vue';",
    );
    expect(source).toContain(
      "import { useLibraryStorage } from '../composables/useLibraryStorage.js';",
    );
    expect(librarySource).toContain('<LibraryStorageSettingsRow');
    expect(librarySource).toContain(':storage="libraryStorage.storage.value"');
    expect(librarySource).toContain(':policy="libraryStorage.policy.value"');
    expect(librarySource).toContain('@set-policy="libraryStorage.setPolicy"');
    expect(librarySource).toContain('@cleanup="handleCleanupLibraryStorage"');
    expect(source).toContain('libraryStorage.initialize();');
    expect(source).toContain('libraryStorage.dispose');
    expect(source).toContain("title: '清理去人聲版本？'");
    expect(source).toContain('原始歌曲會保留，之後可以重新產生。');
  });

  it('presents metadata organization as automatic instead of owning a manual maintenance action', () => {
    expect(librarySource).toContain('<LibraryMetadataSettingsRow />');
    expect(source).not.toContain('useLibraryMetadataMaintenance');
    expect(source).not.toContain('@run="runLibraryMetadataMaintenance"');
  });

  it('nests BPM controls inside the audio-processing feature row', () => {
    const gateRowStart = source.indexOf('<SettingsFeatureGateRow');
    const bpmRow = source.indexOf('<MusicAnalysisSettingsRow', gateRowStart);
    const gateRowEnd = source.indexOf(
      '</SettingsFeatureGateRow>',
      gateRowStart,
    );

    expect(gateRowStart).toBeGreaterThan(-1);
    expect(bpmRow).toBeGreaterThan(gateRowStart);
    expect(gateRowEnd).toBeGreaterThan(bpmRow);
    expect(source.slice(bpmRow, gateRowEnd)).toMatch(
      /gate\.id\s*===\s*FEATURE_IDS\.AUDIO_PROCESSING_FLOW\s*&&\s*gate\.enabled/u,
    );
  });

  it('nests the separation GPU acceleration row inside the audio-processing feature row', () => {
    const gateRowStart = source.indexOf('<SettingsFeatureGateRow');
    const gpuRow = source.indexOf('<SeparationGpuSettingsRow', gateRowStart);
    const gateRowEnd = source.indexOf(
      '</SettingsFeatureGateRow>',
      gateRowStart,
    );

    expect(gpuRow).toBeGreaterThan(gateRowStart);
    expect(gateRowEnd).toBeGreaterThan(gpuRow);
    expect(source.slice(gpuRow, gateRowEnd)).toMatch(
      /gate\.id\s*===\s*FEATURE_IDS\.AUDIO_PROCESSING_FLOW\s*&&\s*gate\.enabled/u,
    );
  });

  it('groups Windows behavior and updates under 應用程式', () => {
    expect(applicationSectionStart).toBeGreaterThan(-1);
    expect(applicationSource).toContain('<WindowsBackgroundSettingsRow');
    expect(applicationSource).toContain('<AppUpdateSettingsRow');
    expect(applicationSource).not.toContain('<FeedbackReportSettingsRow');
  });

  it('keeps low-frequency support and maintenance entries together', () => {
    expect(supportSectionStart).toBeGreaterThan(-1);
    expect(supportSource).toContain('announcement.reopen');
    expect(supportSource).toContain('openCommunityDiscord');
    expect(supportSource).toContain('<FeedbackReportSettingsRow');
    expect(supportSource).toContain('<DiagnosticsSettingsRow');
  });

  it('keeps support copy concise without repeating the announcement summary', () => {
    expect(supportSource).toContain(':value="`v${announcement.version}`"');
    expect(supportSource).toContain(':tooltip="announcement.summary"');
    expect(supportSource).not.toContain(
      ':value="`v${announcement.version} · ${announcement.summary}`"',
    );
  });

  it('wires the app-update row to download telemetry and the auto-check toggle', () => {
    const rowStart = applicationSource.indexOf('<AppUpdateSettingsRow');
    const rowEnd = applicationSource.indexOf('/>', rowStart);
    const row = applicationSource.slice(rowStart, rowEnd);

    expect(row).toContain(
      ':download-bytes-per-second="appUpdateState.downloadBytesPerSecond"',
    );
    expect(row).toContain(
      ':download-eta-seconds="appUpdateState.downloadEtaSeconds"',
    );
    expect(row).toContain(
      ':auto-check-enabled="appUpdateState.autoCheckEnabled"',
    );
    expect(row).toContain('@set-auto-check="setAppUpdateAutoCheck"');
    expect(source).toContain('refreshAppUpdateAutoCheck();');
  });

  it('wires the Windows close behavior through its dedicated owner', () => {
    expect(source).toContain(
      "import WindowsBackgroundSettingsRow from '../components/settings/WindowsBackgroundSettingsRow.vue';",
    );
    expect(source).toContain(
      "import { useWindowsIntegrationSettings } from '../composables/useWindowsIntegrationSettings.js';",
    );
    expect(source).not.toContain('<SettingsBlock title="Windows">');
    expect(source).toContain('<SettingsBlock title="應用程式">');
    expect(source).toContain(
      ':behavior="windowsIntegrationSettings.windowCloseBehavior.value"',
    );
    expect(source).toContain(
      ':busy="windowsIntegrationSettings.preferenceBusy.value"',
    );
    expect(source).toContain(
      ':error="windowsIntegrationSettings.preferenceError.value"',
    );
    expect(source).toContain(
      '@set-behavior="windowsIntegrationSettings.setWindowCloseBehavior"',
    );
    expect(source).toContain('windowsIntegrationSettings.refreshPreference();');
  });

  it('describes the destructive confirmation as clearing error records', () => {
    expect(source).toContain("title: '清除錯誤紀錄？'");
    expect(source).toContain("confirmLabel: '清除紀錄'");
  });

  it('confirms BPM component removal without exposing storage details', () => {
    expect(source).toContain("title: '移除 BPM 分析元件？'");
    expect(source).toContain('歌曲與既有分析資料都會保留');
    expect(source).toContain('@remove="handleRemoveMusicAnalysis"');
  });

  it('requires confirmation before removing the stored OBS password', () => {
    expect(source).toContain("title: '移除 OBS 密碼？'");
    expect(source).toContain("confirmLabel: '移除密碼'");
    expect(source).toContain(':feature-enabled="gate.enabled"');
    expect(source).toMatch(
      /gate\.enabled \|\|\s+obsIntegrationSettings\.hasStoredPassword\.value/,
    );
    expect(source).toContain('@clear-password="handleClearObsPassword"');
  });
});
