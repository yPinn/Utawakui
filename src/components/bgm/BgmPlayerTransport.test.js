import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';

import BgmPlayerTransport from './BgmPlayerTransport.vue';

const source = readFileSync(
  new URL('./BgmPlayerTransport.vue', import.meta.url),
  'utf8',
);

describe('BgmPlayerTransport', () => {
  it('uses BGM player identity and exposes the complete safety transport', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'bgm-playing',
        audibleLane: 'bgm',
        currentTrack: { title: 'Quiet Room', artist: 'Local Artist' },
        currentTime: 42,
        duration: 180,
        volume: 0.25,
      }),
    );

    expect(html).toContain('aria-label="BGM 播放控制"');
    expect(html).not.toContain('>失敗<');
    expect(html).not.toContain('目前可聽：BGM');
    expect(html).toContain('暫停 BGM');
    expect(html).toContain('壓低 BGM（降低 12 dB）');
    expect(source).toMatch(/>\s*壓低 BGM\s*<\/UiButton>/u);
    const dimButton = html.match(
      /<button[^>]*bgm-transport__talk[^>]*>[\s\S]*?<\/button>/u,
    )?.[0];
    expect(dimButton).toContain('aria-pressed="false"');
    expect(dimButton).not.toContain('<svg');
    expect(source).not.toContain('MicVocal');
    expect(html).toContain('立即停止 BGM（不淡出）');
    expect(html).toContain('aria-label="BGM 進度"');
    expect(html).toContain('0:42');
    expect(html).toContain('3:00');
    expect(source).not.toContain('UiChip');
    expect(source).not.toContain('UiNotice');
    expect(source).not.toContain('場次');
  });

  it('describes attenuation as a relative reduction and keeps the visible label in its active name', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'bgm-playing',
        currentTrack: { title: 'Quiet Room', artist: 'Local Artist' },
        isDimmed: true,
        volume: 0.25,
        dimDb: -12,
      }),
    );

    expect(html).toContain('恢復 BGM 音量');
    const dimButton = html.match(
      /<button[^>]*bgm-transport__talk[^>]*>[\s\S]*?<\/button>/u,
    )?.[0];
    expect(dimButton).toContain('aria-pressed="true"');
    expect(dimButton).toContain('aria-label="壓低 BGM（按下恢復 BGM 音量）"');
    expect(dimButton).toContain('壓低 BGM');
    expect(dimButton).not.toContain('<svg');
    expect(html).not.toContain('Talk／Dim');
    expect(html).not.toContain('Dim：25%');
  });

  it('resets and locks the play button while the performance lane owns audio', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'track-active',
        audibleLane: 'performance',
        currentTrack: { title: 'Quiet Room', artist: 'Local Artist' },
      }),
    );

    expect(html).not.toContain('目前可聽：演唱曲目');
    expect(html).toContain('播放 BGM');
    expect(html).toContain('disabled');
    expect(html).not.toContain('暫停 BGM');
    expect(html).toContain('立即停止 BGM（不淡出）');
    expect(source).not.toContain('bgmRequested:');
  });

  it('keeps the single play action available after the performance is explicitly paused', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'track-paused',
        audibleLane: null,
        currentTrack: { title: 'Quiet Room', artist: 'Local Artist' },
      }),
    );
    const primaryButton = html.match(
      /<button(?:(?!<\/button>)[\s\S])*播放 BGM(?:(?!<\/button>)[\s\S])*<\/button>/u,
    )?.[0];

    expect(primaryButton).toBeDefined();
    expect(primaryButton).not.toContain('disabled');
  });

  it('keeps every transport action mounted so status changes do not shift the row', async () => {
    const idleHtml = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'idle',
        currentTrack: { title: 'Quiet Room', artist: 'Local Artist' },
      }),
    );
    const playingHtml = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'bgm-playing',
        audibleLane: 'bgm',
        currentTrack: { title: 'Quiet Room', artist: 'Local Artist' },
      }),
    );

    const idleCut = idleHtml.match(
      /<button[^>]*bgm-transport__cut[^>]*>/u,
    )?.[0];
    const playingCut = playingHtml.match(
      /<button[^>]*bgm-transport__cut[^>]*>/u,
    )?.[0];

    expect(idleHtml).toContain('立即停止 BGM（不淡出）');
    expect(idleCut).toContain('disabled');
    expect(playingHtml).toContain('立即停止 BGM（不淡出）');
    expect(playingCut).not.toContain('disabled');
    expect(source).toContain(':disabled="!canCutBgm"');
    expect(source).not.toContain('v-if="canCutBgm"');
    expect(source).not.toContain('v-if="isBgmPlaying"');
    expect(source).toContain(':icon="primaryAction.icon"');
    expect(source).toContain('@click="activatePrimaryAction"');
  });

  it('groups normal, audio, and emergency controls without status badges', () => {
    expect(source).not.toContain('UiChip');
    expect(source).not.toContain('bgm-transport__phase');
    expect(source).not.toContain('bgm-transport__restore');
    expect(source).toContain('class="bgm-transport__talk"');
    expect(source).toContain('class="bgm-transport__audio"');
    expect(source).toContain('class="bgm-transport__cut"');
    expect(source).toContain(':aria-pressed="isDimmed"');
    expect(source).toContain(':aria-pressed="isMuted"');
    expect(source).toContain('intent="danger"');
  });

  it('keeps play unavailable until a BGM is selected', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'idle',
      }),
    );

    expect(html).toContain('disabled');
    expect(source).toContain(':disabled="primaryAction.disabled"');
    expect(source).not.toContain('sessionMode:');
    expect(source).not.toContain('disabled: { type: Boolean');
    expect(source).toContain(
      "import { formatDuration } from '../../utils/format.js'",
    );
    expect(source).toContain("emit('seek', Number(value))");
    expect(source).toContain("emit('commitPosition')");
  });
});

