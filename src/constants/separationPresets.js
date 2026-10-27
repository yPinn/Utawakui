import recipeCatalog from '../../shared/audioProcessingRecipes.json';

export const SEPARATION_PRESET_OPTIONS = Object.freeze(
  recipeCatalog.recipes
    .filter(({ implemented }) => implemented)
    .map(({ id, label, description, availability }) =>
      Object.freeze({ id, label, description, availability }),
    ),
);

export const DEFAULT_SEPARATION_PRESET_ID = recipeCatalog.defaultRecipeId;
