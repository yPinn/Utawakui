import { describe, expect, it } from 'vitest';
import { preparationActivityIndicator } from './preparationActivityPresentation.js';

describe('preparation activity presentation', () => {
  it('keeps idle preparation quiet after completed history', () => {
    expect(preparationActivityIndicator()).toEqual({
      state: 'idle',
      label: '',
    });
    expect(
      preparationActivityIndicator({
        separationQueue: {
          status: 'idle',
          done: 3,
          total: 3,
          pending: 0,
          failed: 0,
          cancelled: 0,
        },
      }),
    ).toEqual({ state: 'idle', label: '' });
  });

  it('projects active provider and local work through one import label', () => {
    expect(
      preparationActivityIndicator({
        providerImport: { isImporting: true },
      }),
    ).toEqual({ state: 'running', label: '匯入中' });
    expect(
      preparationActivityIndicator({
        localImport: { isConverting: true },
      }),
    ).toEqual({ state: 'running', label: '匯入中' });
  });

  it('keeps paused state meaningful without exposing a zero-item count', () => {
    expect(
      preparationActivityIndicator({
        separationQueue: {
          status: 'paused',
          done: 4,
          total: 4,
          pending: 0,
          failed: 0,
          cancelled: 0,
        },
      }),
    ).toEqual({ state: 'paused', label: '已暫停' });
  });

  it('does not promote a foreground source-resolution error to global attention', () => {
    expect(
      preparationActivityIndicator({
        providerImport: {
          statusType: 'error',
          singleTrack: null,
          playlistTracks: null,
        },
      }),
    ).toEqual({ state: 'idle', label: '' });
  });

  it('prioritizes unfinished work over running work and running over pause', () => {
    expect(
      preparationActivityIndicator({
        separationQueue: {
          status: 'running',
          done: 1,
          total: 4,
          pending: 2,
          failed: 1,
          cancelled: 0,
        },
        providerImport: { isImporting: true },
      }),
    ).toEqual({ state: 'attention', label: '1 首未完成' });

    expect(
      preparationActivityIndicator({
        separationQueue: {
          status: 'paused',
          done: 1,
          total: 4,
          pending: 3,
          failed: 0,
          cancelled: 0,
        },
        localImport: { isImporting: true },
      }),
    ).toEqual({ state: 'running', label: '匯入中' });
  });

  it('aggregates multiple unfinished preparation domains without leaking details', () => {
    expect(
      preparationActivityIndicator({
        separationQueue: {
          status: 'idle',
          done: 2,
          total: 2,
          pending: 0,
          failed: 1,
          cancelled: 0,
        },
        providerImport: {
          singleTrack: { status: 'error' },
        },
      }),
    ).toEqual({ state: 'attention', label: '有未完成項目' });
  });

  it('projects provider failures and concurrent preparation work explicitly', () => {
    expect(
      preparationActivityIndicator({
        providerImport: {
          playlistTracks: [{ status: 'done' }, { status: 'error' }],
        },
      }),
    ).toEqual({ state: 'attention', label: '匯入未完成' });

    expect(
      preparationActivityIndicator({
        separationQueue: {
          status: 'running',
          done: 0,
          total: 2,
          pending: 1,
          failed: 0,
          cancelled: 0,
        },
        localImport: { isImporting: true },
      }),
    ).toEqual({ state: 'running', label: '多項處理中' });
  });
});
