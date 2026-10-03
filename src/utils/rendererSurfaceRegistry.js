const createSurfaceDefinition = ({
  entryOwner,
  migrationStatus,
  overlayHostId = null,
  parentSurfaceId = null,
  renderer,
  surfaceId,
  system,
}) =>
  Object.freeze({
    entryOwner,
    migrationStatus,
    overlayHostId,
    parentSurfaceId,
    renderer,
    surfaceId,
    system,
  });

export const UI_SURFACE_REGISTRY = Object.freeze({
  'app-shell': createSurfaceDefinition({
    entryOwner: 'src/main.js',
    migrationStatus: 'registered-v2',
    overlayHostId: 'app-shell-overlay',
    renderer: 'main',
    surfaceId: 'app-shell',
    system: 'v2',
  }),
  'app-shell-overlay': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v2',
    parentSurfaceId: 'app-shell',
    renderer: 'main',
    surfaceId: 'app-shell-overlay',
    system: 'v2',
  }),
  'app-folder': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v2',
    overlayHostId: 'app-folder-overlay',
    parentSurfaceId: 'app-shell',
    renderer: 'main',
    surfaceId: 'app-folder',
    system: 'v2',
  }),
  'app-folder-overlay': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v2',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'app-folder-overlay',
    system: 'v2',
  }),
  setlist: createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v1',
    overlayHostId: 'setlist-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'setlist',
    system: 'v1',
  }),
  'setlist-overlay': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v1',
    parentSurfaceId: 'setlist',
    renderer: 'main',
    surfaceId: 'setlist-overlay',
    system: 'v1',
  }),
  lyrics: createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v1',
    overlayHostId: 'lyrics-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'lyrics',
    system: 'v1',
  }),
  'lyrics-overlay': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v1',
    parentSurfaceId: 'lyrics',
    renderer: 'main',
    surfaceId: 'lyrics-overlay',
    system: 'v1',
  }),
  output: createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v1',
    overlayHostId: 'output-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'output',
    system: 'v1',
  }),
  'output-overlay': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v1',
    parentSurfaceId: 'output',
    renderer: 'main',
    surfaceId: 'output-overlay',
    system: 'v1',
  }),
  import: createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v1',
    overlayHostId: 'import-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'import',
    system: 'v1',
  }),
  'import-overlay': createSurfaceDefinition({
    entryOwner: 'src/App.vue',
    migrationStatus: 'registered-v1',
    parentSurfaceId: 'import',
    renderer: 'main',
    surfaceId: 'import-overlay',
    system: 'v1',
  }),
  'app-utility': createSurfaceDefinition({
    entryOwner: 'src/components/layout/AppUtilityFrame.vue',
    migrationStatus: 'registered-v1',
    overlayHostId: 'app-utility-overlay',
    parentSurfaceId: 'app-shell',
    renderer: 'main',
    surfaceId: 'app-utility',
    system: 'v1',
  }),
  'app-utility-overlay': createSurfaceDefinition({
    entryOwner: 'src/components/layout/AppUtilityFrame.vue',
    migrationStatus: 'registered-v1',
    parentSurfaceId: 'app-utility',
    renderer: 'main',
    surfaceId: 'app-utility-overlay',
    system: 'v1',
  }),
  performer: createSurfaceDefinition({
    entryOwner: 'src/performer-main.js',
    migrationStatus: 'registered-v1',
    overlayHostId: 'performer-overlay',
    renderer: 'performer',
    surfaceId: 'performer',
    system: 'v1',
  }),
  'performer-overlay': createSurfaceDefinition({
    entryOwner: 'src/performer/PerformerApp.vue',
    migrationStatus: 'registered-v1',
    parentSurfaceId: 'performer',
    renderer: 'performer',
    surfaceId: 'performer-overlay',
    system: 'v1',
  }),
  'visual-review': createSurfaceDefinition({
    entryOwner: 'src/views/VisualSystemView.vue',
    migrationStatus: 'registered-v2',
    overlayHostId: 'visual-review-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'visual-review',
    system: 'v2',
  }),
  'visual-review-overlay': createSurfaceDefinition({
    entryOwner: 'src/views/VisualSystemView.vue',
    migrationStatus: 'registered-v2',
    parentSurfaceId: 'visual-review',
    renderer: 'main',
    surfaceId: 'visual-review-overlay',
    system: 'v2',
  }),
  'internal-tools': createSurfaceDefinition({
    entryOwner: 'src/views/InternalToolsView.vue',
    migrationStatus: 'registered-v2',
    overlayHostId: 'internal-tools-overlay',
    parentSurfaceId: 'app-folder',
    renderer: 'main',
    surfaceId: 'internal-tools',
    system: 'v2',
  }),
  'internal-tools-overlay': createSurfaceDefinition({
    entryOwner: 'src/views/InternalToolsView.vue',
    migrationStatus: 'registered-v2',
    parentSurfaceId: 'internal-tools',
    renderer: 'main',
    surfaceId: 'internal-tools-overlay',
    system: 'v2',
  }),
  'component-lab': createSurfaceDefinition({
    entryOwner: 'prototypes/ui-component-lab/src/App.vue',
    migrationStatus: 'registered-v2',
    overlayHostId: 'component-lab-overlay',
    renderer: 'prototype',
    surfaceId: 'component-lab',
    system: 'v2',
  }),
  'component-lab-overlay': createSurfaceDefinition({
    entryOwner: 'prototypes/ui-component-lab/src/App.vue',
    migrationStatus: 'registered-v2',
    parentSurfaceId: 'component-lab',
    renderer: 'prototype',
    surfaceId: 'component-lab-overlay',
    system: 'v2',
  }),
  'studio-library-prototype': createSurfaceDefinition({
    entryOwner: 'prototypes/studio-library-workspace/index.html',
    migrationStatus: 'registered-v2',
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
  return Object.freeze({
    'data-ui-renderer': definition.renderer,
    'data-ui-surface': definition.surfaceId,
    'data-ui-system': definition.system,
  });
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
    const expected = definition[definitionKey];
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

  return root;
}
