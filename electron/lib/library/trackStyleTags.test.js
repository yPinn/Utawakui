import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTrackStyleTagsService } from './trackStyleTags.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const profile = 'discogs-effnet-bsdynamic-1:audit-2026-11-08-v1';
const trackId = 'sample';
const audioContent = 'fixture audio';
let dir;
let audio;
let input;
let scope;
let service;

function prepareImport(labels, other = []) {
  fs.writeFileSync(
    input,
    JSON.stringify({
      version: 1,
      profile,
      tracks: [
        {
          trackId,
          audioSha256: hash(audioContent),
          candidates: labels.map((label) => ({ label, score: 0.43 })),
        },
        ...other,
      ],
    }),
  );
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-styles-'));
  audio = path.join(dir, 'tracks', trackId, 'audio.wav');
  input = path.join(dir, 'manifest.json');
  fs.mkdirSync(path.dirname(audio), { recursive: true });
  fs.writeFileSync(audio, audioContent);
  scope = { dir, epoch: 0 };
  service = createTrackStyleTagsService({ getLibraryContext: () => scope });
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function adoptionFixture(id, scores = [0.8, 0.4], label = 'Rock', extra = {}) {
  const directory = path.join(dir, 'tracks', id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'audio.wav'), audioContent);
  return {
    trackId: id,
    audioSha256: hash(audioContent),
    candidates: scores.map((score, index) => ({
      label: index ? `Style ${index}` : label,
      score,
    })),
    ...extra,
  };
}

it('previews conservative first candidates and persists only the selected track', async () => {
  const entries = [
    adoptionFixture('selected', [0.5, 0.35]),
    adoptionFixture('unchecked'),
    adoptionFixture('manual'),
    adoptionFixture('market', [0.9, 0.4], 'J-pop'),
    adoptionFixture('flagged', [0.9, 0.4], 'Folk', { marketReview: true }),
    adoptionFixture('close', [0.8, 0.4, 0.75]),
    adoptionFixture('low', [0.49, 0.1]),
    adoptionFixture('single', [0.8]),
  ];
  fs.writeFileSync(
    input,
    JSON.stringify({ version: 1, profile, tracks: entries }),
  );
  await service.importCandidates(input, scope);
  const manual = await service.get('manual');
  await service.save({
    trackId: 'manual',
    token: manual.editToken,
    tags: [],
    dismissed: ['Rock'],
  });
  const manualPath = path.join(dir, 'style-tags.json');
  const before = fs.readFileSync(manualPath);
  const preview = await service.previewAdoption();
  expect(preview.rows.map(({ trackId }) => trackId)).toEqual([
    'selected',
    'unchecked',
  ]);
  expect(fs.readFileSync(manualPath)).toEqual(before);
  await expect(
    service.applyAdoption(preview.previewId, ['selected', 'manual']),
  ).rejects.toMatchObject({ styleStatus: 'invalid' });
  await expect(
    service.applyAdoption(preview.previewId, ['selected']),
  ).resolves.toEqual({ adopted: 1, skipped: 0 });
  const stored = JSON.parse(fs.readFileSync(manualPath, 'utf8')).tracks;
  expect(stored.manual).toEqual(JSON.parse(before).tracks.manual);
  expect(stored.unchecked).toBeUndefined();
  expect(stored.selected).toMatchObject({
    tags: ['Rock'],
    adoptedFrom: profile,
  });
  await expect(
    service.applyAdoption(preview.previewId, ['selected']),
  ).rejects.toMatchObject({ styleStatus: 'stale' });
  service = createTrackStyleTagsService({ getLibraryContext: () => scope });
  await expect(service.get('selected')).resolves.toMatchObject({
    tags: ['Rock'],
  });
  for (const entry of entries)
    expect(
      fs.readFileSync(
        path.join(dir, 'tracks', entry.trackId, 'audio.wav'),
        'utf8',
      ),
    ).toBe(audioContent);
});

it('skips new manual edits, refreshed candidates and replaced audio at apply time', async () => {
  const entries = ['manual', 'refresh', 'audio'].map((id) =>
    adoptionFixture(id),
  );
  fs.writeFileSync(
    input,
    JSON.stringify({ version: 1, profile, tracks: entries }),
  );
  await service.importCandidates(input, scope);
  const preview = await service.previewAdoption();
  const manual = await service.get('manual');
  await service.save({
    trackId: 'manual',
    token: manual.editToken,
    tags: ['Folk'],
    dismissed: [],
  });
  entries[1].candidates[0].score = 0.9;
  fs.writeFileSync(
    input,
    JSON.stringify({ version: 1, profile, tracks: entries }),
  );
  await service.importCandidates(input, scope);
  fs.writeFileSync(path.join(dir, 'tracks', 'audio', 'audio.wav'), 'new audio');
  await expect(
    service.applyAdoption(preview.previewId, ['manual', 'refresh', 'audio']),
  ).resolves.toEqual({ adopted: 0, skipped: 3 });
  await expect(service.get('manual')).resolves.toMatchObject({
    tags: ['Folk'],
  });
});

