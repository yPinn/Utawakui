import { createSSRApp, h, reactive } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import Mockup from './ObsTemplateMockup.vue';
import {
  createOutputPreviewScene,
  OUTPUT_PREVIEW_SCENARIO_ID,
} from '../../../shared/presentation/outputPreviewScene.mjs';
import {
  OUTPUT_PREVIEW_SCENE,
  getOutputWorkbenchData,
} from '../../constants/outputTemplates.js';
import { createOutputScenario } from '../../../scripts/outputAppearanceBaseline.mjs';

describe('F3 Gallery projected scene', () => {
  it('preserves an explicitly supplied empty snapshot instead of showing a sample', async () => {
    const input = createOutputScenario('empty');
    const scene = createOutputPreviewScene({
      snapshot: input.snapshot,
      nowMs: input.nowMs,
    });
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(Mockup, { preset: { id: 'karaoke-stack', kind: 'lyrics' }, scene }),
      }),
    );
    expect(html).not.toContain('obs-template-mockup__ktv-lines');
  });
  it('uses bounded material and reading choices rather than hardcoded preview choices', async () => {
    const render = (id, settings) =>
      renderToString(
        createSSRApp({
          render: () =>
            h(Mockup, {
              preset: { id, kind: 'lyrics' },
              scene: OUTPUT_PREVIEW_SCENE,
              settings,
            }),
        }),
      );
    expect(
      await render('kinetic-pop', { kineticMaterial: 'solid-outline' }),
    ).toContain('data-kinetic-material="solid-outline"');
    expect(await render('manga-frame', { furigana: 'off' })).not.toContain(
      '<ruby>',
    );
  });
  it('accepts reactive scene props without attempting to structuredClone a Vue proxy', async () => {
    const scene = reactive(
      createOutputPreviewScene({ templateId: 'manga-frame' }),
    );
    await expect(
      renderToString(
        createSSRApp({
          render: () =>
            h(Mockup, { preset: { id: 'manga-frame', kind: 'lyrics' }, scene }),
        }),
      ),
    ).resolves.toContain('data-scenario-id');
  });
  it.each(getOutputWorkbenchData().templates)(
    '$id uses the shared scenario with its own normalized defaults',
    async (preset) => {
      const scene = createOutputPreviewScene({
        templateId: preset.id,
        kind: preset.kind,
      });
      const html = await renderToString(
        createSSRApp({
          render: () => h(Mockup, { preset, scene: OUTPUT_PREVIEW_SCENE }),
        }),
      );
      expect(html).toContain(
        `data-scenario-id="${OUTPUT_PREVIEW_SCENARIO_ID}"`,
      );
      expect(html).toContain(`data-frame-time="${scene.frameTimeMs}"`);
      expect(html).toContain(
        `data-appearance-font="${scene.appearance.fontFamily}"`,
      );
      if (preset.kind === 'now-playing')
        expect(html).toContain(scene.track.title);
      if (preset.id === 'queue-board') expect(html).toContain(scene.sourceName);
      if (preset.id === 'karaoke-stack') {
        expect(html).toContain(scene.frame.ktv.currentText);
        expect(html).toContain(scene.frame.ktv.nextText);
      }
      if (preset.id === 'kinetic-pop') {
        expect(html.replace(/<[^>]*>/gu, '')).toContain(
          scene.frame.kineticPop.displayText,
        );
      }
      if (preset.id === 'cover-player') {
        expect(html).toContain(scene.playback.elapsed);
        expect(html).toContain(scene.playback.remaining);
        expect(html).not.toContain('0:23');
      }
    },
  );
});
