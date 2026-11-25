import { expect, it } from 'vitest';
import provenance from '../../../src/assets/output-template-thumbnails/provenance.json';
import { PUBLIC_THUMBNAILS, TEMPLATES } from './templates.js';
import { getTemplateMotion, getTemplateThumbnail } from './thumbnails.js';

it.each(TEMPLATES)('loads an image for $id', ({ id }) => {
  expect(getTemplateThumbnail(id)).toContain(`/${id}.`);
});

it.each(TEMPLATES)('loads a motion preview for $id', ({ id }) => {
  expect(getTemplateMotion(id)).toContain(`/motion/${id}.webp`);
  expect(getTemplateMotion(id)).not.toBe(getTemplateThumbnail(id));
});

it('limits desktop imports to the project capture files', () => {
  const allowed = Object.values(provenance.templates)
    .filter(
      ({ rights }) =>
        rights === 'project-owned-synthetic-artwork' ||
        rights === 'derived-project-artwork-per-legacy-readme',
    )
    .map(({ file }) => file);
  for (const file of PUBLIC_THUMBNAILS) {
    expect(allowed).toContain(file);
  }
});
