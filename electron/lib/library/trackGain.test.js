import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTrackGainService } from './trackGain.js';

const trackId = 'sample';
let dir;
let audio;
let scope;
let service;
const storePath = () => path.join(dir, 'track-gain.json');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-gain-'));
  audio = path.join(dir, 'tracks', trackId, 'audio.wav');
  fs.mkdirSync(path.dirname(audio), { recursive: true });
  fs.writeFileSync(audio, 'fixture audio');
  scope = { dir, epoch: 0 };
  service = createTrackGainService({ getLibraryContext: () => scope });
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function save(gainDb) {
  const open = await service.get(trackId);
  return service.save({ trackId, token: open.editToken, gainDb });
}

describe('track gain', () => {
  it('starts at 0 dB and persists a saved trim across restarts', async () => {
    expect(await service.get(trackId)).toMatchObject({ gainDb: 0 });
    expect(await save(-4.5)).toMatchObject({ gainDb: -4.5 });
    service = createTrackGainService({ getLibraryContext: () => scope });
    expect(await service.get(trackId)).toMatchObject({ gainDb: -4.5 });
  });

  it('removes the entry when reset to 0 dB', async () => {
    await save(3);
    await save(0);
    expect(JSON.parse(fs.readFileSync(storePath(), 'utf8')).tracks).toEqual({});
  });

  it('accepts only bounded half-dB steps', async () => {
    for (const value of [-12.5, 6.5, 1.25, Number.NaN, '3', null])
      await expect(save(value)).rejects.toMatchObject({
        gainStatus: 'invalid',
      });
    expect(await save(-12)).toMatchObject({ gainDb: -12 });
    expect(await save(6)).toMatchObject({ gainDb: 6 });
  });

  it('reads as unset after the audio file is replaced', async () => {
    await save(-6);
    fs.writeFileSync(audio, 'different audio');
    expect(await service.get(trackId)).toMatchObject({ gainDb: 0 });
  });

  it('rejects a stale edit token', async () => {
    const open = await service.get(trackId);
    await save(2);
    await expect(
      service.save({ trackId, token: open.editToken, gainDb: 4 }),
    ).rejects.toMatchObject({ gainStatus: 'stale' });
  });

  it('reports a missing track without creating a store', async () => {
    await expect(service.get('missing')).rejects.toMatchObject({
      gainStatus: 'missing',
    });
    expect(fs.existsSync(storePath())).toBe(false);
  });
});
