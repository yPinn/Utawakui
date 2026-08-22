'use strict';

const catalog = require('../../../shared/audioProcessingRecipes.json');

const PUBLIC_RECIPE_CATALOG = Object.freeze(
  catalog.recipes.map((recipe) => Object.freeze({ ...recipe })),
);
const DEFAULT_RECIPE_ID = catalog.defaultRecipeId;
const LEGACY_RESULT_DEFINITIONS = Object.freeze(
  catalog.legacyResults.map((result) => Object.freeze({ ...result })),
);

// Engine details stay main-owned. Renderer imports only the product catalog
// above and can never choose a model, path, runtime, or inference parameter.
const ENGINE_RECIPE_DEFINITIONS = Object.freeze({
  quick: Object.freeze({
    id: 'quick',
    engineId: 'onnx-mdx',
    profileId: 'mdx-kara2-v1',
    modelIds: Object.freeze(['kara2']),
    engineRecipeId: 'quick',
  }),
  general: Object.freeze({
    id: 'general',
    engineId: 'onnx-mdx',
    profileId: 'mdx-inst-hq4-v1',
    modelIds: Object.freeze(['inst-hq4']),
    engineRecipeId: 'general',
  }),
});

function findPublicRecipe(recipeId) {
  return PUBLIC_RECIPE_CATALOG.find(({ id }) => id === recipeId) || null;
}

function isRunnableRecipe(recipeId) {
  const productRecipe = findPublicRecipe(recipeId);
  return Boolean(
    productRecipe?.implemented && ENGINE_RECIPE_DEFINITIONS[recipeId],
  );
}

function resolveRecipe(recipeId) {
  const productRecipe = findPublicRecipe(recipeId);
  if (!productRecipe) {
    throw new Error(`unknown audio-processing recipe: ${recipeId}`);
  }
  if (!isRunnableRecipe(recipeId)) {
    throw new Error(`audio-processing recipe is not available: ${recipeId}`);
  }
  return ENGINE_RECIPE_DEFINITIONS[recipeId];
}

function getLegacyResultDefinition(resultId) {
  return LEGACY_RESULT_DEFINITIONS.find(({ id }) => id === resultId) || null;
}

module.exports = {
  PUBLIC_RECIPE_CATALOG,
  DEFAULT_RECIPE_ID,
  LEGACY_RESULT_DEFINITIONS,
  isRunnableRecipe,
  resolveRecipe,
  getLegacyResultDefinition,
};