describe('track style data ownership', () => {
  it('keeps corrections and dismissals after restart and candidate refresh', async () => {
    prepareImport(['Cloud Rap', 'Trap', 'Pop Rap']);
    expect(await service.importCandidates(input, scope)).toEqual({
      imported: 1,
      skipped: 0,
    });
    const candidateFile = path.join(dir, 'style-candidates.json');
    const candidatesBefore = fs.readFileSync(candidateFile);
    const before = await service.get(trackId);
    expect(before.tags).toEqual([]);
    const saved = await service.save({
      trackId,
      token: before.editToken,
      tags: ['Cloud Rap', 'Alternative Hip Hop', 'Late-night'],
      dismissed: ['Trap', 'Pop Rap'],
    });
    expect(saved.tags).toEqual([
      'Cloud Rap',
      'Alternative Hip Hop',
      'Late-night',
    ]);
    expect(fs.readFileSync(candidateFile)).toEqual(candidatesBefore);
    const manualFile = path.join(dir, 'style-tags.json');
    const manualBefore = fs.readFileSync(manualFile);

    service = createTrackStyleTagsService({ getLibraryContext: () => scope });
    await expect(service.get(trackId)).resolves.toMatchObject({
      tags: saved.tags,
      dismissed: ['Trap', 'Pop Rap'],
    });
    prepareImport(['Pop Rap', 'Trap', 'Indie Pop']);
    await service.importCandidates(input, scope);
    const refreshed = await service.get(trackId);
    expect(refreshed.tags).toEqual(saved.tags);
    expect(refreshed.dismissed).toEqual(['Trap', 'Pop Rap']);
    expect(refreshed.candidates.map(({ label }) => label)).toEqual([
      'Pop Rap',
      'Trap',
      'Indie Pop',
    ]);
    expect(fs.readFileSync(manualFile)).toEqual(manualBefore);
    expect(fs.readFileSync(audio, 'utf8')).toBe(audioContent);
  });

  it('skips missing or replaced audio and invalidates an open editor', async () => {
    prepareImport(
      ['Trap'],
      [
        {
          trackId: 'missing',
          audioSha256: hash('not present'),
          candidates: [{ label: 'Folk', score: 0.2 }],
        },
      ],
    );
    expect(await service.importCandidates(input, scope)).toEqual({
      imported: 1,
      skipped: 1,
    });
    const before = await service.get(trackId);
    await service.save({
      trackId,
      token: before.editToken,
      tags: ['Rap'],
      dismissed: [],
    });
    const open = await service.get(trackId);
    fs.writeFileSync(audio, 'replacement');
    await expect(
      service.save({ trackId, token: open.editToken, tags: [], dismissed: [] }),
    ).rejects.toMatchObject({ styleStatus: 'stale' });
    expect(await service.importCandidates(input, scope)).toEqual({
      imported: 0,
      skipped: 2,
    });
    expect(await service.get(trackId)).toMatchObject({
      tags: ['Rap'],
      candidates: [],
      needsReview: true,
    });
  });

  it('rejects a stale edit after another save or a library change', async () => {
    const open = await service.get(trackId);
    await service.save({
      trackId,
      token: open.editToken,
      tags: ['Rock'],
      dismissed: [],
    });
    await expect(
      service.save({
        trackId,
        token: open.editToken,
        tags: ['Pop'],
        dismissed: [],
      }),
    ).rejects.toMatchObject({ styleStatus: 'stale' });
    const current = await service.get(trackId);
    scope = { ...scope, epoch: 1 };
    await expect(
      service.save({
        trackId,
        token: current.editToken,
        tags: [],
        dismissed: [],
      }),
    ).rejects.toMatchObject({ styleStatus: 'stale' });
  });

  it('keeps manual editing available if the candidate store cannot be read', async () => {
    const candidate = path.join(dir, 'style-candidates.json');
    fs.writeFileSync(candidate, '{');
    const open = await service.get(trackId);
    expect(open).toMatchObject({ candidates: [], candidatesUnavailable: true });
    await expect(
      service.save({
        trackId,
        token: open.editToken,
        tags: ['Rock'],
        dismissed: [],
      }),
    ).resolves.toMatchObject({ tags: ['Rock'], candidatesUnavailable: true });
    expect(fs.readFileSync(candidate, 'utf8')).toBe('{');
  });

  it('rejects unsafe or invalid imports before writing either sidecar', async () => {
    prepareImport(
      ['Trap'],
      [
        {
          trackId: '../outside',
          audioSha256: hash('untrusted'),
          candidates: [{ label: 'Folk', score: 0.2 }],
        },
      ],
    );
    await expect(service.importCandidates(input, scope)).rejects.toMatchObject({
      styleStatus: 'invalid',
    });
    expect(fs.existsSync(path.join(dir, 'style-tags.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'style-candidates.json'))).toBe(false);
  });
});
