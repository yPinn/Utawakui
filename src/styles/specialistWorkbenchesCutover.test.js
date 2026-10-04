import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const internalToolsSource = readSource('../views/InternalToolsView.vue');
const navigationSource = readSource(
  '../components/internal-tools/InternalToolsNavigation.vue',
);
const registrySource = readSource('../utils/rendererSurfaceRegistry.js');
const tokenSource = readSource('./tokens.css');

const specialistConsumerPaths = [
  '../components/analysis/MusicAnalysisBatchPanel.vue',
  '../components/analysis/MusicAnalysisBenchmarkReview.vue',
  '../components/analysis/MusicAnalysisBenchmarkTimeline.vue',
  '../components/analysis/MusicAnalysisJobPanel.vue',
  '../components/analysis/MusicAnalysisReferenceAnnotation.vue',
  '../components/analysis/MusicAnalysisTrackPicker.vue',
  '../components/analysis/MusicStructureSummary.vue',
  '../components/lyrics-provider/LyricsProviderReviewForm.vue',
];

const retiredLegacyAliases = [
  '--ui-line-height-headline',
  '--ui-motion-ease',
  '--ui-motion-fast',
  '--ui-radius',
];

const specialistLegacyTokens = retiredLegacyAliases;

describe('Specialist workbench Token v2 cleanup', () => {
  it('keeps Internal Tools and its overlay as one registered v2 surface', () => {
    expect(registrySource).toMatch(
      /'internal-tools':\s*createSurfaceDefinition\(\{(?=[^}]*overlayHostId:\s*'internal-tools-overlay')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
    );
    expect(registrySource).toMatch(
      /'internal-tools-overlay':\s*createSurfaceDefinition\(\{(?=[^}]*parentSurfaceId:\s*'internal-tools')(?=[^}]*system:\s*'v2')[^}]*\}\)/su,
    );
    expect(internalToolsSource).toContain(
      "provideUiOverlayHost('internal-tools')",
    );
  });

  it('rejects T1-only names across all specialist consumers', () => {
    for (const path of specialistConsumerPaths) {
      const source = readSource(path);
      for (const token of specialistLegacyTokens) {
        expect(source, `${path}: ${token}`).not.toContain(`var(${token})`);
      }
    }

    for (const token of retiredLegacyAliases) {
      expect(tokenSource, token).not.toMatch(new RegExp(`${token}\\s*:`, 'u'));
    }
  });

  it('preserves the four workbench mounts and categorized navigation', () => {
    for (const component of [
      'MusicAnalysisWorkbench',
      'DiagnosticsWorkbench',
      'MusicAnalysisEvaluationWorkbench',
      'LyricsProviderReviewWorkbench',
    ]) {
      expect(internalToolsSource, component).toContain(component);
    }
    expect(internalToolsSource).toContain('<InternalToolsNavigation');
    expect(internalToolsSource).toContain(
      '<component :is="activeTool.component" v-if="activeTool" />',
    );
    expect(navigationSource).toContain(':items="categoryItems"');
    expect(navigationSource).toContain(':items="toolItems"');
    expect(navigationSource).toContain('@update:model-value="selectCategory"');
    expect(navigationSource).toContain('@update:model-value="selectTool"');
    expect(navigationSource).toContain("emit('navigate', firstTool.route)");
    expect(navigationSource).toContain("emit('navigate', route)");
  });

  it('keeps workbench content inside the bounded composition body', () => {
    expect(internalToolsSource).toMatch(
      /\.internal-tools-view\s*\{(?=[^}]*height:\s*100%)(?=[^}]*min-height:\s*0)(?=[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\))[^}]*\}/su,
    );
    expect(internalToolsSource).toMatch(
      /\.internal-tools-view__body\s*\{(?=[^}]*min-height:\s*0)(?=[^}]*overflow:\s*hidden)[^}]*\}/su,
    );
  });
});
