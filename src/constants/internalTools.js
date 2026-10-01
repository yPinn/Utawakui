const operations = Object.freeze([
  Object.freeze({
    id: 'music-analysis',
    route: 'music-analysis',
    label: 'Music Analysis',
    description: '強制執行單曲分析、批次重跑，並檢查已發布的結構結果。',
    lifecycle: '產品操作',
    tone: 'accent',
    shortcut: 'F5',
  }),
  Object.freeze({
    id: 'diagnostics-workbench',
    route: 'diagnostics-workbench',
    label: 'Live Diagnostics',
    description: '直接檢視目前 App 的本機診斷事件，不必先匯出 support bundle。',
    lifecycle: '支援操作',
    tone: 'info',
    shortcut: 'F6',
  }),
]);

const evaluation = Object.freeze([
  Object.freeze({
    id: 'music-analysis-evaluation',
    route: 'music-analysis-evaluation',
    label: 'Music M2',
    description:
      '建立人工參考標註並審查 benchmark 預測，不會發布產品 sidecar。',
    lifecycle: '研究評估',
    tone: 'warning',
    shortcut: '',
  }),
  Object.freeze({
    id: 'lyrics-provider-review',
    route: 'lyrics-provider-review',
    label: 'Lyrics Provider Corpus',
    description: '審核 private corpus 候選，完成後產生 provider 評估輸入。',
    lifecycle: '研究評估',
    tone: 'warning',
    shortcut: 'F7',
  }),
]);

export const INTERNAL_TOOL_CATEGORIES = Object.freeze([
  Object.freeze({
    id: 'operations',
    label: 'Operations',
    description: '可重複執行的產品與支援操作。',
    tools: operations,
  }),
  Object.freeze({
    id: 'evaluation',
    label: 'Evaluation',
    description: '有明確品質 gate 與結束條件的研究工作。',
    tools: evaluation,
  }),
]);

export const INTERNAL_TOOL_ROUTES = Object.freeze([
  ...operations,
  ...evaluation,
]);

export function internalToolDefinition(route) {
  return INTERNAL_TOOL_ROUTES.find((tool) => tool.route === route) ?? null;
}

export function internalToolCategory(route) {
  return (
    INTERNAL_TOOL_CATEGORIES.find((category) =>
      category.tools.some((tool) => tool.route === route),
    ) ?? null
  );
}
