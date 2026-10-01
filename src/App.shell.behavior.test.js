import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');

describe('App shell right Dock', () => {
  it('routes shell navigation through the app-view action API', () => {
    expect(source).toMatch(
      /const\s*\{[\s\S]*?activeView,[\s\S]*?setActiveView,[\s\S]*?\}\s*=\s*useAppView\(\);/u,
    );
    expect(source).toContain(':active-view="activeView"');
    expect(source).toContain('@update:active-view="setActiveView"');
    expect(source).toContain(
      'useKeyboardShortcuts({ internalViewShortcuts });',
    );
    expect(source).not.toContain('v-model:active-view="activeView"');
  });

  it('renders Settings in a mutually exclusive shell utility frame', () => {
    expect(source).toContain(
      "import AppUtilityFrame from './components/layout/AppUtilityFrame.vue';",
    );
    expect(source).toContain(':settings-active="isSettingsView"');
    expect(source).toContain(':update-available="appUpdateReady"');
    expect(source).toContain('@open-settings="openSettings"');
    expect(source).toMatch(/<AppUtilityFrame\s+v-if="isSettingsView"/u);
    expect(source).toContain('@back="leaveSettings"');
    expect(source).toContain('<SettingsView />');
    expect(source).toMatch(/<AppArchiveFrame\s+v-else/u);
    expect(source).not.toContain('settings: SettingsView');
  });

  it('owns playback and metadata surfaces beside the primary archive workspace', () => {
    expect(source).toContain('class="shell__main shell__main--with-dock"');
    expect(source).toContain('class="shell__workspace"');
    expect(source).toContain('class="shell__dock"');
    expect(source).toContain('<AppRightDock');
    expect(source).toContain('<QueuePanel');
    expect(source).toContain('RIGHT_DOCK_SURFACE_METADATA');
    expect(source).toContain('RIGHT_DOCK_SURFACE_QUEUE');
    expect(source).not.toContain('<SeparationQueuePanel');
    expect(source).not.toContain('RIGHT_DOCK_SURFACE_SEPARATION');
    expect(source).not.toContain('#context');
  });

  it('reserves the shared desktop bay and reuses the 16px shell panel inset', () => {
    expect(source).toMatch(
      /<div\s+class="shell__workspace"\s+:class="\{ 'shell__workspace--utility': isSettingsView \}"\s*>/u,
    );
    expect(source).toMatch(
      /\.shell__main--with-dock\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--ui-right-dock-width\);[^}]*gap:\s*var\(--ui-space-3\);[^}]*\}/su,
    );
    expect(source).toMatch(
      /\.shell__dock\s*\{[^}]*justify-content:\s*flex-end;[^}]*padding-top:\s*var\(--ui-shell-panel-inset-block\);[^}]*\}/su,
    );
    expect(source).toMatch(
      /\.shell__sidebar\s*\{[^}]*padding-block:\s*var\(--ui-shell-panel-inset-block\);[^}]*\}/su,
    );
    expect(source).toMatch(
      /\.shell__main\s*\{[^}]*padding-bottom:\s*var\(--ui-shell-panel-inset-block\);[^}]*\}/su,
    );
    expect(source).toMatch(
      /\.shell__workspace--utility\s*\{[^}]*padding-top:\s*var\(--ui-shell-panel-inset-block\);[^}]*\}/su,
    );
    expect(source).not.toMatch(/\.shell__workspace\s*\{[^}]*padding-top:/su);
  });

  it('routes playback triggers to the Dock while accompaniment stays in the titlebar', () => {
    expect(source).toContain(':artwork-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(source).toContain(':queue-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(source).toContain('@artwork-activate="toggleMetadataSurface"');
    expect(source).toContain('@queue-activate="toggleQueueSurface"');
    expect(source).not.toContain(':separation-expanded');
    expect(source).not.toContain('@open-separation');
    expect(source).not.toContain('openSeparationSurface');
    expect(source).not.toContain(':separation-controls=');
    expect(source).not.toContain('@separation-activate=');
    expect(source).toContain(
      '@close="closeDockSurface(RIGHT_DOCK_SURFACE_METADATA)"',
    );
    expect(source).toContain(
      '@close="closeDockSurface(RIGHT_DOCK_SURFACE_QUEUE)"',
    );
  });

  it('retains an opened Queue and switches Dock surfaces without display-none remounts', () => {
    expect(source).toContain(
      'v-if="rightDock.mountedSurfaces[RIGHT_DOCK_SURFACE_QUEUE]"',
    );
    expect(source).toContain(':active="queueExpanded"');
    expect(source).toContain(
      "'shell__dock-surface--active': queueSurfaceActive",
    );
    expect(source).not.toMatch(/<QueuePanel[\s\S]*?v-show=/u);
    expect(source).toMatch(
      /\.shell__dock-surface\s*\{[^}]*position:\s*absolute;[^}]*opacity:\s*0;[^}]*transform:\s*translateX/su,
    );
    expect(source).toMatch(
      /\.shell__dock-surface--active\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*translateX\(0\)/su,
    );
  });

  it('records Queue trigger-to-paint timing in development diagnostics', () => {
    expect(source).toContain('measureInteractionToNextPaint');
    expect(source).toContain('utawakui:right-dock:queue-toggle');
  });

  it('returns the bay to an end-aligned overlay at the shared compact breakpoint', () => {
    expect(source).toMatch(
      /@media \(max-width: 70rem\)[\s\S]*\.shell__main--with-dock\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*gap:\s*0;[^}]*\}/u,
    );
    expect(source).toMatch(
      /@media \(max-width: 70rem\)[\s\S]*\.shell__dock\s*\{[^}]*position:\s*absolute;[^}]*inset-inline-end:\s*var\(--ui-shell-edge-inset-inline\);[^}]*\}/u,
    );
  });
});
