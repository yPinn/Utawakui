import { describe, expect, it } from 'vitest';
import {
  createElementBoxesMessage,
  hitTestElementBoxes,
  OUTPUT_ELEMENT_BOXES_MESSAGE,
  readElementBoxesMessage,
} from './outputElementMessage.mjs';

const viewport = { width: 360, height: 480 };
const expectations = {
  templateId: 'cover-player',
  allowedIds: ['title', 'artist', 'progress', 'transport'],
};

function message(elements, overrides = {}) {
  return {
    ...createElementBoxesMessage('cover-player', elements, viewport),
    ...overrides,
  };
}

describe('output element boxes message', () => {
  it('round-trips rounded boxes for the expected template', () => {
    const data = message([
      { id: 'title', x: 20.04, y: 300.06, width: 200, height: 24.44 },
    ]);
    expect(data.type).toBe(OUTPUT_ELEMENT_BOXES_MESSAGE);
    expect(readElementBoxesMessage(data, expectations)).toEqual({
      viewport,
      elements: [{ id: 'title', x: 20, y: 300.1, width: 200, height: 24.4 }],
    });
  });

  it.each([
    ['another message type', { type: 'other' }],
    ['another template', { templateId: 'art-card' }],
    ['a missing viewport', { viewport: null }],
    ['an oversized viewport', { viewport: { width: 9000, height: 480 } }],
    [
      'too many elements',
      {
        elements: Array.from({ length: 17 }, () => ({
          id: 'title',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        })),
      },
    ],
  ])('rejects %s', (_, overrides) => {
    expect(readElementBoxesMessage(message([], overrides), expectations)).toBe(
      null,
    );
  });

  it.each([
    ['an undeclared id', { id: 'artwork', x: 0, y: 0, width: 1, height: 1 }],
    ['a selector-like id', { id: 'title"]', x: 0, y: 0, width: 1, height: 1 }],
    ['a non-finite value', { id: 'title', x: NaN, y: 0, width: 1, height: 1 }],
    [
      'a far off-canvas box',
      { id: 'title', x: 2000, y: 0, width: 1, height: 1 },
    ],
  ])('rejects the whole message for %s', (_, box) => {
    expect(
      readElementBoxesMessage(
        { ...message([]), elements: [box] },
        expectations,
      ),
    ).toBe(null);
  });

  it('selects the smallest box under the point and falls back to the template', () => {
    const elements = [
      { id: 'transport', x: 0, y: 400, width: 360, height: 80 },
      { id: 'progress', x: 20, y: 400, width: 320, height: 10 },
    ];
    expect(hitTestElementBoxes(elements, { x: 100, y: 405 })).toBe('progress');
    expect(hitTestElementBoxes(elements, { x: 100, y: 450 })).toBe('transport');
    expect(hitTestElementBoxes(elements, { x: 100, y: 100 })).toBe('template');
  });
});
