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
        error: 'BGM 音訊輸出暫時無法使用。',
      }),
    );

    expect(html).toContain('aria-label="BGM 播放控制"');
    expect(html).toContain(
      'aria-label="BGM 操作失敗：BGM 音訊輸出暫時無法使用。"',
    );
    expect(html).toContain('>失敗<');
    expect(html).not.toContain('目前可聽：BGM');
    expect(html).toContain('Quiet Room');
    expect(html).toContain('暫停 BGM');
    expect(html).toContain('開啟 Talk（BGM 降低 12 dB）');
    expect(html).toContain('緊急靜音 BGM');
    expect(html).toContain('aria-label="BGM 進度"');
    expect(html).toContain('0:42');
    expect(html).not.toContain('3:00');
    expect(html).not.toContain('role="alert"');
    expect(source).not.toContain('UiNotice');
    expect(source).not.toContain('場次');
  });

  it('describes Talk as a relative reduction instead of another volume percentage', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'bgm-playing',
        currentTrack: { title: 'Quiet Room', artist: 'Local Artist' },
        isDimmed: true,
        volume: 0.25,
        dimDb: -12,
      }),
    );

    expect(html).toContain('關閉 Talk（恢復原音量）');
    expect(html).not.toContain('Talk／Dim');
    expect(html).not.toContain('Dim：25%');
  });

  it('resets and locks the play button while the performance lane owns audio', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'track-active',
        audibleLane: 'performance',
        restorePending: true,
        currentTrack: { title: 'Quiet Room', artist: 'Local Artist' },
      }),
    );

    expect(html).toContain('aria-label="演唱曲目播放中"');
    expect(html).toContain('>演唱<');
    expect(html).not.toContain('>演唱曲目播放中<');
    expect(html).not.toContain('目前可聽：演唱曲目');
    expect(html).toContain('aria-label="曲後恢復 BGM"');
    expect(html).toContain('>回復<');
    expect(html).toContain('播放 BGM');
    expect(html).toContain('disabled');
    expect(html).not.toContain('暫停 BGM');
    expect(html).toContain('緊急靜音 BGM');
    expect(source).not.toContain('bgmRequested:');
  });

  it('keeps the single play action available after the performance is explicitly paused', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'track-paused',
        audibleLane: null,
        restorePending: true,
        currentTrack: { title: 'Quiet Room', artist: 'Local Artist' },
      }),
    );
    const primaryButton = html.match(
      /<button(?:(?!<\/button>)[\s\S])*播放 BGM(?:(?!<\/button>)[\s\S])*<\/button>/u,
    )?.[0];

    expect(html).toContain('aria-label="演唱曲目已暫停"');
    expect(html).toContain('>暫停<');
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

    expect(idleHtml).toContain('緊急靜音 BGM');
    expect(idleCut).toContain('disabled');
    expect(playingHtml).toContain('緊急靜音 BGM');
    expect(playingCut).not.toContain('disabled');
    expect(source).toContain(':disabled="!canCutBgm"');
    expect(source).not.toContain('v-if="canCutBgm"');
    expect(source).not.toContain('v-if="isBgmPlaying"');
    expect(source).toContain(':icon="primaryAction.icon"');
    expect(source).toContain('@click="activatePrimaryAction"');
  });

  it('keeps status graphical and reserves optional status slots', async () => {
    const idleHtml = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'idle',
        restorePending: false,
      }),
    );
    const restoreHtml = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'track-active',
        restorePending: true,
      }),
    );

    expect(source).toContain("import UiChip from '../ui/UiChip.vue'");
    expect(source).toContain(':is="phaseStatus.icon"');
    expect(source).toContain('class="bgm-transport__phase"');
    expect(source).toContain('class="bgm-transport__restore"');
    expect(source).not.toContain('v-if="restorePending"');
    expect(idleHtml).toContain('aria-hidden="true"');
    expect(idleHtml).toContain('>回復<');
    expect(restoreHtml).toContain('aria-hidden="false"');
  });

  it('keeps play unavailable until a BGM is selected', async () => {
    const html = await renderToString(
      createSSRApp(BgmPlayerTransport, {
        phase: 'idle',
      }),
    );

    expect(html).toContain('尚未選擇 BGM');
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
