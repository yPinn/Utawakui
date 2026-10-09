<script setup>
import { computed } from 'vue';
import UiFolderArtifact from '../ui/UiFolderArtifact.vue';
import UiFolderArtifactCanvas from '../ui/UiFolderArtifactCanvas.vue';

const props = defineProps({
  artist: { type: String, required: true },
  summary: { type: Object, required: true },
});

const artifacts = Object.freeze([
  {
    id: 'artist-summary',
    kind: 'note',
    label: '藝人曲庫摘要',
    initialX: 0.12,
    initialY: 0.78,
    rotation: -1.5,
  },
]);

const summaryBody = computed(() => {
  const { trackCount = 0, albumCount = 0, yearStart, yearEnd } = props.summary;
  const facts = [`${trackCount} 首曲目`, `${albumCount} 張專輯`];
  if (yearStart) {
    facts.push(
      yearEnd && yearEnd !== yearStart
        ? `${yearStart}–${yearEnd}`
        : String(yearStart),
    );
  }
  return facts.join(' · ');
});
</script>

<template>
  <UiFolderArtifactCanvas
    :artifacts="artifacts"
    material="folder"
    label="Folder 延伸摘要"
  >
    <template #default="{ artifact }">
      <UiFolderArtifact
        :kind="artifact.kind"
        :eyebrow="artist"
        title="藝人曲庫摘要"
        :body="summaryBody"
      />
    </template>
  </UiFolderArtifactCanvas>
</template>
