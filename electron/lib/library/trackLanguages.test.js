import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTrackLanguagesService, normalizeTag } from './trackLanguages.js';
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

async function save(languages, primary = null) {
  const open = await service.get(trackId);
  return service.save({ trackId, token: open.editToken, languages, primary });
}

describe('track languages', () => {
  it('starts unannotated and keeps distinct Chinese varieties', async () => {
    expect(await service.get(trackId)).toMatchObject({
      languages: [],
      primary: null,
      status: 'pending',
      needsReview: false,
    });
    expect(await save(['cmn', 'nan-tw', 'yue'])).toMatchObject({
      languages: ['cmn', 'nan-TW', 'yue'],
      primary: null,
      status: 'confirmed',
    });
    expect(normalizeTag('ZH-hant-tw')).toBe('zh-Hant-TW');
  });

  it('persists across restarts and treats a single language as primary', async () => {
    await save(['ja']);
    service = createTrackLanguagesService({ getLibraryContext: () => scope });
    expect(await service.get(trackId)).toMatchObject({
      languages: ['ja'],
      primary: 'ja',
      status: 'confirmed',
    });
  });

  it('records an optional primary language for mixed tracks', async () => {
    expect(await save(['ko', 'en'], 'ko')).toMatchObject({ primary: 'ko' });
    await expect(save(['ko', 'en'], 'ja')).rejects.toMatchObject({
      languageStatus: 'invalid',
    });
  });

  it('rejects malformed, duplicate, und and mixed zxx lists', async () => {
    for (const languages of [
      ['english'],
      ['en', 'en'],
      ['und'],
      ['zxx', 'en'],
      ['en; rm'],
      Array.from({ length: 9 }, (_, index) => `x${'abcdefghi'[index]}`),
    ])
      await expect(save(languages)).rejects.toMatchObject({
        languageStatus: 'invalid',
      });
    expect(await save(['zxx'])).toMatchObject({ languages: ['zxx'] });
  });

  it('clears the record when every language is removed', async () => {
    await save(['en']);
    expect(await save([])).toMatchObject({ languages: [], status: 'pending' });
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
});
