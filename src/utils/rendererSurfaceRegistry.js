const createSurfaceDefinition = ({
  entryOwner,
  overlayHostId = null,
  parentSurfaceId = null,
  renderer,
  surfaceId,
  system,
}) =>
  Object.freeze({
    entryOwner,
    overlayHostId,
    parentSurfaceId,
    renderer,
    surfaceId,
    system,
  });

export const UI_SURFACE_REGISTRY = Object.freeze({
  'app-shell': createSurfaceDefinition({
    entryOwner: 'src/main.js',
    overlayHostId: 'app-shell-overlay',
    renderer: 'main',
    surfaceId: 'app-shell',
    system: 'v2',
  }),
  'app-shell-overlay': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    parentSurfaceId: 'app-shell',
    renderer: 'main',
    surfaceId: 'app-shell-overlay',
    system: 'v2',
  }),
  'app-folder': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    overlayHostId: 'app-folder-overlay',
    parentSurfaceId: 'app-shell',
    renderer: 'main',
    surfaceId: 'app-folder',
    system: 'v2',
  }),
  'app-folder-overlay': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'app-folder-overlay',
    system: 'v2',
  }),
  library: createSurfaceDefinition({
    entryOwner: 'src/pages/LibraryPage.vue',
    overlayHostId: 'library-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'library',
    system: 'v2',
  }),
  'library-overlay': createSurfaceDefinition({
    entryOwner: 'src/pages/LibraryPage.vue',
    parentSurfaceId: 'library',
    renderer: 'main',
    surfaceId: 'library-overlay',
    system: 'v2',
  }),
  'track-preview': createSurfaceDefinition({
    entryOwner: 'src/components/track/TrackPreviewOverlay.vue',
    overlayHostId: 'track-preview-overlay',
    parentSurfaceId: 'app-shell',
    renderer: 'main',
    surfaceId: 'track-preview',
    system: 'v2',
  }),
  'track-preview-overlay': createSurfaceDefinition({
    entryOwner: 'src/components/track/TrackPreviewOverlay.vue',
    parentSurfaceId: 'track-preview',
    renderer: 'main',
    surfaceId: 'track-preview-overlay',
    system: 'v2',
  }),
  'performance-session-workspace': createSurfaceDefinition({
    entryOwner: 'src/components/performance/PerformanceWorkspace.vue',
    overlayHostId: 'performance-session-workspace-overlay',
    parentSurfaceId: 'performance',
    renderer: 'main',
    surfaceId: 'performance-session-workspace',
    system: 'v2',
  }),
  'performance-session-workspace-overlay': createSurfaceDefinition({
    entryOwner: 'src/components/performance/PerformanceWorkspace.vue',
    parentSurfaceId: 'performance-session-workspace',
    renderer: 'main',
    surfaceId: 'performance-session-workspace-overlay',
    system: 'v2',
  }),
  performance: createSurfaceDefinition({
    entryOwner: 'src/pages/PerformancePage.vue',
    overlayHostId: 'performance-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'performance',
    system: 'v2',
  }),
  'performance-overlay': createSurfaceDefinition({
    entryOwner: 'src/pages/PerformancePage.vue',
    parentSurfaceId: 'performance',
    renderer: 'main',
    surfaceId: 'performance-overlay',
    system: 'v2',
  }),
  lyrics: createSurfaceDefinition({
    entryOwner: 'src/pages/LibraryPage.vue',
    overlayHostId: 'lyrics-overlay',
    parentSurfaceId: 'library',
    renderer: 'main',
    surfaceId: 'lyrics',
    system: 'v2',
  }),
  'lyrics-overlay': createSurfaceDefinition({
    entryOwner: 'src/pages/LibraryPage.vue',
    parentSurfaceId: 'lyrics',
    renderer: 'main',
    surfaceId: 'lyrics-overlay',
    system: 'v2',
  }),
  display: createSurfaceDefinition({
    entryOwner: 'src/pages/DisplayPage.vue',
    overlayHostId: 'display-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'display',
    system: 'v2',
  }),
  'display-overlay': createSurfaceDefinition({
    entryOwner: 'src/pages/DisplayPage.vue',
    parentSurfaceId: 'display',
    renderer: 'main',
    surfaceId: 'display-overlay',
    system: 'v2',
  }),
  import: createSurfaceDefinition({
    entryOwner: 'src/pages/LibraryPage.vue',
    overlayHostId: 'import-overlay',
    parentSurfaceId: 'library',
    renderer: 'main',
    surfaceId: 'import',
    system: 'v2',
  }),
  'import-overlay': createSurfaceDefinition({
    entryOwner: 'src/pages/LibraryPage.vue',
    parentSurfaceId: 'import',
    renderer: 'main',
    surfaceId: 'import-overlay',
    system: 'v2',
  }),
  'app-utility': createSurfaceDefinition({
    entryOwner: 'src/components/layout/AppUtilityPage.vue',
    overlayHostId: 'app-utility-overlay',
    parentSurfaceId: 'app-shell',
    renderer: 'main',
    surfaceId: 'app-utility',
    system: 'v2',
  }),
  'app-utility-overlay': createSurfaceDefinition({
    entryOwner: 'src/components/layout/AppUtilityPage.vue',
    parentSurfaceId: 'app-utility',
    renderer: 'main',
    surfaceId: 'app-utility-overlay',
    system: 'v2',
  }),
  performer: createSurfaceDefinition({
    entryOwner: 'src/performer-main.js',
    overlayHostId: 'performer-overlay',
    renderer: 'performer',
    surfaceId: 'performer',
    system: 'v2',
  }),
  'performer-overlay': createSurfaceDefinition({
    entryOwner: 'src/performer/PerformerApp.vue',
    parentSurfaceId: 'performer',
    renderer: 'performer',
    surfaceId: 'performer-overlay',
    system: 'v2',
  }),
  'visual-review': createSurfaceDefinition({
    entryOwner: 'src/views/VisualSystemView.vue',
    overlayHostId: 'visual-review-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'visual-review',
    system: 'v2',
  }),
  'visual-review-overlay': createSurfaceDefinition({
    entryOwner: 'src/views/VisualSystemView.vue',
    parentSurfaceId: 'visual-review',
    renderer: 'main',
    surfaceId: 'visual-review-overlay',
    system: 'v2',
  }),
  'internal-tools': createSurfaceDefinition({
    entryOwner: 'src/views/InternalToolsView.vue',
    overlayHostId: 'internal-tools-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'internal-tools',
    system: 'v2',
  }),
  'internal-tools-overlay': createSurfaceDefinition({
    entryOwner: 'src/views/InternalToolsView.vue',
    parentSurfaceId: 'internal-tools',
    renderer: 'main',
    surfaceId: 'internal-tools-overlay',
    system: 'v2',
  }),
  'component-lab': createSurfaceDefinition({
    entryOwner: 'prototypes/ui-component-lab/src/App.vue',
    overlayHostId: 'component-lab-overlay',
    renderer: 'prototype',
    surfaceId: 'component-lab',
    system: 'v2',
  }),
  'component-lab-overlay': createSurfaceDefinition({
    entryOwner: 'prototypes/ui-component-lab/src/App.vue',
    parentSurfaceId: 'component-lab',
    renderer: 'prototype',
    surfaceId: 'component-lab-overlay',
    system: 'v2',
  }),
  'studio-library-prototype': createSurfaceDefinition({
    entryOwner: 'prototypes/studio-library-workspace/index.html',
    renderer: 'prototype',
    surfaceId: 'studio-library-prototype',
    system: 'v2',
  }),
});

