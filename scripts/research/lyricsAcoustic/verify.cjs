'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  validateAcousticEstimateLines,
} = require('../../../shared/lyricsAcousticEstimate.mjs');
const {
  prepareAcousticPreview,
  selectAcousticPreviewFrame,
} = require('../../../shared/presentation/lyricsAcousticPreview.mjs');

function verifyResults(cases) {
  const checks = [];
  for (const item of cases) {
    const { canonical, estimate } = item;
    const before = JSON.stringify(canonical);
    const lines = validateAcousticEstimateLines(estimate.preview.lines);
    const prepared = prepareAcousticPreview(
      canonical,
      estimate,
      estimate.preview.offsetUsedMs,
    );
    assert.equal(prepared.status, 'ready');
    assert.equal(lines.length, canonical.lines.length);
    for (const [index, line] of lines.entries()) {
      assert.equal(line.text, canonical.lines[index].text);
      if (line.status === 'ready')
        assert.equal(
          line.chunks.map((c) => line.text.slice(c.from, c.to)).join(''),
          line.text,
        );
    }
    const samples = lines
      .filter(
        (line) => Number.isFinite(line.startMs) && Number.isFinite(line.endMs),
      )
      .map((line) => line.startMs + 1);
    for (const positionMs of [...samples, ...samples.toReversed()]) {
      const options = {
        enabled: true,
        positionMs,
        offsetMs: prepared.offsetUsedMs,
      };
      const frame = selectAcousticPreviewFrame(canonical, prepared, options);
      const active = canonical.lines.findLast(
        (line) => line.startMs !== null && line.startMs <= positionMs,
      );
      assert.equal(frame.lineId, active.lineId);
      const disabled = selectAcousticPreviewFrame(canonical, prepared, {
        ...options,
        enabled: false,
      });
      assert.ok(['line-estimate', 'plain'].includes(disabled.timingSource));
      const t2 = structuredClone(canonical);
      const authored = t2.lines.find((line) => line.lineId === active.lineId);
      if (authored.endMs > authored.startMs) {
        authored.segments = [
          {
            segmentId: 'authored-check',
            text: authored.text,
            startMs: authored.startMs,
            endMs: authored.endMs,
          },
        ];
        const t2frame = selectAcousticPreviewFrame(
          t2,
          prepareAcousticPreview(t2, estimate, prepared.offsetUsedMs),
          options,
        );
        assert.equal(t2frame.timingSource, 't2');
        assert.equal(t2frame.chunks.map((c) => c.text).join(''), authored.text);
      }
    }
    assert.equal(
      prepareAcousticPreview(canonical, estimate, prepared.offsetUsedMs + 1)
        .status,
      'stale',
    );
    const changed = structuredClone(canonical);
    changed.lines[0].text += 'x';
    assert.equal(
      prepareAcousticPreview(changed, estimate, prepared.offsetUsedMs).status,
      'stale',
    );
    assert.deepEqual(item.metrics.remainingOwnedPids, []);
    assert.equal(JSON.stringify(canonical), before);
    const texts = new Map();
    for (const line of lines)
      texts.set(line.text, (texts.get(line.text) ?? 0) + 1);
    checks.push({
      id: item.id,
      lines: lines.length,
      textPreserved: true,
      forwardAndBackwardSamples: samples.length * 2,
      t2AndT1Fallback: true,
      offsetAndTextStale: true,
      ownedWorkersClosed: true,
      repeatedOccurrences: [...texts.values()]
        .filter((n) => n > 1)
        .reduce((a, b) => a + b, 0),
    });
  }
  return checks;
}

if (require.main === module) {
  const root = process.argv[2];
  const result = verifyResults(
    JSON.parse(fs.readFileSync(path.join(root, 'results.json'))).cases,
  );
  fs.writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ checks: result }, null, 2),
  );
  console.log(
    JSON.stringify({
      cases: result.length,
      repeatedOccurrences: result.reduce(
        (n, r) => n + r.repeatedOccurrences,
        0,
      ),
      clockSamples: result.reduce((n, r) => n + r.forwardAndBackwardSamples, 0),
    }),
  );
}
module.exports = { verifyResults };
