import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');

describe('App shell right Dock', () => {
  it('owns Queue and metadata surfaces beside the primary archive workspace', () => {
    expect(source).toContain('class="shell__main shell__main--with-dock"');
    expect(source).toContain('class="shell__workspace"');
    expect(source).toContain('class="shell__dock"');
    expect(source).toContain('<AppRightDock');
    expect(source).toContain('<QueuePanel');
    expect(source).toContain('RIGHT_DOCK_SURFACE_METADATA');
    expect(source).toContain('RIGHT_DOCK_SURFACE_QUEUE');
    expect(source).not.toContain('#context');
  });

  it('reserves the shared desktop bay and reuses the 16px shell panel inset', () => {
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
  });

  it('routes artwork and Queue triggers into the same Dock content target', () => {
    expect(source).toContain(':artwork-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(source).toContain(':queue-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(source).toContain('@artwork-activate="toggleMetadataSurface"');
    expect(source).toContain('@queue-activate="toggleQueueSurface"');
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
