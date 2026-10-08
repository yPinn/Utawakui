'use strict';

const fs = require('fs');
const path = require('path');

const FEATURE_DEPENDENCIES_DIRNAME = 'dependencies';
const PROVIDER_RUNTIME_DIRNAME = 'ytdlp';
const PROVIDER_RUNTIME_VERSION_DIRNAME = 'current';
const PYTHON_DIRNAME = 'python';
const SITE_PACKAGES_RELATIVE_PATH = path.join('Lib', 'site-packages');
const BGUTIL_PLUGIN_DIRNAME = 'bgutil-ytdlp-pot-provider-rs';
const ARTIST_PHOTO_YTMUSIC_WORKER_RELATIVE_PATH = path.join(
  'provider',
  'artist_photo_ytmusic_worker.py',
);

function getPathApi(filePath) {
  if (path.posix.isAbsolute(filePath)) return path.posix;
  if (path.win32.isAbsolute(filePath)) return path.win32;
  return path;
}

function buildProviderRuntimePaths(installDir) {
  const pathApi = getPathApi(installDir);
  const pythonDir = pathApi.join(installDir, PYTHON_DIRNAME);
  const sitePackagesDir = pathApi.join(pythonDir, 'Lib', 'site-packages');
  const pluginParentDir = pathApi.join(installDir, 'plugins');
  return {
    installDir,
    manifestPath: pathApi.join(installDir, 'manifest.json'),
    pythonDir,
    pythonPath: pathApi.join(pythonDir, 'python.exe'),
    sitePackagesDir,
    pluginParentDir,
    pluginPackageDir: pathApi.join(pluginParentDir, BGUTIL_PLUGIN_DIRNAME),
    bgutilProviderPath: pathApi.join(installDir, 'bgutil', 'bgutil-pot.exe'),
    cacheDir: pathApi.join(installDir, 'cache'),
  };
}

function getProviderRuntimePaths(userDataDir) {
  const pathApi = getPathApi(userDataDir);
  return buildProviderRuntimePaths(
    pathApi.join(
      userDataDir,
      FEATURE_DEPENDENCIES_DIRNAME,
      PROVIDER_RUNTIME_DIRNAME,
      PROVIDER_RUNTIME_VERSION_DIRNAME,
    ),
  );
}

function resolveArtistPhotoYtMusicWorkerPath({
  isPackaged,
  resourcesPath,
  appPath,
  existsSync = fs.existsSync,
}) {
  const rootPath = isPackaged
    ? resourcesPath
    : typeof appPath === 'string'
      ? getPathApi(appPath).join(appPath, 'resources')
      : null;
  if (!rootPath || !getPathApi(rootPath).isAbsolute(rootPath)) {
    throw new Error('missing artist photo YT Music worker resource root');
  }
  const workerPath = getPathApi(rootPath).join(
    rootPath,
    ...ARTIST_PHOTO_YTMUSIC_WORKER_RELATIVE_PATH.split(/[\\/]/u),
  );
  if (!existsSync(workerPath)) {
    throw new Error('artist photo YT Music worker is missing');
  }
  return workerPath;
}

function findPythonPathFile(paths) {
  try {
    return fs
      .readdirSync(paths.pythonDir)
      .find((name) => /^python\d+._pth$/i.test(name));
  } catch {
    return null;
  }
}

function writePythonPathConfig(paths) {
  const filename = findPythonPathFile(paths);
  if (!filename) return false;
  const filePath = path.join(paths.pythonDir, filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((line, index, list) => {
    return line.length > 0 || index < list.length - 1;
  });
  const normalizedSitePackages = SITE_PACKAGES_RELATIVE_PATH.replaceAll(
    path.sep,
    '/',
  );

  if (!lines.includes(normalizedSitePackages)) {
    const importSiteIndex = lines.findIndex((line) => line === '#import site');
    const insertIndex = importSiteIndex === -1 ? lines.length : importSiteIndex;
    lines.splice(insertIndex, 0, normalizedSitePackages);
  }

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
  return true;
}

function getMissingProviderRuntimeArtifacts(paths, options = {}) {
  const requireManifest = options.requireManifest !== false;
  const checks = [
    ['python executable', paths.pythonPath],
    ['yt-dlp package', path.join(paths.sitePackagesDir, 'yt_dlp')],
    ['ytmusicapi package', path.join(paths.sitePackagesDir, 'ytmusicapi')],
    ['requests package', path.join(paths.sitePackagesDir, 'requests')],
    ['urllib3 package', path.join(paths.sitePackagesDir, 'urllib3')],
    ['certifi package', path.join(paths.sitePackagesDir, 'certifi')],
    [
      'charset-normalizer package',
      path.join(paths.sitePackagesDir, 'charset_normalizer'),
    ],
    ['idna package', path.join(paths.sitePackagesDir, 'idna')],
    [
      'bgutil plugin package',
      path.join(paths.pluginPackageDir, 'yt_dlp_plugins'),
    ],
    ['bgutil provider executable', paths.bgutilProviderPath],
    ...(requireManifest ? [['manifest', paths.manifestPath]] : []),
  ];

  return checks
    .filter(([, artifactPath]) => !fs.existsSync(artifactPath))
    .map(([label]) => label);
}

function isProviderRuntimeInstalled(paths) {
  return getMissingProviderRuntimeArtifacts(paths).length === 0;
}

function ensureBgutilPluginPackageMarkers(paths) {
  const packageDir = path.join(paths.pluginPackageDir, 'yt_dlp_plugins');
  const extractorDir = path.join(packageDir, 'extractor');
  fs.mkdirSync(extractorDir, { recursive: true });
  for (const markerPath of [
    path.join(packageDir, '__init__.py'),
    path.join(extractorDir, '__init__.py'),
  ]) {
    if (!fs.existsSync(markerPath)) {
      fs.writeFileSync(markerPath, '');
    }
  }
}

module.exports = {
  ARTIST_PHOTO_YTMUSIC_WORKER_RELATIVE_PATH,
  BGUTIL_PLUGIN_DIRNAME,
  buildProviderRuntimePaths,
  ensureBgutilPluginPackageMarkers,
  getMissingProviderRuntimeArtifacts,
  getProviderRuntimePaths,
  isProviderRuntimeInstalled,
  resolveArtistPhotoYtMusicWorkerPath,
  writePythonPathConfig,
};
