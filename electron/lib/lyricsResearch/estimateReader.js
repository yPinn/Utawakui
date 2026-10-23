'use strict';
const { loadResearchInput, automaticInputCurrent } = require('./input');
const { loadExperimentalEstimate } = require('./estimates');

function createExperimentalEstimateReader({
  getLibraryDir,
  isEnabled,
  loadInput = loadResearchInput,
  loadEstimate = loadExperimentalEstimate,
  inputCurrent = automaticInputCurrent,
}) {
  return async (trackId, filename) => {
    if (!isEnabled()) return { status: 'disabled' };
    const library = getLibraryDir();
    const input = await loadInput(
      library,
      { trackId, language: 'zh', lineIndex: 0 },
      { filename },
    );
    const stale = () => ({
      status: 'stale',
      reason: 'source-changed',
      sourceRevision: input.sourceRevision,
    });
    if (!isEnabled()) return { status: 'disabled' };
    if (getLibraryDir() !== library || !inputCurrent(library, input))
      return stale();
    const value = loadEstimate(input);
    if (!isEnabled()) return { status: 'disabled' };
    if (getLibraryDir() !== library || !inputCurrent(library, input))
      return stale();
    return { ...value, sourceRevision: input.sourceRevision };
  };
}
module.exports = { createExperimentalEstimateReader };
