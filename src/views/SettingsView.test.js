import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SettingsView.vue', import.meta.url),
  'utf8',
);
const versionSectionStart = source.indexOf(
  '<SettingsBlock title="版本與公告">',
);
const versionSource = source.slice(
  versionSectionStart,
  source.indexOf('</SettingsBlock>', versionSectionStart) +
    '</SettingsBlock>'.length,
);
const maintenanceSource = source.slice(
  source.indexOf('<SettingsBlock title="維護">'),
);

describe('SettingsView version and maintenance sections', () => {
  it('describes optional downloads in user-facing terms', () => {
    expect(source).toContain('功能與下載項目');
    expect(source).toContain(
      '啟用前會說明用途與需要的額外下載；之後可隨時移除。',
    );
    expect(source).not.toContain('工具與模型會列在下方');
    expect(source).toContain('<MusicAnalysisSettingsRow');
    expect(source).toContain('FEATURE_IDS.AUDIO_PROCESSING_FLOW');
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

  it('groups app updates with feedback reporting under 版本與公告, ordered update-first', () => {
    const appUpdateIndex = versionSource.indexOf('<AppUpdateSettingsRow');
    const feedbackRowIndex = versionSource.indexOf(
      '<FeedbackReportSettingsRow',
    );

    expect(appUpdateIndex).toBeGreaterThan(-1);
    expect(feedbackRowIndex).toBeGreaterThan(-1);
    expect(appUpdateIndex).toBeLessThan(feedbackRowIndex);
  });

  it('places the re-open-announcement row between the update row and feedback reporting', () => {
    const appUpdateIndex = versionSource.indexOf('<AppUpdateSettingsRow');
    const reopenIndex = versionSource.indexOf('announcement.reopen');
    const feedbackRowIndex = versionSource.indexOf(
      '<FeedbackReportSettingsRow',
    );

    expect(reopenIndex).toBeGreaterThan(appUpdateIndex);
    expect(reopenIndex).toBeLessThan(feedbackRowIndex);
  });

  it('keeps error diagnostics under 維護, separate from the version block', () => {
    expect(versionSource).not.toContain('<DiagnosticsSettingsRow');
    expect(maintenanceSource).toContain('<DiagnosticsSettingsRow');
    expect(maintenanceSource).not.toContain('<AppUpdateSettingsRow');
  });

  it('wires the app-update row to download telemetry and the auto-check toggle', () => {
    const rowStart = versionSource.indexOf('<AppUpdateSettingsRow');
    const rowEnd = versionSource.indexOf('/>', rowStart);
    const row = versionSource.slice(rowStart, rowEnd);

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

  it('describes the destructive confirmation as clearing error records', () => {
    expect(source).toContain("window.confirm('清除這台電腦上的錯誤紀錄？')");
  });

  it('confirms BPM component removal without exposing storage details', () => {
    expect(source).toContain(
      "window.confirm('移除 BPM 分析元件？歌曲與既有分析資料都會保留。')",
    );
    expect(source).toContain('@remove="handleRemoveMusicAnalysis"');
  });
});
