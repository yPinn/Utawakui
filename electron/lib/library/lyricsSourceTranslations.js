'use strict';

// Translations that arrive with a saved provider source. They are offered to
// the editor as a draft; nothing here writes the translation sidecar.
const fs = require('node:fs');
const path = require('node:path');
const { loadTrackLyricsManifest } = require('./lyrics');
const { analyzeTtml } = require('../lyricsFormats/ttml');
const {
  languages,
  maxTextLength,
} = require('../../../shared/lyricsTranslationValues.json');

const ARTIFACT_FILENAME = /^betterlyrics-\d{1,20}\.json$/u;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;

// Maps a provider language tag to a supported translation language, or null.
function translationLanguage(tag) {
  const value = String(tag ?? '').toLowerCase();
  if (value === 'en' || value.startsWith('en-')) return 'en';
  if (/^zh-(hant|tw|hk|mo)(-|$)/u.test(value)) return 'zh-TW';
  return null;
}

function readBetterLyricsTtml(trackDir, source) {
  const filename = source?.provider?.artifactFilename;
  if (!ARTIFACT_FILENAME.test(filename ?? '')) return null;
  const file = path.join(trackDir, 'lyrics', 'providers', filename);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.size > MAX_ARTIFACT_BYTES) return null;
  const record = JSON.parse(fs.readFileSync(file, 'utf8'))?.record;
  return typeof record?.ttml === 'string' ? record : null;
}

// Rows bind only when every provider line still matches the saved document.
function loadSourceTranslations(trackDir, filename, document) {
  const source = loadTrackLyricsManifest(trackDir).sources.find(
    (candidate) => candidate.filename === filename,
  );
  if (source?.provider?.name !== 'betterlyrics') return {};
  const record = readBetterLyricsTtml(trackDir, source);
  if (!record) return {};
  const analysis = analyzeTtml(record.ttml, {
    recordId: record.id,
    trackDurationMs: Math.round(record.duration * 1000),
  });
  const lines = analysis.status === 'ok' ? analysis.document.lines : [];
  if (
    lines.length !== document.lines.length ||
    lines.some((line, index) => line.text !== document.lines[index].text)
  )
    return {};
  const result = {};
  for (const [tag, texts] of Object.entries(analysis.translations)) {
    const language = translationLanguage(tag);
    if (!languages.includes(language) || result[language]) continue;
    const rows = document.lines.flatMap((line, index) => {
      const text = texts[index]?.slice(0, maxTextLength).trim();
      // A line already in the target language gains nothing from a copy.
      return text && text !== line.text.trim()
        ? [{ lineId: line.lineId, original: line.text, text }]
        : [];
    });
    if (rows.length) result[language] = rows;
  }
  return result;
}

module.exports = { loadSourceTranslations, translationLanguage };
