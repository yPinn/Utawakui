import { computed, readonly, shallowRef } from 'vue';
const sessions = new WeakMap();

// Read failures and unsuccessful edits have independent lifetimes. A background
// read cannot erase a failed edit or overtake a newer write.
export function useSettingsPreference({
  scope,
  key,
  initialValue,
  read,
  write,
  validate,
  readMessage,
  saveMessage,
}) {
  const shared = scope && key;
  if (shared && sessions.get(scope)?.has(key))
    return sessions.get(scope).get(key);
  const value = shallowRef(initialValue);
  const loaded = shallowRef(false);
  const reading = shallowRef(false);
  const busy = shallowRef(false);
  const readError = shallowRef('');
  const saveError = shallowRef('');
  let revision = 0;
  async function refresh() {
    if (busy.value) return value.value;
    const current = ++revision;
    reading.value = true;
    try {
      const saved = await read();
      if (!validate(saved)) throw new TypeError('invalid preference');
      if (current === revision) {
        value.value = saved;
        loaded.value = true;
        readError.value = '';
      }
    } catch {
      if (current === revision) readError.value = readMessage;
    } finally {
      if (current === revision) reading.value = false;
    }
    return value.value;
  }
  async function save(next) {
    if (busy.value || !validate(next)) return false;
    ++revision;
    reading.value = false;
    const previous = value.value;
    value.value = next;
    busy.value = true;
    try {
      const saved = await write(next);
      if (!validate(saved) || saved !== next)
        throw new TypeError('unconfirmed preference');
      value.value = saved;
      loaded.value = true;
      readError.value = '';
      saveError.value = '';
      return true;
    } catch {
      value.value = previous;
      saveError.value = saveMessage;
      return false;
    } finally {
      busy.value = false;
    }
  }
  const preference = {
    value,
    loaded: readonly(loaded),
    reading: readonly(reading),
    busy: readonly(busy),
    readError: readonly(readError),
    saveError: readonly(saveError),
    error: computed(() => saveError.value || readError.value),
    refresh,
    save,
  };
  if (shared) {
    if (!sessions.has(scope)) sessions.set(scope, new Map());
    sessions.get(scope).set(key, preference);
  }
  return preference;
}
