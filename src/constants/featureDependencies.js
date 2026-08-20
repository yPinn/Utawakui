import registry from '../../shared/featureDependencies.json';

export const FEATURE_DEPENDENCIES = Object.freeze(
  registry.dependencies.map((dependency) =>
    Object.freeze({
      ...dependency,
    }),
  ),
);

export function getFeatureDependencies(featureId) {
  return FEATURE_DEPENDENCIES.filter(
    (dependency) => dependency.featureId === featureId,
  );
}
