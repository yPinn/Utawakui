import { createSSRApp, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  SEPARATION_QUEUE_KEY,
  useSeparationQueueContext,
} from './useSeparationQueueContext.js';

describe('useSeparationQueueContext', () => {
  it('returns the root-provided controller without creating another owner', () => {
    const controller = {
      queue: ref(null),
      error: ref(''),
      enqueue: vi.fn(),
    };
    const app = createSSRApp({ render: () => null });
    app.provide(SEPARATION_QUEUE_KEY, controller);

    const injected = app.runWithContext(() => useSeparationQueueContext());

    expect(injected).toBe(controller);
  });

  it('uses an inert fallback for isolated component mounts', async () => {
    const app = createSSRApp({ render: () => null });
    const injected = app.runWithContext(() => useSeparationQueueContext());

    expect(injected.queue.value).toBeNull();
    expect(injected.error.value).toBe('');
    await expect(injected.enqueue(['track-a'])).resolves.toBeNull();
  });
});
