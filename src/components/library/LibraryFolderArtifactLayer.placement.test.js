import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import LibraryFolderArtifactLayer from './LibraryFolderArtifactLayer.vue';

const capture = vi.hoisted(() => ({ artifacts: [] }));
vi.mock('../ui/UiFolderArtifactCanvas.vue', () => ({
  default: {
    props: ['artifacts'],
    setup(props) {
      capture.artifacts = props.artifacts;
      return () => null;
    },
  },
}));

async function render(objects = []) {
  await renderToString(
    createSSRApp({
      render: () =>
        h(LibraryFolderArtifactLayer, {
          summary: { artist: '測試藝人', trackCount: 2, albumCount: 2 },
          objects,
        }),
    }),
  );
  return capture.artifacts;
}

describe('album and Single data memo placement', () => {
  it('starts the shared unsaved summary at the top right of the paper', async () => {
    const [summary] = await render();
    expect(summary).toMatchObject({
      id: 'derived:artist-summary',
      initialPlacement: { region: 'paper', anchor: { x: 1, y: 0 } },
      initialPinned: false,
      rotation: -1.5,
    });
  });

  it('keeps a saved summary placement, pin and rotation ahead of the new default', async () => {
    const placement = { region: 'bottom', anchor: { x: 0.2, y: 0.7 } };
    const [summary] = await render([
      {
        key: 'derived:artist-summary',
        type: 'note',
        source: 'derived',
        placement,
        pinned: true,
        rotation: 2,
        order: 1,
      },
    ]);
    expect(summary).toMatchObject({
      initialPlacement: placement,
      initialPinned: true,
      rotation: 2,
    });
    expect(placement).toEqual({ region: 'bottom', anchor: { x: 0.2, y: 0.7 } });
  });

  it('leaves user note placement unchanged', async () => {
    const placement = { region: 'side', anchor: { x: 0.3, y: 0.8 } };
    const artifacts = await render([
      {
        key: 'note:custom',
        type: 'note',
        source: 'user',
        text: '備忘',
        placement,
        rotation: 1,
        order: 2,
      },
    ]);
    expect(artifacts.find(({ id }) => id === 'note:custom')).toMatchObject({
      initialPlacement: placement,
      rotation: 1,
    });
  });
});
