import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlaybackPersistence } from './playbackPersistence.js';

const QUEUE = {
  sourceTrackIds: ['track-a'],
  queuedTrackIds: [],
  historyEntries: [],
  currentIsSource: true,
  lastSourceTrackId: 'track-a',
  sourceName: '',
  sourceId: null,
  isShuffle: false,
  orderIds: ['track-a'],
};

describe('playback resume audio-preference migration', () => {
  let userDataDir;
  let service;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-resume-audio-migration-'),
    );
    service = createPlaybackPersistence({ userDataDir });
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('exposes bounded volume and mute only from a valid version-one snapshot', () => {
    fs.writeFileSync(
      path.join(userDataDir, 'playback-resume.json'),
      JSON.stringify({
        version: 1,
        updatedAt: '2026-10-16T00:00:00.000Z',
        currentTrackId: 'track-a',
        positionSeconds: 10,
        volume: 0.72,
        isMuted: true,
        playbackMode: 'sequence',
        queue: QUEUE,
      }),
    );

    expect(service.getLegacyAudioPreferences()).toEqual({
      performanceVolume: 0.72,
      performanceMuted: true,
    });
    expect(service.getResumeSnapshot()).not.toHaveProperty('volume');
    expect(service.getResumeSnapshot()).not.toHaveProperty('isMuted');
  });

  it('writes version-two transport snapshots without audio preferences', () => {
    const saved = service.saveResumeSnapshot({
      currentTrackId: 'track-a',
      positionSeconds: 10,
      playbackMode: 'sequence',
      queue: QUEUE,
      volume: 0.99,
      isMuted: true,
    });

    expect(saved.version).toBe(2);
    expect(saved).not.toHaveProperty('volume');
    expect(saved).not.toHaveProperty('isMuted');
    expect(service.getLegacyAudioPreferences()).toBeNull();
  });
});
