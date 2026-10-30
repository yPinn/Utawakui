'use strict';

const fs = require('fs');
const path = require('path');
const { createAppError } = require('../appError');
const { FEATURE_IDS } = require('../featureGates');
const { atomicWriteJson, atomicWriteText } = require('../atomicWrite');
const { FFMPEG_DEPENDENCY_ID, YTDLP_DEPENDENCY_ID } = require('./registry');

function writeDependencyNotices(installDir, dependency) {
  const dependencyRole = (() => {
    if (dependency.id === YTDLP_DEPENDENCY_ID) {
      return 'This provider runtime is managed by Utawakui for the provider-flow feature.';
    }
    if (dependency.kind === 'model') {
      return 'This model is managed by Utawakui for the audio-processing-flow feature.';
    }
    return 'This FFmpeg binary is managed by Utawakui for the audio-processing-flow feature.';
  })();
  atomicWriteText(
    path.join(installDir, 'SOURCE.txt'),
    [
      `${dependency.name} ${dependency.version}`,
      `Source: ${dependency.sourceUrl}`,
      dependency.downloadUrl
        ? `Download: ${dependency.downloadUrl}`
        : `Bundled source: ${dependency.bundledRelativePath}`,
      `License: ${dependency.license}`,
      `License info: ${dependency.licenseUrl}`,
      '',
      dependencyRole,
      'It is stored under the current user profile and is removed when Utawakui app data is cleaned.',
      '',
    ].join('\n'),
  );
  atomicWriteText(
    path.join(installDir, 'LICENSE.txt'),
    [
      `${dependency.name} is distributed under ${dependency.license}.`,
      `See ${dependency.licenseUrl} and ${dependency.sourceUrl} for upstream licensing details.`,
      ...(Array.isArray(dependency.artifacts) && dependency.artifacts.length > 0
        ? [
            '',
            'Managed runtime components:',
            ...dependency.artifacts.map((artifact) => {
              const identity = [artifact.name, artifact.version]
                .filter(Boolean)
                .join(' ');
              const license = artifact.license ? ` — ${artifact.license}` : '';
              const licenseUrl = artifact.licenseUrl
                ? ` — ${artifact.licenseUrl}`
                : '';
              return `${identity}${license}${licenseUrl}`;
            }),
          ]
        : []),
      '',
    ].join('\n'),
  );
}

function writeDependencyManifest(manifestPath, dependency, options = {}) {
  atomicWriteJson(manifestPath, {
    id: dependency.id,
    featureId: dependency.featureId,
    name: dependency.name,
    version: dependency.version,
    license: dependency.license,
    sourceUrl: dependency.sourceUrl,
    ...(dependency.downloadUrl ? { downloadUrl: dependency.downloadUrl } : {}),
    ...(Array.isArray(dependency.artifacts)
      ? {
          artifacts: dependency.artifacts.map((artifact) => ({
            role: artifact.role,
            name: artifact.name,
            version: artifact.version,
            ...(artifact.license ? { license: artifact.license } : {}),
            ...(artifact.licenseUrl ? { licenseUrl: artifact.licenseUrl } : {}),
            sourceUrl: artifact.sourceUrl,
            downloadUrl: artifact.downloadUrl,
            sha256: artifact.sha256,
          })),
        }
      : {}),
    ...(dependency.bundledRelativePath
      ? { bundledRelativePath: dependency.bundledRelativePath }
      : {}),
    sha256: dependency.sha256,
    installedAt: (options.now || (() => new Date()))().toISOString(),
    ...(dependency.executableRelativePath
      ? { executableRelativePath: dependency.executableRelativePath }
      : {}),
    ...(dependency.fileRelativePath
      ? { fileRelativePath: dependency.fileRelativePath }
      : {}),
    ...(dependency.modelId ? { modelId: dependency.modelId } : {}),
  });
}

function readDependencyManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function readInstalledAt(manifestPath) {
  const manifest = readDependencyManifest(manifestPath);
  return typeof manifest?.installedAt === 'string'
    ? manifest.installedAt
    : null;
}

function readInstalledVersion(manifestPath) {
  const manifest = readDependencyManifest(manifestPath);
  return typeof manifest?.version === 'string' ? manifest.version : null;
}

function isDependencyUpdateAvailable(dependency, installedVersion) {
  if (!installedVersion || typeof dependency?.version !== 'string') {
    return false;
  }

  if (
    dependency.id === FFMPEG_DEPENDENCY_ID &&
    dependency.version === 'release'
  ) {
    return false;
  }

  return installedVersion !== dependency.version;
}

function createMissingDependencyError(dependency) {
  // Loaded lazily: workers import this module without the UI catalogs.
  const { t } = require('../i18n');
  const isProviderTool = dependency.featureId === FEATURE_IDS.PROVIDER_FLOW;
  return createAppError({
    code: 'FEATURE_DEPENDENCY_MISSING',
    severity: 'warning',
    title: t(
      isProviderTool
        ? 'common.missingDependency.providerTitle'
        : 'common.missingDependency.audioTitle',
    ),
    message: t('common.missingDependency.message', { name: dependency.name }),
    actionLabel: t('common.missingDependency.action'),
    context: {
      featureId: dependency.featureId,
      dependencyId: dependency.id,
    },
  });
}

module.exports = {
  createMissingDependencyError,
  isDependencyUpdateAvailable,
  readInstalledAt,
  readInstalledVersion,
  writeDependencyManifest,
  writeDependencyNotices,
};
