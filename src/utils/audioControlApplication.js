// This is an operation deadline, not an audio latency or quality guarantee.
export const AUDIO_CONTROL_APPLY_TIMEOUT_MS = 10_000;

export function createAudioControlApplication({ publish }) {
  let revision = 0;
  let current = null;
  let latest = null;

  function cancel() {
    current?.finish('cancelled');
  }

  function invalidate(lane, status = 'unconfirmed') {
    cancel();
    if (!latest) return;
    latest = Object.freeze({
      ...latest,
      revision: ++revision,
      status: 'invalidated',
      ok: false,
      applied: null,
      lanes: Object.freeze({ ...latest.lanes, [lane]: status }),
    });
    publish(latest);
  }

  function run(values, apply, { isCurrent: inScope = () => true } = {}) {
    cancel();
    const requested = Object.freeze({ ...values });
    const candidate = ++revision;
    const lanes = { monitor: 'pending', capture: 'pending' };
    let resolve;
    let timer;
    const operation = new Promise((done) => (resolve = done));
    const job = {
      isCurrent: () => current === job && inScope(),
      lane(name, status) {
        if (!job.isCurrent()) return;
        lanes[name] = status;
        publishResult('pending');
      },
      finish(status) {
        if (current !== job) return;
        if (!inScope()) status = 'cancelled';
        if (
          status === 'applied' &&
          (lanes.monitor !== 'applied' ||
            !['applied', 'disabled'].includes(lanes.capture))
        )
          status = 'failed';
        clearTimeout(timer);
        current = null;
        const result = publishResult(status);
        resolve(result);
      },
    };
    function publishResult(status) {
      const result = Object.freeze({
        revision: candidate,
        status,
        ok: status === 'applied',
        requested,
        applied: status === 'applied' ? requested : null,
        lanes: Object.freeze(
          Object.fromEntries(
            Object.entries(lanes).map(([name, lane]) => [
              name,
              status !== 'pending' && lane === 'pending' ? 'unconfirmed' : lane,
            ]),
          ),
        ),
      });
      latest = result;
      publish(result);
      return result;
    }
    current = job;
    publishResult('pending');
    timer = setTimeout(
      () => job.finish('timeout'),
      AUDIO_CONTROL_APPLY_TIMEOUT_MS,
    );
    // Start synchronously so ready/default controls retain their immediate
    // behavior. Every async resource boundary must recheck job.isCurrent().
    try {
      Promise.resolve(apply(job)).then(
        (outcome) =>
          job.finish(
            typeof outcome === 'string'
              ? outcome
              : outcome
                ? 'applied'
                : 'failed',
          ),
        () => job.finish('failed'),
      );
    } catch {
      job.finish('failed');
    }
    return operation;
  }

  return { run, cancel, invalidate };
}
