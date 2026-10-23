import { normalizeOutputAppearance } from '../outputAppearance.mjs';
import { selectReceiptSetlistFrame } from './receiptSetlist.mjs';
import { normalizeLyricsPresentationPolicyId } from './lyricsPresentationPolicies.mjs';
import {
  selectArtworkFrame,
  selectLyricsOverlayFrame,
  selectSetlistFrame,
} from './state.mjs';

export const OUTPUT_PREVIEW_SCENARIO_ID = 'showcase-t1-v1';
export const OUTPUT_PREVIEW_NOW_MS = Date.parse('2026-10-20T00:00:00.000Z');
const TRACK = {
  id: 'preview-track',
  title: '合成示範曲',
  artist: '示範演唱者',
};
const CURRENT = '試験の言葉を 並べてみる';
const NEXT = '次の文で 表示を確かめる';

// Small distributable example, authored here. The F1 pressure corpus stays in scripts/.
export function createOutputPreviewSnapshot() {
  return {
    version: 2,
    revision: 0,
    generatedAt: '2026-10-20T00:00:00.000Z',
    displayDelayMs: 0,
    playback: {
      status: 'paused',
      positionMs: 5000,
      durationMs: 32000,
      rate: 1,
      track: { ...TRACK },
    },
    queue: {
      sourceName: '示範場次',
      items: [
        {
          state: 'played',
          track: {
            id: 'preview-history-a',
            title: '已唱示範一',
            artist: '示範演唱者',
          },
        },
        {
          state: 'played',
          track: {
            id: 'preview-history-b',
            title: '已唱示範二',
            artist: '示範演唱者',
          },
        },
        { state: 'current', track: { ...TRACK } },
        {
          state: 'queued',
          track: {
            id: 'preview-next',
            title: '下一首示範',
            artist: '示範演唱者',
          },
        },
      ],
    },
    lyrics: {
      trackId: TRACK.id,
      source: { language: 'ja' },
      synced: true,
      offsetMs: 0,
      activeLineIndex: 0,
      lines: [
        { lineId: 'preview-line-a', text: CURRENT, startMs: 0, endMs: 8000 },
        { lineId: 'preview-line-b', text: NEXT, startMs: 8000, endMs: 16000 },
        {
          lineId: 'preview-line-c',
          text: 'これは表示確認の試験文です',
          startMs: 16000,
          endMs: 24000,
        },
      ],
      reading: {
        lines: [
          {
            lineId: 'preview-line-a',
            text: CURRENT,
            segments: [
              { text: '試験', reading: 'しけん' },
              { text: 'の' },
              { text: '言葉', reading: 'ことば' },
              { text: 'を 並べてみる' },
            ],
          },
          { lineId: 'preview-line-b', text: NEXT, segments: [{ text: NEXT }] },
          {
            lineId: 'preview-line-c',
            text: 'これは表示確認の試験文です',
            segments: [{ text: 'これは表示確認の試験文です' }],
          },
        ],
      },
    },
  };
}

function clockLabel(value) {
  const seconds = Math.floor(Math.max(0, value) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// Callers own template/kind allowlists and capture geometry. No filesystem or DOM.
export function createOutputPreviewScene({
  kind = 'lyrics',
  templateId = 'karaoke-stack',
  settings = {},
  snapshot: suppliedSnapshot,
  nowMs = OUTPUT_PREVIEW_NOW_MS,
  scenarioId = suppliedSnapshot
    ? 'supplied-snapshot'
    : OUTPUT_PREVIEW_SCENARIO_ID,
} = {}) {
  if (!['lyrics', 'setlist', 'now-playing'].includes(kind))
    throw new Error('Unsupported preview kind');
  const snapshot = suppliedSnapshot
    ? globalThis.structuredClone(suppliedSnapshot)
    : createOutputPreviewSnapshot();
  if (!suppliedSnapshot && templateId === 'receipt-setlist') {
    const history = Array.from({ length: 12 }, (_, index) => ({
      ordinal: index + 1,
      track: {
        id: `receipt-example-${index}`,
        title:
          index === 10
            ? '這是一首用來驗證兩行上限與省略號的合成長曲名 — Acoustic Live Session'
            : `已唱示範曲 ${index + 1}`,
        ...(index === 9 ? {} : { artist: '示範演唱者' }),
      },
    }));
    snapshot.queue.receipt = { completedCount: 12, history };
    snapshot.queue.items.find((item) => item.state === 'current').track.title =
      '合成示範曲 — 用來確認目前曲目兩行文字佔位與超長省略';
    snapshot.playback.track.title = snapshot.queue.items.find(
      (item) => item.state === 'current',
    ).track.title;
  }
  const appearance = normalizeOutputAppearance(settings, { templateId });
  const lyricsPresentationPolicyId = normalizeLyricsPresentationPolicyId(
    templateId,
    settings?.lyricsPresentationPolicyId,
  );
  const options = {
    nowMs,
    templateId,
    kineticMaterial: appearance.kineticMaterial,
    lyricsPresentationPolicyId,
  };
  const frame =
    kind === 'lyrics'
      ? selectLyricsOverlayFrame(snapshot, options)
      : kind === 'setlist'
        ? templateId === 'receipt-setlist'
          ? selectReceiptSetlistFrame(snapshot)
          : selectSetlistFrame(snapshot)
        : selectArtworkFrame(snapshot, options);
  const lyricsFrame =
    kind === 'lyrics' ? frame : selectLyricsOverlayFrame(snapshot, options);
  const artworkFrame =
    kind === 'now-playing' ? frame : selectArtworkFrame(snapshot, options);
  const items = snapshot.queue?.items ?? [];
  return {
    scenarioId,
    label: '合成固定示例',
    frameTimeMs: nowMs,
    templateId,
    kind,
    snapshot,
    appearance,
    lyricsPresentationPolicyId,
    frame,
    track: { ...(snapshot.playback?.track ?? {}) },
    nextTrack: {
      ...(items.find(({ state }) => state === 'queued')?.track ?? {}),
    },
    sourceName: snapshot.queue?.sourceName ?? '',
    queue: items.map(({ state, track }, index) => ({
      ...track,
      number: String(index + 1).padStart(2, '0'),
      state,
    })),
    lyrics: {
      language: lyricsFrame.language,
      current: lyricsFrame.currentText,
      next: lyricsFrame.nextText,
      lineIndex: lyricsFrame.lineIndex,
      reading: lyricsFrame.currentReading,
      kinetic: {
        material:
          lyricsFrame.kineticPop?.material ?? appearance.kineticMaterial,
        arrangement: appearance.kineticArrangement,
      },
    },
    playback: {
      ...artworkFrame,
      elapsed: clockLabel(artworkFrame.positionMs),
      remaining: `-${clockLabel(artworkFrame.durationMs - artworkFrame.positionMs)}`,
    },
  };
}
