import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sourceFor = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const menuSource = sourceFor('./UiActionMenu.vue');
const trackMenuSource = sourceFor('../track/TrackActionMenu.vue');

describe('UiActionMenu positioning contract', () => {
  it('owns both point and element anchor placement through shared geometry', () => {
    expect(menuSource).toContain("['element', 'point'].includes(value?.kind)");
    expect(menuSource).toContain('anchoredFloatingLayout');
    expect(menuSource).toContain('pointFloatingPosition');
    expect(menuSource).toContain("placement: 'bottom-start'");
    expect(menuSource).toContain("placement: 'end-start'");
    expect(menuSource).not.toMatch(/alignX|align-x/u);
  });

  it('uses semantic sizes instead of caller-owned pixel widths', () => {
    expect(menuSource).toContain("['sm', 'md', 'lg'].includes(value)");
    expect(menuSource).toContain('actionMenuWidth(props.size)');
    expect(sourceFor('./actionMenuModel.js')).toContain('sm: 184');
    expect(sourceFor('./actionMenuModel.js')).toContain('md: 220');
    expect(sourceFor('./actionMenuModel.js')).toContain('lg: 240');
  });

  it('keeps one TrackActionMenu transport API for button and pointer callers', () => {
    expect(trackMenuSource).toContain('anchor: {');
    expect(trackMenuSource).toContain(':anchor="anchor"');
    expect(trackMenuSource).not.toMatch(/anchorEl|anchor-el|\bx: \{|\by: \{/u);

    const buttonCallers = [
      '../library/CollectionActionRail.vue',
      '../library/LibraryBrowseWorkspace.vue',
      '../performance-session/PerformanceSessionPlanList.vue',
      '../settings/DiagnosticsSettingsRow.vue',
      '../settings/PlaybackHistorySettingsRow.vue',
      '../settings/SettingsDependencyActions.vue',
      '../../views/SettingsView.vue',
    ];
    for (const path of buttonCallers) {
      const source = sourceFor(path);
      expect(source, path).toContain("kind: 'element'");
      expect(source, path).not.toMatch(/anchor-el|align-x/u);
    }

    const pointCallers = [
      '../library/LibraryBrowseContent.vue',
      '../playback/context/TrackContextActions.vue',
      '../playlists/PlaylistSidebar.vue',
      '../queue/QueuePanel.vue',
      '../separation/SeparationToolbarList.vue',
      '../track/TrackPreviewOverlay.vue',
      './UiFolderArtifactCanvas.vue',
    ];
    for (const path of pointCallers) {
      expect(sourceFor(path), path).toContain("kind: 'point'");
    }
  });
});
