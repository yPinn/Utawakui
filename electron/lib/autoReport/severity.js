'use strict';

// S1 reports on first occurrence; S2 only after repeating within the
// escalation window; anything unlisted stays local (fail closed).
const SEVERITY_BY_CODE = Object.freeze({
  UNCAUGHT_EXCEPTION: { severity: 'S1', label: '主程序未捕捉的例外' },
  RENDER_PROCESS_GONE: { severity: 'S1', label: '畫面程序異常結束' },
  PRELOAD_FAILED: { severity: 'S1', label: '安全橋接載入失敗' },
  STARTUP_DEFERRED_MIGRATION_FAILED: {
    severity: 'S1',
    label: '啟動資料遷移失敗',
  },
  UNHANDLED_REJECTION: { severity: 'S2', label: '未處理的非同步錯誤' },
  RENDERER_UNRESPONSIVE: { severity: 'S2', label: '畫面沒有回應' },
  RENDERER_LOAD_FAILED: { severity: 'S2', label: '畫面載入失敗' },
  CHILD_PROCESS_GONE: { severity: 'S2', label: '子程序異常結束' },
  VUE_UNHANDLED_ERROR: { severity: 'S2', label: '介面元件錯誤' },
  WINDOW_ERROR: { severity: 'S2', label: '畫面腳本錯誤' },
  OUTPUT_AUTOMATIC_START_FAILED: {
    severity: 'S2',
    label: 'Output 自動啟動失敗',
  },
});
// Renderer exits are only critical for these reasons (see
// diagnosticsLifecycle FATAL_RENDERER_REASONS); others are routine.
const FATAL_ONLY_CODES = new Set(['RENDER_PROCESS_GONE']);
const S2_ESCALATION = Object.freeze({ count: 3, windowMs: 60 * 60 * 1000 });
const MAX_APP_FRAMES = 10;

function classifyDiagnosticEvent(event) {
  if (event?.level !== 'error' && event?.level !== 'warning') return 'S4';
  const entry = SEVERITY_BY_CODE[event.code];
  if (!entry) return 'S3';
  if (FATAL_ONLY_CODES.has(event.code) && event.context?.fatal !== true) {
    return 'S3';
  }
  return entry.severity;
}

function labelOf(code) {
  return SEVERITY_BY_CODE[code]?.label ?? '未分類錯誤';
}

// App-bundle frames only (diagnostics already rewrote them to app:<path>);
// every other frame is dropped, so no user path can reach a report.
function appFramesOf(stack) {
  if (typeof stack !== 'string') return [];
  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^at .*\bapp:[^\s()]+\)?$/u.test(line))
    .slice(0, MAX_APP_FRAMES);
}

// Line and column are dropped so a report groups across small code moves.
function fingerprintOf(event) {
  const [topFrame = ''] = appFramesOf(event?.stack);
  return `${event?.code ?? 'UNKNOWN'}|${topFrame.replace(/:\d+(?::\d+)?\)?$/u, '')}`;
}

module.exports = {
  S2_ESCALATION,
  SEVERITY_BY_CODE,
  appFramesOf,
  classifyDiagnosticEvent,
  fingerprintOf,
  labelOf,
};
