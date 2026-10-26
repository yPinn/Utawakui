import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const viewSource = readSource('./SettingsView.vue');
const librarySource = readSource(
  '../components/settings/SettingsLibrarySection.vue',
);
const audioSource = readSource(
  '../components/settings/SettingsAudioSection.vue',
);
const applicationSource = readSource(
  '../components/settings/SettingsApplicationSection.vue',
);
const optionalSource = readSource(
  '../components/settings/SettingsCapabilitiesSection.vue',
);
const supportSource = readSource(
  '../components/settings/SettingsSupportSection.vue',
);
const researchSource = readSource(
  '../components/settings/LyricsResearchSettingsBlock.vue',
);
const sectionSources = [
  librarySource,
  audioSource,
  applicationSource,
  optionalSource,
  researchSource,
  supportSource,
];
const source = [viewSource, ...sectionSources].join('\n');

describe('SettingsView document composition', () => {
  it('composes independent core, optional, research and support sections without legacy tabs or an inner page scroll', () => {
    const sectionComponents = [
      'SettingsLibrarySection',
      'SettingsAudioSection',
      'SettingsCapabilitiesSection',
      'LyricsResearchSettingsBlock',
      'SettingsApplicationSection',
      'SettingsSupportSection',
    ];
    let previousStart = -1;
    for (const component of sectionComponents) {
      expect(viewSource).toContain(`import ${component}`);
      const position = viewSource.indexOf(`<${component}`);
      expect(position, component).toBeGreaterThan(previousStart);
      previousStart = position;
    }

    expect(
      sectionSources.every((section) => section.includes('SettingsSection')),
    ).toBe(true);
    expect(source).toContain('SettingsDocumentItem');
    expect(source).not.toContain(
      "import UiTabs from '../components/ui/UiTabs.vue';",
    );
    expect(source).not.toContain('<UiTabs');
    expect(source).not.toContain('<UiScrollLayout');
    expect(source).not.toContain('role="tabpanel"');
    expect(source).not.toContain('activeSettingsTab');
    expect(viewSource).not.toContain('../composables/');
    expect(viewSource).not.toContain('Modal');
  });

  it('keeps core, optional, and support responsibilities in their named sections', () => {
    expect(librarySource).toContain('title="曲庫與儲存"');
    expect(librarySource).toContain('<LibraryStorageSettingsRow');
    expect(librarySource).toContain('<LibraryMetadataSettingsRow');
    expect(librarySource).toContain('<PlaybackHistorySettingsRow');
    expect(audioSource).toContain('title="音訊輸出"');
    expect(audioSource).toContain('<AudioOutputSettingsBlock');
    expect(applicationSource).toContain('title="應用程式"');
    expect(applicationSource).toContain('<WindowsBackgroundSettingsRow');
    expect(applicationSource).toContain('<AppUpdateSettingsRow');
    expect(optionalSource).toContain("title: '外部來源與歌詞'");
    expect(optionalSource).toContain('<SettingsFeatureGateRow');
    expect(optionalSource).not.toContain('LyricsResearchSettingsBlock');
    expect(researchSource).toContain('title="歌詞時間分析（實驗）"');
    expect(researchSource).toContain('<LyricsExperimentalQueueSettings />');
    expect(viewSource).not.toContain('LyricsExperimentalQueueSettings');
    expect(supportSource).toContain('title="支援與維護"');
    expect(supportSource).toContain('<FeedbackReportSettingsRow');
    expect(supportSource).toContain('<DiagnosticsSettingsRow');
  });

  it('reveals deep-linked capability groups and feature requests in the same document', () => {
    expect(source).toContain('async function revealSettingsTarget(targetId)');
    expect(source).toContain("target?.scrollIntoView({ block: 'start' })");
    expect(source).toContain('target?.focus({ preventScroll: true })');
    expect(source).toContain('`settings-group-${section}`');
    expect(source).toContain('`settings-feature-${featureId}`');
    expect(optionalSource).toContain(':id="`settings-feature-${gate.id}`"');
    expect(optionalSource).toContain('tabindex="-1"');
  });

  it('groups optional gates by user-facing purpose without a redundant introduction', () => {
    expect(source).not.toContain('使用前請閱讀各功能說明，再選擇是否啟用。');
    expect(source).toContain("title: '外部來源與歌詞'");
    expect(source).toContain("title: '本機音訊處理'");
    expect(source).toContain("title: '公開輸出與 OBS'");
    expect(optionalSource).toContain('v-for="group in optionalFeatureGroups"');
    expect(source).not.toContain('enabledGateCount');
    expect(source).not.toContain('額外元件只在需要時下載。');
  });
});

