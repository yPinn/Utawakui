import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./CaptureDeviceModal.vue', import.meta.url),
  'utf8',
);

describe('CaptureDeviceModal appearance contract', () => {
  it('keeps each outward row focus ring inside the nested scroll viewport', () => {
    expect(source).toMatch(
      /\.capture-device-modal\s*\{[\s\S]*?--capture-device-modal-focus-safe-inset:\s*calc\(\s*var\(--ui-focus-width\)\s*\+\s*var\(--ui-focus-offset\)\s*\);/u,
    );
    expect(source).toMatch(
      /\.capture-device-modal__list :deep\(\.capture-device-modal__list-viewport\)\s*\{[\s\S]*?padding:\s*var\(--capture-device-modal-focus-safe-inset\);[\s\S]*?scroll-padding:\s*var\(--capture-device-modal-focus-safe-inset\);/u,
    );
    expect(source).toMatch(
      /\.capture-device-modal__row:focus-visible\s*\{[\s\S]*?outline-offset:\s*var\(--ui-focus-offset\);/u,
    );
  });
});
