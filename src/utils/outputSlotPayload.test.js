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

  it('copies only a validated local font descriptor across IPC', () => {
    const localFont = {
      source: 'local',
      family: 'Noto Sans CJK TC',
      postscriptName: 'NotoSansCJKtc-Regular',
      style: 'Regular',
    };
    const payload = buildOutputSlotPayload(
      reactive({
        templateId: 'live-stage',
        settings: {
          fontFamily: localFont,
          arbitraryObject: { nested: true },
        },
      }),
    );

    expect(payload.settings).toEqual({ fontFamily: localFont });
    expect(() => structuredClone(payload)).not.toThrow();
  });

  it('moves untouched settings to the next template default', () => {
    const fromFocusLine = buildOutputSlotPayload(
      { templateId: 'focus-line', settings: { fontFamily: 'serif' } },
      { templateId: 'manga-frame' },
    );
    // Karaoke has no font field, so the slot default stands for untouched.
    const throughKaraoke = buildOutputSlotPayload(
      { templateId: 'karaoke-stack', settings: { fontFamily: 'serif' } },
      { templateId: 'manga-frame' },
    );

    expect(fromFocusLine.settings.fontFamily).toBe('antique');
    expect(throughKaraoke.settings.fontFamily).toBe('antique');
  });

  it('keeps customized settings and explicit changes across templates', () => {
    const customized = buildOutputSlotPayload(
      { templateId: 'focus-line', settings: { fontFamily: 'rounded' } },
      { templateId: 'manga-frame' },
    );
    const explicit = buildOutputSlotPayload(
      { templateId: 'focus-line', settings: { fontFamily: 'serif' } },
      { templateId: 'manga-frame', settings: { fontFamily: 'sans' } },
    );
    const sameTemplate = buildOutputSlotPayload(
      { templateId: 'manga-frame', settings: { fontFamily: 'serif' } },
      { settings: { fontScale: 'large' } },
    );

    expect(customized.settings.fontFamily).toBe('rounded');
    expect(explicit.settings.fontFamily).toBe('sans');
    expect(sameTemplate.settings.fontFamily).toBe('serif');
  });
});
