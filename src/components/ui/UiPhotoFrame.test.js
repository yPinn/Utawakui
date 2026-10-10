import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiPhotoFrame from './UiPhotoFrame.vue';

const source = readFileSync(
  new URL('./UiPhotoFrame.vue', import.meta.url),
  'utf8',
);

describe('UiPhotoFrame', () => {
  it('owns one shared physical photo-frame material', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(UiPhotoFrame, {
            src: '/photo.jpg',
            alt: '頁面照片',
          }),
      }),
    );

    expect(html).toContain('ui-photo-frame');
    expect(html).toContain('src="/photo.jpg"');
    expect(html).toContain('alt="頁面照片"');
    expect(source).toMatch(
      /\.ui-photo-frame\s*\{[^}]*padding:\s*var\(--ui-photo-frame-padding\);[^}]*border:\s*var\(--ui-border-width\) solid var\(--ui-photo-frame-border-color\);[^}]*background-color:\s*var\(--ui-photo-frame-bg\);[^}]*box-shadow:\s*var\(--ui-photo-frame-shadow\);/su,
    );
    expect(source).not.toMatch(/#[\da-f]{3,8}\b/iu);
  });

  it('separates thumbnail crop and filter from intrinsic preview sizing', async () => {
    const thumbnail = await renderToString(
      createSSRApp({
        render: () =>
          h(UiPhotoFrame, {
            src: '/thumbnail.jpg',
            alt: '縮圖',
            fit: 'cover',
            filtered: true,
          }),
      }),
    );
    const preview = await renderToString(
      createSSRApp({
        render: () =>
          h(UiPhotoFrame, {
            src: '/preview.jpg',
            alt: '展開照片',
            intrinsic: true,
            fit: 'contain',
          }),
      }),
    );

    expect(thumbnail).toContain('ui-photo-frame--filtered');
    expect(thumbnail).toContain('ui-photo-frame--cover');
    expect(preview).toContain('ui-photo-frame--intrinsic');
    expect(preview).toContain('ui-photo-frame--contain');
    expect(source).toMatch(
      /\.ui-photo-frame--filtered \.ui-photo-frame__image\s*\{[^}]*filter:\s*var\(--ui-photo-frame-filter\)/su,
    );
    expect(source).toMatch(
      /\.ui-photo-frame--intrinsic \.ui-photo-frame__image\s*\{[^}]*inline-size:\s*auto;[^}]*block-size:\s*auto;[^}]*max-inline-size:\s*calc\(\s*var\(--ui-media-max-inline-size\)[\s\S]*?var\(--ui-photo-frame-padding\)[\s\S]*?var\(--ui-border-width\)[\s\S]*?\);[^}]*max-block-size:\s*calc\(\s*var\(--ui-media-max-block-size\)/su,
    );
  });

  it('remains legible in forced-colors mode', () => {
    expect(source).toMatch(
      /@media \(forced-colors: active\)[\s\S]*?\.ui-photo-frame\s*\{[^}]*border-color:\s*CanvasText;[^}]*background-color:\s*Canvas;[\s\S]*?\.ui-photo-frame__image\s*\{[^}]*filter:\s*none;/u,
    );
  });
});
