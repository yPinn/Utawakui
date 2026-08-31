'use strict';

const { fingerprintAmllRecord } = require('./amll/candidate.js');
const {
  deleteStoredAmllSource,
  loadStoredAmllArtifactSummary,
  saveAmllRecord,
} = require('./amll/storage.js');
const { analyzeAmllTtml } = require('./amll/ttml.js');

module.exports = {
  analyzeAmllTtml,
  deleteStoredAmllSource,
  fingerprintAmllRecord,
  loadStoredAmllArtifactSummary,
  saveAmllRecord,
};
