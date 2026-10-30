import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { createVerifiedB2Input } = createRequire(import.meta.url)(
  './obsInput.cjs',
);
const device = {
  id: '{0.0.1.00000000}.{11223344-5566-7788-99aa-bbccddeeff00}',
  label: 'Vm Out B2 (VB-Audio Voicemeeter VAIO)',
};
function fixture({ unavailable = false, actualId = device.id } = {}) {
  const calls = [];
  const obs = {
    async call(name, args) {
      calls.push({ name, args });
      if (name === 'GetInputPropertiesListPropertyItems')
        return {
          propertyItems: unavailable
            ? []
            : [
                {
                  itemEnabled: true,
                  itemValue: device.id,
                  itemName: device.label,
                },
              ],
        };
      if (name === 'GetInputSettings')
        return {
          inputKind: 'wasapi_input_capture',
          inputSettings: { device_id: actualId, use_device_timing: true },
        };
      return {};
    },
  };
  return {
    calls,
    intent: { obs, sceneName: 'owned scene', inputName: 'owned input', device },
  };
}
describe('isolated B2 input initialization', () => {
  it('supplies the verified endpoint on the first creation, without a default interval', async () => {
    const { calls, intent } = fixture();
    await createVerifiedB2Input(intent);
    assert.deepEqual(calls[0].args.inputSettings, {
      device_id: device.id,
      use_device_timing: true,
    });
    assert.equal(
      calls.some((c) => c.name === 'SetInputSettings'),
      false,
    );
  });
  for (const id of ['default', '', '{0.0.1.00000000}.{not-an-endpoint}'])
    it(`rejects invalid target ${JSON.stringify(id)} before creating a source`, async () => {
      const { calls, intent } = fixture();
      await assert.rejects(
        createVerifiedB2Input({ ...intent, device: { ...device, id } }),
      );
      assert.deepEqual(calls, []);
    });
  it('does not fall back when the saved endpoint is unavailable', async () => {
    const { calls, intent } = fixture({ unavailable: true });
    await assert.rejects(createVerifiedB2Input(intent), /still be available/);
    assert.equal(calls.filter((c) => c.name === 'CreateInput').length, 1);
    assert.equal(
      calls.some((c) => c.name === 'SetInputSettings'),
      false,
    );
  });
  it('rejects a driver/default substitution before recording', async () => {
    const { intent } = fixture({ actualId: 'default' });
    await assert.rejects(createVerifiedB2Input(intent));
  });
});
