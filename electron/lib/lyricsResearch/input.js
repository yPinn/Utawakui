'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { resolveTrackDir, resolveTrackAudioPath } = require('../library/paths');
const {
  listTrackLyricsSources,
  readTrackLyrics,
} = require('../library/lyrics');
const { loadIndex } = require('../library/metadataIndex');
const {
  prepareAcousticEstimateContext,
} = require('../library/lyricsAcousticEstimates');
const { contained } = require('../lyricsAcoustic/integrity');
const {
  normalizeLyricsDocument,
} = require('../../../src/utils/lyricsDocument.js');
const { validateIntent } = require('./service');
const { isAnalysisLanguage, resolveAnalysisLanguage } = require('./language');
async function loadResearchInput(libraryDir, intent, { filename } = {}) {
  validateIntent(intent);
  const trackDir = resolveTrackDir(libraryDir, intent.trackId);
  if (!trackDir) throw Error('research track missing');
  contained(libraryDir, trackDir);
  const audioPath = resolveTrackAudioPath(libraryDir, intent.trackId);
  if (!audioPath) throw Error('research audio missing');
  contained(libraryDir, audioPath);
  const state = listTrackLyricsSources(trackDir);
  const source = filename
    ? state.sources.find((s) => s.filename === filename)
    : (state.sources.find((s) => s.filename === state.preference?.filename) ??
      state.sources.find(
        (s) => s.language?.split('-')[0] === intent.language,
      ) ??
      state.sources[0]);
  if (!source) throw Error('research lyrics missing');
  const lyricsPath = contained(
    libraryDir,
    path.join(trackDir, 'lyrics', source.filename),
  );
  if (fs.statSync(lyricsPath).size > 2097152)
    throw Error('research lyrics budget');
  const current = readTrackLyrics(libraryDir, intent.trackId, source.filename);
  const context = await prepareAcousticEstimateContext(trackDir, source);
  const canonical = normalizeLyricsDocument({
    ...current,
    sourceFingerprint: context.source.sha256,
  });
  if (
    !canonical.lines.length ||
    canonical.lines.length > 1000 ||
    canonical.lines.some((l) => l.text.length > 2000)
  )
    throw Error('research lines budget');
  const durationMs = Math.round(
    Number(loadIndex(libraryDir).tracks[intent.trackId]?.duration) * 1000,
  );
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    durationMs > 1800000
  )
    throw Error('research duration unavailable');
  return {
    trackDir,
    context,
    selection: JSON.stringify(state),
    source,
    sourceLabel: source.label || source.filename,
    canonical,
    text: current.text,
    audioPath,
    audioFilename: path.basename(audioPath),
    durationMs,
    identity: createHash('sha256')
      .update(JSON.stringify([libraryDir, context, canonical]))
      .digest('hex'),
  };
}
async function loadAutomaticResearchInput(
  libraryDir,
  trackId,
  requestedLanguage = 'auto',
) {
  if (!isAnalysisLanguage(requestedLanguage))
    throw Error('invalid analysis language');
  const trackDir = resolveTrackDir(libraryDir, trackId);
  if (!trackDir) throw Error('research track missing');
  contained(libraryDir, trackDir);
  const state = listTrackLyricsSources(trackDir);
  const preferred = state.sources.find(
    (source) => source.filename === state.preference?.filename,
  );
  const skipped = (reason) => ({ status: 'skipped', reason });
  if (!state.sources.length) return skipped('lyrics-missing');
  function readDocument(source) {
    const file = contained(
      libraryDir,
      path.join(trackDir, 'lyrics', source.filename),
    );
    if (fs.statSync(file).size > 2097152) throw Error('research lyrics budget');
    return normalizeLyricsDocument(
      readTrackLyrics(libraryDir, trackId, source.filename),
    );
  }
  function body(source) {
    return readDocument(source)
      .lines.map((line) => line.text)
      .join('\n');
  }
  const source =
    preferred ??
    state.sources.find(
      (s) => resolveAnalysisLanguage(s.language, '').language,
    ) ??
    state.sources.find(
      (s) => resolveAnalysisLanguage(s.language, body(s)).language,
    ) ??
    state.sources[0];
  const parsed = readDocument(source);
  if (
    !parsed.lines.some(
      (line) =>
        !line.segments?.length &&
        Number.isSafeInteger(line.startMs) &&
        Number.isSafeInteger(line.endMs),
    )
  )
    return skipped(
      parsed.lines.some((line) => line.segments?.length)
        ? 'native-t2'
        : 'untimed-lyrics',
    );
  const resolution = resolveAnalysisLanguage(
    source.language,
    body(source),
    requestedLanguage,
  );
  if (!resolution.language) return skipped(resolution.reason);
  const input = await loadResearchInput(
    libraryDir,
    {
      trackId,
      language: resolution.language,
      lineIndex: 0,
    },
    { filename: source.filename },
  );
  if (input.selection !== JSON.stringify(state))
    throw Error('research source changed');
  if (
    !input.canonical.lines.some(
      (line) =>
        !line.segments?.length &&
        Number.isSafeInteger(line.startMs) &&
        Number.isSafeInteger(line.endMs),
    )
  )
    return skipped(
      input.canonical.lines.some((line) => line.segments?.length)
        ? 'native-t2'
        : 'untimed-lyrics',
    );
  const currentResolution = resolveAnalysisLanguage(
    input.source.language,
    input.canonical.lines.map((line) => line.text).join('\n'),
    requestedLanguage,
  );
  if (!currentResolution.language) return skipped(currentResolution.reason);
  return {
    ...input,
    language: currentResolution.language,
    languageOrigin: currentResolution.origin,
  };
}
function automaticInputCurrent(libraryDir, input) {
  try {
    return (
      path.resolve(libraryDir) === path.resolve(input.trackDir, '../..') &&
      JSON.stringify(listTrackLyricsSources(input.trackDir)) === input.selection
    );
  } catch {
    return false;
  }
}
module.exports = {
  loadResearchInput,
  loadAutomaticResearchInput,
  automaticInputCurrent,
};
