import { inject, provide } from 'vue';

const NOTICE_REPORTER_KEY = Symbol('ui-notice-reporter');

// An app shell may let notices offer a follow-up action, e.g. reporting an
// error. UiNotice stays domain-free: it only asks whether a notice qualifies.
export function provideNoticeReporter({ label, canReport, report }) {
  provide(NOTICE_REPORTER_KEY, Object.freeze({ label, canReport, report }));
}

export function injectNoticeReporter() {
  return inject(NOTICE_REPORTER_KEY, null);
}
