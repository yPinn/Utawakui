import moduleUrl from 'signalsmith-stretch?url';

// Keep engine evaluation off the initial renderer graph. Both monitor and
// capture graphs share the download, while each still owns its AudioWorkletNode.
export function createPitchProcessorLoader(
  importModule = () => import('signalsmith-stretch'),
) {
  let pending = null;
  return function load() {
    pending ??= Promise.resolve()
      .then(importModule)
      .then(({ default: processor }) => {
        // Preserve the self-hosted worklet URL required by script-src 'self'.
        processor.moduleUrl = moduleUrl;
        return processor;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
    return pending;
  };
}

export const loadPitchProcessor = createPitchProcessorLoader();
