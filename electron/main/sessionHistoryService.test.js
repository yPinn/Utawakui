import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionHistoryService } from './sessionHistoryService.js';

function fakeObsAdapter({ streaming = false, recording = false } = {}) {
  return {
    getStatus: vi.fn(() => ({
      observed: {
        streaming: { active: streaming },
        recording: { active: recording },
      },
    })),
    requestStreamSnapshot: vi.fn(async () => ({
      timecode: '00:01:02.000',
      durationMs: 62_000,
    })),
    requestRecordSnapshot: vi.fn(async () => ({
      timecode: '00:00:30.000',
      durationMs: 30_000,
    })),
  };
}

function projectionWithTrack(track) {
  return { snapshot: { playback: { track } } };
}

function readSessionFile(dir, sessionId) {
  return JSON.parse(
    fs.readFileSync(
      path.join(dir, 'obs-sessions', `${sessionId}.json`),
      'utf8',
    ),
  );
}

describe('sessionHistoryService', () => {
  let dir;
  let sessionIds;
  let nextSessionId;
  let generateSessionId;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-session-history-'));
    sessionIds = ['sess_1', 'sess_2', 'sess_3'];
    nextSessionId = 0;
    generateSessionId = vi.fn(() => sessionIds[nextSessionId++]);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing while neither stream nor recording is active', async () => {
    const obsAdapter = fakeObsAdapter();
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    await vi.waitFor(() => {
      expect(obsAdapter.getStatus).toHaveBeenCalled();
    });

    expect(service.getCurrentSession()).toBe(null);
    expect(obsAdapter.requestStreamSnapshot).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, 'obs-sessions'))).toBe(false);
  });

  it('starts a session and records the first track while streaming', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      now: () => new Date('2026-09-24T12:00:00.000Z'),
    });

    service.handleProjectionChange(
      projectionWithTrack({
        id: 'track-1',
        title: 'Song A',
        artist: 'Artist A',
      }),
    );
    await vi.waitFor(() => {
      expect(obsAdapter.requestStreamSnapshot).toHaveBeenCalled();
    });

    const session = service.getCurrentSession();
    expect(session.id).toBe('sess_1');
    expect(session.entries).toEqual([
      {
        type: 'track',
        trackId: 'track-1',
        title: 'Song A',
        artist: 'Artist A',
        stream: { timecode: '00:01:02.000', durationMs: 62_000 },
        record: null,
        occurredAt: '2026-09-24T12:00:00.000Z',
      },
    ]);
    expect(readSessionFile(dir, 'sess_1')).toMatchObject({
      sessionId: 'sess_1',
      entries: [{ trackId: 'track-1' }],
    });
    expect(obsAdapter.requestRecordSnapshot).not.toHaveBeenCalled();
  });

  it('ignores repeated projection updates for the same track', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });
    const track = { id: 'track-1', title: 'Song A' };

    service.handleProjectionChange(projectionWithTrack(track));
    await vi.waitFor(() => {
      expect(obsAdapter.requestStreamSnapshot).toHaveBeenCalledOnce();
    });

    service.handleProjectionChange(projectionWithTrack(track));
    service.handleProjectionChange(projectionWithTrack({ ...track }));
    await Promise.resolve();

    expect(obsAdapter.requestStreamSnapshot).toHaveBeenCalledOnce();
    expect(service.getCurrentSession().entries).toHaveLength(1);
  });

  it('appends a second track to the same session file', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      // Disables the skip threshold (tested separately below) so this test
      // only exercises appending, not retraction.
      getSkipThresholdMs: () => 0,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(1),
    );

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-2', title: 'Song B' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(2),
    );

    const session = service.getCurrentSession();
    expect(session.id).toBe('sess_1');
    expect(session.entries.map((entry) => entry.trackId)).toEqual([
      'track-1',
      'track-2',
    ]);
    expect(readSessionFile(dir, 'sess_1').entries).toHaveLength(2);
  });

  it('records both stream and record snapshots when both outputs are active', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true, recording: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    await vi.waitFor(() => {
      expect(service.getCurrentSession()?.entries).toHaveLength(1);
    });

    const [entry] = service.getCurrentSession().entries;
    expect(entry.stream).toEqual({
      timecode: '00:01:02.000',
      durationMs: 62_000,
    });
    expect(entry.record).toEqual({
      timecode: '00:00:30.000',
      durationMs: 30_000,
    });
  });

  it('clears the session when a track change is observed with both outputs inactive', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    await vi.waitFor(() => expect(service.getCurrentSession()).not.toBe(null));

    obsAdapter.getStatus.mockReturnValue({
      observed: {
        streaming: { active: false },
        recording: { active: false },
      },
    });
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-2', title: 'Song B' }),
    );
    await vi.waitFor(() => {
      expect(service.getCurrentSession()).toBe(null);
    });

    // Going live again starts a brand new session rather than reusing sess_1.
    obsAdapter.getStatus.mockReturnValue({
      observed: {
        streaming: { active: true },
        recording: { active: false },
      },
    });
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-3', title: 'Song C' }),
    );
    await vi.waitFor(() => {
      expect(service.getCurrentSession()?.id).toBe('sess_2');
    });
  });

  it('getLatestSession keeps a just-ended session readable after getCurrentSession goes null', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      getSkipThresholdMs: () => 0,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(1),
    );

    obsAdapter.getStatus.mockReturnValue({
      observed: {
        streaming: { active: false },
        recording: { active: false },
      },
    });
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-2', title: 'Song B' }),
    );
    await vi.waitFor(() => expect(service.getCurrentSession()).toBe(null));

    const latest = service.getLatestSession();
    expect(latest.id).toBe('sess_1');
    expect(latest.entries.map((entry) => entry.trackId)).toEqual(['track-1']);
  });

  it('getLatestSession prefers the live session over the last completed one', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    await service.addMarker('note');

    expect(service.getLatestSession().id).toBe('sess_1');
    expect(service.getLatestSession()).toEqual(service.getCurrentSession());
  });

  it('getLatestSession returns null before any session has ever existed', () => {
    const obsAdapter = fakeObsAdapter();
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    expect(service.getLatestSession()).toBe(null);
  });

  it('does nothing when the track clears to null (playback stopped)', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(1),
    );

    service.handleProjectionChange(projectionWithTrack(null));
    await Promise.resolve();

    expect(service.getCurrentSession().entries).toHaveLength(1);
  });

  it('records a null snapshot (not a thrown error) when the OBS request fails', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    obsAdapter.requestStreamSnapshot.mockRejectedValue(new Error('offline'));
    const logger = { error: vi.fn() };
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      logger,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(1),
    );

    expect(service.getCurrentSession().entries[0].stream).toBe(null);
    expect(logger.error).toHaveBeenCalledWith(
      '[session-history] Snapshot request failed',
      expect.any(Error),
    );
  });

  it('serializes rapid, back-to-back track changes into the same order', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      getSkipThresholdMs: () => 0,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-2', title: 'Song B' }),
    );
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-3', title: 'Song C' }),
    );

    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(3),
    );

    expect(
      service.getCurrentSession().entries.map((entry) => entry.trackId),
    ).toEqual(['track-1', 'track-2', 'track-3']);
  });

  it('getCurrentSession returns an independent copy, not a live reference', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(1),
    );

    const snapshot = service.getCurrentSession();
    snapshot.entries.push({ type: 'track', trackId: 'intruder' });

    expect(service.getCurrentSession().entries).toHaveLength(1);
  });
});

