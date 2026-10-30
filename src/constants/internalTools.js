// Dev-only workbenches in one flat navigation row; sub-modes live inside each page.
export const INTERNAL_TOOL_ROUTES = Object.freeze([
  Object.freeze({ route: 'music-analysis', label: '音樂分析', shortcut: 'F5' }),
  Object.freeze({
    route: 'diagnostics-workbench',
    label: '診斷',
    shortcut: 'F6',
  }),
  Object.freeze({
    route: 'lyrics-provider-review',
    label: '歌詞來源',
    shortcut: 'F7',
  }),
  Object.freeze({
    route: 'microphone-research',
    label: 'Mic 輸入',
    shortcut: '',
  }),
]);

export function internalToolDefinition(route) {
  return INTERNAL_TOOL_ROUTES.find((tool) => tool.route === route) ?? null;
}
