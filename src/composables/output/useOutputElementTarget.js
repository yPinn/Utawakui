import { computed, shallowRef, watch } from 'vue';

// One adjustment target shared by the inspector select and canvas selection.
export function useOutputElementTarget({ elementTargets, templateId }) {
  const selectedTargetId = shallowRef('template');
  const selectedTarget = computed(() =>
    elementTargets.value.find(({ id }) => id === selectedTargetId.value),
  );
  const elementIds = computed(() => elementTargets.value.map(({ id }) => id));
  const targetOptions = computed(() => [
    { value: 'template', label: '整個模板' },
    ...elementTargets.value.map(({ id, label }) => ({ value: id, label })),
  ]);

  function selectTarget(id) {
    selectedTargetId.value = elementIds.value.includes(id) ? id : 'template';
  }

  watch(templateId, () => {
    selectedTargetId.value = 'template';
  });

  return {
    elementIds,
    selectedTarget,
    selectedTargetId,
    selectTarget,
    targetOptions,
  };
}
