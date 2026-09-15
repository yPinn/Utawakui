import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workbenchSource = fs.readFileSync(
  new URL('./MusicAnalysisWorkbench.vue', import.meta.url),
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
      /\.analysis-picker__list\s*\{[^}]*flex:\s*1;[^}]*overflow-y:\s*auto;/s,
    );
  });

  it('gives the result pane its own vertical scroll boundary', () => {
    expect(workbenchSource).toMatch(
      /\.analysis-workbench__detail\s*\{[^}]*overflow-y:\s*auto;/s,
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

  it('keeps benchmark review separate from sidecar-producing analysis', () => {
    expect(workbenchSource).toContain("workbenchMode = shallowRef('analysis')");
    expect(workbenchSource).toContain('正式分析');
    expect(workbenchSource).toContain('Benchmark Review');
    expect(workbenchSource).toContain('人工標註');
    expect(workbenchSource).toMatch(
      /<MusicAnalysisReferenceAnnotation\s+v-if="workbenchMode === 'annotation'"/,
    );
    expect(workbenchSource).toMatch(
      /<MusicAnalysisBenchmarkReview\s+v-else-if="workbenchMode === 'benchmark'"/,
    );
    expect(workbenchSource).toMatch(
      /<UiSurface\s+v-else\s+class="analysis-workbench__layout"/,
    );
  });

  it('keeps storage and runtime internals out of product-facing analysis copy', () => {
    expect(workbenchSource).toContain('歌曲、歌詞與既有分析結果都會保留。');
    expect(jobPanelSource).toContain('將下載音樂分析所需檔案');
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
