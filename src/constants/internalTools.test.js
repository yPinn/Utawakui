import { describe, expect, it } from 'vitest';
import {
  INTERNAL_TOOL_CATEGORIES,
  INTERNAL_TOOL_ROUTES,
  internalToolCategory,
  internalToolDefinition,
} from './internalTools.js';

describe('internal tools registry', () => {
  it('classifies repeatable operations separately from evaluation work', () => {
    expect(
      INTERNAL_TOOL_CATEGORIES.map((category) => [
        category.id,
        category.tools.map((tool) => tool.route),
      ]),
    ).toEqual([
      ['operations', ['music-analysis', 'diagnostics-workbench']],
      ['evaluation', ['music-analysis-evaluation', 'lyrics-provider-review']],
    ]);
  });

  it('preserves F5, F6 and F7 as direct entries without assigning M2 a new key', () => {
    expect(
      Object.fromEntries(
        INTERNAL_TOOL_ROUTES.filter((tool) => tool.shortcut).map((tool) => [
          tool.shortcut,
          tool.route,
        ]),
      ),
    ).toEqual({
      F5: 'music-analysis',
      F6: 'diagnostics-workbench',
      F7: 'lyrics-provider-review',
    });
    expect(internalToolDefinition('music-analysis-evaluation')?.shortcut).toBe(
      '',
    );
  });

  it('resolves a route to its tool and owning category', () => {
    expect(internalToolDefinition('diagnostics-workbench')).toMatchObject({
      label: 'Live Diagnostics',
      lifecycle: '支援操作',
    });
    expect(internalToolCategory('lyrics-provider-review')?.id).toBe(
      'evaluation',
    );
    expect(internalToolDefinition('unknown')).toBeNull();
    expect(internalToolCategory('unknown')).toBeNull();
  });
});
