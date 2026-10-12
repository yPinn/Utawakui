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
      { surfaceId: 'library' },
      { default: () => h(OverlayProbe) },
    );
    const boundary = findAll(
      root,
      (node) => node.props?.['data-ui-surface'] === 'library',
    )[0];
    const host = findAll(
      root,
      (node) => node.props?.id === 'library-overlay',
    )[0];
    const probe = findAll(root, (node) => node.props?.['data-overlay-host'])[0];

    expect(boundary.props['data-ui-system']).toBe('v2');
    expect(host.props['data-ui-surface']).toBe('library-overlay');
    expect(host.props['data-ui-system']).toBe('v2');
    expect(probe.props['data-overlay-host']).toBe('#library-overlay');
    app.unmount();
  });

  it('registers the Performance Session workspace as a complete v2 child surface', () => {
    const { app, root } = mount(AppSurfaceBoundary, {
      surfaceId: 'performance-session-workspace',
    });
    const boundary = findAll(
      root,
      (node) =>
        node.props?.['data-ui-surface'] === 'performance-session-workspace',
    )[0];
    const host = findAll(
      root,
      (node) => node.props?.id === 'performance-session-workspace-overlay',
    )[0];

    expect(boundary.props['data-ui-system']).toBe('v2');
    expect(host.props['data-ui-system']).toBe('v2');
    app.unmount();
  });

  it('mounts a detached child host beside its parent host', () => {
    const { app, root } = mount(
      AppSurfaceBoundary,
      {
        surfaceId: 'performance',
        childHosts: ['performance-session-workspace'],
      },
      {
        default: () =>
          h(AppSurfaceBoundary, {
            surfaceId: 'performance-session-workspace',
            detachedHost: true,
          }),
      },
    );
    const hostIds = findAll(root, (node) =>
      String(node.props?.class ?? '').includes('ui-overlay-host'),
    ).map((node) => node.props.id);

    expect(hostIds).toEqual([
      'performance-overlay',
      'performance-session-workspace-overlay',
    ]);
    app.unmount();
  });

  it('rejects a child host that the registry does not parent here', () => {
    expect(() =>
      mount(AppSurfaceBoundary, {
        surfaceId: 'lyrics',
        childHosts: ['performance-session-workspace'],
      }),
    ).toThrow(/not a child of lyrics/u);
  });
});
