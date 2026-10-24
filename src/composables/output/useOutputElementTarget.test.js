import { effectScope, nextTick, shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';
import { useOutputElementTarget } from './useOutputElementTarget.js';

describe('useOutputElementTarget', () => {
  it('shares one target between the select and canvas and resets per template', async () => {
    const elementTargets = shallowRef([
      { id: 'title', label: '曲名', fields: [] },
      { id: 'artist', label: '藝人', fields: [] },
    ]);
    const templateId = shallowRef('cover-player');
    const scope = effectScope();
    const target = scope.run(() =>
      useOutputElementTarget({ elementTargets, templateId }),
    );

    expect(target.targetOptions.value.map(({ value }) => value)).toEqual([
      'template',
      'title',
      'artist',
    ]);
    target.selectTarget('artist');
    expect(target.selectedTarget.value.label).toBe('藝人');
    target.selectTarget('artwork');
    expect(target.selectedTargetId.value).toBe('template');

    target.selectTarget('title');
    templateId.value = 'art-card';
    await nextTick();
    expect(target.selectedTargetId.value).toBe('template');
    scope.stop();
  });
});
