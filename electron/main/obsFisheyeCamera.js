'use strict';

const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');

const FILTER_KIND = 'utawakui_fisheye_camera';
const EFFECTS = { zoom: 1, glitch: 2, grain: 3 };
const ACTIONS = new Set([
  'status',
  'bind',
  'auto-on',
  'auto-off',
  ...Object.keys(EFFECTS),
]);

function isCameraAction(action) {
  return ACTIONS.has(action);
}

function createObsFisheyeCamera({ now = () => performance.now() } = {}) {
  let binding = null;
  let commandPending = false;
  let manualUntil = 0;

  async function readProgram(call) {
    const program = await call('GetCurrentProgramScene');
    const name = program.sceneName ?? program.currentProgramSceneName;
    const uuid = program.sceneUuid ?? program.currentProgramSceneUuid;
    if (typeof name !== 'string' || !name) return null;
    if (uuid) return { name, id: uuid, source: { sourceUuid: uuid } };
    const { currentSceneCollectionName } = await call('GetSceneCollectionList');
    if (!currentSceneCollectionName) return null;
    return {
      name,
      id: JSON.stringify([currentSceneCollectionName, name]),
      source: { sourceName: name },
    };
  }

  async function inspectFilter(call, program) {
    const { filters } = await call('GetSourceFilterList', program.source);
    const matches = filters.filter(
      ({ filterKind }) => filterKind === FILTER_KIND,
    );
    if (matches.length !== 1) {
      return { state: matches.length ? 'ambiguous' : 'missing' };
    }
    const filter = matches[0];
    const { defaultFilterSettings: defaults } = await call(
      'GetSourceFilterDefaultSettings',
      { filterKind: FILTER_KIND },
    );
    if (defaults?.camera_control_version !== 1)
      return { state: 'update-script' };
    const settings = { ...defaults, ...filter.filterSettings };
    if (!filter.filterEnabled) return { state: 'disabled-filter' };
    if (settings.mode !== 0 || !(settings.intensity > 0))
      return { state: 'inactive-filter' };
    return {
      state: 'ready',
      filterName: filter.filterName,
      automatic: settings.automatic === true,
    };
  }

  async function run(action, { call, connection }) {
    const isCommand = action !== 'status';
    if (isCommand && commandPending) return { state: 'busy' };
    if (isCommand) commandPending = true;
    try {
      const program = await readProgram(call);
      if (!program) return { state: 'no-scene' };
      const scene = program.name;
      const target = binding?.connection === connection ? binding : null;
      if (
        action !== 'bind' &&
        action !== 'status' &&
        target?.id !== program.id
      ) {
        return { state: target ? 'scene-changed' : 'unbound', scene };
      }
      const { state, filterName, automatic } = await inspectFilter(
        call,
        program,
      );
      if (state !== 'ready') return { state, scene };
      if (action === 'status' && target?.id !== program.id) {
        return { state: target ? 'scene-changed' : 'unbound', scene };
      }
      if (action === 'bind') {
        binding = { connection, id: program.id, filterName };
      } else if (filterName !== target.filterName) {
        return { state: 'filter-changed', scene };
      }
      const ready = { state: 'ready', scene, automatic };
      if (action === 'bind' || action === 'status') return ready;

      const effect = EFFECTS[action];
      if (now() < manualUntil) return { state: 'busy' };
      const latest = await call('GetSourceFilter', {
        ...program.source,
        filterName,
      });
      if (latest.filterKind !== FILTER_KIND)
        return { state: 'filter-changed', scene };
      if (!latest.filterEnabled) return { state: 'disabled-filter', scene };
      const { mode = 0, intensity = 75 } = latest.filterSettings ?? {};
      if (mode !== 0 || !(intensity > 0))
        return { state: 'inactive-filter', scene };
      if ((await readProgram(call))?.id !== program.id)
        return { state: 'scene-changed' };
      const filterSettings = effect
        ? { camera_effect: effect, camera_cue: randomUUID() }
        : { automatic: action === 'auto-on' };
      await call('SetSourceFilterSettings', {
        ...program.source,
        filterName,
        filterSettings,
        overlay: true,
      });
      if (effect) manualUntil = now() + 750;
      const observed = await call('GetSourceFilter', {
        ...program.source,
        filterName,
      });
      const matches =
        observed.filterKind === FILTER_KIND &&
        observed.filterEnabled &&
        Object.entries(filterSettings).every(
          ([key, value]) => observed.filterSettings?.[key] === value,
        );
      if (!matches) return { state: 'unconfirmed', scene };
      return {
        ...ready,
        automatic: filterSettings.automatic ?? automatic,
        confirmed: true,
      };
    } finally {
      if (isCommand) commandPending = false;
    }
  }

  return { run };
}

module.exports = { createObsFisheyeCamera, isCameraAction };
