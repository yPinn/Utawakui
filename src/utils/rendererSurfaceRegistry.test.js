import { describe, expect, it } from 'vitest';
import {
  RENDERER_SURFACE_REGISTRY,
  UI_SURFACE_REGISTRY,
  registerRendererSurfaceRoot,
  registeredOverlayHostAttributes,
  registeredOverlayHostSelector,
  registeredSurfaceAttributes,
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
  it('defines an immutable v2 Main root while Performer remains v1', () => {
    expect(RENDERER_SURFACE_REGISTRY).toEqual({
      main: {
        entryOwner: 'src/main.js',
        migrationStatus: 'registered-v2',
        overlayHostId: 'app-shell-overlay',
        parentSurfaceId: null,
        renderer: 'main',
        surfaceId: 'app-shell',
        system: 'v2',
      },
      performer: {
        entryOwner: 'src/performer-main.js',
        migrationStatus: 'registered-v1',
        overlayHostId: 'performer-overlay',
        parentSurfaceId: null,
        renderer: 'performer',
        surfaceId: 'performer',
        system: 'v1',
      },
    });
    expect(Object.isFrozen(RENDERER_SURFACE_REGISTRY)).toBe(true);
    expect(Object.isFrozen(RENDERER_SURFACE_REGISTRY.main)).toBe(true);
    expect(Object.isFrozen(RENDERER_SURFACE_REGISTRY.performer)).toBe(true);
  });

  it('registers Folder and Utility as complete v1 child surfaces during cutover', () => {
    for (const surfaceId of ['app-folder', 'app-utility']) {
      const definition = UI_SURFACE_REGISTRY[surfaceId];
      expect(definition).toMatchObject({
        migrationStatus: 'registered-v1',
        parentSurfaceId: 'app-shell',
        renderer: 'main',
        surfaceId,
        system: 'v1',
      });
      expect(registeredOverlayHostAttributes(surfaceId)).toMatchObject({
        id: `${surfaceId}-overlay`,
        'data-ui-renderer': 'main',
        'data-ui-surface': `${surfaceId}-overlay`,
        'data-ui-system': 'v1',
      });
    }
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
      'app-shell',
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
    ['performer', 'performer', 'v1'],
  ])(
    'registers the %s #app root before mount',
    (renderer, surfaceId, system) => {
      const documentRef = createDocument();

      const root = registerRendererSurfaceRoot(renderer, documentRef);

      expect(root).toBe(documentRef.root);
      expect(root.dataset).toEqual({
        uiRenderer: renderer,
        uiSurface: surfaceId,
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
