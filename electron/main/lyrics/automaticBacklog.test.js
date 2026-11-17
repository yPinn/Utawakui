import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLyricsBacklog } from './automaticBacklog.js';
import { recordAutomaticLyricsAttempt } from '../../lib/library/lyrics.js';
import { nextAutomaticAttempt } from '../../lib/library/lyricsAutomaticAttempts.js';

const NOW = Date.parse('2026-11-16T00:00:00Z');
let dir;

function addTrack(
  id,
  { lyrics = false, title = `Song ${id}`, importedAt = '2026-10-25' } = {},
) {
  const trackDir = path.join(dir, 'tracks', id);
  fs.mkdirSync(trackDir, { recursive: true });
  fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'audio');
  const index = JSON.parse(
    fs.readFileSync(path.join(dir, 'library.json'), 'utf8'),
  );
  index.tracks[id] = { title, artist: 'Artist', duration: 200, importedAt };
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify(index));
  if (lyrics) {
    fs.mkdirSync(path.join(trackDir, 'lyrics'));
    fs.writeFileSync(path.join(trackDir, 'lyrics', 'a.lrc'), '[00:01.00]hi');
  }
  return trackDir;
}

function backlog(overrides = {}) {
  return createLyricsBacklog({
    getLibraryDir: () => dir,
    acquire: vi.fn(),
    isEnabled: () => true,
    now: () => NOW,
    ...overrides,
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-backlog-'));
  fs.mkdirSync(path.join(dir, 'tracks'));
  fs.writeFileSync(
    path.join(dir, 'library.json'),
    JSON.stringify({ version: 1, tracks: {} }),
  );
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('lyrics backlog', () => {
  it('picks a due track without lyrics and skips tracks with sources or no vocals', () => {
    addTrack('with-lyrics', { lyrics: true });
    addTrack('instrumental');
    fs.writeFileSync(
      path.join(dir, 'track-languages.json'),
      JSON.stringify({
        version: 1,
        tracks: {
          instrumental: { audioSha256: 'a'.repeat(64), languages: ['zxx'] },
        },
      }),
    );
    addTrack('missing');
    expect(backlog().pickNext().track).toMatchObject({ id: 'missing' });
  });

  it('waits for the earliest retry when nothing is due', () => {
    const trackDir = addTrack('missing');
    const track = { title: 'Song missing', artist: 'Artist', duration: 200 };
    recordAutomaticLyricsAttempt(
      trackDir,
      nextAutomaticAttempt(null, {
        track,
        result: { reason: 'provider-unavailable' },
        at: NOW - 30 * 60 * 1000,
      }),
    );
    expect(backlog().pickNext()).toEqual({ waitMs: 30 * 60 * 1000 });
  });

  it('does nothing while lyrics are turned off', () => {
    addTrack('missing');
    expect(backlog({ isEnabled: () => false }).pickNext().track).toBe(
      undefined,
    );
  });

  it('acquires one track at a time, refreshes after a save and stops on quit', async () => {
    addTrack('missing');
    const onSaved = vi.fn();
    let instance;
    const acquire = vi.fn(async () => {
      instance.stop();
      return { status: 'saved' };
    });
    const wait = vi.fn(async (_ms, _value, { signal }) => {
      if (signal.aborted) throw new Error('aborted');
    });
    instance = backlog({ acquire, onSaved, wait });
    instance.start();
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(acquire).toHaveBeenCalledOnce();
    expect(acquire.mock.calls[0][0]).toMatchObject({ id: 'missing' });
  });

  it('tries never-attempted tracks first, newest import first, then the oldest retry', () => {
    const retry = addTrack('retry', { importedAt: '2026-11-10' });
    recordAutomaticLyricsAttempt(
      retry,
      nextAutomaticAttempt(null, {
        track: { title: 'Song retry', artist: 'Artist', duration: 200 },
        result: { reason: 'provider-unavailable' },
        at: NOW - 2 * 60 * 60 * 1000,
      }),
    );
    addTrack('older', { importedAt: '2026-10-01' });
    addTrack('newer', { importedAt: '2026-11-01' });
    expect(backlog().pickNext().track).toMatchObject({ id: 'newer' });
  });

  it('wakes from an idle wait when the library changes', async () => {
    let instance;
    const waits = [];
    const wait = vi.fn(
      (ms, _value, { signal }) =>
        new Promise((resolve, reject) => {
          waits.push(ms);
          if (ms === 0) return resolve();
          signal.addEventListener('abort', () => reject(new Error('abort')), {
            once: true,
          });
        }),
    );
    const acquire = vi.fn(async () => {
      instance.stop();
      return { status: 'saved' };
    });
    instance = backlog({ acquire, wait, startDelayMs: 0 });
    instance.start();
    await vi.waitFor(() => expect(waits).toHaveLength(2));
    addTrack('new-download');
    instance.wake();
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledOnce());
    expect(acquire.mock.calls[0][0]).toMatchObject({ id: 'new-download' });
  });
});
