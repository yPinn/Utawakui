'use strict';

const {
  normalizeLrclibSearchOptions,
  registerLyricsAcquisitionHandlers,
} = require('./lyrics/acquisitionHandlers');
const { registerLyricsDocumentHandlers } = require('./lyrics/documentHandlers');
const { registerLyricsReadingHandlers } = require('./lyrics/readingHandlers');

function registerLyricsHandlers(options) {
  registerLyricsDocumentHandlers(options);
  registerLyricsAcquisitionHandlers(options);
  registerLyricsReadingHandlers(options);
}

module.exports = {
  normalizeLrclibSearchOptions,
  registerLyricsHandlers,
};
