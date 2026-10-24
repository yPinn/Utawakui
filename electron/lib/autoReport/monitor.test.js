import { describe, expect, it, vi } from 'vitest';
import monitorModule from './monitor.js';
import throttleModule from './throttle.js';

const { createAutoReportMonitor } = monitorModule;
const { MAX_REPORTS_PER_DAY } = throttleModule;

const HOUR = 60 * 60 * 1000;

function crash(overrides = {}) {
  return {
    level: 'error',
    process: 'main',
    source: 'process',
    operation: 'uncaught-exception',
    code: 'UNCAUGHT_EXCEPTION',
    message: 'TypeError: boom',
    stack: [
      'TypeError: boom',
      '    at publish (app:electron/main.js:994:9)',
      '    at read ([path])',
    ].join('\n'),
    ...overrides,
  };
}

function setup({ consent = 'always', stored = null, submitResult } = {}) {
  let clock = Date.parse('2026-10-24T03:00:00.000Z');
  let persisted = stored;
  let currentConsent = consent;
  let id = 0;
  const submit = vi.fn(async () => submitResult ?? { status: 'ok' });
  const promptUser = vi.fn();
  const notifySent = vi.fn();
  const monitor = createAutoReportMonitor({
    readState: () => persisted,
    writeState: (value) => {
      persisted = JSON.parse(JSON.stringify(value));
    },
    getConsent: () => currentConsent,
    setConsent: (value) => {
      currentConsent = value;
    },
    submit,
    promptUser,
    notifySent,
    environment: { appVersion: '0.4.0', platform: 'win32' },
    idGenerator: () => `r-${(id += 1)}`,
    now: () => clock,
  });
  return {
    monitor,
    submit,
    promptUser,
    notifySent,
    advance: (ms) => {
      clock += ms;
    },
    persisted: () => persisted,
    consent: () => currentConsent,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('auto report monitor', () => {
  it('sends an S1 report with only app frames and a generated summary', async () => {
    const { monitor, submit, notifySent } = setup();
    monitor.observe(crash());
    await flush();

    const report = submit.mock.calls[0][0];
    expect(report).toMatchObject({
      kind: 'auto',
      severity: 'S1',
      code: 'UNCAUGHT_EXCEPTION',
      appFrames: ['at publish (app:electron/main.js:994:9)'],
      occurrences: 1,
    });
    expect(report.summary).toContain('主程序未捕捉的例外');
    expect(JSON.stringify(report)).not.toContain('[path]');
    expect(notifySent).toHaveBeenCalledWith({ reportId: 'r-1' });
  });

  it('ignores routine errors and non-fatal renderer exits', async () => {
    const { monitor, submit } = setup();
    monitor.observe(crash({ code: 'LYRICS_LRCLIB_SEARCH_FAILED' }));
    monitor.observe(crash({ code: 'RENDER_PROCESS_GONE', context: {} }));
    monitor.observe(crash({ level: 'info' }));
    await flush();
    expect(submit).not.toHaveBeenCalled();
  });

  it('escalates S2 only after three occurrences within an hour', async () => {
    const { monitor, submit, advance } = setup();
    const rejection = crash({ code: 'UNHANDLED_REJECTION' });
    monitor.observe(rejection);
    advance(HOUR + 1);
    monitor.observe(rejection);
    monitor.observe(rejection);
    await flush();
    expect(submit).not.toHaveBeenCalled();

    monitor.observe(rejection);
    await flush();
    expect(submit).toHaveBeenCalledOnce();
    expect(submit.mock.calls[0][0]).toMatchObject({
      severity: 'S2',
      escalated: true,
      occurrences: 3,
    });
  });

  it('sends one report per fingerprint a day and at most three a day', async () => {
    const { monitor, submit, advance } = setup();
    monitor.observe(crash());
    await flush();
    monitor.observe(crash());
    await flush();
    expect(submit).toHaveBeenCalledTimes(1);

    for (let index = 0; index < MAX_REPORTS_PER_DAY + 1; index += 1) {
      advance(1000);
      monitor.observe(
        crash({ stack: `TypeError\n    at f${index} (app:x${index}.js:1:1)` }),
      );
      await flush();
    }
    expect(submit).toHaveBeenCalledTimes(MAX_REPORTS_PER_DAY);
  });

  it('asks first, then honours always and never', async () => {
    const first = setup({ consent: 'ask' });
    first.monitor.observe(crash());
    expect(first.submit).not.toHaveBeenCalled();
    expect(first.promptUser).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: 'r-1', title: '主程序未捕捉的例外' }),
    );
    expect(first.monitor.pendingPrompt()).toMatchObject({ reportId: 'r-1' });
    await expect(first.monitor.respond('r-1', 'always')).resolves.toEqual({
      ok: true,
      sent: true,
    });
    expect(first.consent()).toBe('always');

    const declined = setup({ consent: 'ask' });
    declined.monitor.observe(crash());
    await declined.monitor.respond('r-1', 'never');
    expect(declined.consent()).toBe('never');
    expect(declined.persisted().pending).toBeNull();
    declined.monitor.observe(crash({ stack: 'E\n    at g (app:y.js:1:1)' }));
    expect(declined.submit).not.toHaveBeenCalled();
    expect(declined.promptUser).toHaveBeenCalledOnce();
  });

  it('keeps a report pending across a restart when sending fails', async () => {
    const failing = setup({
      submitResult: { status: 'error', reason: 'offline' },
    });
    failing.monitor.observe(crash());
    await flush();
    const stored = failing.persisted();
    expect(stored.pending.reportId).toBe('r-1');

    const restarted = setup({ stored });
    restarted.monitor.resumePending();
    await flush();
    expect(restarted.submit).toHaveBeenCalledOnce();
    expect(restarted.submit.mock.calls[0][0].reportId).toBe('r-1');
    expect(restarted.persisted().pending).toBeNull();
  });

  it('drops a pending report older than seven days', async () => {
    const failing = setup({ submitResult: { status: 'error' } });
    failing.monitor.observe(crash());
    await flush();
    const restarted = setup({ stored: failing.persisted() });
    restarted.advance(7 * 24 * HOUR + 1);
    restarted.monitor.resumePending();
    await flush();
    expect(restarted.submit).not.toHaveBeenCalled();
    expect(restarted.persisted().pending).toBeNull();
  });
});
