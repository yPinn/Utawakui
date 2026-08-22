export function isOutputPortConflict(value) {
  const message = value instanceof Error ? value.message : String(value ?? '');
  return /port is already in use|EADDRINUSE/i.test(message);
}
