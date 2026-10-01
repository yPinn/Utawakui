import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from './obsTemplateMockupSource.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));

describe('Ornate Vertical gallery mockup', () => {
  it('keeps the parent mockup as a composition surface', () => {
    const source = readObsTemplateMockupSource();

    expect(source).toContain(
      "import OrnateVerticalPreview from './OrnateVerticalPreview.vue';",
    );
    expect(source).toContain(
      `<template v-else-if="preset?.id === 'ornate-vertical'">`,
    );
    expect(source).toContain('<OrnateVerticalPreview');
    expect(source).toContain(':animated="animated"');
    expect(source).toContain(':scene="lyrics.ornate"');
  });

  it('uses shared presentation and motion rules for a two-line animated comparison', () => {
    const source = fs.readFileSync(
      path.join(directory, 'OrnateVerticalPreview.vue'),
      'utf8',
    );

    expect(source).toContain('adaptOrnateVerticalLyricsPresentation');
    expect(source).toContain('createOrnateVerticalDocumentContext');
    expect(source).toContain('ornateVerticalRevealDelaySeconds');
    expect(source).toContain('夜が明けるまで言葉を残していく');
    expect(source).toContain('v-for="(line, lineIndex) in previewLines"');
    expect(source).toContain('v-for="segment in line.segments"');
    expect(source).toContain('v-for="unit in segment.units"');
    expect(source).toContain(':data-placement="line.placement"');
    expect(source).toContain(':data-segment-count="line.segments.length"');
    expect(source).toContain(':data-emphasis="unit.emphasis"');
    expect(source).toContain('writing-mode: vertical-rl');
    expect(source).toContain('justify-self: end');
    expect(source).toContain('flex-direction: row-reverse');
    expect(source).toContain(
      'font-size: var(--ui-output-preview-ornate-font-size)',
    );
    expect(source).toContain('position: absolute');
    expect(source).toContain("font-family: 'Utawakui Hina Mincho'");
    expect(source).toContain('HinaMincho-Regular.ttf');
    expect(source).toMatch(
      /\[data-animated='true'\][\s\S]*ornate-preview-line-cycle/,
    );
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/,
    );
    expect(source).not.toContain('Array.from');
    expect(source).not.toContain('--ornate-enter-x');
    expect(source).not.toContain('--ornate-enter-y');
    expect(source).not.toContain('--ornate-enter-rotation');
    expect(source).not.toContain('--ornate-enter-scale');
    expect(source).not.toContain('font-size: 1.42em');
    expect(source).not.toContain('3.5vw');
    expect(source).not.toContain('cqi');
    expect(source).not.toContain(
      ".ornate-preview__line[data-placement='left']",
    );
    expect(source).not.toContain(
      ".ornate-preview__line[data-placement='center']",
    );
    expect(source).not.toMatch(/url\([^)]*\.(?:png|jpe?g|webp)/i);
  });

  it('bounds the ornate child to the preview canvas instead of intrinsic text height', () => {
    const source = readObsTemplateMockupSource();

    expect(source).toMatch(
      /data-template-id='ornate-vertical'[\s\S]*?\.obs-template-mockup__content--lyrics\s*\{[^}]*position:\s*relative;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/,
    );
    expect(source).toContain(
      '--ui-output-preview-ornate-font-size: var(\n    --ui-output-preview-ornate-detail-font-size\n  )',
    );
    expect(source).toContain(
      '--ui-output-preview-ornate-font-size: var(\n    --ui-output-preview-ornate-thumbnail-font-size\n  )',
    );
  });
});
