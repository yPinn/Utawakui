import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(
  new URL('./UiModal.vue', import.meta.url),
  'utf8',
);

describe('UiModal appearance contract', () => {
  it('offers an optional header tool area split from close by one separator', () => {
    // Without tools the header is unchanged: title and close only.
    expect(modalSource).toMatch(
      /<template v-if="\$slots\['header-actions'\]">\s*<div class="ui-modal__header-actions">\s*<slot name="header-actions" \/>\s*<\/div>\s*<UiSeparator\s+v-if="presentation !== 'media'"\s+orientation="vertical"/u,
    );
    // Dialog close stays last, after the tools and their separator.
    expect(modalSource).toMatch(
      /<\/template>\s*<UiIconButton\s+v-if="presentation !== 'media'"\s+:icon="X"\s+:label="t\('ui\.modal\.close'\)"\s+variant="ghost"\s+tooltip-placement="top"[\s\S]*?:disabled="closeDisabled"\s+@click="close"\s*\/>/u,
    );
    // Media close comes before caller actions so visual and Tab order agree.
    expect(modalSource).toMatch(
      /<UiIconButton\s+v-if="presentation === 'media'"\s+:icon="X"\s+:label="t\('ui\.modal\.close'\)"\s+variant="overlay"\s+tooltip-placement="start"[\s\S]*?\/>\s*<template v-if="\$slots\['header-actions'\]">/u,
    );
  });

  it('offers an optional material tint washed in from the end edge', () => {
    expect(modalSource).toContain('tint: { type: String, default: null }');
    expect(modalSource).toMatch(
      /:style="tint \? \{ '--ui-modal-tint': tint \} : undefined"/u,
    );
    // Registered so a tint change crossfades on the standard motion token.
    expect(modalSource).toMatch(
      /@property --ui-modal-tint \{\s*syntax: '<color>';/u,
    );
    expect(modalSource).toMatch(
      /transition: --ui-modal-tint var\(--ui-motion-duration-slow\)/u,
    );
    // Lightness-capped, then washed in strongly from the end edge and faded
    // toward the start side; mirrored for RTL.
    expect(modalSource).toMatch(
      /\.ui-modal--tinted \{\s*--ui-modal-tint-ground: oklch\(from var\(--ui-modal-tint\) min\(l, 0\.55\) c h\);\s*background-image: radial-gradient\(\s*ellipse 90% 140% at 100% 50%,\s*color-mix\(in oklab, var\(--ui-modal-tint-ground\) 55%, transparent\)/u,
    );
    expect(modalSource).toContain('.ui-modal--tinted:dir(rtl)');
  });

  it('maps every public size to the reviewed inline and block-size tokens', () => {
    expect(modalSource).toMatch(
      /\.ui-modal\s*\{[\s\S]*?--ui-modal-inline-size:\s*var\(--ui-modal-inline-size-small\);[\s\S]*?--ui-modal-max-block-size:\s*var\(--ui-modal-max-block-size-small\);/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal--notice\s*\{[\s\S]*?--ui-modal-inline-size:\s*var\(--ui-modal-inline-size-medium\);[\s\S]*?--ui-modal-max-block-size:\s*var\(--ui-modal-max-block-size-medium\);/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal--wide\s*\{[\s\S]*?--ui-modal-inline-size:\s*var\(--ui-modal-inline-size-large\);[\s\S]*?--ui-modal-max-block-size:\s*var\(--ui-modal-max-block-size-large\);/u,
    );
    expect(modalSource).toContain(
      'calc(100dvw - (var(--ui-modal-viewport-inset) * 2))',
    );
    expect(modalSource).toContain(
      'calc(100dvh - (var(--ui-modal-viewport-inset) * 2))',
    );
  });

  it('supports a semantic max block-size override without changing inline size', () => {
    expect(modalSource).toContain(
      "validator: (value) => ['', 'small', 'medium', 'large'].includes(value)",
    );
    expect(modalSource).toContain(
      'maxBlockSize ? `ui-modal--max-block-${maxBlockSize}` : null',
    );
    expect(modalSource).toMatch(
      /\.ui-modal--max-block-medium\s*\{\s*--ui-modal-max-block-size:\s*var\(--ui-modal-max-block-size-medium\);/u,
    );
  });

  it('uses the reviewed raised shell, nested field aliases, and semantic zone spacing', () => {
    expect(modalSource).toContain(
      '--ui-field-background: var(--ui-field-background-on-raised);',
    );
    expect(modalSource).toContain(
      '--ui-field-background-hover: var(--ui-field-background-hover-on-raised);',
    );
    expect(modalSource).toContain(
      '--ui-field-background-readonly: var(--ui-field-background-readonly-on-raised);',
    );
    expect(modalSource).toContain(
      'background: var(--ui-color-surface-raised);',
    );
    expect(modalSource).toContain('box-shadow: var(--ui-shadow-dialog);');
    expect(modalSource).toContain('gap: var(--ui-modal-section-gap);');
    expect(modalSource).toContain(
      'padding: var(--ui-modal-footer-inset-block) var(--ui-modal-content-inset);',
    );
    expect(modalSource).not.toContain('box-shadow: var(--ui-shadow-overlay);');
  });

  it('keeps text selection available by default and scopes select-none to opted-in dialogs', () => {
    expect(modalSource).toContain(
      'selectable: { type: Boolean, default: true }',
    );
    expect(modalSource).toContain("'ui-modal--select-none': !selectable");
    expect(modalSource).toMatch(
      /\.ui-modal--select-none\s*\{[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?user-select:\s*none;/u,
    );
  });

  it('offers an image-led media presentation without the raised dialog shell', () => {
    expect(modalSource).toContain(
      "presentation: {\n    type: String,\n    default: 'dialog',",
    );
    expect(modalSource).toContain(
      "['dialog', 'document', 'media'].includes(value)",
    );
    expect(modalSource).toContain('`ui-modal--${presentation}`');
    expect(modalSource).toContain(
      "'ui-visually-hidden': presentation === 'media'",
    );
    expect(modalSource).toContain('v-if="presentation !== \'media\'"');
    expect(modalSource).toContain('class="ui-modal__media-body"');
    expect(modalSource).toContain('variant="overlay"');
    expect(modalSource).toContain('variant="ghost"');
    expect(modalSource).not.toContain(
      ":shape=\"presentation === 'media' ? 'circle' : 'square'\"",
    );
    expect(modalSource).toMatch(
      /\.ui-modal--media\s*\{[^}]*inline-size:\s*fit-content;[^}]*container-type:\s*normal;[^}]*overflow:\s*visible;[^}]*border:\s*none;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/su,
    );
    expect(modalSource).toContain('--ui-modal-media-content-max-inline-size:');
    expect(modalSource).toContain('--ui-modal-media-content-max-block-size:');
    expect(modalSource).toMatch(
      /--ui-modal-media-content-max-inline-size:\s*min\(\s*var\(--ui-modal-media-max-inline-size\),\s*calc\([\s\S]*?100dvw[\s\S]*?var\(--ui-modal-media-action-rail-inline-size\)[\s\S]*?var\(--ui-modal-media-action-gap\)[\s\S]*?\)\s*\);/u,
    );
    expect(modalSource).toMatch(
      /--ui-modal-media-content-max-block-size:\s*min\(\s*var\(--ui-modal-media-max-block-size\),\s*calc\(100dvh - \(var\(--ui-modal-viewport-inset\) \* 2\)\)\s*\);/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal--media \.ui-modal__header\s*\{[^}]*position:\s*static;[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;[^}]*align-self:\s*start;/su,
    );
    expect(modalSource).toMatch(
      /\.ui-modal--media \.ui-modal__header-end\s*\{[^}]*flex-direction:\s*column;[^}]*gap:\s*var\(--ui-space-1\);/su,
    );
    expect(modalSource).toMatch(
      /\.ui-modal__media-body\s*\{[^}]*--ui-media-max-inline-size:\s*var\(--ui-modal-media-content-max-inline-size\);[^}]*--ui-media-max-block-size:\s*var\(--ui-modal-media-content-max-block-size\);/su,
    );
    expect(modalSource).toMatch(
      /\.ui-modal__media-body\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/su,
    );
    expect(modalSource).toContain('tooltip-placement="start"');
    expect(modalSource).toContain('tooltip-placement="top"');
  });

  it('uses a media-only enter and leave transition without animating layout', () => {
    expect(modalSource).toContain('<Transition');
    expect(modalSource).toContain(
      ":name=\"presentation === 'media' ? 'ui-modal-media' : undefined\"",
    );
    expect(modalSource).toContain('@after-leave="handleAfterLeave"');
    expect(modalSource).toMatch(
      /\.ui-modal-media-enter-active[\s\S]*?background-color var\(--ui-motion-duration-standard\)[\s\S]*?\.ui-modal-media-leave-active[\s\S]*?background-color var\(--ui-motion-duration-fast\)/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal-media-enter-active \.ui-modal--media[\s\S]*?transform var\(--ui-motion-duration-standard\)[\s\S]*?clip-path var\(--ui-motion-duration-standard\)/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal-media-enter-from \.ui-modal--media,[\s\S]*?\.ui-modal-media-leave-to \.ui-modal--media[\s\S]*?transform:\s*scale\(0\.94\);[\s\S]*?clip-path:\s*inset\(4%\);/u,
    );
    expect(modalSource).not.toMatch(
      /ui-modal-media-(?:enter|leave)-active[\s\S]*?transition:[^;]*(?:width|height|top|left)/u,
    );
    expect(modalSource).not.toContain('prefers-reduced-motion: reduce');
  });

  it('reserves a complete focus ring inside the body scrollport without changing section rhythm', () => {
    expect(modalSource).toMatch(
      /\.ui-modal\s*\{[\s\S]*?--ui-modal-focus-safe-inset:\s*var\(--ui-focus-safe-inset\);/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal__body :deep\(\.ui-modal__body-viewport\),\s*\.ui-modal__workspace-body\s*\{[\s\S]*?padding:\s*var\(--ui-modal-focus-safe-inset\)\s+var\(--ui-modal-content-inset\)\s+var\(--ui-modal-content-inset\);[\s\S]*?scroll-padding-block:\s*var\(--ui-modal-focus-safe-inset\);/u,
    );
    expect(modalSource).toMatch(
      /\.ui-modal__header\s*\{[\s\S]*?padding:[\s\S]*?max\(\s*0rem,\s*calc\(\s*var\(--ui-modal-section-gap\)\s*-\s*var\(--ui-modal-focus-safe-inset\)\s*\)\s*\);/u,
    );
  });
});