// A controllable clock — startedAtMs/occurredAt/elapsed all read through
// this, so tests can simulate "played for exactly N ms" deterministically
// instead of racing real wall-clock time.
function steppingClock(startMs) {
  let clockMs = startMs;
  return {
    now: () => new Date(clockMs),
    advance: (ms) => {
      clockMs += ms;
    },
  };
}

describe('sessionHistoryService skip threshold', () => {
  let dir;
  let generateSessionId;

  beforeEach(() => {
    dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-session-history-threshold-'),
    );
    generateSessionId = vi.fn(() => 'sess_1');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('retracts a track that played shorter than the threshold once the next track starts', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const clock = steppingClock(1_000_000);
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      now: clock.now,
      getSkipThresholdMs: () => 10_000,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Skipped' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(1),
    );

    clock.advance(5_000); // under the 10s threshold
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-2', title: 'Song B' }),
    );
    // Length alone would false-positive on the stale pre-retraction state
    // (still 1, still track-1) before the retract-then-push sequence
    // actually finishes — assert the settled content instead.
    await vi.waitFor(() => {
      const [entry] = service.getCurrentSession()?.entries ?? [];
      expect(entry?.trackId).toBe('track-2');
    });

    expect(service.getCurrentSession().entries).toHaveLength(1);
    expect(readSessionFile(dir, 'sess_1').entries).toHaveLength(1);
  });

  it('retracts a too-short track even when the next track change observes both outputs already inactive', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const clock = steppingClock(1_000_000);
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      now: clock.now,
      getSkipThresholdMs: () => 10_000,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Skipped' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(1),
    );

    clock.advance(5_000); // under the 10s threshold
    obsAdapter.getStatus.mockReturnValue({
      observed: {
        streaming: { active: false },
        recording: { active: false },
      },
    });
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-2', title: 'Song B' }),
    );
    await vi.waitFor(() => {
      expect(service.getCurrentSession()).toBe(null);
    });

    // The session is gone from memory (stream stopped), but the file
    // written while track-1 was pending must not still list it — it never
    // played long enough to count as a real performance.
    expect(readSessionFile(dir, 'sess_1').entries).toHaveLength(0);
  });

  it('keeps a track that played at least the threshold', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const clock = steppingClock(1_000_000);
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      now: clock.now,
      getSkipThresholdMs: () => 10_000,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Kept' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(1),
    );

    clock.advance(10_000); // exactly at the threshold
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-2', title: 'Song B' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(2),
    );

    expect(
      service.getCurrentSession().entries.map((entry) => entry.trackId),
    ).toEqual(['track-1', 'track-2']);
  });

  it('never retracts a marker, and a marker in between does not protect the track from retraction', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const clock = steppingClock(1_000_000);
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      now: clock.now,
      getSkipThresholdMs: () => 10_000,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Skipped' }),
    );
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(1),
    );

    clock.advance(2_000);
    await service.addMarker('mid-song note');
    expect(service.getCurrentSession().entries).toHaveLength(2);

    clock.advance(2_000); // still under 10s of *track* play time
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-2', title: 'Song B' }),
    );
    await vi.waitFor(() => {
      const entries = service.getCurrentSession()?.entries ?? [];
      expect(entries.map((entry) => entry.type)).toEqual(['marker', 'track']);
    });

    const entries = service.getCurrentSession().entries;
    expect(entries[0].label).toBe('mid-song note');
    expect(entries[1].trackId).toBe('track-2');
  });
});

