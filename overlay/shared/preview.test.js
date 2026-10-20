import { describe, expect, it } from 'vitest';
import {
  applyPreviewCanvas,
  inspectionBackdrop,
  inspectionGuideVisible,
  isPreviewMode,
  isWorkbenchMode,
  withPreviewFallback,
  previewSceneForSlot,
} from './preview.mjs';
import { createOutputPreviewScene } from '../../shared/presentation/outputPreviewScene.mjs';
import registry from '../../shared/outputTemplateValues.json';

describe('overlay preview fallback', () => {
  it('uses each slot default and keeps an unmarked or unavailable document unchanged', () => {
    for (const [kind, templateId] of [
      ['lyrics', 'karaoke-stack'],
      ['setlist', 'queue-board'],
      ['now-playing', 'art-card'],
    ]) {
      expect(previewSceneForSlot(kind).templateId).toBe(templateId);
    }
    const document = { documentElement: { dataset: {} } };
    applyPreviewCanvas(document);
    expect(document.documentElement.dataset).toEqual({});
    expect(() => applyPreviewCanvas(null)).not.toThrow();
    expect(inspectionBackdrop()).toBe('');
    expect(inspectionGuideVisible()).toBe(true);
    expect(isPreviewMode()).toBe(false);
    expect(isWorkbenchMode()).toBe(false);
  });
  it.each(Object.entries(registry.templateKinds))(
    '%s shares the Gallery scene and template settings',
    (templateId, kind) => {
      const slot = {
        templateId,
        settings: { fontScale: 'large', lookAmount: 70 },
      };
      expect(previewSceneForSlot(kind, slot)).toEqual(
        createOutputPreviewScene({ kind, templateId, settings: slot.settings }),
      );
      const empty = { visible: false, revision: 9 };
      expect(
        withPreviewFallback(
          empty,
          previewSceneForSlot(kind, slot).frame,
          false,
        ),
      ).toBe(empty);
    },
  );
  it('recognizes only the explicit preview query', () => {
    expect(isPreviewMode({ search: '?preview=1' })).toBe(true);
    expect(isPreviewMode({ search: '?preview=0' })).toBe(false);
    expect(isPreviewMode({ search: '' })).toBe(false);
  });

  it('recognizes only the explicit Workbench composition query', () => {
    expect(isWorkbenchMode({ search: '?workbench=1' })).toBe(true);
    expect(isWorkbenchMode({ search: '?workbench=0' })).toBe(false);
    expect(isWorkbenchMode({ search: '' })).toBe(false);
  });

  it('marks demo and inspection canvases independently', () => {
    const document = { documentElement: { dataset: {} } };
    applyPreviewCanvas(document, {
      previewMode: true,
      workbenchMode: true,
      location: { search: '?preview=1&workbench=1&backdrop=checker' },
    });
    expect(document.documentElement.dataset.overlayPreview).toBe('true');
    expect(document.documentElement.dataset.overlayWorkbench).toBe('true');
    expect(document.documentElement.dataset.overlayBackdrop).toBe('checker');
    expect(document.documentElement.dataset.overlayGuide).toBe('true');
  });

  it('replaces a standalone checker with a transparent embedded inspection canvas', () => {
    const document = {
      documentElement: { dataset: { overlayBackdrop: 'checker' } },
    };
    applyPreviewCanvas(document, {
      workbenchMode: true,
      location: { search: '?workbench=1&backdrop=transparent' },
    });
    expect(document.documentElement.dataset.overlayBackdrop).toBe(
      'transparent',
    );
    expect(document.documentElement.dataset.overlayWorkbench).toBe('true');
  });

  it('allows only local inspection backdrop ids', () => {
    expect(inspectionBackdrop({ search: '?backdrop=checker' })).toBe('checker');
    expect(inspectionBackdrop({ search: '?backdrop=transparent' })).toBe(
      'transparent',
    );
    expect(inspectionBackdrop({ search: '?backdrop=dark' })).toBe('dark');
    expect(inspectionBackdrop({ search: '?backdrop=light' })).toBe('light');
    expect(inspectionBackdrop({ search: '?backdrop=provider-value' })).toBe('');
    expect(inspectionBackdrop({ search: '' })).toBe('');
  });

  it('keeps the Workbench guide visible by default and accepts only the explicit hide value', () => {
    expect(inspectionGuideVisible({ search: '?guide=1' })).toBe(true);
    expect(inspectionGuideVisible({ search: '?guide=0' })).toBe(false);
    expect(inspectionGuideVisible({ search: '?guide=provider-value' })).toBe(
      true,
    );
    expect(inspectionGuideVisible({ search: '' })).toBe(true);
  });

  it('uses demo content only when preview mode receives an empty live frame', () => {
    const hidden = { revision: 7, visible: false, currentText: '' };
    const demo = { revision: 0, visible: true, currentText: 'Demo lyric' };
    expect(withPreviewFallback(hidden, demo, true)).toEqual({
      revision: 7,
      visible: true,
      currentText: 'Demo lyric',
    });
    expect(withPreviewFallback(hidden, demo, false)).toBe(hidden);

    const live = { revision: 8, visible: true, currentText: 'Live lyric' };
    expect(withPreviewFallback(live, demo, true)).toBe(live);
  });
});
