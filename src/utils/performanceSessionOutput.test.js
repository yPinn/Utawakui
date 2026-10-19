import { describe, expect, it } from 'vitest';
import { projectPerformanceSessionOutput } from './performanceSessionOutput.js';
import {
  projectQueueOutputDocument,
  projectDynamicOutputState,
} from './outputStreamProjection.js';
import { selectSetlistFrame } from '../../shared/presentation/state.mjs';
import outputProjection from '../../electron/lib/outputProjection.js';

const item = (itemId, progress, extra = {}) => ({
  itemId,
  progress,
  trackId: 'same-track',
  mode: 'library',
  displayTitle: `安排 ${itemId}`,
  displayArtist: '演唱者',
  ...extra,
});
const player = {
  track: { id: 'same-track', title: '原曲名', url: 'private' },
  playbackPhase: 'paused',
  currentTime: 12,
  duration: 120,
};

describe('arrangement public projection', () => {
  it('passes the existing main validation and Browser Source frame without a new wire schema', () => {
    const hub = outputProjection.createOutputProjectionHub({ bootId: 'boot' });
    hub.connectSource('renderer');
    const current = item('current', 'playing');
    const projected = projectPerformanceSessionOutput({
      plan: {
        source: { name: 'Tonight' },
        items: [item('done', 'completed'), current],
      },
      current,
      player,
    });
    const document = projectQueueOutputDocument(projected.queue);
    const dynamic = projectDynamicOutputState({
      player: projected.player,
      queue: {
        reference: { documentId: document.documentId, documentRevision: 1 },
      },
    });
    const envelope = (stream, payload) => ({
      contractVersion: 3,
      bootId: 'boot',
      sourceEpoch: 'epoch',
      revision: 1,
      kind: 'full',
      stream,
      payload,
    });
    expect(
      hub.publish(envelope('queue.document', { document }), 'renderer'),
    ).toBe(true);
    expect(hub.publish(envelope('state.snapshot', dynamic), 'renderer')).toBe(
      true,
    );
    expect(selectSetlistFrame(hub.getProjection().snapshot)).toMatchObject({
      sourceName: 'Tonight',
      current: { title: '安排 current' },
      history: [{ title: '安排 done' }],
    });
  });
  it('publishes committed labels and only completed occurrences, with no draft or private fields', () => {
    const items = [
      item('a', 'completed'),
      item('b', 'skipped'),
      item('c', 'interrupted'),
      item('d', 'playing'),
      item('e', 'queued'),
    ];
    const projection = projectPerformanceSessionOutput({
      plan: { source: { name: '今晚歌單' }, items },
      current: items[3],
      player,
    });
    const document = projectQueueOutputDocument(projection.queue);
    const dynamic = projectDynamicOutputState({ player: projection.player });
    expect(selectSetlistFrame({ queue: document })).toMatchObject({
      sourceName: '今晚歌單',
      current: { title: '安排 d' },
      history: [{ title: '安排 a' }],
    });
    expect(document.items).toHaveLength(2);
    expect(dynamic.playback).toMatchObject({
      status: 'paused',
      positionMs: 12000,
      track: { id: 'same-track', title: '安排 d' },
    });
    expect(JSON.stringify({ document, dynamic })).not.toMatch(
      /private|安排 b|安排 c|安排 e/,
    );
    expect(player.track.title).toBe('原曲名');
  });

  it('does not publish an unconfirmed start, and preserves same-track completed repeats', () => {
    const items = [
      item('a', 'completed'),
      item('b', 'completed'),
      item('c', 'queued'),
    ];
    const projection = projectPerformanceSessionOutput({
      plan: { items },
      current: items[2],
      player,
    });
    expect(projection.queue.historyEntries).toHaveLength(2);
    expect(projection.queue.currentTrack).toBeNull();
    expect(projection.player.track).toBeNull();
  });

  it('projects an explicitly started manual item without claiming audio timing', () => {
    const current = item('manual-1', 'playing', {
      mode: 'manual',
      trackId: null,
    });
    const projection = projectPerformanceSessionOutput({
      plan: { items: [current] },
      current,
      player: { ...player, track: null },
    });
    expect(
      projectDynamicOutputState({ player: projection.player }).playback,
    ).toMatchObject({
      status: 'playing',
      positionMs: 0,
      durationMs: null,
      track: { id: 'manual-1', title: '安排 manual-1' },
    });
  });

  it('keeps completed records when current clears and bounds output to the existing queue contract', () => {
    const items = Array.from({ length: 500 }, (_, i) =>
      item(String(i), 'completed'),
    );
    const document = projectQueueOutputDocument(
      projectPerformanceSessionOutput({ plan: { items }, player }).queue,
    );
    expect(document.items).toHaveLength(100);
    expect(document.items[0].track.title).toBe('安排 400');
    expect(document.items.at(-1).track.title).toBe('安排 499');
  });
});
