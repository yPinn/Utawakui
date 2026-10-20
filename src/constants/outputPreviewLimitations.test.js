import { describe, expect, it } from 'vitest';
import registry from '../../shared/outputTemplateValues.json';
import { outputPreviewLimitations } from './outputPreviewLimitations.js';

describe('Gallery preview limitations', () => {
  it.each(Object.keys(registry.templateKinds))(
    '%s declares default-only abbreviated presentation',
    (id) => {
      const notes = outputPreviewLimitations(id);
      expect(notes).toHaveLength(2);
      expect(notes[0]).toContain('預設外觀');
      expect(notes[1].length).toBeGreaterThan(8);
    },
  );
  it('keeps unknown and inherited names at the generic reference limitation', () => {
    expect(outputPreviewLimitations('unknown')[1]).toBe('僅供風格參考。');
    expect(outputPreviewLimitations('toString')[1]).toBe('僅供風格參考。');
  });
});
