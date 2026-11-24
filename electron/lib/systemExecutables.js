'use strict';

const path = require('node:path');

// Windows tools resolve from System32 only, never by bare name: a bare name
// searches the working directory and PATH first, where a planted copy runs.
function system32Executable(...segments) {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  return path.win32.join(systemRoot, 'System32', ...segments);
}

function windowsPowerShellPath() {
  return system32Executable('WindowsPowerShell', 'v1.0', 'powershell.exe');
}

module.exports = { system32Executable, windowsPowerShellPath };
