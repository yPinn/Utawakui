import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const standardControlSurfaces = [
  '../analysis/MusicAnalysisWorkbench.vue',
  '../analysis/MusicAnalysisTrackPicker.vue',
  '../analysis/MusicAnalysisJobPanel.vue',
  '../analysis/MusicAnalysisBatchPanel.vue',
  '../analysis/MusicAnalysisSelectionToolbar.vue',
  '../analysis/MusicAnalysisBenchmarkReview.vue',
  '../analysis/MusicAnalysisReferenceAnnotation.vue',
  '../settings/DiagnosticsWorkbench.vue',
  '../lyrics-provider/LyricsProviderReviewWorkbench.vue',
  '../lyrics-provider/LyricsProviderReviewStrata.vue',
  '../lyrics-provider/LyricsProviderReviewCandidateList.vue',
  '../lyrics-provider/LyricsProviderReviewForm.vue',
];

const directManipulationSurfaces = [
  '../analysis/MusicAnalysisReferenceEditor.vue',
  '../analysis/MusicAnalysisBenchmarkTimeline.vue',
];

describe('Internal Tools UI contract', () => {
  it('uses shared primitives for every standard feature control', () => {
    for (const relativePath of standardControlSurfaces) {
      expect(source(relativePath), relativePath).not.toMatch(
        /<(?:button|input|select|textarea|details|summary)(?:\s|>)/u,
      );
    }
  });

  it('keeps only the documented proportional timeline segments as raw buttons', () => {
    const referenceEditor = source(directManipulationSurfaces[0]);
    const benchmarkTimeline = source(directManipulationSurfaces[1]);

    expect(referenceEditor.match(/<button(?:\s|>)/gu)).toHaveLength(1);
    expect(referenceEditor).toContain('class="reference-editor__segment"');
    expect(referenceEditor).not.toMatch(/<(?:input|select)(?:\s|>)/u);

    expect(benchmarkTimeline.match(/<button(?:\s|>)/gu)).toHaveLength(1);
    expect(benchmarkTimeline).toContain('class="benchmark-timeline__segment"');
  });

  it('uses semantic tokens instead of page-local color literals', () => {
    for (const relativePath of [
      ...standardControlSurfaces,
      ...directManipulationSurfaces,
      './InternalToolsNavigation.vue',
    ]) {
      expect(source(relativePath), relativePath).not.toMatch(
        /#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu,
      );
    }
  });
});
