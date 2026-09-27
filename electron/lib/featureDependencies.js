'use strict';

const {
  FFMPEG_DEPENDENCY_ID,
  YTDLP_DEPENDENCY_ID,
  SEPARATION_MODEL_DEPENDENCY_IDS,
  getFeatureDependency,
  getFeatureDependencies,
  getFfmpegDependency,
  getYtdlpDependency,
  getSeparationModelDependency,
  getFfmpegPaths,
  getYtdlpPaths,
  getModelDependencyPaths,
  getManagedDependencyInstallDir,
  getManagedDependencyCleanupPaths,
} = require('./featureDependencies/registry');
const { downloadBuffer, sha256 } = require('./featureDependencies/download');
const {
  expandZipArchive,
  validateZipArchiveBuffer,
} = require('./featureDependencies/archive');
const {
  ensureYtdlpDependency,
  getPreparedYtdlpPath,
} = require('./featureDependencies/providerRuntime');
const {
  ensureFfmpegDependency,
  getPreparedFfmpegPath,
  resolveFfmpegRuntime,
} = require('./featureDependencies/ffmpeg');
const {
  ensureModelDependency,
  getPreparedSeparationModelPath,
} = require('./featureDependencies/models');
const {
  listFeatureDependencyStatuses,
  prepareFeatureDependency,
  removeFeatureDependency,
  repairFeatureDependency,
} = require('./featureDependencies/service');

module.exports = {
  FFMPEG_DEPENDENCY_ID,
  YTDLP_DEPENDENCY_ID,
  SEPARATION_MODEL_DEPENDENCY_IDS,
  getFeatureDependency,
  getFeatureDependencies,
  getFfmpegDependency,
  getYtdlpDependency,
  getSeparationModelDependency,
  getFfmpegPaths,
  getYtdlpPaths,
  getModelDependencyPaths,
  getManagedDependencyInstallDir,
  getManagedDependencyCleanupPaths,
  listFeatureDependencyStatuses,
  ensureYtdlpDependency,
  ensureFfmpegDependency,
  ensureModelDependency,
  getPreparedYtdlpPath,
  getPreparedFfmpegPath,
  resolveFfmpegRuntime,
  getPreparedSeparationModelPath,
  prepareFeatureDependency,
  removeFeatureDependency,
  repairFeatureDependency,
  sha256,
  downloadBuffer,
  expandZipArchive,
  validateZipArchiveBuffer,
};
