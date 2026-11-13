import { nextTick } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TrackVideoEditor from './TrackVideoEditor.vue';
import { mount } from '../ui/uiTestHost.js';

vi.mock('../../composables/useAppConfirmation.js', () => ({
  useAppConfirmation: () => ({ confirm: vi.fn(async () => true) }),
}));
const requireFeatureGate = vi.fn(async () => true);
vi.mock('../../composables/useFeatureGateAccess.js', () => ({
  useFeatureGateAccess: () => ({ requireFeatureGate }),
}));

let app;
let editor;
let api;
async function flush() {
  await Promise.resolve();
  await nextTick();
}

beforeEach(async () => {
  requireFeatureGate.mockClear();
  requireFeatureGate.mockResolvedValue(true);
  api = {
    getTrackVideo: vi.fn(async () => ({
      status: 'ok',
      video: null,
      source: { id: 'abcdefghijk', kind: 'unknown', title: 'Song' },
    })),
    getTrackVideoFormats: vi.fn(async () => ({
      status: 'ok',
      token: 'offer',
      kind: 'mv',
      choices: [{ id: '1080', height: 1080, sizeBytes: 1000 }],
      defaultId: '1080',
    })),
    pickTrackVideo: vi.fn(async () => ({
      status: 'candidate',
      token: 'draft',
      reason: 'missing-reference',
      url: 'utawakui-media://track-video-candidate/draft',
    })),
    downloadTrackVideo: vi.fn(),
    cancelTrackVideo: vi.fn(async () => ({ status: 'ok' })),
    getTrackVideoStatus: vi.fn(async () => ({ status: 'idle' })),
    alignTrackVideo: vi.fn(async () => ({
      status: 'ok',
      suggestedOffsetMs: 8417,
    })),
    setTrackVideoOffset: vi.fn(async (_track, revision, offsetMs) => ({
      status: 'ok',
      video: { available: true, revision, offsetMs },
    })),
    saveTrackVideo: vi.fn(async () => ({
      status: 'ok',
      video: { available: true, width: 1920, height: 1080, sizeBytes: 1000 },
    })),
  };
  vi.stubGlobal('window', { Utawakui: api });
  const mounted = mount(
    { ...TrackVideoEditor, render: () => null },
    { trackId: 'track' },
  );
  app = mounted.app;
  editor = app._instance.subTree.component.setupState;
  await flush();
});

it('prompts for a legacy silent video source and saves the estimate only when requested', async () => {
  editor.saved = { available: true, revision: 'saved', offsetMs: 9000 };
  editor.offset = 9000;
  api.alignTrackVideo.mockResolvedValueOnce({
    status: 'ok',
    needsReference: true,
  });
  await editor.alignSaved();
  expect(editor.referenceOpen).toBe(true);
  expect(editor.offset).toBe(9000);
  editor.referenceInput = 'https://youtu.be/DOuhvBJqKVY?list=ignored';
  await editor.alignSaved();
  expect(api.alignTrackVideo).toHaveBeenLastCalledWith(
    'track',
    'saved',
    'DOuhvBJqKVY',
  );
  expect(editor.referenceOpen).toBe(false);
  expect(editor.offset).toBe(8417);
  expect(editor.saved.offsetMs).toBe(9000);
  expect(api.setTrackVideoOffset).not.toHaveBeenCalled();
  await editor.saveOffset();
  expect(api.setTrackVideoOffset).toHaveBeenCalledExactlyOnceWith(
    'track',
    'saved',
    8417,
    { token: undefined, useSegments: false },
  );
  expect(editor.saved.offsetMs).toBe(8417);
});

it('applies a section estimate even when its first offset matches the saved value', async () => {
  editor.saved = { available: true, revision: 'saved', offsetMs: 18766 };
  editor.offset = 18766;
  api.alignTrackVideo.mockResolvedValueOnce({
    status: 'ok',
    suggestedOffsetMs: 18766,
    alignmentToken: 'sections',
    segmentCount: 2,
  });
  await editor.alignSaved();
  expect(editor.useSegments).toBe(true);
  expect(editor.canSaveOffset).toBe(true);
  await editor.saveOffset();
  expect(api.setTrackVideoOffset).toHaveBeenCalledWith(
    'track',
    'saved',
    18766,
    { token: 'sections', useSegments: true },
  );
});

