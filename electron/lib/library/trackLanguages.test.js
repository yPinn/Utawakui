import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTrackLanguagesService } from './trackLanguages.js';
import { createTrackStyleTagsService } from './trackStyleTags.js';

const trackId = 'sample';
let dir;
let audio;
let scope;
let service;
const storePath = () => path.join(dir, 'track-languages.json');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-languages-'));
  audio = path.join(dir, 'tracks', trackId, 'audio.wav');
  fs.mkdirSync(path.dirname(audio), { recursive: true });
  fs.writeFileSync(audio, 'fixture audio');
  scope = { dir, epoch: 0 };
  service = createTrackLanguagesService({ getLibraryContext: () => scope });
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function save(languages) {
  const open = await service.get(trackId);
  return service.save({ trackId, token: open.editToken, languages });
}

describe('track languages', () => {
  it('starts unannotated and saves broad groups in display order', async () => {
    expect(await service.get(trackId)).toMatchObject({
      languages: [],
      needsReview: false,
    });
    expect(await save(['en', 'ja'])).toMatchObject({ languages: ['ja', 'en'] });
  });

  it('persists across restarts', async () => {
    await save(['other']);
    service = createTrackLanguagesService({ getLibraryContext: () => scope });
    expect(await service.get(trackId)).toMatchObject({ languages: ['other'] });
  });

  it('accepts only the broad groups and keeps no vocals exclusive', async () => {
    for (const languages of [
      ['cmn'],
      ['japanese'],
      ['ja', 'ja'],
      ['zxx', 'en'],
      'ja',
    ])
      await expect(save(languages)).rejects.toMatchObject({
        languageStatus: 'invalid',
      });
    expect(await save(['zxx'])).toMatchObject({ languages: ['zxx'] });
  });

  it('folds finer stored codes into the broad groups', () => {
    fs.writeFileSync(
      storePath(),
      JSON.stringify({
        version: 1,
        tracks: {
          [trackId]: {
            audioSha256: 'a'.repeat(64),
            languages: ['yue', 'nan-TW', 'es', 'zxx'],
          },
        },
      }),
    );
    expect(service.list().tracks[trackId]).toEqual({
      languages: ['zh', 'other'],
    });
  });

  it('clears the record when every language is removed', async () => {
    await save(['en']);
    expect(await save([])).toMatchObject({ languages: [] });
    expect(JSON.parse(fs.readFileSync(storePath(), 'utf8')).tracks).toEqual({});
  });

  it('marks saved languages for review after the audio changes', async () => {
    await save(['en']);
    const open = await service.get(trackId);
    fs.writeFileSync(audio, 'replacement');
    await expect(
      service.save({ trackId, token: open.editToken, languages: ['ja'] }),
    ).rejects.toMatchObject({ languageStatus: 'stale' });
    expect(await service.get(trackId)).toMatchObject({
      languages: ['en'],
      needsReview: true,
    });
  });

  it('rejects stale tokens, library changes and style tokens', async () => {
    const style = await createTrackStyleTagsService({
      getLibraryContext: () => scope,
    }).get(trackId);
    await expect(
      service.save({ trackId, token: style.editToken, languages: ['ja'] }),
    ).rejects.toMatchObject({ languageStatus: 'stale' });
    const open = await service.get(trackId);
    await save(['en']);
    await expect(
      service.save({ trackId, token: open.editToken, languages: ['ja'] }),
    ).rejects.toMatchObject({ languageStatus: 'stale' });
    const fresh = await service.get(trackId);
    scope = { dir, epoch: 1 };
    await expect(
      service.save({ trackId, token: fresh.editToken, languages: ['ja'] }),
    ).rejects.toMatchObject({ languageStatus: 'stale' });
  });

  it('reports a missing track and leaves the audio untouched', async () => {
    await expect(service.get('absent')).rejects.toMatchObject({
      languageStatus: 'missing',
    });
    await save(['en']);
    expect(fs.readFileSync(audio, 'utf8')).toBe('fixture audio');
  });

  it('lists saved languages and applies one language to many tracks', async () => {
    const other = path.join(dir, 'tracks', 'other', 'audio.wav');
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(other, 'other audio');
    await save(['ko', 'en']);
    expect(service.list().tracks).toEqual({
      [trackId]: { languages: ['ko', 'en'] },
    });
    const open = await service.get(trackId);
    expect(
      await service.applyBatch({
        trackIds: [trackId, 'other', 'absent'],
        language: 'ja',
      }),
    ).toEqual({ updated: 2, skipped: 1 });
    expect(service.list().tracks).toEqual({
      [trackId]: { languages: ['ja'] },
      other: { languages: ['ja'] },
    });
    await expect(
      service.save({ trackId, token: open.editToken, languages: ['en'] }),
    ).rejects.toMatchObject({ languageStatus: 'stale' });
  });

  it('rejects invalid batch requests', async () => {
    for (const request of [
      { trackIds: [], language: 'ja' },
      { trackIds: [trackId, trackId], language: 'ja' },
      { trackIds: ['../escape'], language: 'ja' },
      { trackIds: [trackId], language: 'cmn' },
    ])
      await expect(service.applyBatch(request)).rejects.toMatchObject({
        languageStatus: 'invalid',
      });
    expect(fs.existsSync(storePath())).toBe(false);
  });
});
