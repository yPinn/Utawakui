import { describe, expect, it } from 'vitest';
import { projectQueueOutputDocument } from '../../src/utils/outputStreamProjection.js';
import {
  parseOutputSnapshot,
  createEmptyOutputSnapshot,
  parseReceiptSetlist,
} from '../outputContract.js';
import {
  receiptRows,
  receiptPageStarts,
  selectReceiptSetlistFrame,
  receiptHistoryAdvanced,
  receiptPageLayout,
} from './receiptSetlist.mjs';
import {
  normalizeOutputAppearance,
  outputAppearanceFieldKeysForTemplate,
} from '../outputAppearance.mjs';
import { projectPerformanceSessionOutput } from '../../src/utils/performanceSessionOutput.js';

const track = (index) => ({
  id: `track-${index}`,
  title: `Song ${index}`,
  artist: 'Artist',
});

describe('receipt setlist presentation and bounded source contract', () => {
  it('keeps total and latest 100 completed records independently of upcoming capacity', () => {
    const queue = projectQueueOutputDocument({
      sourceName: 'Session',
      completedEntries: Array.from({ length: 120 }, (_, index) => ({
        track: track(index + 1),
      })),
      currentTrack: track(121),
      upcomingTracks: Array.from({ length: 100 }, (_, index) =>
        track(index + 200),
      ),
    });
    expect(queue.items.filter(({ state }) => state === 'played')).toHaveLength(
      0,
    );
    expect(queue.receipt.completedCount).toBe(120);
    expect(queue.receipt.history).toHaveLength(100);
    expect(queue.receipt.history[0]).toMatchObject({
      ordinal: 21,
      track: track(21),
    });
    expect(queue.receipt.history.at(-1)).toMatchObject({ ordinal: 120 });
    const snapshot = createEmptyOutputSnapshot();
    snapshot.queue = queue;
    const frame = selectReceiptSetlistFrame(parseOutputSnapshot(snapshot));
    expect(frame.completedCount).toBe(120);
    expect(frame.history.at(-1)).toMatchObject({
      ordinal: 120,
      title: 'Song 120',
    });
    expect(frame.current.title).toBe('Song 121');
  });

  it('rejects null tracks, inconsistent ordinals, oversized history and private fields', () => {
    const valid = {
      completedCount: 2,
      history: [
        { ordinal: 1, track: track(1) },
        { ordinal: 2, track: track(2) },
      ],
    };
    expect(parseReceiptSetlist(valid)).toEqual(valid);
    expect(() =>
      parseReceiptSetlist({ ...valid, completedCount: 1 }),
    ).toThrow();
    expect(() =>
      parseReceiptSetlist({
        ...valid,
        history: [{ ordinal: 0, track: track(1) }],
      }),
    ).toThrow();
    expect(() =>
      parseReceiptSetlist({ ...valid, history: [{ ordinal: 2, track: null }] }),
    ).toThrow();
    expect(() =>
      parseReceiptSetlist({ ...valid, history: [...valid.history].reverse() }),
    ).toThrow();
    expect(() =>
      parseReceiptSetlist({
        ...valid,
        history: Array(101).fill(valid.history[0]),
      }),
    ).toThrow();
    expect(() => parseReceiptSetlist({ ...valid, path: 'private' })).toThrow();
  });

  it('does not classify skipped ordinary queue history as confirmed completion', () => {
    const document = projectQueueOutputDocument({
      historyEntries: [{ track: track(1) }],
      currentTrack: track(2),
    });
    expect(document).not.toHaveProperty('receipt');
    const first = selectReceiptSetlistFrame({ queue: document });
    const next = selectReceiptSetlistFrame({
      queue: projectQueueOutputDocument({
        historyEntries: [{ track: track(1) }, { track: track(2) }],
        currentTrack: track(3),
      }),
    });
    expect(next.countIsComplete).toBe(false);
    expect(receiptHistoryAdvanced(first, next)).toBe(false);
  });

  it('counts a completed final arranged song with no next item, excluding skipped and interrupted items', () => {
    const items = ['completed', 'skipped', 'interrupted'].map(
      (progress, index) => ({
        itemId: `item-${index}`,
        trackId: `track-${index}`,
        progress,
        displayTitle: `Song ${index}`,
        displayArtist: 'Artist',
      }),
    );
    const projection = projectPerformanceSessionOutput({
      plan: { items },
      current: null,
    });
    const receipt = selectReceiptSetlistFrame({
      queue: projectQueueOutputDocument(projection.queue),
    });
    expect(receipt).toMatchObject({
      current: null,
      completedCount: 1,
      countIsComplete: true,
      visible: true,
    });
    expect(receipt.history).toHaveLength(1);
    expect(receipt.history[0].title).toBe('Song 0');
  });

  it('keeps duplicate performances separate and derives both orders without mutation', () => {
    const history = [1, 2, 3].map((ordinal) => ({
      ordinal,
      trackId: 'same',
      title: 'Again',
      artist: '',
    }));
    expect(
      receiptRows({ history }, 'down').map(({ ordinal }) => ordinal),
    ).toEqual([3, 2, 1]);
    expect(
      receiptRows({ history }, 'up').map(({ ordinal }) => ordinal),
    ).toEqual([1, 2, 3]);
    expect(history.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3]);
    expect(
      receiptHistoryAdvanced(
        { sourceName: 'A', completedCount: 2, history: history.slice(0, 2) },
        { sourceName: 'A', completedCount: 3, history },
      ),
    ).toBe(true);
    expect(
      receiptHistoryAdvanced(
        { sourceName: 'A', completedCount: 2, history: history.slice(0, 2) },
        { sourceName: 'B', completedCount: 3, history },
      ),
    ).toBe(false);
    expect(
      receiptHistoryAdvanced(
        { sourceName: 'A', completedCount: 3, history },
        { sourceName: 'A', completedCount: 2, history: history.slice(0, 2) },
      ),
    ).toBe(false);
  });

  it('pages at whole-row boundaries and gives the upward latest anchor first', () => {
    expect(receiptPageStarts(3, 5, 'down')).toEqual([0]);
    expect(receiptPageStarts(13, 5, 'down')).toEqual([0, 5, 8]);
    expect(receiptPageStarts(13, 5, 'up')).toEqual([8, 3, 0]);
    expect(receiptPageStarts(13, 0, 'down')).toEqual([0]);
  });

  it('packs measured single- and two-line rows without clipping or skipping records', () => {
    const heights = [70, 96, 70, 70, 96];
    expect(receiptPageLayout(heights, 240, 'down')).toEqual([
      { y: 0, height: 236 },
      { y: -236, height: 166 },
    ]);
    expect(receiptPageLayout(heights, 240, 'up')).toEqual([
      { y: -166, height: 236 },
      { y: 0, height: 166 },
    ]);
    expect(receiptPageLayout([], 240)).toEqual([{ y: 0, height: 0 }]);
  });

  it('prints the first confirmed completion but settles revised older records', () => {
    const first = { ordinal: 1, trackId: 'a', title: 'One', artist: '' };
    const previous = { sourceName: 'A', completedCount: 0, history: [] };
    const next = { ...previous, completedCount: 1, history: [first] };
    expect(receiptHistoryAdvanced(previous, next)).toBe(true);
    expect(receiptHistoryAdvanced(null, next)).toBe(false);
    expect(
      receiptHistoryAdvanced(next, {
        ...next,
        completedCount: 2,
        history: [
          { ...first, title: 'Revised' },
          { ...first, ordinal: 2 },
        ],
      }),
    ).toBe(false);
    expect(receiptRows(null)).toEqual([]);
  });

  it('falls back to available history without claiming it is a complete session total', () => {
    const frame = selectReceiptSetlistFrame({
      queue: { sourceName: '', items: [{ state: 'played', track: track(1) }] },
    });
    expect(frame).toMatchObject({
      completedCount: 1,
      countIsComplete: false,
      visible: true,
    });
  });

  it('has bounded template-specific controls and defaults to downward printing', () => {
    const options = { templateId: 'receipt-setlist' };
    expect(outputAppearanceFieldKeysForTemplate('receipt-setlist')).toEqual([
      'fontScale',
      'receiptDirection',
      'receiptReview',
      'receiptReviewInterval',
    ]);
    expect(normalizeOutputAppearance({}, options)).toMatchObject({
      receiptDirection: 'down',
      receiptReview: 'on',
      receiptReviewInterval: 15,
    });
    expect(
      normalizeOutputAppearance(
        { receiptDirection: 'sideways', receiptReviewInterval: 9999 },
        options,
      ),
    ).toMatchObject({ receiptDirection: 'down', receiptReviewInterval: 60 });
    expect(outputAppearanceFieldKeysForTemplate('queue-board')).not.toContain(
      'receiptDirection',
    );
  });
});
