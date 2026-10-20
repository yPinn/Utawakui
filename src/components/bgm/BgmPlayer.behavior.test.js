import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync(
  new URL('./BgmPlayer.vue', import.meta.url),
  'utf8',
);
describe('BGM feature ownership', () => {
  it('composes one source, one transport and a progressive picker from existing feature components', () => {
    for (const part of [
      'BgmCurrentSource',
      'BgmPlayerTransport',
      'BgmTrackPicker',
      'projectBgmOperationalStatus',
      'useBgmSession',
      'useBgmStandbyPlan',
    ])
      expect(source).toContain(part);
    for (const obsolete of [
      'useBoundedMovableSurface',
      'requestClose',
      'sessionActive',
      'new Audio',
      'onUnmounted',
      'onMounted',
      'UiSurface',
    ])
      expect(source).not.toContain(obsolete);
    expect(source).toContain('restorePending: handoffState.restorePending');
  });
  it('keeps the fixed Dock available in idle and performance-page states', () => {
    expect(source).not.toContain('v-if="visible"');
    expect(source).not.toContain('useAppView');
    expect(source).not.toContain("variant === 'session' && pickerExpanded");
    expect(source).toContain('v-if="pickerExpanded"');
    expect(source).not.toContain('setExpanded');
  });
});
