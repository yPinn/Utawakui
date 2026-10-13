import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const source = readSource('./VisualSystemView.vue');
const appSource = readSource('../App.vue');
const sidebarSource = readSource('../components/layout/AppPlaylistSidebar.vue');
const demoSource = readSource('./DemoView.vue');

describe('VisualSystemView component catalogue boundary', () => {
  it('composes one component catalogue without a second product-page switcher', () => {
    expect(source).toContain("import DemoView from './DemoView.vue';");
    expect(source).toContain('<DemoView />');
    expect(source).not.toContain('UiTabs');
    expect(source).not.toContain('PANELS');
    expect(source).not.toContain('useVisualReviewMode');
    expect(source).not.toContain('Studio Library Candidate');
    expect(source).not.toContain('最終決策板');
  });

  it('removes adopted full-page review implementations and their state adapters', () => {
    for (const relativePath of [
      './StudioLibraryPrototypeView.vue',
      '../components/demo/DemoFinalDecisionBoard.vue',
      '../components/demo/studio-library/StudioLibraryDossier.vue',
      '../components/demo/studio-library/StudioLibraryDossierHeader.vue',
      '../components/demo/studio-library/StudioLibraryTrackTable.vue',
      '../composables/useVisualReviewMode.js',
      '../composables/useStudioLibraryInspector.js',
      '../composables/useStudioLibraryInspectorWidth.js',
      '../utils/studioLibraryPresentation.js',
    ]) {
      expect(
        existsSync(fileURLToPath(new URL(relativePath, import.meta.url))),
      ).toBe(false);
    }
  });

  it('does not keep Studio Candidate navigation exceptions in the app shell', () => {
    expect(appSource).not.toContain('useVisualReviewMode');
    expect(appSource).not.toContain('isStudioLibraryMode');
    expect(appSource).not.toContain('folderActiveDestination');
    expect(appSource).toContain(':active-destination="activeView"');
    expect(sidebarSource).not.toContain('useVisualReviewMode');
    expect(sidebarSource).not.toContain('isStudioLibraryMode');
    expect(sidebarSource).toContain('@activate-library="openLibraryContent"');
  });

  it('keeps the catalogue isolated from production library and playback state', () => {
    for (const owner of [
      'useLibrary',
      'usePlaylists',
      'usePlayer',
      'usePlaybackQueue',
    ]) {
      expect(source).not.toContain(owner);
      expect(demoSource).not.toContain(owner);
    }
  });

  it('gives the single catalogue page one stable full-width workspace track', () => {
    expect(source).toMatch(
      /\.visual-system-view\s*\{[^}]*inline-size:\s*100%;[^}]*block-size:\s*100%;[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/su,
    );
    expect(source).not.toMatch(
      /\.visual-system-view\s*\{[^}]*display:\s*flex;/su,
    );
  });
});
