import { expect, it } from 'vitest';
import {
  applyFieldDecisions,
  projectFields,
  validateFieldDecisions,
} from './metadata.js';

it('distinguishes accepting a snapshot, clearing manually, and following source', () => {
  const original = {
    title: 'Old',
    album: 'Manual album',
    releaseYear: 2026,
    custom: 4,
  };
  const observed = {
    title: 'Source',
    album: 'Provider album',
    releaseYear: 2025,
  };
  const accepted = applyFieldDecisions(original, observed, {
    title: { action: 'source' },
    album: { action: 'clear' },
  });
  expect(accepted).toMatchObject({
    title: 'Source',
    album: '',
    titleOrigin: 'manual',
    albumOrigin: 'manual',
    custom: 4,
  });
  expect(
    projectFields(accepted, { ...observed, title: 'Updated' }).title.value,
  ).toBe('Source');
  const following = applyFieldDecisions(accepted, observed, {
    title: { action: 'follow' },
  });
  expect(
    projectFields(following, { ...observed, title: 'Updated' }).title,
  ).toMatchObject({ value: 'Source', observed: 'Updated', origin: 'source' });
});

it('keeps unknown legacy values, supports numeric clear and rejects title clear or invalid input', () => {
  expect(
    projectFields({ title: 'Legacy' }, { title: 'Provider' }).title,
  ).toMatchObject({ value: 'Legacy', origin: 'unknown' });
  expect(
    applyFieldDecisions(
      { title: 'Song', releaseYear: 2026 },
      {},
      { releaseYear: { action: 'clear' } },
    ),
  ).toMatchObject({ releaseYear: null, releaseYearOrigin: 'manual' });
  expect(() =>
    validateFieldDecisions({ title: { action: 'clear' } }),
  ).toThrow();
  expect(() =>
    validateFieldDecisions({ path: { action: 'manual', value: '../x' } }),
  ).toThrow();
  expect(() =>
    validateFieldDecisions({ trackNumber: { action: 'manual', value: 0 } }),
  ).toThrow();
  expect(() =>
    validateFieldDecisions(JSON.parse('{"__proto__":{}}')),
  ).toThrow();
});

it('does not advertise following file-tag snapshots that have no automatic replay owner', () => {
  expect(
    projectFields({ title: 'Old' }, { title: 'File title' }).title.canFollow,
  ).toBe(false);
  expect(
    projectFields({ title: 'Old' }, { title: 'Provider title' }, ['title'])
      .title.canFollow,
  ).toBe(true);
  expect(() =>
    applyFieldDecisions(
      { title: 'Old' },
      { title: 'File title' },
      { title: { action: 'follow' } },
      { followFields: [] },
    ),
  ).toThrow();
});