export const RENDERER_SURFACE_REGISTRY = Object.freeze({
  main: UI_SURFACE_REGISTRY['app-shell'],
  performer: UI_SURFACE_REGISTRY.performer,
});

const DATASET_FIELDS = Object.freeze([
  ['uiRenderer', 'renderer'],
  ['uiSurface', 'surfaceId'],
  ['uiSystem', 'system'],
]);

function surfaceDefinition(surfaceId) {
  if (!Object.hasOwn(UI_SURFACE_REGISTRY, surfaceId)) {
    throw new Error(`Unknown UI surface: ${surfaceId}`);
  }
  return UI_SURFACE_REGISTRY[surfaceId];
}

export function registeredSurfaceAttributes(surfaceId) {
  const definition = surfaceDefinition(surfaceId);
  const attributes = {
    'data-ui-renderer': definition.renderer,
    'data-ui-surface': definition.surfaceId,
    'data-ui-system': definition.system,
  };
  if (definition.parentSurfaceId === null) {
    attributes['data-ui-surface-root'] = 'true';
  }
  return Object.freeze(attributes);
}

export function registeredOverlayHostAttributes(surfaceId) {
  const definition = surfaceDefinition(surfaceId);
  if (!definition.overlayHostId) {
    throw new Error(`UI surface ${surfaceId} does not own an overlay host`);
  }
  return Object.freeze({
    id: definition.overlayHostId,
    ...registeredSurfaceAttributes(definition.overlayHostId),
  });
}

export function registeredOverlayHostSelector(surfaceId) {
  return `#${registeredOverlayHostAttributes(surfaceId).id}`;
}

// Window-level layers (modals) must escape any surface stacking context, so
// they mount on the renderer root that owns the injected surface host.
export function rendererRootSurfaceId(overlayHostSelector) {
  let current = Object.values(UI_SURFACE_REGISTRY).find(
    (definition) =>
      definition.overlayHostId &&
      `#${definition.overlayHostId}` === overlayHostSelector,
  );
  if (!current) return null;
  while (current.parentSurfaceId) {
    current = surfaceDefinition(current.parentSurfaceId);
  }
  return current.overlayHostId ? current.surfaceId : null;
}

function registerDatasetValue(root, renderer, datasetKey, expected) {
  const current = root.dataset[datasetKey];
  if (current !== undefined && current !== expected) {
    const attribute = datasetKey.replace(
      /[A-Z]/g,
      (character) => `-${character.toLowerCase()}`,
    );
    throw new Error(
      `Renderer ${renderer} mount root has conflicting data-${attribute}`,
    );
  }
  root.dataset[datasetKey] = expected;
}

export function registerRendererSurfaceRoot(
  renderer,
  documentRef = globalThis.document,
) {
  if (!Object.hasOwn(RENDERER_SURFACE_REGISTRY, renderer)) {
    throw new Error(`Unknown renderer surface: ${renderer}`);
  }
  const definition = RENDERER_SURFACE_REGISTRY[renderer];
  if (!documentRef?.getElementById) {
    throw new Error(`Renderer surface ${renderer} requires a document`);
  }

  const documentRoot = documentRef.documentElement;
  if (
    documentRoot?.dataset &&
    Object.hasOwn(documentRoot.dataset, 'uiSystem')
  ) {
    throw new Error('Document root cannot own data-ui-system');
  }

  const root = documentRef.getElementById('app');
  if (!root) {
    throw new Error(`Renderer ${renderer} mount root #app was not found`);
  }
  if (root === documentRoot || root === documentRef.body) {
    throw new Error(
      `Renderer ${renderer} mount root must be below the document root`,
    );
  }

  for (const [datasetKey, definitionKey] of DATASET_FIELDS) {
    registerDatasetValue(root, renderer, datasetKey, definition[definitionKey]);
  }
  registerDatasetValue(root, renderer, 'uiSurfaceRoot', 'true');

  return root;
}