describe('session and Dock reuse one BGM safety transport', () => {
  it('places progress above a context row and one operation row at every width', () => {
    expect(source.indexOf('class="bgm-transport__progress"')).toBeLessThan(
      source.indexOf('class="bgm-transport__context"'),
    );
    expect(source.indexOf('class="bgm-transport__context"')).toBeLessThan(
      source.indexOf('class="bgm-transport__controls"'),
    );
    const context = source.slice(
      source.indexOf('class="bgm-transport__context"'),
      source.indexOf('class="bgm-transport__controls"'),
    );
    expect(context).toContain('class="bgm-transport__cut"');
    expect(source).not.toContain('@container');
  });
  it('keeps progress and volume mounted directly in the Dock with no adjustment disclosure', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        variant: 'dock',
        phase: 'bgm-playing',
        audibleLane: 'bgm',
        currentTrack: { id: 'a', title: 'BGM' },
      }),
    );
    expect(html).toContain('壓低 BGM');
    expect(html).toContain('立即停止 BGM（不淡出）');
    expect(html).toContain('BGM 進度');
    expect(html).toContain('BGM 音量');
    expect(html).not.toContain('BGM 音量與進度');
    expect(source).not.toContain('UiPopover');
    expect(source).not.toContain('SlidersHorizontal');
    expect(source).not.toContain('detailsOpen');
    expect(source.match(/<UiRangeControl/gu)).toHaveLength(2);
    expect(html).not.toContain('暫停 BGM');
    expect(source).toContain('v-if="variant !== \'dock\'"');
  });
});

describe('compact track information', () => {
  it('keeps one progress control while hiding the context and mixer tools', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        variant: 'dock',
        compact: true,
        phase: 'idle',
        currentTrack: { id: 'bgm' },
        currentTime: 77,
        duration: 235,
      }),
    );
    expect(html).toContain('1:17');
    expect(html).toContain('3:55');
    expect(html).toContain('aria-label="BGM 進度"');
    for (const name of ['context', 'controls'])
      expect(html).toMatch(
        new RegExp(
          `<div[^>]*class="bgm-transport__${name}"[^>]*style="display:none;"`,
        ),
      );
    expect(html).not.toContain('播放 BGM');
    expect(html.match(/aria-label="BGM 進度"/g)).toHaveLength(1);
  });
});
