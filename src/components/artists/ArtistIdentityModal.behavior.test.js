import { readFileSync } from 'node:fs';
import { createSSRApp, h, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import UiButton from '../ui/UiButton.vue';
import UiField from '../ui/UiField.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import ArtistIdentityModal from './ArtistIdentityModal.vue';
import ArtistIdentityCatalog from './ArtistIdentityCatalog.vue';
import ArtistIdentityCredits from './ArtistIdentityCredits.vue';
import ArtistIdentityMerge from './ArtistIdentityMerge.vue';

const source = readFileSync(
  new URL('./ArtistIdentityModal.vue', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [ArtistIdentityModal, './ArtistIdentityModal.vue'],
  [ArtistIdentityCatalog, './ArtistIdentityCatalog.vue'],
  [ArtistIdentityCredits, './ArtistIdentityCredits.vue'],
  [ArtistIdentityMerge, './ArtistIdentityMerge.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiModal, '../ui/UiModal.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiRadioGroup, '../ui/UiRadioGroup.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiSearchBox, '../ui/UiSearchBox.vue'],
  [UiTextField, '../ui/UiTextField.vue'],
  [UiTooltip, '../ui/UiTooltip.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const CURRENT = {
  id: 'artist-11111111-1111-4111-8111-111111111111',
  name: '林俊傑',
  identityResolved: true,
  credits: [
    { id: 'credit-english', name: 'JJ Lin', trackCount: 1 },
    { id: 'credit-chinese', name: '林俊傑', trackCount: 1 },
  ],
};
const ARTISTS = [
  CURRENT,
  { id: 'artist-jay', name: '周杰倫', trackIds: ['jay-1'] },
  { id: 'artist-aimer', name: 'Aimer', trackIds: ['aimer-1', 'aimer-2'] },
];

function props(overrides = {}) {
  return {
    open: true,
    artist: CURRENT,
    artists: ARTISTS,
    canUndo: true,
    busy: false,
    error: '',
    lookupStatus: 'idle',
    catalogCandidates: [],
    lookupError: '',
    ...overrides,
  };
}

async function render(overrides = {}) {
  return renderToString(
    createSSRApp({
      render: () => h(ArtistIdentityModal, props(overrides)),
    }),
  );
}

describe('ArtistIdentityModal', () => {
  it('uses a wide recovery-first layout without exposing manual fields by default', async () => {
    const html = await render();

    expect(source).toContain('size="wide"');
    expect(source).toContain('max-block-size="medium"');
    expect(source).not.toContain('fixed-height');
    expect(source).toContain('class="artist-identity-modal__workflow"');
    expect(source).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
    expect(source).toContain('@container (max-width: 40rem)');
    expect(source).toContain('ArtistIdentityCredits');
    expect(source).toContain('ArtistIdentityMerge');
    expect(source).toContain('ArtistIdentityCatalog');
    expect(source).toContain('const advancedOpen = shallowRef(false)');
    expect(html).toContain('整理藝人：林俊傑');
    expect(html.indexOf('目前組合')).toBeLessThan(html.indexOf('整理狀態'));
    expect(html).toContain('JJ Lin');
    expect(html).toContain('林俊傑');
    expect(html).toContain('已自動整理');
    expect(html).toContain('組合有誤時，拆分標示即可');
    expect(html).toContain('進階修正');
    expect(html).toContain('復原');
    expect(html).not.toContain('顯示名稱');
    expect(html).not.toContain('合併藝人');
    expect(html).not.toContain('重新辨識');
    expect(html).not.toContain('搜尋要合併的藝人');
    expect(html).not.toContain(`value="${CURRENT.id}"`);
  });

  it('explains the pending automatic path when identity is not resolved yet', async () => {
    const html = await render({
      artist: { ...CURRENT, identityResolved: false },
    });

    expect(html).toContain('等待自動整理');
    expect(html).toContain('取得足夠證據後會自動整合');
    expect(html).not.toContain('已自動整理');
  });

  it('hides undo when there is no recovery step available', async () => {
    const html = await render({ canUndo: false });
    expect(html).not.toContain('復原');
  });

  it('offers explicit lookup retry as a fallback and applies only the selected opaque candidate', async () => {
    const onSearchCatalog = vi.fn();
    const onApplyCatalog = vi.fn();
    const mounted = mount(ArtistIdentityModal, {
      ...props({
        lookupStatus: 'ready',
        catalogCandidates: [
          {
            candidateId: 'candidate_000000000000000000000000',
            name: '林俊傑',
            aliases: ['JJ Lin'],
            type: 'Person',
            evidence: 'exact-recording',
            canAutoLink: true,
          },
        ],
      }),
      onSearchCatalog,
      onApplyCatalog,
    });
    await nextTick();
    const button = (label) =>
      findAll(
        mounted.overlayHost,
        (node) => node.type === 'button' && textContent(node).trim() === label,
      )[0];

    trigger(button('進階修正'), 'onClick');
    await nextTick();
    trigger(button('重新辨識'), 'onClick');
    const radio = findAll(
      mounted.overlayHost,
      (node) =>
        node.type === 'input' &&
        node.props.value === 'candidate_000000000000000000000000',
    )[0];
    trigger(radio, 'onChange');
    await nextTick();
    trigger(button('套用'), 'onClick');

    expect(onSearchCatalog).toHaveBeenCalledOnce();
    expect(onApplyCatalog).toHaveBeenCalledWith(
      'candidate_000000000000000000000000',
    );
    mounted.app.unmount();
  });

  it('emits bounded merge, display-name, split, and undo intents only', async () => {
    const onMerge = vi.fn();
    const onSetDisplayName = vi.fn();
    const onSplit = vi.fn();
    const onUndo = vi.fn();
    const mounted = mount(ArtistIdentityModal, {
      ...props(),
      onMerge,
      onSetDisplayName,
      onSplit,
      onUndo,
    });
    await nextTick();

    const button = (label) =>
      findAll(
        mounted.overlayHost,
        (node) => node.type === 'button' && textContent(node).trim() === label,
      )[0];
    trigger(button('進階修正'), 'onClick');
    await nextTick();

    const search = findAll(
      mounted.overlayHost,
      (node) => node.type === 'input' && node.props.type === 'search',
    )[0];
    trigger(search, 'onInput', { target: { value: '周杰倫' } });
    await nextTick();

    const radio = findAll(
      mounted.overlayHost,
      (node) => node.type === 'input' && node.props.value === 'artist-jay',
    )[0];
    trigger(radio, 'onChange');
    await nextTick();
    trigger(button('合併'), 'onClick');
    trigger(button('儲存'), 'onClick');
    trigger(button('拆分 JJ Lin'), 'onClick');
    trigger(button('復原'), 'onClick');

    expect(onMerge).toHaveBeenCalledWith('artist-jay');
    expect(onSetDisplayName).toHaveBeenCalledWith('林俊傑');
    expect(onSplit).toHaveBeenCalledWith('credit-english');
    expect(onUndo).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });

  it('renders empty search, busy, and bounded error states accessibly', async () => {
    const empty = await render({ artists: [CURRENT] });
    const busy = await render({ busy: true });
    const failed = await render({ error: '藝人資料已更新，請重新確認。' });

    expect(empty).not.toContain('請先輸入藝人名稱');
    expect(busy).toContain('disabled');
    expect(busy).toContain('aria-busy="true"');
    expect(failed).toContain('藝人資料已更新，請重新確認。');
  });
});
