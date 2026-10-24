import { effectScope, nextTick, shallowRef } from 'vue';
import { describe, expect, it } from 'vitest';
import { createElementBoxesMessage } from '../../../shared/outputElementMessage.mjs';
import { useOutputElementBoxes } from './useOutputElementBoxes.js';

const origin = 'http://127.0.0.1:41234';
const data = createElementBoxesMessage(
  'cover-player',
  [{ id: 'title', x: 20, y: 300, width: 200, height: 24 }],
  { width: 360, height: 480 },
);

function setup() {
  const portrait = { name: 'portrait' };
  const large = { name: 'portrait-large' };
  const templateId = shallowRef('cover-player');
  const scope = effectScope();
  const result = scope.run(() =>
    useOutputElementBoxes({
      frameWindows: () =>
        new Map([
          ['portrait', portrait],
          ['portrait-large', large],
        ]),
      expectedOrigin: () => origin,
      templateId: () => templateId.value,
      allowedIds: () => ['title', 'artist'],
    }),
  );
  return { ...result, portrait, large, templateId, scope };
}

describe('useOutputElementBoxes', () => {
  it('stores boxes per capture size from its own iframes and origin only', () => {
    const { boxesBySize, handleMessage, portrait, large, scope } = setup();

    handleMessage({ origin, source: portrait, data });
    handleMessage({ origin: 'http://127.0.0.1:1', source: large, data });
    handleMessage({ origin, source: { name: 'stranger' }, data });
    handleMessage({
      origin,
      source: large,
      data: { ...data, templateId: 'art-card' },
    });

    expect(Object.keys(boxesBySize.value)).toEqual(['portrait']);
    expect(boxesBySize.value.portrait.elements[0].id).toBe('title');
    scope.stop();
  });

  it('clears stored boxes when the template changes', async () => {
    const { boxesBySize, handleMessage, portrait, templateId, scope } = setup();
    handleMessage({ origin, source: portrait, data });
    templateId.value = 'art-card';
    await nextTick();
    expect(boxesBySize.value).toEqual({});
    scope.stop();
  });
});
