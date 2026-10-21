import { describe, expect, it } from 'vitest';
import {
  RENDERER_SURFACE_REGISTRY,
  UI_SURFACE_REGISTRY,
  registerRendererSurfaceRoot,
  registeredOverlayHostAttributes,
  registeredOverlayHostSelector,
  registeredSurfaceAttributes,
  rendererRootSurfaceId,
} from './rendererSurfaceRegistry.js';

function createDocument({ rootDataset = {}, documentDataset = {} } = {}) {
  const root = { id: 'app', dataset: { ...rootDataset } };
  const documentElement = { dataset: { ...documentDataset } };
  const body = {};
  return {
    body,
    documentElement,
    root,
    getElementById(id) {
      return id === 'app' ? root : null;
    },
  };
}

describe('renderer surface registry', () => {
  it('defines immutable v2 roots for Main and Performer', () => {
    expect(RENDERER_SURFACE_REGISTRY).toEqual({
      main: {
        entryOwner: 'src/main.js',
        overlayHostId: 'app-shell-overlay',
        parentSurfaceId: null,
        renderer: 'main',
        surfaceId: 'app-shell',
        system: 'v2',
      },
      performer: {
        entryOwner: 'src/entries/prompter/main.js',
        overlayHostId: 'performer-overlay',
        parentSurfaceId: null,
        renderer: 'performer',
        surfaceId: 'performer',
        system: 'v2',
      },
    });
    expect(Object.isFrozen(RENDERER_SURFACE_REGISTRY)).toBe(true);
    expect(Object.isFrozen(RENDERER_SURFACE_REGISTRY.main)).toBe(true);
    expect(Object.isFrozen(RENDERER_SURFACE_REGISTRY.performer)).toBe(true);
  });

  it('marks only renderer and standalone prototype roots as paint owners', () => {
    for (const surfaceId of [
      'app-shell',
      'performer',
      'component-lab',
      'studio-library-prototype',
    ]) {
      expect(registeredSurfaceAttributes(surfaceId)).toMatchObject({
        'data-ui-surface-root': 'true',
      });
    }

    for (const surfaceId of [
      'app-folder',
      'library',
      'performance',
      'display',
      'lyrics',
      'import',
      'settings',
      'app-shell-overlay',
    ]) {
      expect(registeredSurfaceAttributes(surfaceId)).not.toHaveProperty(
        'data-ui-surface-root',
      );
    }
  });

  it('registers Settings as a Folder child with its own overlay host', () => {
    expect(UI_SURFACE_REGISTRY['app-folder']).toMatchObject({
      entryOwner: 'src/App.vue',
      parentSurfaceId: 'app-shell',
      renderer: 'main',
      surfaceId: 'app-folder',
      system: 'v2',
    });
    expect(registeredOverlayHostAttributes('app-folder')).toMatchObject({
      id: 'app-folder-overlay',
      'data-ui-renderer': 'main',
      'data-ui-surface': 'app-folder-overlay',
      'data-ui-system': 'v2',
    });
    expect(UI_SURFACE_REGISTRY.settings).toMatchObject({
      entryOwner: 'src/pages/SettingsPage.vue',
      overlayHostId: 'settings-overlay',
      parentSurfaceId: 'app-folder',
      renderer: 'main',
      surfaceId: 'settings',
      system: 'v2',
    });
    expect(registeredOverlayHostAttributes('settings')).toMatchObject({
      id: 'settings-overlay',
      'data-ui-renderer': 'main',
      'data-ui-surface': 'settings-overlay',
      'data-ui-system': 'v2',
    });
    expect(UI_SURFACE_REGISTRY['app-utility']).toBeUndefined();
  });

  it('registers Library and its overlay as one complete v2 surface', () => {
    expect(UI_SURFACE_REGISTRY.library).toMatchObject({
      entryOwner: 'src/pages/LibraryPage.vue',
      overlayHostId: 'library-overlay',
      parentSurfaceId: 'app-folder',
      renderer: 'main',
      surfaceId: 'library',
      system: 'v2',
    });
    expect(registeredOverlayHostAttributes('library')).toMatchObject({
      id: 'library-overlay',
      'data-ui-renderer': 'main',
      'data-ui-surface': 'library-overlay',
      'data-ui-system': 'v2',
    });
    expect(UI_SURFACE_REGISTRY['library-overlay'].entryOwner).toBe(
      'src/pages/LibraryPage.vue',
    );
  });

  it('registers Performance and its overlay as one complete v2 surface', () => {
    expect(UI_SURFACE_REGISTRY.performance).toMatchObject({
      entryOwner: 'src/pages/PerformancePage.vue',
      overlayHostId: 'performance-overlay',
      parentSurfaceId: 'app-folder',
      renderer: 'main',
      surfaceId: 'performance',
      system: 'v2',
    });
    expect(registeredOverlayHostAttributes('performance')).toMatchObject({
      id: 'performance-overlay',
      'data-ui-renderer': 'main',
      'data-ui-surface': 'performance-overlay',
      'data-ui-system': 'v2',
    });
  });

  it('registers Display and its overlay as one complete v2 surface', () => {
    expect(UI_SURFACE_REGISTRY.display).toMatchObject({
      entryOwner: 'src/pages/DisplayPage.vue',
      overlayHostId: 'display-overlay',
      parentSurfaceId: 'app-folder',
      renderer: 'main',
      surfaceId: 'display',
      system: 'v2',
    });
    expect(registeredOverlayHostAttributes('display')).toMatchObject({
      id: 'display-overlay',
      'data-ui-renderer': 'main',
      'data-ui-surface': 'display-overlay',
      'data-ui-system': 'v2',
    });
  });

  it('registers Lyrics and its overlay as one complete v2 surface', () => {
    expect(UI_SURFACE_REGISTRY.lyrics).toMatchObject({
      entryOwner: 'src/pages/LibraryPage.vue',
      overlayHostId: 'lyrics-overlay',
      parentSurfaceId: 'library',
      renderer: 'main',
      surfaceId: 'lyrics',
      system: 'v2',
    });
    expect(registeredOverlayHostAttributes('lyrics')).toMatchObject({
      id: 'lyrics-overlay',
      'data-ui-renderer': 'main',
      'data-ui-surface': 'lyrics-overlay',
      'data-ui-system': 'v2',
    });
  });

  it('registers Import and its overlay as one complete v2 surface', () => {
    expect(UI_SURFACE_REGISTRY.import).toMatchObject({
      entryOwner: 'src/pages/LibraryPage.vue',
      overlayHostId: 'import-overlay',
      parentSurfaceId: 'library',
      renderer: 'main',
      surfaceId: 'import',
      system: 'v2',
    });
    expect(registeredOverlayHostAttributes('import')).toMatchObject({
      id: 'import-overlay',
      'data-ui-renderer': 'main',
      'data-ui-surface': 'import-overlay',
      'data-ui-system': 'v2',
    });
    expect(UI_SURFACE_REGISTRY['import-overlay'].entryOwner).toBe(
      'src/pages/LibraryPage.vue',
    );
  });

  it('registers the Performance Session workspace and overlay as v2', () => {
    expect(UI_SURFACE_REGISTRY['performance-session-workspace']).toMatchObject({
      entryOwner: 'src/components/performance/PerformanceWorkspace.vue',
      overlayHostId: 'performance-session-workspace-overlay',
      parentSurfaceId: 'performance',
      renderer: 'main',
      surfaceId: 'performance-session-workspace',
      system: 'v2',
    });
    expect(
      registeredOverlayHostAttributes('performance-session-workspace'),
    ).toMatchObject({
      id: 'performance-session-workspace-overlay',
      'data-ui-renderer': 'main',
      'data-ui-surface': 'performance-session-workspace-overlay',
      'data-ui-system': 'v2',
    });
  });

  it('resolves any registered overlay host to its renderer root', () => {
    expect(rendererRootSurfaceId('#library-overlay')).toBe('app-shell');
    expect(rendererRootSurfaceId('#performance-overlay')).toBe('app-shell');
    expect(rendererRootSurfaceId('#display-overlay')).toBe('app-shell');
    expect(rendererRootSurfaceId('#settings-overlay')).toBe('app-shell');
    expect(rendererRootSurfaceId('#lyrics-overlay')).toBe('app-shell');
    expect(
      rendererRootSurfaceId('#performance-session-workspace-overlay'),
    ).toBe('app-shell');
    expect(rendererRootSurfaceId('#app-shell-overlay')).toBe('app-shell');
    expect(rendererRootSurfaceId('#performer-overlay')).toBe('performer');
    expect(rendererRootSurfaceId('#unknown-overlay')).toBeNull();
    expect(rendererRootSurfaceId(null)).toBeNull();
  });

  it('gives the track preview dialog its own overlay host for nested menus', () => {
    expect(UI_SURFACE_REGISTRY['track-preview']).toMatchObject({
      entryOwner: 'src/components/track/TrackPreviewOverlay.vue',
      overlayHostId: 'track-preview-overlay',
      parentSurfaceId: 'app-shell',
      surfaceId: 'track-preview',
    });
    expect(registeredOverlayHostAttributes('track-preview')).toMatchObject({
      id: 'track-preview-overlay',
      'data-ui-surface': 'track-preview-overlay',
    });
  });

  it('registers review surfaces and their local overlay hosts as explicit boundaries', () => {
    expect(registeredSurfaceAttributes('visual-review')).toEqual({
      'data-ui-renderer': 'main',
      'data-ui-surface': 'visual-review',
      'data-ui-system': 'v2',
    });
    expect(registeredOverlayHostAttributes('visual-review')).toEqual({
      id: 'visual-review-overlay',
      'data-ui-renderer': 'main',
      'data-ui-surface': 'visual-review-overlay',
      'data-ui-system': 'v2',
    });
    expect(registeredOverlayHostSelector('visual-review')).toBe(
      '#visual-review-overlay',
    );
    expect(UI_SURFACE_REGISTRY['visual-review'].parentSurfaceId).toBe(
      'app-folder',
    );
    expect(Object.isFrozen(UI_SURFACE_REGISTRY)).toBe(true);
  });

  it('rejects unknown surfaces and surfaces without an overlay host', () => {
    expect(() => registeredSurfaceAttributes('missing')).toThrow(
      'Unknown UI surface: missing',
    );
    expect(() =>
      registeredOverlayHostAttributes('visual-review-overlay'),
    ).toThrow('UI surface visual-review-overlay does not own an overlay host');
  });

  it.each([
    ['main', 'app-shell', 'v2'],
    ['performer', 'performer', 'v2'],
  ])(
    'registers the %s #app root before mount',
    (renderer, surfaceId, system) => {
      const documentRef = createDocument();

      const root = registerRendererSurfaceRoot(renderer, documentRef);

      expect(root).toBe(documentRef.root);
      expect(root.dataset).toEqual({
        uiRenderer: renderer,
        uiSurface: surfaceId,
        uiSurfaceRoot: 'true',
        uiSystem: system,
      });
      expect(documentRef.documentElement.dataset.uiSystem).toBeUndefined();
    },
  );

  it('accepts an identical repeated registration without creating another owner', () => {
    const documentRef = createDocument({
      rootDataset: {
        uiRenderer: 'main',
        uiSurface: 'app-shell',
        uiSurfaceRoot: 'true',
        uiSystem: 'v2',
      },
    });

    expect(registerRendererSurfaceRoot('main', documentRef)).toBe(
      documentRef.root,
    );
  });

  it.each([
    [
      'an unknown renderer',
      () => registerRendererSurfaceRoot('preview', createDocument()),
      'Unknown renderer surface: preview',
    ],
    [
      'an inherited object key as a renderer',
      () => registerRendererSurfaceRoot('toString', createDocument()),
      'Unknown renderer surface: toString',
    ],
    [
      'a missing document',
      () => registerRendererSurfaceRoot('main', null),
      'Renderer surface main requires a document',
    ],
    [
      'a missing #app mount root',
      () =>
        registerRendererSurfaceRoot('main', {
          body: {},
          documentElement: { dataset: {} },
          getElementById: () => null,
        }),
      'Renderer main mount root #app was not found',
    ],
    [
      'document-root system ownership',
      () =>
        registerRendererSurfaceRoot(
          'main',
          createDocument({ documentDataset: { uiSystem: 'v1' } }),
        ),
      'Document root cannot own data-ui-system',
    ],
    [
      'a document-element mount root',
      () => {
        const documentRef = createDocument();
        documentRef.getElementById = () => documentRef.documentElement;
        return registerRendererSurfaceRoot('main', documentRef);
      },
      'Renderer main mount root must be below the document root',
    ],
    [
      'a body mount root',
      () => {
        const documentRef = createDocument();
        documentRef.getElementById = () => documentRef.body;
        return registerRendererSurfaceRoot('main', documentRef);
      },
      'Renderer main mount root must be below the document root',
    ],
    [
      'a conflicting surface owner',
      () =>
        registerRendererSurfaceRoot(
          'main',
          createDocument({ rootDataset: { uiSurface: 'feature-island' } }),
        ),
      'Renderer main mount root has conflicting data-ui-surface',
    ],
    [
      'a conflicting system owner',
      () =>
        registerRendererSurfaceRoot(
          'main',
          createDocument({ rootDataset: { uiSystem: 'v1' } }),
        ),
      'Renderer main mount root has conflicting data-ui-system',
    ],
    [
      'a conflicting paint owner',
      () =>
        registerRendererSurfaceRoot(
          'main',
          createDocument({ rootDataset: { uiSurfaceRoot: 'false' } }),
        ),
      'Renderer main mount root has conflicting data-ui-surface-root',
    ],
    [
      'a conflicting renderer owner',
      () =>
        registerRendererSurfaceRoot(
          'main',
          createDocument({ rootDataset: { uiRenderer: 'performer' } }),
        ),
      'Renderer main mount root has conflicting data-ui-renderer',
    ],
  ])('rejects %s', (_name, register, message) => {
    expect(register).toThrow(message);
  });
});
