import recipeCatalog from '../../shared/audioProcessingRecipes.json';

export const SEPARATION_PRESET_OPTIONS = Object.freeze(
  recipeCatalog.recipes
    .filter(({ implemented }) => implemented)
    .map(({ id, label, description, availability }) =>
      Object.freeze({ id, label, description, availability }),
    ),
);

export const LEGACY_SEPARATION_RESULT_OPTIONS = Object.freeze(
  recipeCatalog.legacyResults.map(({ id, label, artifactFilename }) =>
    Object.freeze({ id, label, artifactFilename, legacy: true }),
  ),
);

export const DEFAULT_SEPARATION_PRESET_ID = recipeCatalog.defaultRecipeId;

export const SEPARATION_PRESET_SELECT_TITLE =
  '品質優先適合多數歌曲；速度優先可縮短等待時間。已產生的舊版結果仍可切換播放，但不再提供再次處理。';

export function isRunnableSeparationRecipe(recipeId) {
  return SEPARATION_PRESET_OPTIONS.some(({ id }) => id === recipeId);
}

export function hasSeparationPreset(recipeId) {
  return (
    isRunnableSeparationRecipe(recipeId) ||
    LEGACY_SEPARATION_RESULT_OPTIONS.some(({ id }) => id === recipeId)
  );
}

export function separationPresetOptionsFor(track) {
  const legacyOptions = LEGACY_SEPARATION_RESULT_OPTIONS.filter(
    ({ id }) => track?.separation?.results?.[id],
  );
  const knownIds = new Set([
    ...SEPARATION_PRESET_OPTIONS.map(({ id }) => id),
    ...legacyOptions.map(({ id }) => id),
  ]);
  const recoveryOptions = Object.entries(
    track?.separation?.results || {},
  ).flatMap(([id, result]) =>
    result?.legacy && !knownIds.has(id)
      ? [{ id, label: `舊版結果：${id}`, legacy: true }]
      : [],
  );
  return [...SEPARATION_PRESET_OPTIONS, ...legacyOptions, ...recoveryOptions];
}
