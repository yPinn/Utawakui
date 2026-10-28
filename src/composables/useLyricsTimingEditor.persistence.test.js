import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useLyricsTimingEditor } from './useLyricsTimingEditor.js';
import { normalizeLyricsDocument } from '../utils/lyricsDocument.js';
import { createLyricsSourceSessions } from '../../electron/lib/library/lyricsSourceSessions.js';
import { createLyricsTimingReview } from '../../electron/lib/library/lyricsTimingReview.js';
import { saveTrackLyricsText } from '../../electron/lib/library/lyrics.js';
import { saveIndexEntry } from '../../electron/lib/library/metadataIndex.js';
let root, sources, review, scope;
const filename = 'main.lrc',
  text = '[00:01.00]前一句\n[00:03.00]這一句\n[00:06.00]下一句';
const editor = useLyricsTimingEditor();
const open = () => sources.open('one', filename);
const args = (opened) => ['one', filename, opened.sourceSession];
function documentFor(a) {
  return normalizeLyricsDocument({
    text,
    source: { filename, kind: 'manual' },
    sourceFingerprint: a.timing.sourceFingerprint,
  });
}
beforeEach(() => {
  fs.mkdirSync(path.resolve('tasks'), { recursive: true });
  root = fs.mkdtempSync(path.resolve('tasks/line-timing-'));
  const track = path.join(root, 'tracks/one');
  fs.mkdirSync(track, { recursive: true });
  fs.writeFileSync(path.join(track, 'audio.wav'), 'original audio');
  saveIndexEntry(root, 'one', { title: 'One' });
  saveTrackLyricsText(track, { filename, kind: 'manual' }, text);
  scope = { dir: root, epoch: 1 };
  sources = createLyricsSourceSessions({
    getContext: () => scope,
    beforeMutation: (value) => review.invalidate(value),
  });
  review = createLyricsTimingReview({ sources });
});
afterEach(() => {
  editor.cancel();
  fs.rmSync(root, { recursive: true, force: true });
});
it('saves the full sentence draft through existing CAS, expires then confirms/revokes a receipt without changing coverage', async () => {
  const a = open(),
    baseline = await review.get(...args(a));
  await review.confirm(...args(a), baseline.token);
  const document = documentFor(a);
  editor.beginLine(document, document.lines[1].lineId, null, a.sourceSession, {
    mode: 'line',
  });
  editor.shiftLine(200);
  const saved = sources.saveTiming(
    'one',
    filename,
    a.timing.sourceFingerprint,
    editor.buildDocument(),
    editor.sourceSession.value,
  );
  expect(saved.document.granularity).toBe('T1');
  expect(saved.document.lines[0]).toMatchObject({
    endMs: 3200,
    endInferred: true,
  });
  expect(saved.document.lines[1]).toMatchObject({ startMs: 3200, endMs: 6200 });
  expect(saved.document.lines[1]).not.toHaveProperty('endInferred');
  const current = open(),
    expired = await review.get(...args(current));
  expect(expired.status).toBe('expired');
  const confirmed = await review.confirm(...args(current), expired.token);
  expect(confirmed).toMatchObject({
    status: 'confirmed',
    coverage: { timed: 3, segmented: 0 },
  });
  const fresh = await review.get(...args(open()));
  expect((await review.revoke(...args(open()), fresh.token)).status).toBe(
    'revoked',
  );
  expect(open().timing.document).toEqual(saved.document);
  sources.saveOffset('one', filename, 500, open().sourceSession);
  editor.cancel();
  expect(open().source.offsetMs).toBe(500);
  expect(open().timing.document.lines[1].startMs).toBe(3200);
});
it('retains a sentence draft after a same-text timing conflict and rejects a stale library scope', () => {
  const a = open(),
    document = documentFor(a);
  editor.beginLine(document, document.lines[1].lineId, null, a.sourceSession, {
    mode: 'line',
  });
  editor.shiftLine(200);
  const other = {
    ...document,
    lines: document.lines.map((line, i) =>
      i === 2 ? { ...line, endMs: 9000 } : line,
    ),
  };
  sources.saveTiming(
    'one',
    filename,
    a.timing.sourceFingerprint,
    other,
    a.sourceSession,
  );
  expect(() =>
    sources.saveTiming(
      'one',
      filename,
      a.timing.sourceFingerprint,
      editor.buildDocument(),
      editor.sourceSession.value,
    ),
  ).toThrow(expect.objectContaining({ code: 'LYRICS_SOURCE_CONFLICT' }));
  expect(editor.draft.value.startMs).toBe(3200);
  expect(editor.canCommit.value).toBe(true);
  scope = { ...scope, epoch: 2 };
  expect(() =>
    sources.saveTiming(
      'one',
      filename,
      a.timing.sourceFingerprint,
      editor.buildDocument(),
      editor.sourceSession.value,
    ),
  ).toThrow();
  expect(editor.draft.value.startMs).toBe(3200);
});
