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
      /<div\s+v-else\s+class="analysis-workbench__layout">/,
    );
  });
});
