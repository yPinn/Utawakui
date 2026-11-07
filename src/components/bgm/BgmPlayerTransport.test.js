import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';

import BgmPlayerTransport from './BgmPlayerTransport.vue';

const source = readFileSync(
  new URL('./BgmPlayerTransport.vue', import.meta.url),
  'utf8',
);

describe('BgmPlayerTransport', () => {
  it.each([false, true])(
    'exposes an independent BGM guide-vocal icon toggle, enabled=%s',
    async (guideVocalOn) => {
      const html = await renderToString(
        createSSRApp(BgmPlayerTransport, {
          phase: 'bgm-playing',
          currentTrack: { id: 'a' },
          hasGuideVocal: true,
          guideVocalOn,
        }),
      );
      const button = html.match(
        /<button[^>]*bgm-transport__guide[^>]*>[\s\S]*?<\/button>/u,
      )?.[0];
      expect(button).toContain('ui-icon-btn');
      expect(button).toContain(`aria-pressed="${guideVocalOn}"`);
      expect(button).toContain(guideVocalOn ? '只播伴奏' : '加入人聲');
      expect(button).not.toContain('disabled');
      expect(source).toContain("emit('setGuideVocalOn', !guideVocalOn)");
    },
  );

  it('explains the original-audio fallback and disables unavailable guide removal', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'idle',
        currentTrack: { id: 'a' },
        hasGuideVocal: false,
      }),
    );
    const button = html.match(
      /<button[^>]*bgm-transport__guide[^>]*>[\s\S]*?<\/button>/u,
    )?.[0];
    expect(button).toContain('disabled');
    expect(button).toContain('準備伴奏');
  });

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

    expect(html).toContain('aria-label="場間音樂播放控制"');
    expect(html).not.toContain('>失敗<');
    expect(html).not.toContain('目前可聽：場間音樂');
    expect(html).toContain('暫停場間音樂');
    expect(html).toContain('壓低場間音樂（降低 12 dB）');
    expect(source).not.toMatch(/>\s*壓低場間音樂\s*<\/UiButton>/u);
    const dimButton = html.match(
      /<button[^>]*bgm-transport__talk[^>]*>[\s\S]*?<\/button>/u,
    )?.[0];
    expect(dimButton).toContain('aria-pressed="false"');
    expect(dimButton).toContain('<svg');
    expect(dimButton).toContain('volume-1');
    expect(dimButton).toContain('ui-icon-btn');
    expect(html).toContain('立即停止場間音樂（不淡出）');
    expect(html).toContain('aria-label="場間音樂進度"');
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

    expect(html).toContain('恢復場間音樂音量');
    const dimButton = html.match(
      /<button[^>]*bgm-transport__talk[^>]*>[\s\S]*?<\/button>/u,
    )?.[0];
    expect(dimButton).toContain('aria-pressed="true"');
    expect(dimButton).toContain('ui-visually-hidden');
    expect(dimButton).toContain('恢復場間音樂音量');
    expect(dimButton).toContain('volume-1');
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
    expect(html).toContain('播放場間音樂');
    expect(html).toContain('disabled');
    expect(html).not.toContain('暫停場間音樂');
    expect(html).toContain('立即停止場間音樂（不淡出）');
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
      /<button(?:(?!<\/button>)[\s\S])*播放場間音樂(?:(?!<\/button>)[\s\S])*<\/button>/u,
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

    expect(idleHtml).toContain('立即停止場間音樂（不淡出）');
    expect(idleCut).toContain('disabled');
    expect(playingHtml).toContain('立即停止場間音樂（不淡出）');
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
    expect(source).toContain(':muted="isMuted"');
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
    expect(html).toContain('壓低場間音樂');
    expect(html).toContain('立即停止場間音樂（不淡出）');
    expect(html).toContain('場間音樂進度');
    expect(html).toContain('場間音樂音量');
    expect(html).not.toContain('場間音樂音量與進度');
    expect(source).not.toContain('UiPopover');
    expect(source).not.toContain('SlidersHorizontal');
    expect(source).not.toContain('detailsOpen');
    expect(source.match(/<UiRangeControl/gu)).toHaveLength(1);
    expect(html).toContain('ui-volume-control--reveal-end');
    expect(html).toContain('ui-volume-control--inline');
    const order = [
      'ui-volume-control__mute',
      'ui-volume-control__range',
      'bgm-transport__guide',
      'bgm-transport__talk',
      'bgm-transport__cut',
    ].map((marker) => html.indexOf(marker));
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(html).not.toContain('暫停場間音樂');
    expect(source).toContain('v-if="variant !== \'dock\'"');
  });
});

describe('compact track information', () => {
  it('keeps progress visible when the selected standby footer is folded', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        variant: 'dock',
        standby: true,
        folded: true,
        combinedTools: true,
        footerId: 'bgm-footer',
        phase: 'idle',
        currentTrack: { id: 'bgm' },
        currentTime: 53,
        duration: 147,
      }),
    );
    const seekRow = html.indexOf('bgm-transport__progress');
    const contextRow = html.indexOf('bgm-transport__context');
    expect(html.slice(seekRow, contextRow)).toContain('0:53');
    expect(html.slice(seekRow, contextRow)).toContain('2:27');
    expect(html).toMatch(
      /id="bgm-footer"[^>]*class="[^"]*bgm-transport__fold--closed[^"]*"[^>]*inert/u,
    );
    expect(html).not.toContain('bgm-transport__audio-toggle');
    expect(html).toContain('aria-label="場間音樂音量"');
  });

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
    expect(html).toContain('aria-label="場間音樂進度"');
    expect(html).toMatch(
      /<div[^>]*class="bgm-transport__context[^"]*"[^>]*style="display:none;"/u,
    );
    expect(html).not.toContain('播放場間音樂');
    expect(html.match(/aria-label="場間音樂進度"/g)).toHaveLength(1);
  });

  it('keeps an exception hint and immediate stop outside the folded mixer', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            BgmPlayerTransport,
            {
              variant: 'dock',
              phase: 'bgm-playing',
              audibleLane: 'bgm',
              currentTrack: { id: 'bgm' },
              combinedTools: true,
              statusVisible: true,
              folded: true,
              footerId: 'bgm-mixer',
            },
            { status: () => h('span', '含人聲') },
          ),
      }),
    );
    expect(html.indexOf('含人聲')).toBeLessThan(html.indexOf('id="bgm-mixer"'));
    expect(html).toMatch(/id="bgm-mixer"[^>]*\binert\b/u);
    const stop = html.match(
      /<button[^>]*class="[^"]*bgm-transport__cut[^"]*"[^>]*>/u,
    )?.[0];
    expect(stop).toBeDefined();
    expect(stop).not.toMatch(/disabled|display:none/u);
  });
});
