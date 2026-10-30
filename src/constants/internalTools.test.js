import { describe, expect, it } from 'vitest';
import {
  INTERNAL_TOOL_ROUTES,
  internalToolDefinition,
} from './internalTools.js';

describe('internal tools registry', () => {
  it('lists every workbench in one flat row', () => {
    expect(INTERNAL_TOOL_ROUTES.map((tool) => tool.route)).toEqual([
      'music-analysis',
      'diagnostics-workbench',
      'lyrics-provider-review',
      'microphone-research',
    ]);
  });

  it('keeps F5, F6 and F7 as direct entries', () => {
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
  });

  it('carries only what the navigation renders', () => {
    for (const tool of INTERNAL_TOOL_ROUTES) {
      expect(Object.keys(tool).sort()).toEqual(['label', 'route', 'shortcut']);
    }
    expect(internalToolDefinition('diagnostics-workbench')?.label).toBe('診斷');
    expect(internalToolDefinition('music-analysis-evaluation')).toBeNull();
  });
});
