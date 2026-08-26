import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadNavigation() {
  return import('./useOutputWorkspaceNavigation.js');
}

describe('useOutputWorkspaceNavigation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('starts each renderer session on the workbench without a remembered kind', async () => {
    const { useOutputWorkspaceNavigation } = await loadNavigation();

    const navigation = useOutputWorkspaceNavigation();

    expect(navigation.activePage.value).toBe('workbench');
    expect(navigation.activeKind.value).toBeNull();
  });

  it('shares the last valid page and kind with later consumers in the same session', async () => {
    const { useOutputWorkspaceNavigation } = await loadNavigation();
    const firstConsumer = useOutputWorkspaceNavigation();

    expect(firstConsumer.selectPage('gallery')).toBe(true);
    expect(
      firstConsumer.selectKind('lyrics', ['now-playing', 'lyrics', 'artwork']),
    ).toBe(true);

    const laterConsumer = useOutputWorkspaceNavigation();

    expect(laterConsumer.activePage.value).toBe('gallery');
    expect(laterConsumer.activeKind.value).toBe('lyrics');
  });

  it('keeps the remembered state when a consumer requests unavailable navigation', async () => {
    const { useOutputWorkspaceNavigation } = await loadNavigation();
    const navigation = useOutputWorkspaceNavigation();
    navigation.selectPage('settings');
    navigation.selectKind('setlist', ['now-playing', 'setlist']);

    expect(navigation.selectPage('unknown')).toBe(false);
    expect(navigation.selectKind('artwork', ['now-playing', 'setlist'])).toBe(
      false,
    );
    expect(navigation.activePage.value).toBe('settings');
    expect(navigation.activeKind.value).toBe('setlist');
  });

  it('falls back to the first available kind when memory is empty or stale', async () => {
    const { useOutputWorkspaceNavigation } = await loadNavigation();
    const navigation = useOutputWorkspaceNavigation();

    expect(navigation.ensureAvailableKind(['now-playing', 'lyrics'])).toBe(
      'now-playing',
    );
    navigation.selectKind('lyrics', ['now-playing', 'lyrics']);

    expect(navigation.ensureAvailableKind(['artwork', 'setlist'])).toBe(
      'artwork',
    );
    expect(navigation.activeKind.value).toBe('artwork');
  });
});
