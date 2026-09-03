import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./StudioLibraryPrototypeView.vue', import.meta.url),
  'utf8',
);
const contextViewUrl = new URL(
  './StudioLibraryContextView.vue',
  import.meta.url,
);
const contextSource = existsSync(fileURLToPath(contextViewUrl))
  ? readFileSync(contextViewUrl, 'utf8')
  : '';
const appSource = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
const archiveFrameSource = readFileSync(
  new URL('../components/layout/AppArchiveFrame.vue', import.meta.url),
  'utf8',
);
const sidebarSource = readFileSync(
  new URL('../components/layout/AppPlaylistSidebar.vue', import.meta.url),
  'utf8',
);
const dossierSource = readFileSync(
  new URL('../components/playlists/StudioLibraryDossier.vue', import.meta.url),
  'utf8',
);
const playerBarSource = readFileSync(
  new URL('../components/playback/PlayerBar.vue', import.meta.url),
  'utf8',
);

describe('StudioLibraryPrototypeView development integration', () => {
  it('projects the real library into a native dossier without an iframe', () => {
    expect(source).toContain('import { useLibrary }');
    expect(source).toContain('import { usePlaylists }');
    expect(source).toContain('import { usePlayer }');
    expect(source).toContain('createStudioLibraryPresentation');
    expect(source).toContain('<StudioLibraryDossier');
    expect(source).not.toContain('<iframe');
    expect(source).not.toContain('postMessage');
  });

  it('activates candidate tokens only for the development view lifetime', () => {
    const candidateTokenFile = ['tokens', 'v2.css'].join('-');
    expect(source).toContain(`import '../styles/${candidateTokenFile}';`);
    expect(source).toContain("root.dataset.uiSystem = 'v2'");
    expect(source).toContain('delete root.dataset.uiSystem');
    expect(source).toContain('onUnmounted');
  });

  it('joins the F7 active tab and archive rail to the solid folder material', () => {
    expect(source).toContain(
      ":global(:root[data-ui-system='v2'] .app-tabs__folder--active)",
    );
    expect(source).toContain(
      ":global(:root[data-ui-system='v2'] .app-tabs__row::after)",
    );
    expect(source).toContain('background: var(--ui-color-folder-primary)');
  });

  it('lets internal content keep the Setlist workflow tab visibly selected', () => {
    expect(archiveFrameSource).toContain('tabActiveView');
    expect(archiveFrameSource).toContain(
      ':active-view="tabActiveView || activeView"',
    );
  });

  it('keeps real Sidebar collection changes inside the Visual System comparison view', () => {
    expect(sidebarSource).toContain("activeView.value === 'visual-system'");
    expect(sidebarSource).toContain(
      "visualSystemMode.value === 'studio-library'",
    );
    expect(sidebarSource).toContain("setActiveView('setlist')");
  });

  it('keeps the primary page Dossier-only and projects metadata through the shell context slot', () => {
    expect(source).not.toContain('useStudioLibraryInspector');
    expect(source).not.toContain('StudioLibraryContextInspector');
    expect(contextSource).toContain('useStudioLibraryInspector');
    expect(contextSource).toContain('<StudioLibraryContextInspector');
    expect(contextSource).toContain(':cover-url="presentation.coverUrl"');
    expect(contextSource).toContain(':tracks="presentation.tracks"');
    expect(contextSource).toContain(':can-collage="presentation.canCollage"');
    expect(appSource).toContain('internalContextDefinitions');
    expect(appSource).toContain('#context');
    expect(archiveFrameSource).toContain('<slot name="context" />');
    expect(archiveFrameSource).toContain('app-archive-frame__context');
    expect(dossierSource).not.toContain('StudioLibraryMetadataRail');
  });

  it('keeps the compact context plane temporary while preserving a full-height collapsed rail', () => {
    expect(archiveFrameSource).toContain('position: absolute');
    expect(archiveFrameSource).toContain('@media (max-width: 70rem)');
    expect(contextSource).toContain('StudioLibraryContextInspector');
    const inspectorSource = readFileSync(
      new URL(
        '../components/playlists/StudioLibraryContextInspector.vue',
        import.meta.url,
      ),
      'utf8',
    );
    expect(inspectorSource).toContain('.studio-context-inspector--collapsed');
    expect(inspectorSource).not.toContain('margin-block: auto');
  });

  it('toggles the external context from PlayerBar artwork only while that context exists', () => {
    expect(playerBarSource).toContain('PlayerBarArtwork');
    expect(playerBarSource).toContain("'artworkActivate'");
    expect(appSource).toContain(':artwork-expandable="activeContextAvailable"');
    expect(appSource).toContain(':artwork-expanded="activeContextExpanded"');
    expect(appSource).toContain(':artwork-controls="activeContextControlId"');
    expect(appSource).toContain('@artwork-activate="toggleActiveContext"');
    expect(appSource).toMatch(
      /loadController:\s*\(\) =>\s*import\('\.\/composables\/useStudioLibraryInspector\.js'\)/u,
    );
    expect(appSource).not.toContain(
      "import { useStudioLibraryInspector } from './composables/useStudioLibraryInspector.js';",
    );
    expect(contextSource).not.toContain('defineExpose');
  });
});
