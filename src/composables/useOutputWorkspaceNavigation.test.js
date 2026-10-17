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
    expect(navigation.previewBackdrop.value).toBe('checker');
    expect(navigation.showLyricsGuide.value).toBe(true);
  });

  it('shares the last valid page and kind with later consumers in the same session', async () => {
    const { useOutputWorkspaceNavigation } = await loadNavigation();
    const firstConsumer = useOutputWorkspaceNavigation();

    expect(firstConsumer.selectPage('gallery')).toBe(true);
    expect(
      firstConsumer.selectKind('lyrics', ['now-playing', 'lyrics', 'artwork']),
    ).toBe(true);
    expect(firstConsumer.selectPreviewBackdrop('dark')).toBe(true);
    firstConsumer.setLyricsGuideVisible(false);

    const laterConsumer = useOutputWorkspaceNavigation();

    expect(laterConsumer.activePage.value).toBe('gallery');
    expect(laterConsumer.activeKind.value).toBe('lyrics');
    expect(laterConsumer.previewBackdrop.value).toBe('dark');
    expect(laterConsumer.showLyricsGuide.value).toBe(false);
  });

  it('keeps the remembered state when a consumer requests unavailable navigation', async () => {
    const { useOutputWorkspaceNavigation } = await loadNavigation();
    const navigation = useOutputWorkspaceNavigation();
    navigation.selectPage('gallery');
    navigation.selectKind('setlist', ['now-playing', 'setlist']);

    expect(navigation.selectPage('unknown')).toBe(false);
    expect(navigation.selectKind('artwork', ['now-playing', 'setlist'])).toBe(
      false,
    );
    expect(navigation.selectPreviewBackdrop('transparent')).toBe(false);
    expect(navigation.activePage.value).toBe('gallery');
    expect(navigation.activeKind.value).toBe('setlist');
    expect(navigation.previewBackdrop.value).toBe('checker');
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

  it('shares one pane preference across modes and consumers without storing effective clamps', async () => {
    const { useOutputWorkspaceNavigation } = await loadNavigation();
    const navigation = useOutputWorkspaceNavigation();
    expect(navigation.sideWidth.value).toBeNull();
    navigation.setSideWidth(336);
    navigation.setSideCollapsed(true);
    navigation.selectPage('gallery');
    expect(navigation.sideWidth.value).toBe(336);
    expect(navigation.sideCollapsed.value).toBe(true);
    expect(navigation.setSideWidth(NaN)).toBe(false);
    expect(navigation.setSideWidth(-1)).toBe(false);
    expect(navigation.setSideWidth(Infinity)).toBe(false);
    expect(navigation.setSideCollapsed('false')).toBe(false);
    navigation.setCompactSideOpen(true);
    const later = useOutputWorkspaceNavigation();
    expect(later.sideWidth.value).toBe(336);
    expect(later.sideCollapsed.value).toBe(true);
    expect(later.compactSideOpen.value).toBe(true);
  });
});
