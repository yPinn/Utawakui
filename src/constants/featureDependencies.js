import registry from '../../shared/featureDependencies.json';

export const FEATURE_DEPENDENCIES = Object.freeze(
  registry.dependencies.map((dependency) =>
    Object.freeze({
      ...dependency,
    }),
  ),
);

export const FEATURE_DEPENDENCY_IDS = Object.freeze({
  YTDLP_PROVIDER_TOOL: 'yt-dlp-provider-tool',
  FFMPEG_GYAN_ESSENTIALS: 'ffmpeg-gyan-essentials',
});

export function getFeatureDependencies(featureId) {
  return FEATURE_DEPENDENCIES.filter(
    (dependency) => dependency.featureId === featureId,
  );
}

export function isKnownFeatureDependency(dependencyId) {
  return FEATURE_DEPENDENCIES.some(
    (dependency) => dependency.id === dependencyId,
  );
}
