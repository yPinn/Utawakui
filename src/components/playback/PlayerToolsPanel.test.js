import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import PlayerToolsPanel from './PlayerToolsPanel.vue';
import { useAppRightDockWidth } from '../../composables/useAppRightDockWidth.js';
import { Headphones, Volume2 } from '../../icons/index.js';

const source = fs.readFileSync(
  new URL('./PlayerToolsPanel.vue', import.meta.url),
  'utf8',
);
const barSource = fs.readFileSync(
  new URL('./PlayerBar.vue', import.meta.url),
  'utf8',
);

async function render(props = {}, slots = {}) {
  const context = {};
  const html = await renderToString(
    createSSRApp({
      render: () => h(PlayerToolsPanel, { open: true, ...props }, slots),
    }),
    context,
  );
  return html + Object.values(context.teleports ?? {}).join('');
}

describe('PlayerToolsPanel shared surface', () => {
  it('shows the fine adjustment in cents without a second value', async () => {
    const html = await render({
      hasTrack: true,
      pitchTempoRows: [
        {
          key: 'pitch',
          label: '微調音高',
          value: '+50 音分',
          sliderValue: 50,
          defaultValue: 0,
          min: -50,
          max: 50,
          step: 1,
          sliderLabel: '音分',
          minusLabel: '降低音分',
          plusLabel: '提高音分',
        },
      ],
    });
    expect(html).toContain('微調音高');
    expect(html).toContain('+50 音分');
    expect(html).not.toContain('Hz');
  });

  it('uses an anchored shared popover with guide mixing as the second linked tab', async () => {
    expect(source).toContain('<UiPopover');
    expect(source).not.toContain('PlayerBarPanel');
    expect(source).toContain('placement="top-end"');
    expect(source).toContain('scroll-axis="vertical"');
    expect(source).toContain('focus-on-open');
    expect(source).toContain('variant="bar"');
    const html = await render();
    expect(html).toContain('演出工具');
    expect(html).toContain('調整');
    expect(html).not.toContain('選擇節拍監聽裝置');
    for (const id of ['adjust', 'guide', 'live'])
      expect(html).toContain(`player-tools-${id}-panel`);
    expect(html.indexOf('id="player-tools-adjust-tab"')).toBeLessThan(
      html.indexOf('id="player-tools-guide-tab"'),
    );
    expect(html.indexOf('id="player-tools-guide-tab"')).toBeLessThan(
      html.indexOf('id="player-tools-live-tab"'),
    );
    expect(html).not.toContain('player-tools-process-panel');
  });

  it('follows the shared RightDock width without a second width owner', async () => {
    const dock = useAppRightDockWidth();
    try {
      dock.setWidth(272);
      expect(await render()).toContain('inline-size:272px');
      dock.setWidth(280);
      expect(await render()).toContain('inline-size:280px');
      expect(source).not.toMatch(/22\.5rem|position:\s*fixed/);
    } finally {
      dock.setWidth(280);
    }
  });

  it('keeps the beat markers separate and reveals volume in the tap tempo row', async () => {
    const html = await render({ activeTab: 'live' });
    const liveStart = html.indexOf('id="player-tools-live-panel"');
    const live = html
      .slice(liveStart, html.indexOf('</section>', liveStart))
      .replace(/<!--.*?-->/g, '');

    expect(live.match(/type="range"/g)).toHaveLength(1);
    expect(live).toContain('aria-label="節拍音量"');
    expect(live).toContain('step="0.05"');
    expect(live).toContain(
      'ui-volume-control--reveal ui-volume-control--inline',
    );
    const tapRow = live.indexOf('class="player-tools__tap-row"');
    expect(live.slice(0, tapRow)).toContain('class="player-tools__beat-row"');
    expect(live.slice(0, tapRow)).toContain('重設節拍器');
    expect(live.slice(tapRow)).toContain('aria-label="節拍音量"');
    expect(live.slice(tapRow)).toContain('點擊測速');
    expect(live).not.toContain('清除點擊記錄');
  });

  it('removes the duplicate separation entry and dedicated PlayerBar wiring', async () => {
    for (const value of [
      'SeparationPresetControl',
      'generateSeparation',
      'selectSeparationPreset',
      'separationPresetOptions',
    ]) {
      expect(source).not.toContain(value);
      expect(barSource).not.toContain(value);
    }
    expect(barSource).not.toContain("useSeparation.js'");
    // The guide tab reuses the library row's shared queue action.
    expect(barSource).toContain('useTrackSeparationAction');
    expect(source).toContain('<UiIconButton');
    const html = await render();
    expect(html).not.toContain('產生伴奏');
    expect(html).not.toContain('處理模式');
  });

  it('keeps independent guide controls in their own pane without percentage preset buttons', async () => {
    const html = await render({
      activeTab: 'guide',
      hasTrack: true,
      guideVocalVisible: true,
      canSyncGuideVocal: true,
      guideVocalRows: ['監聽', '擷取'].map((label) => ({
        key: label,
        label,
        icon: Headphones,
        deviceName: `${label}裝置`,
        onIcon: Volume2,
        on: true,
        onLabel: `關閉導唱(${label})`,
        value: '50%',
        sliderValue: 0.5,
        defaultValue: 0.5,
        min: 0,
        max: 2,
        step: 0.05,
        sliderLabel: `導唱比例(${label})`,
        marks: [0, 0.5, 1, 1.5, 2],
        referenceMark: 1,
      })),
    });
    for (const label of ['監聽', '擷取']) {
      expect(html).toContain(`關閉導唱(${label})`);
      expect(html).toContain(`aria-label="導唱比例(${label})"`);
    }
    expect(html).not.toContain('player-tools__stop-button');
    const adjust = html.slice(
      html.indexOf('id="player-tools-adjust-panel"'),
      html.indexOf(
        '</section>',
        html.indexOf('id="player-tools-adjust-panel"'),
      ),
    );
    const guide = html.slice(
      html.indexOf('id="player-tools-guide-panel"'),
      html.indexOf('</section>', html.indexOf('id="player-tools-guide-panel"')),
    );
    expect(guide).toContain('role="switch"');
    expect(guide.match(/max="2"/g)).toHaveLength(2);
    expect(guide.match(/step="0.05"/g)).toHaveLength(2);
    const marks = [...guide.matchAll(/data-range-stop="([^"]+)"/g)].map(
      ([, value]) => Number(value),
    );
    expect(marks).toEqual([0, 0.5, 1, 1.5, 2, 0, 0.5, 1, 1.5, 2]);
    expect(guide.match(/ui-range-control__stop--reference/g)).toHaveLength(2);
    expect(guide).not.toContain('100%');
    expect(adjust).not.toContain('導唱比例');
    expect(adjust).not.toContain('音高預覽');
    expect(guide).not.toContain('音高預覽');
    expect(guide).toContain('導唱比例(監聽)');
    expect(guide).toContain('導唱比例(擷取)');
  });

  it('shows the mirrored monitor level and keeps capture editable while synced', async () => {
    const html = await render({
      activeTab: 'guide',
      hasTrack: true,
      guideVocalVisible: true,
      canSyncGuideVocal: true,
      guideVocalSynced: true,
      guideVocalRows: ['monitor', 'capture'].map((key) => ({
        key,
        disabled: key === 'monitor',
        sliderLabel: key,
        onIcon: Volume2,
        onLabel: `toggle ${key}`,
        value: '200%',
        sliderValue: 2,
        min: 0,
        max: 2,
        step: 0.05,
      })),
    });
    expect(html).toMatch(/role="switch"[^>]*checked/);
    expect(html).toMatch(/<input[^>]*aria-label="monitor"[^>]*disabled/);
    expect(html).not.toMatch(/<input[^>]*aria-label="capture"[^>]*disabled/);
    expect(html.match(/aria-valuetext="200%"/g)).toHaveLength(2);
  });

  it('explains the unavailable guide controls when no track status is known', async () => {
    const html = await render({ activeTab: 'guide' });
    expect(html).toContain('導唱需使用伴奏。');
    expect(html).not.toContain('產生伴奏');
  });

  it('keeps guide sliders visible but disabled below the accompaniment action', async () => {
    const html = await render({
      activeTab: 'guide',
      hasTrack: true,
      guideAccompaniment: {
        message: '尚無伴奏',
        actionLabel: '產生伴奏',
      },
      guideVocalRows: [
        {
          key: 'monitor',
          label: '監聽',
          icon: Headphones,
          deviceName: '監聽裝置',
          onIcon: Volume2,
          on: true,
          onLabel: '關閉導唱(監聽)',
          value: '50%',
          sliderValue: 0.5,
          defaultValue: 0.5,
          min: 0,
          max: 1,
          step: 0.01,
          sliderLabel: '導唱比例(監聽)',
        },
      ],
    });
    const guide = html.slice(html.indexOf('id="player-tools-guide-panel"'));
    expect(guide).toContain('尚無伴奏');
    expect(guide.indexOf('產生伴奏')).toBeLessThan(
      guide.indexOf('導唱比例(監聽)'),
    );
    expect(guide).not.toContain('導唱需使用伴奏。');
    expect(guide).toMatch(/aria-label="導唱比例\(監聽\)"[^>]*disabled/);
    expect(guide).toMatch(/aria-pressed="true"[^>]*disabled/);
  });

  it('shows queue progress instead of the action while accompaniment is processing', async () => {
    const html = await render({
      activeTab: 'guide',
      hasTrack: true,
      guideAccompaniment: { message: '伴奏處理中', detail: '42%', busy: true },
    });
    expect(html).toContain('伴奏處理中');
    expect(html).toContain('42%');
    expect(html).not.toContain('產生伴奏');
  });
});
