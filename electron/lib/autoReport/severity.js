'use strict';

// S1 reports on first occurrence; S2 only after repeating within the
// escalation window; anything unlisted stays local (fail closed). Each code
// counts only from the process that owns it, so a renderer cannot raise a
// main-process code.
const MAIN = Object.freeze(['main']);
const RENDERER = Object.freeze(['renderer']);
const SEVERITY_BY_CODE = Object.freeze({
  UNCAUGHT_EXCEPTION: {
    severity: 'S1',
    label: '主程序未捕捉的例外',
    processes: MAIN,
  },
  RENDER_PROCESS_GONE: {
    severity: 'S1',
    label: '畫面程序異常結束',
    processes: MAIN,
  },
  PRELOAD_FAILED: {
    severity: 'S1',
    label: '安全橋接載入失敗',
    processes: MAIN,
  },
  STARTUP_DEFERRED_MIGRATION_FAILED: {
    severity: 'S1',
    label: '啟動資料遷移失敗',
    processes: MAIN,
  },
  UNHANDLED_REJECTION: {
    severity: 'S2',
    label: '未處理的非同步錯誤',
    processes: Object.freeze(['main', 'renderer']),
  },
  RENDERER_UNRESPONSIVE: {
    severity: 'S2',
    label: '畫面沒有回應',
    processes: MAIN,
  },
  RENDERER_LOAD_FAILED: {
    severity: 'S2',
    label: '畫面載入失敗',
    processes: MAIN,
  },
  CHILD_PROCESS_GONE: {
    severity: 'S2',
    label: '子程序異常結束',
    processes: MAIN,
  },
  VUE_UNHANDLED_ERROR: {
    severity: 'S2',
    label: '介面元件錯誤',
    processes: RENDERER,
  },
  WINDOW_ERROR: { severity: 'S2', label: '畫面腳本錯誤', processes: RENDERER },
  OUTPUT_AUTOMATIC_START_FAILED: {
    severity: 'S2',
    label: 'Output 自動啟動失敗',
    processes: MAIN,
  },
});
// Renderer exits are only critical for these reasons (see
// diagnosticsLifecycle FATAL_RENDERER_REASONS); others are routine.
const FATAL_ONLY_CODES = new Set(['RENDER_PROCESS_GONE']);
// Lifecycle grades killed／evicted child exits as warnings; only abnormal
// exits are recorded as errors.
const ERROR_LEVEL_ONLY_CODES = new Set(['CHILD_PROCESS_GONE']);
const S2_ESCALATION = Object.freeze({ count: 3, windowMs: 60 * 60 * 1000 });
const MAX_APP_FRAMES = 10;

function classifyDiagnosticEvent(event) {
  if (event?.level !== 'error' && event?.level !== 'warning') return 'S4';
  const entry = SEVERITY_BY_CODE[event.code];
  if (!entry || !entry.processes.includes(event.process)) return 'S3';
  if (ERROR_LEVEL_ONLY_CODES.has(event.code) && event.level !== 'error') {
    return 'S3';
  }
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
// Lifecycle events carry no stack, so the window role keeps one window's
// failures from counting toward another's.
function fingerprintOf(event) {
  const [topFrame = ''] = appFramesOf(event?.stack);
  const role = event?.context?.windowRole;
  return `${event?.code ?? 'UNKNOWN'}${role ? `@${role}` : ''}|${topFrame.replace(/:\d+(?::\d+)?\)?$/u, '')}`;
}

module.exports = {
  S2_ESCALATION,
  SEVERITY_BY_CODE,
  appFramesOf,
  classifyDiagnosticEvent,
  fingerprintOf,
  labelOf,
};
