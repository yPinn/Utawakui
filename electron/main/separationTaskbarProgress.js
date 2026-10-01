'use strict';

const ACTIVE_STATUSES = new Set(['running', 'pausing', 'paused']);

function noneProjection() {
  return {
    value: -1,
    mode: 'none',
    active: false,
    requiresAttention: false,
  };
}

function boundedProgress(value) {
  return Math.max(0, Math.min(1, value));
}

function projectSeparationTaskbarProgress(status) {
  const queue = status?.queue;
  if (!queue || !Number.isFinite(queue.total) || queue.total <= 0) {
    return noneProjection();
  }

  const failed =
    Math.max(0, queue.failed ?? 0) + Math.max(0, queue.cancelled ?? 0);
  if (!ACTIVE_STATUSES.has(queue.status)) {
    if (failed > 0) {
      return {
        value: 1,
        mode: 'error',
        active: false,
        requiresAttention: true,
      };
    }
    return noneProjection();
  }

  const done = Math.max(0, Number(queue.done) || 0);
  if (queue.status === 'paused') {
    return {
      value: boundedProgress(done / queue.total),
      mode: 'paused',
      active: true,
      requiresAttention: false,
    };
  }

  const activeItem = Array.isArray(queue.items)
    ? queue.items.find(({ itemId }) => itemId === queue.activeItemId)
    : null;
  if (!Number.isFinite(activeItem?.percent)) {
    return {
      value: 2,
      mode: 'indeterminate',
      active: true,
      requiresAttention: false,
    };
  }

  return {
    value: boundedProgress((done + activeItem.percent / 100) / queue.total),
    mode: 'normal',
    active: true,
    requiresAttention: false,
  };
}

module.exports = { projectSeparationTaskbarProgress };
