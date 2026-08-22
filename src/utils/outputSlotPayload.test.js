import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { buildOutputSlotPayload } from './outputSlotPayload.js';

describe('buildOutputSlotPayload', () => {
  it('copies a reactive slot into structured-cloneable plain data', () => {
    const slot = reactive({
      templateId: 'focus-line',
      styleSetIds: ['runtime-source', 'lyrics-type'],
      settings: { fontFamily: 'serif', fontScale: 'medium' },
    });

    const payload = buildOutputSlotPayload(slot, {
      templateId: 'karaoke-stack',
      settings: { fontScale: 'large' },
    });

    expect(() => structuredClone(payload)).not.toThrow();
    expect(payload).toEqual({
      templateId: 'karaoke-stack',
      styleSetIds: ['runtime-source', 'lyrics-type'],
      settings: { fontFamily: 'serif', fontScale: 'large' },
    });

    slot.styleSetIds.push('lyrics-surface');
    slot.settings.fontFamily = 'sans';
    expect(payload.styleSetIds).toEqual(['runtime-source', 'lyrics-type']);
    expect(payload.settings.fontFamily).toBe('serif');
  });

  it('drops unsupported nested values before IPC', () => {
    const payload = buildOutputSlotPayload(
      reactive({
        templateId: 'now-next',
        settings: {
          valid: null,
          invalidObject: { nested: true },
          invalidFunction: () => true,
          invalidNumber: Number.POSITIVE_INFINITY,
        },
      }),
    );

    expect(payload.settings).toEqual({ valid: null });
    expect(() => structuredClone(payload)).not.toThrow();
  });
});