describe('sessionHistoryService markers', () => {
  let dir;
  let generateSessionId;

  beforeEach(() => {
    dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-session-history-markers-'),
    );
    generateSessionId = vi.fn(() => 'sess_1');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null and writes nothing when neither stream nor recording is active', async () => {
    const obsAdapter = fakeObsAdapter();
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    await expect(service.addMarker('note')).resolves.toBe(null);
    expect(service.getCurrentSession()).toBe(null);
    expect(fs.existsSync(path.join(dir, 'obs-sessions'))).toBe(false);
  });

  it('records a marker with a trimmed label and both output snapshots', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true, recording: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      now: () => new Date('2026-09-24T12:00:00.000Z'),
    });

    const entry = await service.addMarker('  talking break  ');

    expect(entry).toEqual({
      type: 'marker',
      label: 'talking break',
      stream: { timecode: '00:01:02.000', durationMs: 62_000 },
      record: { timecode: '00:00:30.000', durationMs: 30_000 },
      occurredAt: '2026-09-24T12:00:00.000Z',
    });
    expect(readSessionFile(dir, 'sess_1').entries).toEqual([entry]);
  });

  it('normalizes a blank or missing label to null', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    const blank = await service.addMarker('   ');
    expect(blank.label).toBe(null);

    const missing = await service.addMarker();
    expect(missing.label).toBe(null);
  });

  it('starts a session for a marker even with no prior track entry', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
    });

    await service.addMarker('opening note');

    expect(service.getCurrentSession().id).toBe('sess_1');
    expect(service.getCurrentSession().entries).toHaveLength(1);
  });

  it('serializes markers and track changes into one consistent order', async () => {
    const obsAdapter = fakeObsAdapter({ streaming: true });
    const service = createSessionHistoryService({
      obsAdapter,
      userDataDir: dir,
      generateSessionId,
      getSkipThresholdMs: () => 0,
    });

    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-1', title: 'Song A' }),
    );
    const markerPromise = service.addMarker('note');
    service.handleProjectionChange(
      projectionWithTrack({ id: 'track-2', title: 'Song B' }),
    );
    await markerPromise;
    await vi.waitFor(() =>
      expect(service.getCurrentSession()?.entries).toHaveLength(3),
    );

    expect(
      service.getCurrentSession().entries.map((entry) => entry.type),
    ).toEqual(['track', 'marker', 'track']);
  });
});
