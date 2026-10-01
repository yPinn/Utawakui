import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = fs.readFileSync(
  new URL('./InternalToolsView.vue', import.meta.url),
  'utf8',
);
const appSource = fs.readFileSync(
  new URL('../App.vue', import.meta.url),
  'utf8',
);

function viewSourceFor(filename) {
  return fs.readFileSync(new URL(`./${filename}`, import.meta.url), 'utf8');
}

describe('InternalToolsView', () => {
  it('owns the isolated Token v2 lifetime and restores the previous root scope', () => {
    expect(viewSource).toContain("import '../styles/tokens-v2.css'");
    expect(viewSource).toContain('previousUiSystem = root.dataset.uiSystem');
    expect(viewSource).toContain("root.dataset.uiSystem = 'v2'");
    expect(viewSource).toContain('delete root.dataset.uiSystem');
  });

  it('keeps one classified navigation owner outside the active workbench', () => {
    expect(viewSource).toContain('<InternalToolsNavigation');
    expect(viewSource).toContain('class="internal-tools-view__body"');
    expect(viewSource).toContain('<component :is="activeTool.component"');
  });

  it('keeps the existing direct routes and adds a navigation-only M2 route', () => {
    expect(appSource).toContain("'music-analysis-evaluation'");
    expect(appSource).toContain("f5: 'music-analysis'");
    expect(appSource).toContain("f6: 'diagnostics-workbench'");
    expect(appSource).toContain("f7: 'lyrics-provider-review'");

    expect(viewSourceFor('MusicAnalysisView.vue')).toContain(
      'active-tool-id="music-analysis"',
    );
    expect(viewSourceFor('DiagnosticsWorkbenchView.vue')).toContain(
      'active-tool-id="diagnostics-workbench"',
    );
    expect(viewSourceFor('LyricsProviderReviewView.vue')).toContain(
      'active-tool-id="lyrics-provider-review"',
    );
    expect(viewSourceFor('MusicAnalysisEvaluationView.vue')).toContain(
      'active-tool-id="music-analysis-evaluation"',
    );
  });
});
