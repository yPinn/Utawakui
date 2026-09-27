import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoCoreMinimums from './DemoCoreMinimums.vue';

const tokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);
const activeTokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const uiConstantSource = readFileSync(
  new URL('../../constants/ui.js', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoCoreMinimums.vue', import.meta.url),
  'utf8',
);
const iconButtonSource = readFileSync(
  new URL('../ui/UiIconButton.vue', import.meta.url),
  'utf8',
);
const checkboxSource = readFileSync(
  new URL('../ui/UiCheckbox.vue', import.meta.url),
  'utf8',
);
const rangeSource = readFileSync(
  new URL('../ui/UiRange.vue', import.meta.url),
  'utf8',
);
const trackRowSource = readFileSync(
  new URL('../ui/UiTrackRow.vue', import.meta.url),
  'utf8',
);
const playlistSidebarRowSource = readFileSync(
  new URL('../playlists/PlaylistSidebarRow.vue', import.meta.url),
  'utf8',
);
const playerBarSource = readFileSync(
  new URL('../playback/PlayerBar.vue', import.meta.url),
  'utf8',
);
const rightDockSource = readFileSync(
  new URL('../layout/AppRightDock.vue', import.meta.url),
  'utf8',
);

const groupedContracts = [
  ['readability', '文字與符號', 'Label 14 · Body 16 · Glyph／控制標記 16'],
  ['interaction', '操作邊界', '一般 32 · Live 44 · 緊急 48'],
  [
    'structure',
    '內容結構',
    '封面 36 · 標頭 32 · 曲目列 44 · 側欄列 48 · Player 68',
  ],
  ['optical', '光學邊界', 'Focus 2 CSS px · Drag 2 CSS px'],
];

describe('DemoCoreMinimums', () => {
  it('keeps a compact target preview separate from all explanatory text', async () => {
    const html = await renderToString(createSSRApp(DemoCoreMinimums));
    const preview = html.match(
      /<div[^>]*data-core-minimum-preview="targets"[^>]*>([\s\S]*?)<\/div>/u,
    )?.[1];

    expect(preview).toBeDefined();
    expect(preview.replace(/<[^>]+>/gu, '').trim()).toBe('');
    expect(preview.match(/data-core-minimum-specimen=/gu)).toHaveLength(3);
    expect(preview).toContain('data-core-minimum-specimen="routine-target"');
    expect(preview).toContain('data-core-minimum-specimen="live-target"');
    expect(preview).toContain('data-core-minimum-specimen="emergency-target"');
    expect(html).toMatch(
      /data-core-minimum-preview="targets"[^>]*aria-hidden="true"/u,
    );
    expect(html).toContain('data-core-minimum-reference="groups"');
  });

  it('separates proposed Token v2 contracts from current implementation sources', async () => {
    const html = await renderToString(createSSRApp(DemoCoreMinimums));
    const candidateIndex = html.indexOf('data-core-minimum-layer="candidate"');
    const currentIndex = html.indexOf('data-core-minimum-layer="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2 新制定');
    expect(html).toContain('現有設定檔／組件契約');
    expect(html).toContain(
      '比較 Token v2 hard floors 與 active implementation',
    );
  });

  it('reduces the full matrix to four scan groups without losing hard floors', async () => {
    const html = await renderToString(createSSRApp(DemoCoreMinimums));

    for (const [key, label, floor] of groupedContracts) {
      expect(html).toContain(`data-core-minimum-group="${key}"`);
      expect(html).toContain(label);
      expect(html).toContain(floor);
    }
    expect(html.match(/data-core-minimum-group=/gu)).toHaveLength(4);
    expect(html).toContain('Standard');
    expect(html).toContain('Compact');
    expect(html).not.toContain('<table');
  });

  it('anchors the 32px icon-button floor to current Token v2 sources', async () => {
    const html = await renderToString(createSSRApp(DemoCoreMinimums));

    for (const source of [
      '--ui-font-size-sm: 0.875rem;',
      '--ui-font-size-md: 1rem;',
      '--ui-focus-width: 2px;',
      '--ui-drag-indicator-width: 2px;',
      '--ui-control-height-live: 2.75rem;',
      '--ui-control-height-emergency: 3rem;',
      '--ui-checkbox-size: var(--ui-space-4);',
      '--ui-range-thumb-size: var(--ui-space-4);',
    ]) {
      expect(tokenSource).toContain(source);
    }
    expect(uiConstantSource).toContain('export const ICON_SIZE = 16;');
    expect(tokenSource).not.toContain('--ui-icon-button-size-sm');
    expect(html).toContain('Icon button hard floor 2rem／32 CSS px');
    expect(html).not.toContain('sm icon button');
  });

  it('lists current sources by the same four review groups', async () => {
    const html = await renderToString(createSSRApp(DemoCoreMinimums));

    for (const [key] of groupedContracts) {
      expect(html).toContain(`data-current-setting-group="${key}"`);
    }
    expect(html.match(/data-current-setting-group=/gu)).toHaveLength(4);
    expect(html).toContain('src/styles/tokens.css');
    expect(html).toContain('src/constants/ui.js');
    expect(html).toContain('src/components/ui/UiCheckbox.vue');
    expect(html).toContain('src/components/ui/UiRange.vue');
    expect(html).toContain('src/components/ui/UiIconButton.vue');
    expect(html).toContain('src/components/ui/UiTrackRow.vue');
    expect(html).toContain('src/components/playlists/PlaylistSidebarRow.vue');
    expect(html).toContain('src/components/playback/PlayerBar.vue');
    expect(html).toContain('src/components/layout/AppRightDock.vue');
    expect(html).toContain('Sidebar 列 54px');
    expect(html).toContain('列表標頭無現行共用 token');
    expect(html).toContain('Checkbox／Range thumb 1rem');
    expect(html).toContain(
      '一般符合 hard floor／Compact，Standard 尚待密度映射',
    );
    expect(html).toContain('現行吻合');
    expect(html).toContain('Focus 2 CSS px；Drag indicator 2 CSS px');
    expect(html).toContain('部分落地，逐項審查中');
  });

  it('derives the current layer from active tokens and their consumers', () => {
    for (const source of [
      '--ui-font-size-sm: 0.875rem;',
      '--ui-font-size-md: 1rem;',
      '--ui-icon-button-size-md: var(--ui-space-6);',
      '--ui-icon-button-size-lg: 2.75rem;',
      '--ui-checkbox-size: var(--ui-space-4);',
      '--ui-range-thumb-size: var(--ui-space-4);',
      '--ui-playlist-row-thumb-size: 2.75rem;',
      '--ui-playlist-row-min-height: var(',
      '--ui-track-row-min-height: 3.25rem;',
      '--ui-track-row-thumb-size: 2.5rem;',
      '--ui-player-bar-height: calc(',
      '--ui-focus-width: 2px;',
      '--ui-drag-indicator-width: 2px;',
    ]) {
      expect(activeTokenSource).toContain(source);
    }
    expect(activeTokenSource).toContain('54px: expanded and compact rows');
    expect(activeTokenSource).toContain('84px: 52px artwork');
    expect(activeTokenSource).not.toContain('--ui-list-header-height');
    expect(rightDockSource).toContain(
      'inline-size: var(--ui-drag-indicator-width)',
    );

    expect(iconButtonSource).toContain(
      '--ui-icon-btn-size: var(--ui-icon-button-size-md)',
    );
    expect(checkboxSource).toContain('width: var(--ui-checkbox-size)');
    expect(rangeSource).toContain('width: var(--ui-range-thumb-size)');
    expect(trackRowSource).toContain(
      'min-height: var(--ui-track-row-min-height)',
    );
    expect(trackRowSource).toContain('size="var(--ui-track-row-thumb-size)"');
    expect(playlistSidebarRowSource).toContain(
      'min-height: var(--ui-playlist-row-min-height)',
    );
    expect(playerBarSource).toContain('height: var(--ui-player-bar-height)');
  });

  it('keeps container adaptation separate from core scaling', async () => {
    const html = await renderToString(createSSRApp(DemoCoreMinimums));

    expect(html).toContain('先重排或收起次要內容');
    expect(html).toContain('不得降低 hard floor');
    expect(html).toContain('預設 16px 根字級與 100% Chromium zoom');
    expect(html).not.toContain('WCAG');
    expect(html).not.toContain('Windows touchable');
    expect(componentSource).toMatch(
      /\.demo-core-minimums__preview\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(3rem, max-content\)\);[\s\S]*?overflow-x:\s*auto;/u,
    );
    expect(componentSource).not.toContain('max-width: 100%;');
    expect(componentSource).not.toContain('vw');
    expect(componentSource).not.toContain('clamp(');
    expect(componentSource).toMatch(
      /\.demo-core-minimums\s*\{[^}]*container-type:\s*inline-size;/s,
    );
    expect(componentSource).toContain('@container (max-width: 48rem)');
    expect(componentSource).toContain('@container (max-width: 36rem)');
    expect(componentSource).not.toContain('@media (max-width: 48rem)');
  });
});
