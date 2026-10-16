import { createSSRApp, h, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import UiArtworkLoading from '../ui/UiArtworkLoading.vue';
import UiButton from '../ui/UiButton.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import TrackArtworkContent from '../ui/TrackArtworkContent.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import ArtistPhotoCandidateModal from './ArtistPhotoCandidateModal.vue';

const CANDIDATE_ID = 'candidate_0123456789abcdef012345';
const CANDIDATES = [
  {
    candidateId: CANDIDATE_ID,
    name: '艾熱AIR',
    previewUrl: 'blob:artist-preview',
    previewStatus: 'ready',
  },
];

for (const [component, filename] of [
  [ArtistPhotoCandidateModal, './ArtistPhotoCandidateModal.vue'],
  [UiArtworkLoading, '../ui/UiArtworkLoading.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiCollageThumb, '../ui/UiCollageThumb.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiModal, '../ui/UiModal.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiRadioGroup, '../ui/UiRadioGroup.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiSkeleton, '../ui/UiSkeleton.vue'],
  [TrackArtworkContent, '../ui/TrackArtworkContent.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

async function render(props) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ArtistPhotoCandidateModal, {
          open: true,
          artistName: '艾熱AIR',
          status: 'ready',
          candidates: [],
          selectedCandidateId: null,
          error: '',
          ...props,
        }),
    }),
  );
}

describe('ArtistPhotoCandidateModal', () => {
  it('explains the anonymous YT Music lookup and local confirmation boundary', async () => {
    const html = await render({ candidates: CANDIDATES });

    expect(html).toContain('選擇 艾熱AIR 的照片');
    expect(html).toContain('YouTube Music');
    expect(html).toContain('不會登入你的帳號');
    expect(html).toContain('套用後儲存到本機');
    expect(html).toContain('src="blob:artist-preview"');
    expect(html).not.toMatch(/<img[^>]+src="https?:\/\//u);
  });

  it.each([
    ['searching', '正在搜尋藝人照片…'],
    ['empty', '找不到合適的藝人照片。'],
  ])('renders the %s state without a candidate radio', async (status, copy) => {
    const html = await render({ status });

    expect(html).toContain(copy);
    expect(html).not.toContain('type="radio"');
  });

  it('uses shared radio, artwork, and skeleton primitives for candidate states', async () => {
    const ready = await render({ candidates: CANDIDATES });
    const searching = await render({ status: 'searching' });
    const loading = await render({
      candidates: [
        {
          candidateId: CANDIDATE_ID,
          name: '艾熱AIR',
          previewUrl: '',
          previewStatus: 'loading',
        },
      ],
    });

    expect(ready).toContain('ui-radio-group--tiles');
    expect(ready).toContain('ui-collage-thumb');
    expect(searching).toContain('ui-skeleton--circle');
    expect(loading).toContain('ui-artwork-loading');
    expect(loading).toContain('ui-radio-group__option--disabled');
  });

  it('renders a bounded error with a retry action', async () => {
    const html = await render({
      status: 'error',
      error: '外部來源目前無法使用，請稍後再試。',
    });

    expect(html).toContain('外部來源目前無法使用');
    expect(html).toContain('重新搜尋');
  });

  it('uses native radios and emits only candidate selection and confirmation intents', async () => {
    const selectCandidate = vi.fn();
    const confirm = vi.fn();
    const { app, overlayHost } = mount(ArtistPhotoCandidateModal, {
      open: true,
      artistName: '艾熱AIR',
      status: 'ready',
      candidates: CANDIDATES,
      selectedCandidateId: null,
      error: '',
      onSelectCandidate: selectCandidate,
      onConfirm: confirm,
    });
    await nextTick();
    const radio = findAll(
      overlayHost,
      (node) => node.type === 'input' && node.props.type === 'radio',
    )[0];
    const confirmButton = findAll(
      overlayHost,
      (node) =>
        node.type === 'button' && textContent(node).trim() === '套用照片',
    )[0];

    expect(radio.props).toMatchObject({
      name: 'artist-photo-candidate',
      value: CANDIDATE_ID,
      checked: false,
    });
    expect(confirmButton.props.disabled).toBe(true);
    trigger(radio, 'onChange');
    trigger(confirmButton, 'onClick');
    expect(selectCandidate).toHaveBeenCalledWith(CANDIDATE_ID);
    expect(confirm).not.toHaveBeenCalled();
    app.unmount();

    const selected = mount(ArtistPhotoCandidateModal, {
      open: true,
      artistName: '艾熱AIR',
      status: 'ready',
      candidates: CANDIDATES,
      selectedCandidateId: CANDIDATE_ID,
      error: '',
      onConfirm: confirm,
    });
    await nextTick();
    const selectedConfirm = findAll(
      selected.overlayHost,
      (node) =>
        node.type === 'button' && textContent(node).trim() === '套用照片',
    )[0];
    expect(selectedConfirm.props.disabled).toBe(false);
    trigger(selectedConfirm, 'onClick');
    expect(confirm).toHaveBeenCalledOnce();
    selected.app.unmount();
  });

  it('keeps candidates with failed previews unavailable for selection', async () => {
    const html = await render({
      candidates: [
        {
          candidateId: CANDIDATE_ID,
          name: '艾熱AIR',
          previewUrl: '',
          previewStatus: 'error',
        },
      ],
    });

    expect(html).toContain('預覽無法載入');
    expect(html).toContain('disabled');
  });

  it('projects applying as the shared disabled option state', async () => {
    const html = await render({
      status: 'applying',
      candidates: CANDIDATES,
      selectedCandidateId: CANDIDATE_ID,
    });

    expect(html).toContain('ui-radio-group__option--disabled');
    expect(html).toContain('disabled');
  });
});
