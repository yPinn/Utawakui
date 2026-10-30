import { describe, expect, it, vi } from 'vitest';
import { registerAudioOutputPermissions } from './audioOutputPermissions.js';

describe('audio output permissions', () => {
  const appUrl = 'http://localhost:5173/';

  function createHarness(options = {}) {
    const allowedSender = { getURL: vi.fn(() => appUrl) };
    const session = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    };
    registerAudioOutputPermissions(session, {
      getAllowedSender: () => allowedSender,
      ...options,
    });
    return {
      allowedSender,
      requestHandler: session.setPermissionRequestHandler.mock.calls[0][0],
      checkHandler: session.setPermissionCheckHandler.mock.calls[0][0],
    };
  }

  it('allows speaker selection for the trusted main frame in both paths', () => {
    const { allowedSender, requestHandler, checkHandler } = createHarness();
    const callback = vi.fn();
    const details = { isMainFrame: true, requestingUrl: appUrl };

    requestHandler(allowedSender, 'speaker-selection', callback, details);

    expect(callback).toHaveBeenCalledWith(true);
    expect(
      checkHandler(
        allowedSender,
        'speaker-selection',
        'http://localhost:5173',
        details,
      ),
    ).toBe(true);
  });

  it('allows explicit local font access only in the trusted main frame', () => {
    const { allowedSender, requestHandler, checkHandler } = createHarness();
    const callback = vi.fn();
    const details = { isMainFrame: true, requestingUrl: appUrl };

    requestHandler(allowedSender, 'local-fonts', callback, details);

    expect(callback).toHaveBeenCalledWith(true);
    expect(checkHandler(allowedSender, 'local-fonts', appUrl, details)).toBe(
      true,
    );

    const nestedCallback = vi.fn();
    requestHandler(allowedSender, 'local-fonts', nestedCallback, {
      ...details,
      isMainFrame: false,
    });
    expect(nestedCallback).toHaveBeenCalledWith(false);
  });

  it('rejects speaker selection outside the trusted main frame', () => {
    const { allowedSender, requestHandler, checkHandler } = createHarness();
    const cases = [
      {
        sender: { getURL: () => appUrl },
        details: { isMainFrame: true, requestingUrl: appUrl },
      },
      {
        sender: allowedSender,
        details: { isMainFrame: false, requestingUrl: appUrl },
      },
      {
        sender: allowedSender,
        details: {
          isMainFrame: true,
          requestingUrl: 'https://example.invalid/',
        },
      },
    ];

    for (const { sender, details } of cases) {
      const callback = vi.fn();
      requestHandler(sender, 'speaker-selection', callback, details);
      expect(callback).toHaveBeenCalledWith(false);
      expect(checkHandler(sender, 'speaker-selection', '', details)).toBe(
        false,
      );
    }
  });

  it('rejects media capture and unrelated permissions', () => {
    const { allowedSender, requestHandler, checkHandler } = createHarness();
    const audioCallback = vi.fn();
    const videoCallback = vi.fn();
    const details = { isMainFrame: true, requestingUrl: appUrl };

    requestHandler(allowedSender, 'media', audioCallback, {
      ...details,
      mediaTypes: ['audio'],
    });
    requestHandler(allowedSender, 'media', videoCallback, {
      ...details,
      mediaTypes: ['video'],
    });

    expect(audioCallback).toHaveBeenCalledWith(false);
    expect(videoCallback).toHaveBeenCalledWith(false);
    expect(
      checkHandler(allowedSender, 'media', '', {
        ...details,
        mediaType: 'audio',
      }),
    ).toBe(false);
    expect(checkHandler(allowedSender, 'notifications', '', details)).toBe(
      false,
    );
  });

  it('allows only explicitly armed research audio in both permission paths', () => {
    let armed = false;
    const { allowedSender, requestHandler, checkHandler } = createHarness({
      isMicrophoneAllowed: () => armed,
    });
    const details = { isMainFrame: true, requestingUrl: appUrl };
    const request = (mediaTypes, extra = {}) => {
      const callback = vi.fn();
      requestHandler(allowedSender, 'media', callback, {
        ...details,
        mediaTypes,
        ...extra,
      });
      return callback.mock.calls[0][0];
    };
    expect(request(['audio'])).toBe(false);
    armed = true;
    expect(request(['audio'])).toBe(true);
    for (const types of [
      undefined,
      [],
      ['video'],
      ['audio', 'video'],
      ['unknown'],
    ]) {
      expect(request(types)).toBe(false);
    }
    expect(request(['audio'], { isMainFrame: false })).toBe(false);
    expect(
      checkHandler(allowedSender, 'media', appUrl, {
        ...details,
        mediaType: 'audio',
      }),
    ).toBe(true);
    expect(
      checkHandler(allowedSender, 'media', appUrl, {
        ...details,
        mediaType: 'video',
      }),
    ).toBe(false);
    expect(checkHandler(allowedSender, 'media', appUrl, details)).toBe(false);
  });
});
