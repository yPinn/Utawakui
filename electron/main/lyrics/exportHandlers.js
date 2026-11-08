'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { parseFile } = require('music-metadata');
const { atomicWriteExclusiveText } = require('../../lib/atomicWrite');
const { originalMedia } = require('../../lib/performanceSettings/media');
const { loadIndex } = require('../../lib/library/metadataIndex');
const { buildLyricsExport } = require('../../lib/library/lyricsExport');
const { isSafeWindowsFilename } = require('../../lib/textGuards');
const { t } = require('../../lib/i18n');
const {
  normalizeLyricsDocument,
} = require('../../../src/utils/lyricsDocument.js');
const { maxDocumentBytes } = require('../../../shared/lyricsTimingValues.json');

const error = (code = 'LYRICS_SOURCE_UNUSABLE') =>
  Object.assign(new Error(code), { code });
const hash = (text) => createHash('sha256').update(text).digest('hex');

function safeTarget(dir, selectedPath, format) {
  const filename = path.basename(selectedPath);
  if (
    !isSafeWindowsFilename(filename) ||
    path.extname(filename).toLowerCase() !== `.${format}`
  )
    throw error('LYRICS_SOURCE_INVALID');
  const parent = fs.realpathSync(path.dirname(selectedPath));
  const relative = path.relative(
    fs.realpathSync(path.join(dir, 'tracks')),
    parent,
  );
  if (
    !path.isAbsolute(relative) &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`)
  )
    throw error('LYRICS_SOURCE_INVALID');
  return path.join(parent, filename);
}

function registerLyricsExportHandlers({
  ipcMain,
  sources,
  sourceOperation,
  dialog,
  getMainWindow,
}) {
  const previews = new Map();
  const inspect = ({ trackId, filename, session }) =>
    sources.inspect(trackId, filename, session);
  function mediaFor(value) {
    try {
      return originalMedia(value.dir, value.trackId);
    } catch {
      throw error();
    }
  }
  function readPlan(value, intent) {
    const { result } = value;
    if (
      !['current', 'missing'].includes(result.timing.status) ||
      Buffer.byteLength(result.text, 'utf8') > maxDocumentBytes
    )
      throw error();
    const document = normalizeLyricsDocument({
      ...result,
      sourceFingerprint: result.timing.sourceFingerprint,
      normalizerProfileId: result.timing.normalizerProfileId,
    });
    return buildLyricsExport(document.lines, {
      format: intent.format,
      durationMs: intent.durationMs,
      offsetMs: result.source.offsetMs ?? 0,
    });
  }
  function checkPreview(intent) {
    const value = inspect(intent);
    if (mediaFor(value).stamp !== intent.mediaStamp)
      throw error('LYRICS_SOURCE_STALE');
    return value;
  }
  ipcMain.handle(
    'lyrics:preview-export',
    (event, trackId, filename, session, format) =>
      sourceOperation(event, 'preview-export', async () => {
        if (!['lrc', 'srt'].includes(format))
          throw error('LYRICS_SOURCE_INVALID');
        const selection = { trackId, filename, session, format };
        const value = inspect(selection);
        const media = mediaFor(value);
        let durationMs;
        try {
          const metadata = await parseFile(media.file, {
            duration: true,
            skipCovers: true,
          });
          durationMs = Math.round(metadata.format.duration * 1000);
        } catch {
          throw error();
        }
        if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw error();
        const intent = { ...selection, durationMs, mediaStamp: media.stamp };
        const plan = readPlan(checkPreview(intent), intent);
        const needsConfirmation = Object.values(plan.issues).some(
          (value) => value > 0,
        );
        const token = plan.text ? randomUUID() : null;
        if (token) {
          if (previews.size >= 32)
            previews.delete(previews.keys().next().value);
          previews.set(token, {
            ...intent,
            needsConfirmation,
            hash: hash(plan.text),
            expiresAt: Date.now() + 5 * 60_000,
          });
        }
        return {
          token,
          needsConfirmation,
          issues: plan.issues,
          overlapDetails: plan.overlapDetails,
          count: plan.rows.length,
          rows: plan.rows
            .slice(0, 5)
            .map((row) => ({ ...row, text: row.text.slice(0, 160) })),
        };
      }),
  );
  ipcMain.handle('lyrics:save-export', (event, token, confirmed) =>
    sourceOperation(event, 'save-export', async () => {
      const intent = previews.get(token);
      if (
        !intent ||
        intent.expiresAt <= Date.now() ||
        (intent.needsConfirmation && confirmed !== true)
      )
        throw error('LYRICS_SOURCE_STALE');
      const value = checkPreview(intent);
      previews.delete(token);
      const title = loadIndex(value.dir).tracks?.[intent.trackId]?.title;
      const base = typeof title === 'string' ? title.trim().slice(0, 100) : '';
      const filename = `${isSafeWindowsFilename(base) ? base : 'lyrics'}.${intent.format}`;
      const options = {
        title: t('lyricsEditor.export.title'),
        defaultPath: filename,
        filters: [
          { name: intent.format.toUpperCase(), extensions: [intent.format] },
        ],
      };
      const owner = getMainWindow();
      const picked = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (picked.canceled || !picked.filePath) return { status: 'cancelled' };
      const current = checkPreview(intent);
      const plan = readPlan(current, intent);
      if (!plan.text || hash(plan.text) !== intent.hash)
        throw error('LYRICS_SOURCE_STALE');
      const target = safeTarget(current.dir, picked.filePath, intent.format);
      atomicWriteExclusiveText(target, plan.text);
      return { status: 'saved' };
    }),
  );
}

module.exports = { registerLyricsExportHandlers };
