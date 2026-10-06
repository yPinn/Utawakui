import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./CollectionActionRail.vue', import.meta.url),
  'utf8',
);

describe('CollectionActionRail', () => {
  it('keeps the stable core action order and search outside the command group', () => {
    const playbackIndex = source.indexOf('<PlaybackPrimaryButton');
    const shuffleIndex = source.indexOf(':icon="Shuffle"');
    const previewIndex = source.indexOf(':icon="Headphones"');
    const queueIndex = source.indexOf(':icon="ListEnd"');
    const extensionIndex = source.indexOf('collection-action-rail__extension');
    const moreIndex = source.indexOf(':icon="Ellipsis"');
    const searchIndex = source.indexOf('<UiSearchBox');

    expect(playbackIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeGreaterThan(playbackIndex);
    expect(shuffleIndex).toBeGreaterThan(previewIndex);
    expect(queueIndex).toBeGreaterThan(shuffleIndex);
    expect(extensionIndex).toBeGreaterThan(queueIndex);
    expect(moreIndex).toBeGreaterThan(extensionIndex);
    expect(searchIndex).toBeGreaterThan(moreIndex);
  });

  it('uses explicit collection capabilities instead of an arbitrary action array', () => {
    for (const capability of [
      'canPlay',
      'canShuffle',
      'canAddToQueue',
      'canPreview',
      'entityAction',
      'moreItems',
    ]) {
      expect(source).toContain(capability);
    }
    expect(source).not.toContain('actions: {');
    expect(source).toContain("emit('togglePlayback')");
    expect(source).toContain("emit('toggleShuffle')");
    expect(source).toContain("emit('addToQueue')");
    expect(source).toContain("emit('preview')");
  });

  it('backs the preview entry off while recording or live', () => {
    expect(source).toContain(
      ':disabled="!canPreview || Boolean(previewBlockedReason)"',
    );
    expect(source).toContain('（${previewBlockedReason}）');
  });
});