it('prefills a saved-video estimate with a review range and saves it on request', async () => {
  editor.saved = { available: true, revision: 'saved', offsetMs: 0 };
  api.alignTrackVideo.mockResolvedValueOnce({
    status: 'ok',
    suggestedOffsetMs: 12832,
    reviewRange: { startMs: 234000, endMs: 238000 },
  });
  await editor.alignSaved();
  expect(editor.offset).toBe(12832);
  expect(editor.offsetHint).toContain('3:54–3:58');
  expect(editor.canSaveOffset).toBe(true);
  expect(api.setTrackVideoOffset).not.toHaveBeenCalled();
  await editor.saveOffset();
  expect(editor.saved.offsetMs).toBe(12832);
});

afterEach(() => {
  app.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('starts with acquisition entries and reveals quality only after an explicit lookup', async () => {
  expect(editor.downloadOpen).toBe(false);
  expect(editor.sourceInput).toBe('abcdefghijk');
  expect(editor.previewOpen).toBe(false);
  expect(editor.options).toEqual([]);
  expect(api.getTrackVideoFormats).not.toHaveBeenCalled();

  await editor.toggleDownload({ currentTarget: { focus: vi.fn() } });
  expect(editor.downloadOpen).toBe(true);
  await editor.lookup();
  expect(editor.selected).toBe('1080');
  expect(editor.options).toHaveLength(1);
});

it('resets preview, format selection and permission when the video ID changes', async () => {
  await editor.lookup();
  editor.previewOpen = true;
  editor.permitted = true;
  editor.editSource('https://youtu.be/oZpYEEcvu5I');
  await flush();
  expect(editor.sourceId).toBe('oZpYEEcvu5I');
  expect(editor.offer).toBeNull();
  expect(editor.selected).toBe('');
  expect(editor.permitted).toBe(false);
  expect(editor.previewOpen).toBe(false);
});

it('cleans a pasted link without resetting an offer for the same video', async () => {
  await editor.lookup();
  editor.permitted = true;
  editor.editSource(
    'https://youtu.be/abcdefghijk?list=PL123&si=share&utm_source=copy',
  );
  await flush();
  expect(editor.sourceInput).toBe(
    'https://www.youtube.com/watch?v=abcdefghijk',
  );
  expect(editor.offer.token).toBe('offer');
  expect(editor.permitted).toBe(true);
});

it('updates the visible input when pasting the same link again with new suffixes', async () => {
  const input = { value: 'https://www.youtube.com/watch?v=abcdefghijk' };
  const event = {
    currentTarget: input,
    clipboardData: {
      getData: () => 'https://youtu.be/abcdefghijk?list=PL123&si=share',
    },
    preventDefault: vi.fn(),
  };
  editor.pasteSource(event);
  input.value = 'https://youtu.be/abcdefghijk?utm_source=copy';
  editor.pasteSource(event);
  expect(event.preventDefault).toHaveBeenCalledTimes(2);
  expect(input.value).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  expect(editor.sourceInput).toBe(input.value);
});

it('returns from local review and collapses source options after applying the video', async () => {
  await editor.toggleDownload({ currentTarget: { focus: vi.fn() } });
  await editor.lookup();
  await editor.pick({ currentTarget: { focus: vi.fn() } });
  expect(editor.candidate.token).toBe('draft');
  await editor.save();
  expect(api.saveTrackVideo).toHaveBeenCalledWith('track', 'draft', 0, false);
  expect(editor.saved.available).toBe(true);
  expect(editor.candidate).toBeNull();
  expect(editor.downloadOpen).toBe(false);
  expect(editor.offer).toBeNull();
});

it('adopts a fixed offset that Main already applied, including zero', async () => {
  editor.saved = { available: true, offsetMs: 9000 };
  api.pickTrackVideo.mockResolvedValueOnce({
    status: 'ok',
    video: { available: true, offsetMs: 0, revision: 'new' },
  });
  await editor.pick({ currentTarget: { focus: vi.fn() } });
  expect(editor.offset).toBe(0);
  expect(editor.saved.revision).toBe('new');
  expect(editor.candidate).toBeNull();
  expect(editor.timingOpen).toBe(false);
  expect(api.saveTrackVideo).not.toHaveBeenCalled();
});

it('adopts an automatically applied download with segments and closes the source form', async () => {
  await editor.toggleDownload({ currentTarget: { focus: vi.fn() } });
  await editor.lookup();
  editor.permitted = true;
  api.downloadTrackVideo.mockResolvedValueOnce({
    status: 'ok',
    video: {
      available: true,
      offsetMs: 750,
      syncSegments: [{ offsetMs: 750 }, { offsetMs: 2750 }],
    },
  });
  await editor.download();
  expect(api.downloadTrackVideo).toHaveBeenCalledWith(
    'track',
    'offer',
    '1080',
    true,
  );
  expect(editor.saved.syncSegments).toHaveLength(2);
  expect(editor.candidate).toBeNull();
  expect(editor.downloadOpen).toBe(false);
  expect(api.saveTrackVideo).not.toHaveBeenCalled();
});

it('opens timing for a partial segmented match and collapses it after manual apply', async () => {
  expect(editor.timingOpen).toBe(false);
  api.pickTrackVideo.mockResolvedValueOnce({
    status: 'candidate',
    token: 'draft',
    reason: 'partial-match',
    suggestedOffsetMs: 750,
    segmentCount: 2,
  });
  await editor.pick({ currentTarget: { focus: vi.fn() } });
  expect(editor.timingOpen).toBe(true);
  expect(editor.candidate.reason).toBe('partial-match');
  expect(editor.useSegments).toBe(true);
  await editor.save();
  expect(api.saveTrackVideo).toHaveBeenCalledWith('track', 'draft', 750, true);
  expect(editor.timingOpen).toBe(false);
});

it('prefills a provisional import offset and identifies where to review it', async () => {
  api.pickTrackVideo.mockResolvedValueOnce({
    status: 'candidate',
    token: 'draft',
    reason: 'partial-offset',
    suggestedOffsetMs: 12832,
    reviewRange: { startMs: 234000, endMs: 238000 },
  });
  await editor.pick({ currentTarget: { focus: vi.fn() } });
  expect(editor.offset).toBe(12832);
  expect(editor.candidateHint).toContain('3:54–3:58');
  expect(api.saveTrackVideo).not.toHaveBeenCalled();
});

it('starts a replacement without a match at zero and restores saved timing when changing source', async () => {
  editor.saved = { available: true, revision: 'saved', offsetMs: 9000 };
  editor.offset = 9000;
  await editor.pick({ currentTarget: { focus: vi.fn() } });
  expect(editor.offset).toBe(0);
  expect(editor.candidate.reason).toBe('missing-reference');
  await editor.changeSource();
  expect(editor.offset).toBe(9000);
  expect(editor.timingOpen).toBe(false);
  expect(api.cancelTrackVideo).toHaveBeenCalledWith('track');
});

it('reports and cancels automatic alignment after the import dialog', async () => {
  vi.useFakeTimers();
  const result = Promise.withResolvers();
  api.pickTrackVideo.mockReturnValueOnce(result.promise);
  api.getTrackVideoStatus.mockResolvedValueOnce({ status: 'aligning' });
  api.cancelTrackVideo.mockImplementationOnce(async () => {
    result.resolve({ status: 'cancelled' });
  });
  const importVideo = editor.pick({ currentTarget: { focus: vi.fn() } });
  expect(editor.status).toBe('choosing');
  await vi.advanceTimersByTimeAsync(100);
  expect(editor.status).toBe('aligning');
  expect(editor.isAcquiring).toBe(true);
  editor.cancel();
  await importVideo;
  expect(editor.status).toBe('');
  expect(editor.candidate).toBeNull();
});

it('sends a closed external-source gate to Settings instead of opening the YouTube form', async () => {
  requireFeatureGate.mockResolvedValue(false);
  await editor.toggleDownload({ currentTarget: { focus: vi.fn() } });
  expect(editor.downloadOpen).toBe(false);
  expect(requireFeatureGate).toHaveBeenCalledWith('provider-flow', {
    source: 'track-video',
    operation: 'open',
  });
});

it('routes a provider refusal from Main to the gate instead of a dead-end notice', async () => {
  api.getTrackVideoFormats.mockResolvedValueOnce({
    status: 'provider-disabled',
  });
  await editor.lookup();
  expect(editor.error).toBe('');
  expect(requireFeatureGate).toHaveBeenCalledWith('provider-flow', {
    source: 'track-video',
    operation: 'working',
  });
});
