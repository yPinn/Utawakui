import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import DemoCandidateArtworkEmpty from './DemoCandidateArtworkEmpty.vue';
import DemoCandidateTrackArtwork from './DemoCandidateTrackArtwork.vue';
import DemoCandidateTrackRow from './DemoCandidateTrackRow.vue';
import DemoCandidateTrackThumb from './DemoCandidateTrackThumb.vue';
import DemoTrackRowAppearance from './DemoTrackRowAppearance.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
for (const [component, filename] of [
  [DemoCandidateTrackRow, './DemoCandidateTrackRow.vue'],
  [DemoCandidateTrackThumb, './DemoCandidateTrackThumb.vue'],
  [DemoCandidateTrackArtwork, './DemoCandidateTrackArtwork.vue'],
  [DemoCandidateArtworkEmpty, './DemoCandidateArtworkEmpty.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}
vi.stubGlobal('requestAnimationFrame', (callback) => {
  callback();
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());
vi.stubGlobal('document', {});
const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const primitiveSource = readSource('./DemoTrackRowPrimitive.vue');
const candidateCheckboxSource = readSource('./DemoCandidateCheckbox.vue');
const candidateSource = readSource('./DemoCandidateTrackRow.vue');
const candidateMarqueeSource = readSource('./DemoCandidateMarqueeText.vue');
const reviewContract = readSource(
  '../../../docs/contracts/token-v2-component-review.md',
);
function classIncludes(node, className) {
  return String(node.props?.class ?? '')
    .split(/\s+/u)
    .includes(className);
}
function rowRoot(root) {
  return findAll(root, (node) =>
    classIncludes(node, 'demo-candidate-track-row'),
  )[0];
}
function visibleText(html) {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
}
describe('DemoTrackRowAppearance', () => {
  it('reuses the reviewed UI component layer instead of redrawing child controls', () => {
    for (const component of [
      'DemoCandidateTrackThumb',
      'DemoCandidateMarqueeText',
    ]) {
      expect(candidateSource).toContain(component);
    }
    expect(candidateSource).not.toContain('DemoCandidateTextButton');
    expect(candidateSource).not.toContain('DemoCandidateStatusIcon');
    expect(candidateSource).not.toContain('Volume2');
    expect(candidateSource).not.toMatch(/from ['"]\.\.\/ui\//u);
    for (const component of [
      'DemoCandidateCheckbox',
      'DemoCandidateChip',
      'DemoCandidateStatusIcon',
      'UiCheckbox',
      'UiChip',
      'UiStatusIcon',
      'UiIconButton',
    ]) {
      expect(primitiveSource).toContain(component);
    }
    expect(primitiveSource).not.toContain('DemoCandidateIconButton');
    expect(primitiveSource).not.toMatch(
      /demo-track-row-(?:checkbox|chip|status|delete)__drawn/u,
    );
  });
  it('keeps listitem semantics and uses a named native sibling button for playback', () => {
    const activate = vi.fn();
    const mounted = mount(DemoCandidateTrackRow, {
      track: {
        id: 'track-1',
        title: '群青日和',
        artist: '東京事変',
      },
      interactive: true,
      selected: true,
      current: true,
      actionAriaLabel: '播放群青日和',
      onActivate: activate,
    });
    const row = rowRoot(mounted.root);
    const action = findAll(row, (node) =>
      classIncludes(node, 'demo-candidate-track-row__action'),
    )[0];
    expect(row.type).toBe('li');
    expect(row.props.role).toBeUndefined();
    expect(row.props.tabindex).toBeUndefined();
    expect(row.props['aria-current']).toBe('true');
    expect(action.type).toBe('button');
    expect(action.props.type).toBe('button');
    expect(action.props['aria-label']).toBe('播放群青日和');
    expect(action.props['aria-pressed']).toBeUndefined();
    expect(candidateSource).not.toContain('actionPressed');
    expect(primitiveSource).not.toContain('selectionAction');
    expect(primitiveSource).toContain('`播放${sample.track.title}`');
    trigger(action, 'onClick', {
      type: 'click',
    });
    expect(activate).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });
  it('keeps the artwork destination and trail action as sibling targets', () => {
    const activate = vi.fn();
    const artworkClick = vi.fn();
    const deleteClick = vi.fn();
    const mounted = mount(
      DemoCandidateTrackRow,
      {
        track: {
          id: 'track-2',
          title: 'アイドル',
          artist: 'YOASOBI',
        },
        interactive: true,
        artworkClickable: true,
        artworkAriaLabel: '前往專輯：アイドル',
        actionAriaLabel: '播放アイドル',
        onActivate: activate,
        onArtworkClick: artworkClick,
      },
      {
        trail: () =>
          h(
            'button',
            {
              type: 'button',
              'aria-label': '刪除アイドル',
              onClick: deleteClick,
            },
            '刪除',
          ),
      },
    );
    const row = rowRoot(mounted.root);
    const buttons = findAll(row, (node) => node.type === 'button');
    const action = buttons.find(
      (button) => button.props['aria-label'] === '播放アイドル',
    );
    const artwork = buttons.find(
      (button) => button.props['aria-label'] === '前往專輯：アイドル',
    );
    const remove = buttons.find(
      (button) => button.props['aria-label'] === '刪除アイドル',
    );
    expect(buttons).toHaveLength(3);
    expect(action.parent).toBe(row);
    expect(artwork.parent).not.toBe(action);
    expect(remove.parent).not.toBe(action);
    trigger(artwork, 'onClick', {
      stopPropagation: vi.fn(),
    });
    trigger(remove, 'onClick', {
      stopPropagation: vi.fn(),
    });
    expect(artworkClick).toHaveBeenCalledOnce();
    expect(deleteClick).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
    mounted.app.unmount();
  });
  it('keeps user metadata selectable without firing the row action after a drag selection', async () => {
    const positiveHtml = await renderToString(
      createSSRApp(DemoCandidateTrackRow, {
        track: {
          id: 'track-3',
          title: '夏夜裡需要保留完整資料的繁體中文曲目名稱',
          artist: 'A Very Long Artist Identity Without Convenient Breaks',
          duration: 185,
        },
      }),
    );
    expect(positiveHtml).not.toContain('<button');
    expect(visibleText(positiveHtml)).toContain('3:05');
    for (const duration of [undefined, 0, -1, Number.NaN]) {
      const durationHtml = await renderToString(
        createSSRApp(DemoCandidateTrackRow, {
          track: {
            id: `duration-${String(duration)}`,
            title: '沒有可用時長',
            duration,
          },
        }),
      );
      expect(visibleText(durationHtml)).not.toMatch(/0:00|-1:-1|--:--/u);
    }
    const html = await renderToString(createSSRApp(DemoTrackRowAppearance));
    for (const content of ['long-multilingual', 'rtl-narrow']) {
      expect(html).toContain(`data-track-row-content="${content}"`);
    }
    expect(candidateSource).toMatch(
      /\.demo-candidate-track-row__info\s*\{[\s\S]*?-webkit-user-select:\s*text;[\s\S]*?user-select:\s*text;/u,
    );
    expect(candidateSource).toContain('@click="activateFromRowContent"');
    expect(candidateSource).toMatch(
      /\.demo-candidate-track-row__artist\s*\{[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/u,
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-track-row__artist\s*\{[\s\S]*?line-height:\s*var\(--ui-line-height-label\);/u,
    );
    expect(candidateMarqueeSource).toMatch(
      /\[data-marquee-focus-owner\]:has\(:focus-visible\)\s+\.demo-candidate-marquee--overflow\s+\.demo-candidate-marquee__text/u,
    );
    const activate = vi.fn();
    const mounted = mount(DemoCandidateTrackRow, {
      track: {
        id: 'selectable-track',
        title: '可選曲名',
        artist: '可選演出者',
      },
      interactive: true,
      actionAriaLabel: '播放可選曲名',
      onActivate: activate,
    });
    const info = findAll(rowRoot(mounted.root), (node) =>
      classIncludes(node, 'demo-candidate-track-row__info'),
    )[0];
    trigger(info, 'onClick', {
      view: {
        getSelection: () => ({
          isCollapsed: false,
        }),
      },
    });
    expect(activate).not.toHaveBeenCalled();
    trigger(info, 'onClick', {
      view: {
        getSelection: () => ({
          isCollapsed: true,
        }),
      },
    });
    expect(activate).toHaveBeenCalledOnce();
    mounted.app.unmount();
  });
  it('uses caller-owned inline bounds and a square hidden-label Candidate checkbox target', async () => {
    const html = await renderToString(createSSRApp(DemoTrackRowAppearance));
    const candidateLayer = html.slice(
      html.indexOf('data-track-row-source="candidate"'),
      html.indexOf('data-track-row-source="current"'),
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-track-row\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?min-height:\s*var\(--ui-track-row-min-height\);/u,
    );
    expect(candidateSource).not.toContain('max-height:');
    expect(visibleText(html)).toContain(
      '填滿 caller；52／44px 是高度 floor，不設硬 max-height',
    );
    expect(candidateLayer).toContain('ui-field__label--hidden');
    expect(candidateLayer).toContain('選取音樂分析候選');
    expect(candidateCheckboxSource).toContain(
      'labelHidden: { type: Boolean, default: false }',
    );
    expect(candidateCheckboxSource).toContain(':label-hidden="labelHidden"');
    expect(candidateCheckboxSource).toMatch(
      /\.demo-candidate-checkbox\.has-hidden-label\s*\{[\s\S]*?width:\s*var\(--demo-checkbox-resolved-target-size\);/u,
    );
    expect(primitiveSource).toContain(
      "labelHidden: layer.key === 'candidate' || undefined",
    );
  });
  it('keeps the Candidate checkbox on an icon-width optical lane without shrinking its hit target', async () => {
    const html = await renderToString(createSSRApp(DemoTrackRowAppearance));
    const candidateLayer = html.slice(
      html.indexOf('data-track-row-source="candidate"'),
      html.indexOf('data-track-row-source="current"'),
    );
    const currentLayer = html.slice(
      html.indexOf('data-track-row-source="current"'),
    );
    expect(candidateLayer).toContain('demo-track-row-selection-lane');
    expect(currentLayer).not.toContain('demo-track-row-selection-lane');
    expect(primitiveSource).toMatch(
      /\.demo-track-row-selection-lane\s*\{[\s\S]*?position:\s*relative;[\s\S]*?width:\s*var\(--ui-checkbox-size\);[\s\S]*?height:\s*var\(--ui-control-height\);[\s\S]*?flex:\s*0 0 var\(--ui-checkbox-size\);/u,
    );
    expect(primitiveSource).toMatch(
      /\.demo-track-row-selection-lane__control\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset-block-start:\s*50%;[\s\S]*?inset-inline-start:\s*50%;[\s\S]*?transform:\s*translate\(-50%, -50%\);/u,
    );
    expect(candidateCheckboxSource).toMatch(
      /\.demo-candidate-checkbox\.has-hidden-label\s*\{[\s\S]*?width:\s*var\(--demo-checkbox-resolved-target-size\);[\s\S]*?flex:\s*0 0 var\(--demo-checkbox-resolved-target-size\);/u,
    );
    expect(candidateCheckboxSource).toMatch(
      /\.demo-candidate-checkbox\.has-hidden-label\s+:deep\(\.ui-field__control\)\s*\{[\s\S]*?width:\s*100%;/u,
    );
  });
  it('keeps selectable metadata above the row action and wires ordinary text clicks to visible feedback', () => {
    expect(candidateSource).toMatch(
      /\.demo-candidate-track-row__action\s*\{[\s\S]*?z-index:\s*var\(--ui-layer-base\);/u,
    );
    expect(candidateSource).toMatch(
      /\.demo-candidate-track-row__info,[\s\S]*?\{[\s\S]*?z-index:\s*var\(--ui-layer-raised\);/u,
    );
    expect(candidateSource).toContain('@click="activateFromRowContent"');
    expect(candidateSource).toMatch(
      /class="demo-candidate-track-row__lead"[\s\S]*?@click="activateFromRowContent"/u,
    );
    expect(candidateSource).toMatch(
      /class="demo-candidate-track-row__trail"[\s\S]*?@click="activateFromRowContent"/u,
    );
    expect(primitiveSource).toContain("reportOperation('整列播放')");
    expect(primitiveSource).toContain("reportOperation('縮圖前往專輯')");
    expect(primitiveSource).toContain('@click.stop');
    expect(primitiveSource).toContain('最近操作：');
  });
  it('documents the UiTrackRow owner checkpoint and bounded Queue adoption', () => {
    expect(reviewContract).toContain(
      '## 已完成階段：UiTrackRow Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '`UiTrackRow` 只擁有一列 track identity anatomy',
    );
    expect(reviewContract).toContain('stretched sibling native button');
    expect(reviewContract).toContain(
      'Candidate 必須實際組合已審查的 development-only TrackThumb 與 Marquee Text',
    );
    expect(reviewContract).toContain(
      'current cue也不因Status Icon已審查就強制組合圓形wrapper',
    );
    expect(reviewContract).toContain(
      'Queue 已採用正式 `UiTrackRow` 的 Standard 52／40px recipe',
    );
    expect(reviewContract).toContain('不能讓滑鼠右鍵成為唯一入口');
  });
});
