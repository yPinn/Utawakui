const createRendererSurfaceDefinition = (renderer, surfaceId, entryOwner) =>
  Object.freeze({
    entryOwner,
    migrationStatus: 'registered-v1',
    overlayHostId: null,
    parentSurfaceId: null,
    renderer,
    surfaceId,
    system: 'v1',
  });

export const RENDERER_SURFACE_REGISTRY = Object.freeze({
  main: createRendererSurfaceDefinition('main', 'app-shell', 'src/main.js'),
  performer: createRendererSurfaceDefinition(
    'performer',
    'performer',
    'src/performer-main.js',
  ),
});

const DATASET_FIELDS = Object.freeze([
  ['uiRenderer', 'renderer'],
  ['uiSurface', 'surfaceId'],
  ['uiSystem', 'system'],
]);

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
