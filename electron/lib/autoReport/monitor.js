'use strict';

const {
  S2_ESCALATION,
  classifyDiagnosticEvent,
  fingerprintOf,
  labelOf,
} = require('./severity');
const {
  emptyThrottleState,
  markSent,
  normalizeThrottleState,
  recordOccurrence,
  sendBlockReason,
} = require('./throttle');
const { buildAutoReport } = require('./payload');

const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONSENTS = new Set(['ask', 'always', 'never']);
const DECISIONS = new Set(['once', 'always', 'never', 'dismiss']);

// What the renderer prompt shows: the readable label, count and message.
function promptOf(report) {
  return {
    reportId: report.reportId,
    title: labelOf(report.code),
    occurrences: report.occurrences,
    escalated: report.escalated,
    message: report.message,
  };
}

// Turns stored diagnostics into at most a few consented reports. State is
// written synchronously before any send so a main-process crash leaves the
// report pending for the next launch instead of losing or repeating it.
function createAutoReportMonitor({
  readState,
  writeState,
  getConsent,
  setConsent,
  submit,
  promptUser = () => {},
  notifySent = () => {},
  environment = {},
  idGenerator,
  now = Date.now,
}) {
  let state = null;
  let sending = false;

  function load() {
    if (state) return state;
    let stored;
    try {
      stored = readState();
    } catch {
      stored = null;
    }
    const pending = stored?.pending;
    state = {
      ...normalizeThrottleState(stored ?? emptyThrottleState()),
      pending: pending && typeof pending.reportId === 'string' ? pending : null,
    };
    return state;
  }

  function save() {
    try {
      writeState(state);
    } catch {
      // Losing throttle history only risks one extra report, never a crash.
    }
  }

  function consent() {
    const value = getConsent();
    return CONSENTS.has(value) ? value : 'ask';
  }

  async function dispatch() {
    const pending = load().pending;
    if (!pending || sending) return false;
    sending = true;
    try {
      const result = await submit(pending.report);
      if (result?.status !== 'ok') return false;
      state = { ...markSent(state, pending.fingerprint, now()), pending: null };
      save();
      notifySent({ reportId: pending.reportId });
      return true;
    } catch {
      return false;
    } finally {
      sending = false;
    }
  }

  function offer() {
    const pending = load().pending;
    if (!pending) return;
    const current = consent();
    if (current === 'never') {
      state = { ...state, pending: null };
      save();
    } else if (current === 'always') {
      dispatch();
    } else {
      promptUser(promptOf(pending.report));
    }
  }

  function observe(event) {
    const severity = classifyDiagnosticEvent(event);
    if (severity !== 'S1' && severity !== 'S2') return;
    const at = now();
    const fingerprint = fingerprintOf(event);
    const occurrence = recordOccurrence(load(), fingerprint, at);
    state = { ...state, ...occurrence.state };
    const escalated = severity === 'S2';
    if (escalated && occurrence.recentS2 < S2_ESCALATION.count) {
      save();
      return;
    }
    if (
      sendBlockReason(state, fingerprint, at) ||
      consent() === 'never' ||
      state.pending
    ) {
      save();
      return;
    }
    const report = buildAutoReport({
      event,
      severity: escalated ? 'S2' : 'S1',
      escalated,
      occurrences: escalated ? occurrence.recentS2 : occurrence.occurrences,
      environment,
      reportId: idGenerator(),
      createdAt: new Date(at).toISOString(),
    });
    state = {
      ...state,
      pending: {
        reportId: report.reportId,
        fingerprint,
        createdAt: at,
        report,
      },
    };
    save();
    offer();
  }

  // Startup: retry or re-offer a report left by the previous session.
  function resumePending() {
    const pending = load().pending;
    if (!pending) return;
    if (now() - pending.createdAt > PENDING_TTL_MS) {
      state = { ...state, pending: null };
      save();
      return;
    }
    offer();
  }

  function pendingPrompt() {
    const pending = load().pending;
    return pending && consent() === 'ask' ? promptOf(pending.report) : null;
  }

  async function respond(reportId, decision) {
    const pending = load().pending;
    if (!pending || pending.reportId !== reportId || !DECISIONS.has(decision)) {
      return { ok: false };
    }
    if (decision === 'always' || decision === 'never') setConsent(decision);
    if (decision === 'never' || decision === 'dismiss') {
      state = { ...state, pending: null };
      save();
      return { ok: true, sent: false };
    }
    return { ok: true, sent: await dispatch() };
  }

  return { observe, pendingPrompt, respond, resumePending };
}

module.exports = { createAutoReportMonitor };
