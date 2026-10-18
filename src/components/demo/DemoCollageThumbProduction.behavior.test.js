import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import DemoCollageThumbProduction from './DemoCollageThumbProduction.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import TrackArtworkContent from '../ui/TrackArtworkContent.vue';
import UiArtworkOverlay from '../ui/UiArtworkOverlay.vue';
import UiArtworkLoading from '../ui/UiArtworkLoading.vue';
import UiButton from '../ui/UiButton.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, file] of [
  [DemoCollageThumbProduction, './DemoCollageThumbProduction.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [TrackArtworkContent, '../ui/TrackArtworkContent.vue'],
  [UiArtworkOverlay, '../ui/UiArtworkOverlay.vue'],
  [UiArtworkLoading, '../ui/UiArtworkLoading.vue'],
  [UiButton, '../ui/UiButton.vue'],
])
  attachClientRender(component, file, import.meta.url);

const one = (root, predicate) => findAll(root, predicate)[0];
const attr = (root, name, value) =>
  one(
    root,
    (n) => name in n.props && (value === undefined || n.props[name] === value),
  );
const images = (root) => findAll(root, (n) => n.type === 'img');
const click = async (root, name) => {
  trigger(attr(root, name), 'onClick', {});
  await nextTick();
};
const error = async (image) => {
  trigger(image, 'onError');
  await nextTick();
};
const cell = (root) =>
  one(root, (n) => n.props.class === 'ui-collage-thumb__cell');

