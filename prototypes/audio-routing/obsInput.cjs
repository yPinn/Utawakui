/* global module, require */

const assert = require('node:assert/strict');

// Research-only: a private, main-owned inventory supplies the exact B2 endpoint.
// Never create with empty settings: OBS would briefly open the default input.
async function createVerifiedB2Input({ obs, sceneName, inputName, device }) {
  assert.equal(device?.label, 'Vm Out B2 (VB-Audio Voicemeeter VAIO)');
  assert.match(
    device.id,
    /^\{0\.0\.1\.00000000\}\.\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i,
  );
  await obs.call('CreateInput', {
    sceneName,
    inputName,
    inputKind: 'wasapi_input_capture',
    inputSettings: { device_id: device.id, use_device_timing: true },
    sceneItemEnabled: true,
  });
  const inventory = await obs.call('GetInputPropertiesListPropertyItems', {
    inputName,
    propertyName: 'device_id',
  });
  assert.equal(
    inventory.propertyItems.filter(
      (item) =>
        item.itemEnabled &&
        item.itemValue === device.id &&
        item.itemName === device.label,
    ).length,
    1,
    'verified B2 endpoint must still be available',
  );
  const current = await obs.call('GetInputSettings', { inputName });
  assert.equal(current.inputKind, 'wasapi_input_capture');
  assert.equal(current.inputSettings.device_id, device.id);
  assert.equal(current.inputSettings.use_device_timing, true);
  return { inventory, current };
}

module.exports = { createVerifiedB2Input };
