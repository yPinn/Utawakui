import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkOrganizationHost } from './workOrganizationHost.js';
import { hashAudioFile } from '../../lib/works/trackBinding.js';
import { loadWorks } from '../../lib/works/organization.js';
import { upsertAlbum, loadPlaylists } from '../../lib/playlists.js';

let dir;
beforeEach(() => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/p2-host-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
function audio(id = 'song', content = 'original audio bytes') {
  const target = path.join(dir, 'tracks', id);
  fs.mkdirSync(target, { recursive: true });
  const file = path.join(target, 'audio.mp3');
  fs.writeFileSync(file, content);
  return file;
}
function host(overrides = {}) {
  return createWorkOrganizationHost({
    getDirectory: () => ({ dir, epoch: 0 }),
    notifyChanged: vi.fn(),
    notifyLibraryUpdated: vi.fn(),
    recordDiagnostic: vi.fn(),
    ...overrides,
  });
}

describe('Main work organization host', () => {
  it('publishes a new scope and invalidates the old runtime without creating a store', async () => {
    const notifyChanged = vi.fn();
    const current = { dir, epoch: 0 };
    const instance = host({ getDirectory: () => current, notifyChanged });
    current.epoch = 1;
    instance.invalidate();
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifyChanged).toHaveBeenCalledWith({
      libraryEpoch: 1,
      revision: 0,
    });
    expect(fs.existsSync(path.join(dir, 'works.json'))).toBe(false);
  });

  it('retains recovery failures privately even when notification and diagnostic consumers have closed', async () => {
    fs.writeFileSync(path.join(dir, 'works.json'), '{broken');
    const recordDiagnostic = vi.fn(() => {
      throw new Error('closed logger');
    });
    const instance = host({
      recordDiagnostic,
      notifyChanged: () => {
        throw new Error('closed window');
      },
    });
    expect(() => instance.invalidate()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    await expect(instance.recover()).resolves.toBe(false);
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WORK_ORGANIZATION_RECOVERY_FAILED' }),
    );
    expect(fs.readFileSync(path.join(dir, 'works.json'), 'utf8')).toBe(
      '{broken',
    );
  });

  it('does not create an organization file when no recovery is pending', async () => {
    const { recover } = host();
    await recover();
    expect(fs.existsSync(path.join(dir, 'works.json'))).toBe(false);
  });

  it('uses real canonical audio and cascades deletion through collection and session boundaries', async () => {
    audio();
    upsertAlbum(dir, { name: 'Release', trackIds: ['song'] });
    const unlinkSessionTrack = vi.fn();
    const removeBgmTrack = vi.fn();
    const { runtime } = host({ unlinkSessionTrack, removeBgmTrack });
    await expect(runtime.deleteTrack({ trackId: 'song' })).resolves.toBe(true);
    expect(loadPlaylists(dir)[0].trackIds).toEqual([]);
    expect(unlinkSessionTrack).toHaveBeenCalledWith(dir, 'song');
    expect(removeBgmTrack).toHaveBeenCalledWith(dir, 'song');
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
    expect(fs.existsSync(path.join(dir, 'tracks/song/audio.mp3'))).toBe(false);
  });

  it('does not clean replacement references when the same ID now points to another original', async () => {
    const file = audio();
    const oldBinding = await hashAudioFile(file);
    upsertAlbum(dir, { name: 'Release', trackIds: ['song'] });
    const unlinkSessionTrack = vi.fn();
    const removeBgmTrack = vi.fn();
    const { cleanupReferences } = host({ unlinkSessionTrack, removeBgmTrack });
    fs.writeFileSync(file, 'replacement audio');
    await cleanupReferences('song', oldBinding, { dir, epoch: 0 });
    expect(loadPlaylists(dir)[0].trackIds).toEqual(['song']);
    expect(unlinkSessionTrack).not.toHaveBeenCalled();
    expect(removeBgmTrack).not.toHaveBeenCalled();
  });

  it('recovers a partial cleanup on restart and publishes library refresh only for recovery', async () => {
    audio();
    upsertAlbum(dir, { name: 'Release', trackIds: ['song'] });
    const failing = host({
      unlinkSessionTrack: vi.fn(() => {
        throw new Error('session write failed');
      }),
    });
    await expect(
      failing.runtime.deleteTrack({ trackId: 'song' }),
    ).rejects.toThrow();
    expect(Object.values(loadWorks(dir).pendingTrackDeletions)[0].phase).toBe(
      'media-deleted',
    );
    const notifyLibraryUpdated = vi.fn();
    const recovered = host({ notifyLibraryUpdated });
    await expect(recovered.recover()).resolves.toBe(true);
    expect(loadWorks(dir).pendingTrackDeletions).toEqual({});
    expect(notifyLibraryUpdated).toHaveBeenCalledWith({
      allowProviderBackfill: false,
    });
  });
});