describe('formal collage catalogue states and recovery', () => {
  it('preserves the formal 0–5 member grid, order, vacant slots and four-member cap', () => {
    const { app, root } = mount(DemoCollageThumbProduction);
    for (let count = 0; count <= 5; count++) {
      const specimen = attr(root, 'data-collage-count', count);
      const occupied = findAll(
        specimen,
        (n) => n.props.class === 'ui-collage-thumb__cell',
      );
      const vacant = findAll(
        specimen,
        (n) =>
          n.props.class ===
          'ui-collage-thumb__cell ui-collage-thumb__cell--empty',
      );
      expect(occupied).toHaveLength(Math.min(4, count));
      expect(vacant).toHaveLength(4 - Math.min(4, count));
      expect(images(specimen)).toHaveLength(Math.min(4, count));
    }
    const firstFour = images(attr(root, 'data-collage-count', 4)).map(
      (n) => n.props.src,
    );
    expect(
      images(attr(root, 'data-collage-count', 5)).map((n) => n.props.src),
    ).toEqual(firstFour);
    expect(images(attr(root, 'data-collage-case', 'single'))).toHaveLength(1);
    expect(images(attr(root, 'data-collage-case', 'single'))[0].props.src).toBe(
      firstFour[0],
    );
    app.unmount();
  });

  it('distinguishes empty collections, missing member images and vacant slots', () => {
    const { app, root } = mount(DemoCollageThumbProduction);
    expect(images(attr(root, 'data-collage-count', 0))).toHaveLength(0);
    expect(
      images(attr(root, 'data-collage-case', 'empty-single')),
    ).toHaveLength(0);
    const missing = attr(root, 'data-collage-case', 'missing');
    expect(
      images(missing).map((n) => n.props['data-track-artwork-kind']),
    ).toEqual(['fallback', 'fallback']);
    expect(
      findAll(missing, (n) => String(n.props.class).includes('cell--empty')),
    ).toHaveLength(2);
    app.unmount();
  });

  it('composes an exposed loading status, completes and reloads without hiding it from AT', async () => {
    const { app, root } = mount(DemoCollageThumbProduction);
    const specimen = attr(root, 'data-collage-case', 'loading');
    const thumb = one(specimen, (n) => 'aria-busy' in n.props);
    expect(thumb.props['aria-hidden']).toBeUndefined();
    expect(thumb.props['aria-busy']).toBe(true);
    expect(textContent(specimen)).toContain('集合封面資料載入中');
    expect(attr(root, 'data-collage-reload').props.disabled).toBe(true);
    await click(root, 'data-collage-complete');
    expect(thumb.props['aria-busy']).toBe(false);
    expect(
      findAll(specimen, (n) => n.props.class === 'ui-artwork-loading'),
    ).toHaveLength(0);
    expect(images(specimen)).toHaveLength(4);
    expect(attr(root, 'data-collage-complete').props.disabled).toBe(true);
    await click(root, 'data-collage-reload');
    expect(thumb.props['aria-busy']).toBe(true);
    expect(images(specimen)).toHaveLength(0);
    app.unmount();
  });

  it('falls from member custom to fallback to initial, then recovers on the same instance', async () => {
    const { app, root } = mount(DemoCollageThumbProduction);
    const specimen = attr(root, 'data-collage-case', 'member-recovery');
    const firstCell = cell(specimen);
    const neighbour = images(specimen)[1];
    await error(images(firstCell)[0]);
    expect(images(firstCell)[0].props['data-track-artwork-kind']).toBe(
      'fallback',
    );
    await error(images(firstCell)[0]);
    expect(images(firstCell)).toHaveLength(0);
    expect(textContent(firstCell)).toBe('恢');
    await click(root, 'data-collage-member-valid');
    expect(cell(specimen)).toBe(firstCell);
    expect(images(firstCell)[0].props['data-track-artwork-kind']).toBe(
      'custom',
    );
    expect(images(specimen)[1]).toBe(neighbour);
    expect(images(firstCell)[0].props.alt).toBe('');
    expect(String(images(firstCell)[0].props.draggable)).toBe('false');
    // Removing the recovered custom image retains a remembered fallback failure.
    await click(root, 'data-collage-member-missing');
    expect(textContent(firstCell)).toBe('恢');
    await click(root, 'data-collage-member-retry');
    await error(images(cell(specimen))[0]);
    expect(images(cell(specimen))[0].props['data-track-artwork-kind']).toBe(
      'fallback',
    );
    app.unmount();
  });

  it('uses a fallback for removed artwork and explicitly remounts to retry a failed URL', async () => {
    const { app, root } = mount(DemoCollageThumbProduction);
    const specimen = attr(root, 'data-collage-case', 'member-recovery');
    const original = cell(specimen);
    await error(images(original)[0]);
    await click(root, 'data-collage-member-valid');
    await click(root, 'data-collage-member-missing');
    expect(images(cell(specimen))[0].props['data-track-artwork-kind']).toBe(
      'fallback',
    );
    await click(root, 'data-collage-member-retry');
    expect(cell(specimen)).not.toBe(original);
    expect(images(cell(specimen))[0].props['data-track-artwork-kind']).toBe(
      'custom',
    );
    await error(images(cell(specimen))[0]);
    expect(images(cell(specimen))[0].props['data-track-artwork-kind']).toBe(
      'fallback',
    );
    app.unmount();
  });

  it('reports collection-cover errors without adopting Candidate fallback, then replaces or removes it', async () => {
    const { app, root } = mount(DemoCollageThumbProduction);
    const specimen = attr(root, 'data-collage-case', 'cover-recovery');
    const cover = images(specimen)[0];
    trigger(specimen, 'onErrorCapture', {
      target: {
        classList: {
          contains: (name) => name === 'ui-collage-thumb__custom-image',
        },
      },
    });
    await nextTick();
    expect(textContent(specimen)).toContain('集合封面載入失敗');
    expect(images(specimen)).toEqual([cover]);
    await click(root, 'data-collage-cover-valid');
    expect(images(specimen)[0]).toBe(cover);
    expect(textContent(specimen)).not.toContain('集合封面載入失敗');
    await click(root, 'data-collage-cover-remove');
    expect(images(specimen)).toHaveLength(4);
    expect(textContent(specimen)).toContain('使用成員拼貼');
    // A member error after removing the collection cover must not set its status.
    trigger(specimen, 'onErrorCapture', {
      target: { classList: { contains: () => false } },
    });
    await nextTick();
    expect(textContent(specimen)).toContain('使用成員拼貼');
    await click(root, 'data-collage-cover-broken');
    expect(images(specimen)).toHaveLength(1);
    app.unmount();
  });
});