describe('SettingsView behavior wiring', () => {
  it('keeps library location recovery copy short and actionable', () => {
    expect(source).toContain('無法建立預設資料夾。請選擇其他位置。');
    expect(source).toContain('設定已保留。請重新連接磁碟，或選擇其他位置。');
    expect(librarySource).not.toContain('下載與匯入的曲目會存放在這裡。');
    expect(librarySource).toContain('切換位置不會搬移既有曲目。');
  });

  it('owns playback-history clearing under library and storage settings', () => {
    expect(source).toContain(
      "import PlaybackHistorySettingsRow from './PlaybackHistorySettingsRow.vue';",
    );
    expect(source).toContain(
      "import { usePlaybackHistory } from '../../composables/usePlaybackHistory.js';",
    );
    expect(librarySource).toContain('<PlaybackHistorySettingsRow');
    expect(librarySource).toContain(':record-count="recentItems.length"');
    expect(librarySource).toContain('@clear="handleClearPlaybackHistory"');
    expect(source).toContain('initializePlaybackHistory(),');
    expect(source).toContain("title: '清除最近播放紀錄？'");
    expect(source).toContain('播放佇列、播放清單、OBS 場次與錯誤紀錄會保留。');
  });

  it('keeps storage and automatic metadata organization in the library section', () => {
    expect(librarySource).toContain('<LibraryStorageSettingsRow');
    expect(librarySource).toContain(':storage="libraryStorage.storage.value"');
    expect(librarySource).toContain(':policy="libraryStorage.policy.value"');
    expect(librarySource).toContain('@set-policy="libraryStorage.setPolicy"');
    expect(librarySource).toContain('@cleanup="handleCleanupLibraryStorage"');
    expect(librarySource).toContain('<LibraryMetadataSettingsRow />');
    expect(source).toContain('libraryStorage.initialize(),');
    expect(source).toContain('libraryStorage.dispose');
    expect(source).toContain("title: '清理去人聲空間？'");
    expect(source).not.toContain('useLibraryMetadataMaintenance');
  });

  it('nests BPM and GPU controls inside the audio-processing capability', () => {
    const gateRowStart = optionalSource.indexOf('<SettingsFeatureGateRow');
    const bpmRow = optionalSource.indexOf(
      '<MusicAnalysisSettingsRow',
      gateRowStart,
    );
    const gpuRow = optionalSource.indexOf(
      '<SeparationGpuSettingsRow',
      gateRowStart,
    );
    const gateRowEnd = optionalSource.indexOf(
      '</SettingsFeatureGateRow>',
      gateRowStart,
    );

    expect(gateRowStart).toBeGreaterThan(-1);
    expect(bpmRow).toBeGreaterThan(gateRowStart);
    expect(
      optionalSource.indexOf('<MusicAnalysisPreferenceRow', gateRowStart),
    ).toBeLessThan(gpuRow);
    expect(bpmRow).toBeGreaterThan(
      optionalSource.indexOf('<template #tools>', gateRowStart),
    );
    expect(gateRowEnd).toBeGreaterThan(gpuRow);
    expect(optionalSource.slice(bpmRow, gateRowEnd)).toMatch(
      /gate\.id\s*===\s*FEATURE_IDS\.AUDIO_PROCESSING_FLOW\s*&&\s*gate\.enabled/u,
    );
  });

  it('keeps low-frequency support and maintenance entries together', () => {
    expect(supportSource).toContain('announcement.reopen');
    expect(supportSource).toContain('openCommunityDiscord');
    expect(supportSource).toContain('<FeedbackReportSettingsRow');
    expect(supportSource).toContain('<DiagnosticsSettingsRow');
    expect(supportSource).toContain(':value="`v${announcement.version}`"');
    expect(supportSource).not.toContain('announcement.summary');
    expect(supportSource).toContain('@click="announcement.reopen"');
  });

  it('wires application update telemetry and Windows close behavior', () => {
    expect(applicationSource).toContain(
      ':download-bytes-per-second="appUpdateState.downloadBytesPerSecond"',
    );
    expect(applicationSource).toContain(
      ':download-eta-seconds="appUpdateState.downloadEtaSeconds"',
    );
    expect(applicationSource).toContain(
      ':auto-check-enabled="appUpdateState.autoCheckEnabled"',
    );
    expect(applicationSource).toContain(
      '@set-auto-check="setAppUpdateAutoCheck"',
    );
    expect(applicationSource).toContain(
      ':behavior="windowsIntegrationSettings.windowCloseBehavior.value"',
    );
    expect(applicationSource).toContain(
      '@set-behavior="windowsIntegrationSettings.setWindowCloseBehavior"',
    );
    expect(source).toContain('refreshAppUpdateAutoCheck();');
    expect(source).toContain('windowsIntegrationSettings.refreshPreference();');
  });

  it('retains destructive confirmations and protected credentials', () => {
    expect(source).toContain("title: '清除錯誤紀錄？'");
    expect(source).toContain("confirmLabel: '清除紀錄'");
    expect(source).toContain("title: '移除 BPM 分析元件？'");
    expect(source).toContain('歌曲與既有分析資料都會保留');
    expect(source).toContain('@remove="handleRemoveMusicAnalysis"');
    expect(source).toContain("title: '移除 OBS 密碼？'");
    expect(source).toContain("confirmLabel: '移除密碼'");
    expect(optionalSource).toContain(':feature-enabled="gate.enabled"');
    expect(optionalSource).toMatch(
      /gate\.enabled \|\|\s+obsIntegrationSettings\.hasStoredPassword\.value/u,
    );
    expect(optionalSource).toContain(
      '@clear-password="handleClearObsPassword"',
    );
  });
});
