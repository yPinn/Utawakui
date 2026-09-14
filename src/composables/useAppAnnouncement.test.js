import { afterEach, describe, expect, it, vi } from 'vitest';
import announcement from '../../shared/releaseAnnouncement.json';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadAppAnnouncement() {
  const { useAppAnnouncement } = await import('./useAppAnnouncement.js');
  return useAppAnnouncement();
}

describe('useAppAnnouncement', () => {
  it('opens once when the seen version differs from the bundled version', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getAnnouncementSeenVersion: vi.fn().mockResolvedValue(null),
        setAnnouncementSeenVersion: vi.fn().mockResolvedValue(null),
      },
    });
    const appAnnouncement = await loadAppAnnouncement();

    await appAnnouncement.initialize();

    expect(appAnnouncement.state.open).toBe(true);
    expect(appAnnouncement.version).toBe(announcement.version);
    expect(appAnnouncement.summary).toBe(announcement.summary);
  });

  it('stays closed when the seen version already matches', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getAnnouncementSeenVersion: vi
          .fn()
          .mockResolvedValue(announcement.version),
        setAnnouncementSeenVersion: vi.fn().mockResolvedValue(null),
      },
    });
    const appAnnouncement = await loadAppAnnouncement();

    await appAnnouncement.initialize();

    expect(appAnnouncement.state.open).toBe(false);
  });

  it('persists the current version on dismiss', async () => {
    const setAnnouncementSeenVersion = vi.fn().mockResolvedValue(null);
    vi.stubGlobal('window', {
      Utawakui: {
        getAnnouncementSeenVersion: vi.fn().mockResolvedValue(null),
        setAnnouncementSeenVersion,
      },
    });
    const appAnnouncement = await loadAppAnnouncement();
    await appAnnouncement.initialize();

    appAnnouncement.dismiss();

    expect(appAnnouncement.state.open).toBe(false);
    expect(setAnnouncementSeenVersion).toHaveBeenCalledWith(
      announcement.version,
    );
  });

  it('reopen shows the modal again after a dismiss', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getAnnouncementSeenVersion: vi.fn().mockResolvedValue(null),
        setAnnouncementSeenVersion: vi.fn().mockResolvedValue(null),
      },
    });
    const appAnnouncement = await loadAppAnnouncement();
    await appAnnouncement.initialize();
    appAnnouncement.dismiss();

    appAnnouncement.reopen();

    expect(appAnnouncement.state.open).toBe(true);
  });

  it('does not throw when the preload bridge is unavailable', async () => {
    vi.stubGlobal('window', {});
    const appAnnouncement = await loadAppAnnouncement();

    await expect(appAnnouncement.initialize()).resolves.toBeUndefined();
    expect(appAnnouncement.state.open).toBe(false);

    expect(() => appAnnouncement.dismiss()).not.toThrow();
  });
});
