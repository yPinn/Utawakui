import { describe, expect, it, vi } from 'vitest';
import { registerAudioOutputPermissions } from './audioOutputPermissions.js';

describe('audio output permissions', () => {
  const appUrl = 'http://localhost:5173/';

  function createHarness() {
    const allowedSender = { getURL: vi.fn(() => appUrl) };
    const session = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    };
    registerAudioOutputPermissions(session, {
      getAllowedSender: () => allowedSender,
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
});
