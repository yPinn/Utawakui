import { describe, expect, it } from 'vitest';
import spoutOutputContractModule from './spoutOutputContract.js';

const {
  SPOUT_DEFAULT_FRAME_RATE_PROFILE,
  SPOUT_FRAME_RATE_PROFILES,
  SPOUT_HELPER_ARGUMENT,
  SPOUT_LYRICS_SURFACE,
  createSpoutConfigureMessage,
  getSpoutLyricsSurface,
  isSpoutFrameRateProfile,
  isSpoutConfigureMessage,
  isSpoutStopMessage,
  normalizeSpoutHelperEvent,
} = spoutOutputContractModule;

describe('Spout output contract', () => {
  it('defines one stable FHD lyrics sender with bounded frame-rate profiles', () => {
    expect(SPOUT_HELPER_ARGUMENT).toBe('--utawakui-spout-helper');
    expect(SPOUT_DEFAULT_FRAME_RATE_PROFILE).toBe('standard');
    expect(SPOUT_FRAME_RATE_PROFILES).toEqual({ reduced: 30, standard: 60 });
    expect(SPOUT_LYRICS_SURFACE).toEqual({
      kind: 'lyrics',
      senderName: 'Utawakui.Lyrics',
      width: 1920,
      height: 1080,
      framesPerSecond: 60,
      pixelFormat: 'bgra8',
      alphaMode: 'premultiplied',
      colorSpace: 'srgb-sdr',
    });
    expect(getSpoutLyricsSurface('reduced')).toEqual({
      ...SPOUT_LYRICS_SURFACE,
      framesPerSecond: 30,
    });
    expect(isSpoutFrameRateProfile('standard')).toBe(true);
    expect(isSpoutFrameRateProfile('reduced')).toBe(true);
    expect(isSpoutFrameRateProfile('120')).toBe(false);
  });

  it('derives the helper URL from a running loopback Output service', () => {
    expect(
      createSpoutConfigureMessage({
        running: true,
        httpUrl: 'http://127.0.0.1:8700',
      }),
    ).toEqual({
      contractVersion: 1,
      type: 'configure',
      outputUrl: 'http://127.0.0.1:8700/overlay/lyrics',
      surface: SPOUT_LYRICS_SURFACE,
    });
  });

  it('derives only the selected bounded frame-rate profile', () => {
    const configuration = createSpoutConfigureMessage(
      {
        running: true,
        httpUrl: 'http://127.0.0.1:8700',
      },
      'reduced',
    );

    expect(configuration.surface.framesPerSecond).toBe(30);
    expect(isSpoutConfigureMessage(configuration)).toBe(true);
    expect(() =>
      createSpoutConfigureMessage(
        { running: true, httpUrl: 'http://127.0.0.1:8700' },
        'unbounded',
      ),
    ).toThrow('Spout frame-rate profile unavailable');
    expect(
      isSpoutConfigureMessage({
        ...configuration,
        surface: { ...configuration.surface, framesPerSecond: 120 },
      }),
    ).toBe(false);
  });

  it.each([
    [{ running: false, httpUrl: null }],
    [{ running: true, httpUrl: 'https://127.0.0.1:8700' }],
    [{ running: true, httpUrl: 'http://localhost:8700' }],
    [{ running: true, httpUrl: 'http://user:pass@127.0.0.1:8700' }],
    [{ running: true, httpUrl: 'http://127.0.0.1:8700/base?token=private' }],
  ])('rejects an unavailable or non-canonical Output endpoint', (status) => {
    expect(() => createSpoutConfigureMessage(status)).toThrow(
      'Spout output endpoint unavailable',
    );
  });

  it('accepts only bounded lifecycle events from the helper', () => {
    expect(
      normalizeSpoutHelperEvent({
        contractVersion: 1,
        type: 'ready',
        surface: SPOUT_LYRICS_SURFACE,
      }),
    ).toEqual({
      contractVersion: 1,
      type: 'ready',
      surface: SPOUT_LYRICS_SURFACE,
    });
    expect(
      normalizeSpoutHelperEvent({
        contractVersion: 1,
        type: 'error',
        code: 'SPOUT_TEXTURE_SEND_FAILED',
        message: 'C:\\private\\driver.dll',
      }),
    ).toEqual({
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_TEXTURE_SEND_FAILED',
    });
    expect(
      normalizeSpoutHelperEvent({
        contractVersion: 1,
        type: 'error',
        code: 'SPOUT_SENDER_NAME_IN_USE',
      }),
    ).toEqual({
      contractVersion: 1,
      type: 'error',
      code: 'SPOUT_SENDER_NAME_IN_USE',
    });
    expect(
      normalizeSpoutHelperEvent({
        contractVersion: 99,
        type: 'ready',
        surface: SPOUT_LYRICS_SURFACE,
      }),
    ).toBeNull();
    expect(
      normalizeSpoutHelperEvent({ contractVersion: 1, type: 'arbitrary' }),
    ).toBeNull();
  });

  it('rejects unknown parent-command fields and altered surface fields', () => {
    const configuration = createSpoutConfigureMessage({
      running: true,
      httpUrl: 'http://127.0.0.1:8700',
    });

    expect(isSpoutConfigureMessage(configuration)).toBe(true);
    expect(
      isSpoutConfigureMessage({ ...configuration, executablePath: 'private' }),
    ).toBe(false);
    expect(
      isSpoutConfigureMessage({
        ...configuration,
        surface: { ...configuration.surface, customOption: true },
      }),
    ).toBe(false);
    expect(isSpoutStopMessage({ contractVersion: 1, type: 'stop' })).toBe(true);
    expect(
      isSpoutStopMessage({
        contractVersion: 1,
        type: 'stop',
        executablePath: 'private',
      }),
    ).toBe(false);
  });
});
