'use strict';

const {
  normalizeLrclibSearchOptions,
  registerLyricsAcquisitionHandlers,
} = require('./lyrics/acquisitionHandlers');
const { registerLyricsDocumentHandlers } = require('./lyrics/documentHandlers');
const {
  registerLyricsAcousticEstimateHandlers,
} = require('./lyrics/acousticEstimateHandlers');
const { registerLyricsReadingHandlers } = require('./lyrics/readingHandlers');

function registerLyricsHandlers(options) {
  registerLyricsDocumentHandlers(options);
  registerLyricsAcousticEstimateHandlers(options);
  registerLyricsAcquisitionHandlers(options);
  registerLyricsReadingHandlers(options);
}

module.exports = {
  normalizeLrclibSearchOptions,
  registerLyricsHandlers,
};
