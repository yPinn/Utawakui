import { nextTick, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import UiPhotoFrame from './UiPhotoFrame.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from './uiTestHost.js';
attachClientRender(UiPhotoFrame, './UiPhotoFrame.vue', import.meta.url);

describe('UiPhotoFrame reactive source and label ownership', () => {
  it('preserves native image recovery through source replacement and removal', async () => {
    const props = reactive({
      src: '/bad-image',
      alt: '照片',
      frame: 'instant',
      label: '中文 日本語',
    });
    const { root, app } = mount(UiPhotoFrame, props);
    const img = findAll(root, (n) => n.type === 'img')[0];
    expect(img.props).toMatchObject({
      src: '/bad-image',
      alt: '照片',
      draggable: 'false',
    });
    props.src = '/valid-image';
    props.alt = '更新照片';
    await nextTick();
    expect(img.props).toMatchObject({ src: '/valid-image', alt: '更新照片' });
    props.src = '';
    await nextTick();
    expect(img.props.src).toBe('');
    props.src = '/restored';
    await nextTick();
    expect(img.props.src).toBe('/restored');
    app.unmount();
  });

  it('restores instant-film caption and its length scale without changing stored text', async () => {
    const props = reactive({
      src: '/photo',
      frame: 'instant',
      label: '短',
      labelLang: 'zh-Hant',
    });
    const { root, app } = mount(UiPhotoFrame, props);
    const caption = () => findAll(root, (n) => n.type === 'figcaption')[0];
    const units = () =>
      Number(caption().props.style['--ui-photo-frame-label-units']);
    const initial = units();
    props.label = '長文字日本語 English '.repeat(9);
    await nextTick();
    expect(units()).toBeGreaterThan(initial);
    expect(textContent(caption())).toBe(props.label);
    expect(caption().props.lang).toBe('zh-Hant');
    props.frame = 'print';
    await nextTick();
    expect(caption()).toBeUndefined();
    props.frame = 'instant';
    props.label = '短';
    await nextTick();
    expect(units()).toBe(initial);
    props.label = '';
    await nextTick();
    expect(caption()).toBeUndefined();
    app.unmount();
  });
});
