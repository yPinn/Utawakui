import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SettingsView.vue', import.meta.url),
  'utf8',
);
const applicationSectionStart = source.indexOf(
  '<SettingsBlock title="應用程式">',
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
  it('uses one page heading without repeating column headings', () => {
    expect(source).toContain('<h1 class="settings-view__title">設定</h1>');
    expect(source).not.toContain('settings-view__column-header');
    expect(source).not.toContain('本機設定');
    expect(source).not.toContain('功能與下載項目');
  });

  it('describes optional downloads in user-facing terms', () => {
    expect(source).toMatch(/<SettingsBlock\s+title="功能與下載"/);
    expect(source).toContain('額外元件只在需要時下載。');
    expect(source).not.toContain('工具與模型會列在下方');
    expect(source).toContain('<MusicAnalysisSettingsRow');
    expect(source).toContain('FEATURE_IDS.AUDIO_PROCESSING_FLOW');
  });

  it('keeps library location recovery copy short and actionable', () => {
    expect(source).toContain('無法建立預設資料夾。請選擇其他位置。');
    expect(source).toContain('設定已保留。請重新連接磁碟，或選擇其他位置。');
    expect(source).toContain('下載與匯入的曲目會存放在這裡。');
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
    expect(source.slice(bpmRow, gateRowEnd)).toContain(
      'gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW && gate.enabled',
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
    expect(source.slice(gpuRow, gateRowEnd)).toContain(
      'gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW && gate.enabled',
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
    expect(source).toContain("window.confirm('清除這台電腦上的錯誤紀錄？')");
  });

  it('confirms BPM component removal without exposing storage details', () => {
    expect(source).toContain(
      "window.confirm('移除 BPM 分析元件？歌曲與既有分析資料都會保留。')",
    );
    expect(source).toContain('@remove="handleRemoveMusicAnalysis"');
  });

  it('requires confirmation before removing the stored OBS password', () => {
    expect(source).toContain(
      "window.confirm('移除這台電腦上已儲存的 OBS 密碼？')",
    );
    expect(source).toContain(':feature-enabled="gate.enabled"');
    expect(source).toMatch(
      /gate\.enabled \|\|\s+obsIntegrationSettings\.hasStoredPassword\.value/,
    );
    expect(source).toContain('@clear-password="handleClearObsPassword"');
  });
});
