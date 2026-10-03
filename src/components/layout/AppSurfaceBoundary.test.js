import { h, inject } from 'vue';
import { describe, expect, it } from 'vitest';
import { UI_OVERLAY_HOST_KEY } from '../../composables/useUiOverlayHost.js';
import { attachClientRender, findAll, mount } from '../ui/uiTestHost.js';
import AppSurfaceBoundary from './AppSurfaceBoundary.vue';

attachClientRender(
  AppSurfaceBoundary,
  './AppSurfaceBoundary.vue',
  import.meta.url,
);

describe('AppSurfaceBoundary', () => {
  it('registers one surface and provides its local overlay host', () => {
    const OverlayProbe = {
      setup() {
        const host = inject(UI_OVERLAY_HOST_KEY);
        return () => h('span', { 'data-overlay-host': host });
      },
    };
    const { app, root } = mount(
      AppSurfaceBoundary,
      { surfaceId: 'setlist' },
      { default: () => h(OverlayProbe) },
    );
    const boundary = findAll(
      root,
      (node) => node.props?.['data-ui-surface'] === 'setlist',
    )[0];
    const host = findAll(
      root,
      (node) => node.props?.id === 'setlist-overlay',
    )[0];
    const probe = findAll(root, (node) => node.props?.['data-overlay-host'])[0];

    expect(boundary.props['data-ui-system']).toBe('v1');
    expect(host.props['data-ui-surface']).toBe('setlist-overlay');
    expect(host.props['data-ui-system']).toBe('v1');
    expect(probe.props['data-overlay-host']).toBe('#setlist-overlay');
    app.unmount();
  });
});
