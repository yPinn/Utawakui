'use strict';
// A summary can exceed a Windows pipe buffer. Await the queued terminal send
// before disconnecting, rather than treating process exit as an IPC receipt.
function sendTerminal(channel, message) {
  return new Promise((resolve) => {
    if (!channel.connected) return resolve();
    channel.send(message, () => resolve());
  });
}
module.exports = { sendTerminal };
