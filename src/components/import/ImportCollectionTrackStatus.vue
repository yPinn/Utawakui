<script setup>
import { computed } from 'vue';
import {
  ArrowDownToLine,
  Check,
  CircleAlert,
  CircleDashed,
  CircleX,
  Library,
  Loader2,
} from '../../icons/index.js';
import {
  identityStatusClass,
  identityStatusLabel,
} from '../../utils/importCandidateDisplay.js';
import {
  downloadFailureHint,
  downloadFailureLabel,
} from '../../utils/downloadFailureDisplay.js';
import UiStatusIcon from '../ui/UiStatusIcon.vue';

const props = defineProps({
  track: { type: Object, required: true },
});

const IDENTITY_STATUS_ICONS = {
  review: CircleAlert,
  pending: CircleDashed,
};
const IDENTITY_STATUS_TONES = {
  review: 'warning',
  pending: 'muted',
};
const TRACK_STATUS_ICONS = {
  pending: ArrowDownToLine,
  downloading: Loader2,
  done: Check,
  downloaded: Library,
  error: CircleX,
};
const TRACK_STATUS_TONES = {
  pending: 'muted',
  downloading: 'info',
  done: 'success',
  downloaded: 'muted',
  error: 'danger',
};

const identity = computed(() => props.track.trackIdentity || null);
const identityState = computed(() => identityStatusClass(identity.value));
const showIdentityStatus = computed(() => identityState.value !== 'identified');
const status = computed(() => {
  if (props.track.status === 'done') return 'done';
  if (props.track.alreadyDownloaded) return 'downloaded';
  return props.track.status || 'pending';
});
const statusLabel = computed(() => {
  if (props.track.status === 'error' && props.track.errorCode) {
    return `${downloadFailureLabel(props.track.errorCode)}｜${downloadFailureHint(props.track.errorCode)}`;
  }
  if (status.value === 'done') return '完成';
  if (status.value === 'downloaded') return '已存在';
  if (status.value === 'downloading') return '下載中';
  if (status.value === 'error') return '失敗';
  return '待下載';
});
</script>

<template>
  <UiStatusIcon
    v-if="showIdentityStatus"
    :icon="IDENTITY_STATUS_ICONS[identityState]"
    :tone="IDENTITY_STATUS_TONES[identityState]"
    :label="identityStatusLabel(identity)"
  />
  <UiStatusIcon
    :icon="TRACK_STATUS_ICONS[status]"
    :tone="TRACK_STATUS_TONES[status]"
    :spinning="status === 'downloading'"
    :label="statusLabel"
  />
</template>
