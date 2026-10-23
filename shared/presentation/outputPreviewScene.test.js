import { describe, expect, it } from 'vitest';
import registry from '../outputTemplateValues.json';
import { selectReceiptSetlistFrame } from './receiptSetlist.mjs';
import streamContract from '../outputStreamContract.js';
import outputValues from '../outputContractValues.json';
import { normalizeOutputAppearance } from '../outputAppearance.mjs';
import {
  selectArtworkFrame,
  selectLyricsOverlayFrame,
  selectSetlistFrame,
} from './state.mjs';
import {
  OUTPUT_PREVIEW_SCENARIO_ID,
  OUTPUT_PREVIEW_NOW_MS,
  createOutputPreviewSnapshot,
  createOutputPreviewScene,
} from './outputPreviewScene.mjs';
import { createOutputScenario } from '../../scripts/outputAppearanceBaseline.mjs';

describe('F3 app-owned preview scene', () => {
  it('keeps synthetic reading data valid for the real V3 document boundary', () => {
    const { lyrics } = createOutputPreviewSnapshot();
    const document = {
      documentId: 'preview-document',
      trackId: lyrics.trackId,
      source: lyrics.source,
      granularity: 'T1',
      lines: lyrics.lines,
      reading: lyrics.reading,
    };
    const parsed = streamContract.parseOutputStreamEnvelope(
      {
        contractVersion: outputValues.projectionEnvelopeVersion,
        bootId: 'preview-boot',
        sourceEpoch: 'preview-epoch',
        stream: 'lyrics.document',
        kind: 'full',
        revision: 0,
        payload: { document },
      },
      'preview-boot',
    );
    expect(parsed.payload.document.reading).toEqual(lyrics.reading);
  });
  it('provides a deterministic small synthetic scene without private or provider data', () => {
    const first = createOutputPreviewSnapshot();
    expect(first).toEqual(createOutputPreviewSnapshot());
    expect(Date.parse(first.generatedAt)).toBe(OUTPUT_PREVIEW_NOW_MS);
    expect(first.playback.positionMs).toBe(5000);
    expect(first.playback.track.id).toBe('preview-track');
    expect(JSON.stringify(first)).not.toMatch(
      /https?:|file:|歌詞権利|YOASOBI|韋禮安/,
    );
    first.playback.track.title = 'mutated';
    expect(createOutputPreviewSnapshot().playback.track.title).not.toBe(
      'mutated',
    );
    const reading = first.lyrics.reading.lines[0];
    expect(reading.segments.map(({ text }) => text).join('')).toBe(
      reading.text,
    );
  });

  it.each(Object.entries(registry.templateKinds))(
    '%s uses canonical projections and bounded settings',
    (templateId, kind) => {
      const settings = {
        fontScale: 'large',
        lookAmount: 999,
        kineticMaterial: 'cycle',
        lyricsPresentationPolicyId: 'literal',
      };
      const result = createOutputPreviewScene({ templateId, kind, settings });
      expect(result.scenarioId).toBe(OUTPUT_PREVIEW_SCENARIO_ID);
      expect(result.frameTimeMs).toBe(OUTPUT_PREVIEW_NOW_MS);
      expect(result.appearance).toEqual(
        normalizeOutputAppearance(settings, { templateId }),
      );
      const options = {
        nowMs: result.frameTimeMs,
        templateId,
        kineticMaterial: result.appearance.kineticMaterial,
        lyricsPresentationPolicyId: result.lyricsPresentationPolicyId,
      };
      const expected =
        kind === 'lyrics'
          ? selectLyricsOverlayFrame(result.snapshot, options)
          : kind === 'setlist'
            ? templateId === 'receipt-setlist'
              ? selectReceiptSetlistFrame(result.snapshot)
              : selectSetlistFrame(result.snapshot)
            : selectArtworkFrame(result.snapshot, options);
      expect(result.frame).toEqual(expected);
      expect(result.playback.progress).toBe(5 / 32);
      expect(result.playback.elapsed).toBe('0:05');
      expect(result.playback.remaining).toBe('-0:27');
      expect(result.queue.find(({ state }) => state === 'current').title).toBe(
        result.track.title,
      );
    },
  );

  it('projects the same supplied F1 snapshot and clock without replacing empty live content', () => {
    const input = createOutputScenario('paused');
    const scene = createOutputPreviewScene({
      kind: 'lyrics',
      templateId: 'manga-frame',
      snapshot: input.snapshot,
      nowMs: input.nowMs,
    });
    expect(scene.frame).toEqual(
      selectLyricsOverlayFrame(input.snapshot, {
        nowMs: input.nowMs,
        templateId: 'manga-frame',
      }),
    );
    expect(scene.scenarioId).toBe('supplied-snapshot');
    const empty = createOutputScenario('empty');
    expect(
      createOutputPreviewScene({ snapshot: empty.snapshot, nowMs: empty.nowMs })
        .frame.visible,
    ).toBe(false);
    expect(() => createOutputPreviewScene({ kind: 'private-path' })).toThrow(
      'Unsupported preview kind',
    );
  });
});
