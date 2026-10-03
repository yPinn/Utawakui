import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 1;
const SOURCE_EXTENSIONS = /\.(?:css|js|vue)$/u;
const ROOT_BOUND_V2_RECIPE = /:root\[data-ui-system=['"]v2['"]\]/gu;
const BODY_TELEPORT = /<Teleport\b[^>]*\bto\s*=\s*["']body["']/gu;
const V2_DOCUMENT_WRITER =
  /(?:document\.documentElement|root)\.dataset\.uiSystem\s*=\s*["']v2["']/gu;
const DOCUMENT_SPECIMEN_MARKER =
  /document\.documentElement\.dataset\.(demoActionMenuSource|demoModalSource)\s*=/gu;
const V2_PROTOTYPE_ROOT = /<html\b[^>]*\bdata-ui-system\s*=\s*["']v2["']/isu;
const CROSS_VERSION_FEATURE_PREFIXES = [
  '--ui-lyrics-',
  '--ui-output-preview-',
  '--ui-performer-',
];

const REVIEW_RUNTIME_FILES = new Set([
  'src/views/DemoView.vue',
  'src/views/InternalToolsView.vue',
  'src/views/StudioLibraryPrototypeView.vue',
  'src/views/VisualSystemView.vue',
  'src/constants/uiDemoSections.js',
]);

function projectPath(root, path) {
  return relative(root, path).replaceAll('\\', '/');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .toSorted((left, right) => compareText(left.name, right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

export function tokenDeclarations(source) {
  return new Set(
    [...source.matchAll(/(^|\n)\s*(--ui-[\w-]+)\s*:/gu)].map(
      ([, , token]) => token,
    ),
  );
}

export function tokenReferences(source) {
  return new Set(
    [...source.matchAll(/var\(\s*(--ui-[\w-]+)/gu)].map(([, token]) => token),
  );
}

function isProductionSource(root, path) {
  const pathFromRoot = projectPath(root, path);
  if (!SOURCE_EXTENSIONS.test(pathFromRoot)) return false;
  if (/\.(?:test|spec)\.[^.]+$/u.test(pathFromRoot)) return false;
  if (pathFromRoot.startsWith('src/components/demo/')) return false;
  if (pathFromRoot.startsWith('src/assets/')) return false;
  if (pathFromRoot.startsWith('src/styles/tokens')) return false;
  if (pathFromRoot.startsWith('src/styles/token-v1-')) return false;
  return !REVIEW_RUNTIME_FILES.has(pathFromRoot);
}

function surfaceFor(path) {
  if (path.startsWith('src/performer/')) return 'performer-window';
  if (path.startsWith('src/components/ui/')) return 'shared-ui';
  if (path.startsWith('src/components/layout/') || path === 'src/App.vue') {
    return 'shell';
  }
  if (path.startsWith('src/views/')) return 'page';
  if (path.startsWith('src/components/output/')) return 'output-feature';
  if (path.startsWith('src/components/lyrics/')) return 'lyrics-feature';
  if (path.startsWith('src/components/playback/')) return 'playback-feature';
  if (path.startsWith('src/components/queue/')) return 'queue-feature';
  if (path.startsWith('src/components/playlists/')) return 'library-feature';
  if (path.startsWith('src/components/bgm/')) return 'bgm-feature';
  if (path.startsWith('src/components/performance-session/')) {
    return 'session-feature';
  }
  if (path.startsWith('src/components/')) return 'other-feature';
  if (path.startsWith('src/styles/')) return 'shared-style';
  return 'renderer-other';
}

function collectCountedFiles(root, paths, pattern, filter = () => true) {
  return paths
    .filter(filter)
    .map((path) => {
      const count = occurrences(readFileSync(path, 'utf8'), pattern);
      return count
        ? { file: projectPath(root, path), occurrences: count }
        : null;
    })
    .filter(Boolean)
    .toSorted((left, right) => compareText(left.file, right.file));
}

function buildActivationInventory({ root, sourceFiles, allFiles }) {
  const vueSources = allFiles.filter(
    (path) => path.endsWith('.vue') && !/\.(?:test|spec)\.vue$/u.test(path),
  );
  const productionVueSources = vueSources.filter(
    (path) => !projectPath(root, path).startsWith('src/components/demo/'),
  );
  const rootBoundRecipes = collectCountedFiles(
    root,
    productionVueSources,
    ROOT_BOUND_V2_RECIPE,
  );
  const teleportFiles = collectCountedFiles(
    root,
    vueSources,
    BODY_TELEPORT,
    (path) => projectPath(root, path).startsWith('src/'),
  );
  const demoTeleports = teleportFiles.filter(({ file }) =>
    file.startsWith('src/components/demo/'),
  );
  const productionTeleports = teleportFiles.filter(
    ({ file }) => !file.startsWith('src/components/demo/'),
  );
  const documentSystemWriters = collectCountedFiles(
    root,
    vueSources,
    V2_DOCUMENT_WRITER,
  );
  const documentSpecimenMarkers = vueSources
    .flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return [...source.matchAll(DOCUMENT_SPECIMEN_MARKER)].map(
        ([, marker]) => ({
          file: projectPath(root, path),
          marker,
        }),
      );
    })
    .toSorted((left, right) =>
      compareText(
        `${left.file}\0${left.marker}`,
        `${right.file}\0${right.marker}`,
      ),
    );
  const prototypeDocumentRoots = allFiles
    .filter(
      (path) =>
        projectPath(root, path).startsWith('prototypes/') &&
        path.endsWith('.html') &&
        V2_PROTOTYPE_ROOT.test(readFileSync(path, 'utf8')),
    )
    .map((path) => projectPath(root, path))
    .toSorted();
  const baseSource = readFileSync(resolve(root, 'src/styles/base.css'), 'utf8');
  const baseVisualTokenReferences = [
    ...baseSource.matchAll(/var\(\s*(--ui-[\w-]+)/gu),
  ]
    .map(([, token]) => token)
    .toSorted();
  const generatedInvalidationImports = sourceFiles
    .filter((path) => {
      const pathFromRoot = projectPath(root, path);
      return (
        SOURCE_EXTENSIONS.test(pathFromRoot) &&
        !/\.(?:test|spec)\.[^.]+$/u.test(pathFromRoot) &&
        !pathFromRoot.endsWith('token-v1-invalidation.generated.css') &&
        readFileSync(path, 'utf8').includes(
          'token-v1-invalidation.generated.css',
        )
      );
    })
    .map((path) => projectPath(root, path))
    .toSorted();
  const currentComposable = 'src/composables/useVisualSystemMode.js';
  const reviewComposableReferences = sourceFiles
    .filter((path) => {
      const pathFromRoot = projectPath(root, path);
      return (
        SOURCE_EXTENSIONS.test(pathFromRoot) &&
        !pathFromRoot.startsWith('src/styles/token-v1-') &&
        readFileSync(path, 'utf8').includes('useVisualSystemMode')
      );
    })
    .map((path) => projectPath(root, path))
    .toSorted();
  const v1Tokens = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8');
  const v2Tokens = readFileSync(
    resolve(root, 'src/styles/tokens-v2.css'),
    'utf8',
  );
  const v2TokenNames = tokenDeclarations(v2Tokens);

  return {
    baseVisualTokenReferences,
    crossVersionFeatureTokens: [...tokenDeclarations(v1Tokens)]
      .filter(
        (token) =>
          !v2TokenNames.has(token) &&
          CROSS_VERSION_FEATURE_PREFIXES.some((prefix) =>
            token.startsWith(prefix),
          ),
      )
      .toSorted(),
    documentSpecimenMarkers,
    documentSystemWriters,
    generatedInvalidationImports,
    prototypeDocumentRoots,
    reviewComposable: {
      current: currentComposable,
      references: reviewComposableReferences,
      target: 'src/composables/useVisualReviewMode.js',
    },
    rootBoundRecipeOccurrences: rootBoundRecipes.reduce(
      (total, { occurrences: count }) => total + count,
      0,
    ),
    rootBoundRecipes,
    teleports: {
      demo: demoTeleports,
      demoCount: demoTeleports.reduce(
        (total, { occurrences: count }) => total + count,
        0,
      ),
      production: productionTeleports,
      productionCount: productionTeleports.reduce(
        (total, { occurrences: count }) => total + count,
        0,
      ),
    },
    tokenEntries: {
      rendererImports: {
        main: "import './styles/tokens.css';",
        performer: "import './styles/tokens.css';",
      },
      v1DocumentRootSelectors: occurrences(v1Tokens, /:root/gu),
      v2DocumentRootSelectors: occurrences(
        v2Tokens,
        /:root\[data-ui-system=['"]v2['"]/gu,
      ),
    },
  };
}

export function buildTokenV2MigrationInventory({ root }) {
  const projectRoot = resolve(root);
  const srcRoot = resolve(projectRoot, 'src');
  const prototypeRoot = resolve(projectRoot, 'prototypes');
  const v1TokenPath = resolve(srcRoot, 'styles', 'tokens.css');
  const v2TokenPath = resolve(srcRoot, 'styles', 'tokens-v2.css');
  const v1Tokens = tokenDeclarations(readFileSync(v1TokenPath, 'utf8'));
  const v2Tokens = tokenDeclarations(readFileSync(v2TokenPath, 'utf8'));
  const legacyTokens = [...v1Tokens]
    .filter((token) => !v2Tokens.has(token))
    .toSorted();
  const legacyTokenSet = new Set(legacyTokens);
  const sourceFiles = walk(srcRoot);
  const allFiles = [...sourceFiles, ...walk(prototypeRoot)];
  const references = sourceFiles
    .filter((path) => isProductionSource(projectRoot, path))
    .flatMap((path) => {
      const file = projectPath(projectRoot, path);
      const surface = surfaceFor(file);
      return [...tokenReferences(readFileSync(path, 'utf8'))]
        .filter((token) => legacyTokenSet.has(token))
        .map((token) => ({ file, surface, token }));
    })
    .toSorted((left, right) =>
      compareText(
        `${left.surface}\0${left.file}\0${left.token}`,
        `${right.surface}\0${right.file}\0${right.token}`,
      ),
    );
  const productionFiles = new Set(references.map(({ file }) => file));
  const productionTokens = new Set(references.map(({ token }) => token));

  return {
    schemaVersion: SCHEMA_VERSION,
    declarations: {
      v1: v1Tokens.size,
      v1Only: legacyTokens.length,
      v2: v2Tokens.size,
    },
    production: {
      files: productionFiles.size,
      pairs: references.length,
      references,
      tokens: productionTokens.size,
    },
    legacyTokens,
    activation: buildActivationInventory({
      allFiles,
      root: projectRoot,
      sourceFiles,
    }),
  };
}

export function generatedArtifactPaths(root) {
  const directory = resolve(root, 'src/styles');
  return {
    invalidation: resolve(directory, 'token-v1-invalidation.generated.css'),
    manifest: resolve(directory, 'token-v1-legacy-manifest.generated.json'),
  };
}

export function serializeMigrationManifest(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

export function renderLegacyInvalidationCss(legacyTokens) {
  const declarations = [...legacyTokens]
    .toSorted()
    .map((token) => `  ${token}: initial;`)
    .join('\n');
  return `/* Generated by scripts/token-v2-migration-inventory.mjs. Do not edit. */\n[data-ui-system='v2'] {\n${declarations}\n}\n`;
}

function atomicWrite(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function runTokenV2MigrationInventoryCli({
  argv = process.argv.slice(2),
  root = resolve(import.meta.dirname, '..'),
  stdout = process.stdout,
} = {}) {
  const [mode = '--check', ...extraArguments] = argv;
  if (!['--check', '--write'].includes(mode) || extraArguments.length) {
    throw new Error(
      'Usage: node scripts/token-v2-migration-inventory.mjs [--check|--write]',
    );
  }

  const inventory = buildTokenV2MigrationInventory({ root });
  const paths = generatedArtifactPaths(root);
  const artifacts = [
    [paths.manifest, serializeMigrationManifest(inventory)],
    [paths.invalidation, renderLegacyInvalidationCss(inventory.legacyTokens)],
  ];

  if (mode === '--write') {
    for (const [path, contents] of artifacts) atomicWrite(path, contents);
  } else {
    const stale = artifacts
      .filter(
        ([path, contents]) =>
          !existsSync(path) || readFileSync(path, 'utf8') !== contents,
      )
      .map(([path]) => projectPath(root, path));
    if (stale.length) {
      throw new Error(
        `Token v2 migration artifacts are stale: ${stale.join(', ')}`,
      );
    }
  }

  const summary = {
    declarations: inventory.declarations,
    mode: mode.slice(2),
    production: {
      files: inventory.production.files,
      pairs: inventory.production.pairs,
      tokens: inventory.production.tokens,
    },
  };
  stdout.write(`${JSON.stringify(summary)}\n`);
  return summary;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    runTokenV2MigrationInventoryCli();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
