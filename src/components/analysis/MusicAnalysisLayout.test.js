import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workbenchSource = fs.readFileSync(
  new URL('./MusicAnalysisWorkbench.vue', import.meta.url),
  'utf8',
);
const evaluationWorkbenchSource = fs.readFileSync(
  new URL('./MusicAnalysisEvaluationWorkbench.vue', import.meta.url),
  'utf8',
);
const pickerSource = fs.readFileSync(
  new URL('./MusicAnalysisTrackPicker.vue', import.meta.url),
  'utf8',
);
const summarySource = fs.readFileSync(
  new URL('./MusicStructureSummary.vue', import.meta.url),
  'utf8',
);
const jobPanelSource = fs.readFileSync(
  new URL('./MusicAnalysisJobPanel.vue', import.meta.url),
  'utf8',
);
const benchmarkSource = fs.readFileSync(
  new URL('./MusicAnalysisBenchmarkReview.vue', import.meta.url),
  'utf8',
);
const workbenchComposableSource = fs.readFileSync(
  new URL('../../composables/useMusicAnalysisWorkbench.js', import.meta.url),
  'utf8',
);
const jobComposableSource = fs.readFileSync(
  new URL('../../composables/analysis/useMusicAnalysisJob.js', import.meta.url),
  'utf8',
);
const benchmarkPresentationSource = fs.readFileSync(
  new URL('../../utils/musicAnalysisBenchmark.js', import.meta.url),
  'utf8',
);

describe('Music Analysis scroll layout', () => {
  it('fills the page and keeps the split pane within the available height', () => {
    expect(workbenchSource).toMatch(
      /\.analysis-workbench\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s,
    );
    expect(workbenchSource).toMatch(
      /\.analysis-workbench__layout\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/s,
    );
  });

  it('keeps track search visible while only the track list scrolls', () => {
    expect(pickerSource).toMatch(
      /\.analysis-picker\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s,
    );
    expect(pickerSource).toMatch(
      /\.analysis-picker__list\s*\{[^}]*flex:\s*1;/s,
    );
    expect(pickerSource).toContain('<UiScrollRegion');
  });

  it('gives the result pane its own vertical scroll boundary', () => {
    expect(workbenchSource).toContain('class="analysis-workbench__detail"');
    expect(workbenchSource).toContain(
      'viewport-class="analysis-workbench__detail-viewport"',
    );
  });

  it('shows one task surface at a time for single-track and batch modes', () => {
    expect(workbenchSource).toContain("analysisMode === 'batch'");
    expect(workbenchSource).toMatch(
      /<MusicAnalysisBatchPanel[\s\S]*v-if="analysisMode === 'batch'"/,
    );
    expect(workbenchSource).toMatch(
      /<template v-else>[\s\S]*<MusicAnalysisJobPanel[\s\S]*<MusicStructureSummary/,
    );
  });

  it('keeps operations separate from annotation and benchmark evaluation', () => {
    expect(workbenchSource).toContain('Music Analysis 作業');
    expect(workbenchSource).not.toContain('MusicAnalysisReferenceAnnotation');
    expect(workbenchSource).not.toContain('MusicAnalysisBenchmarkReview');
    expect(workbenchSource).not.toContain('MusicAnalysisCapabilityModal');
    expect(evaluationWorkbenchSource).toContain(
      '<MusicAnalysisReferenceAnnotation',
    );
    expect(evaluationWorkbenchSource).toContain(
      '<MusicAnalysisBenchmarkReview',
    );
    expect(evaluationWorkbenchSource).toContain('<UiSegmentedControl');
  });

  it('keeps capability lifecycle in Settings and internals out of analysis copy', () => {
    expect(workbenchSource).toContain('@open-settings="openSettings"');
    expect(workbenchSource).not.toMatch(
      /prepareCapability|repairCapability|removeCapability/u,
    );
    expect(jobPanelSource).toContain('請到設定準備或修復 BPM 分析');
    expect(jobPanelSource).toContain("'openSettings'");
    expect(jobPanelSource).not.toContain('將下載音樂分析所需檔案');
    expect(jobPanelSource).toContain('label="重新讀取分析結果"');
    expect(summarySource).toContain("title: '分析結果需要更新'");
    expect(summarySource).toContain('分析版本 {{ sourceRevision }}');
    expect(benchmarkSource).toContain('不會變更分析結果');
    expect(workbenchComposableSource).toContain("loading: '讀取分析結果'");
    expect(jobComposableSource).toContain("checking: '檢查既有分析結果'");
    expect(jobComposableSource).toContain('若結果未更新，請再執行一次分析');
    expect(benchmarkPresentationSource).toContain(
      '正式分析結果會保留 BPM／節拍，但不顯示段落。',
    );

    for (const source of [
      workbenchSource,
      evaluationWorkbenchSource,
      summarySource,
      benchmarkSource,
      workbenchComposableSource,
      jobComposableSource,
      benchmarkPresentationSource,
    ]) {
      expect(source).not.toMatch(/sidecar|狀態 API|M0 fallback/iu);
    }
  });
});
