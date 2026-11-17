// SPDX-License-Identifier: GPL-3.0-only
import { spawn } from 'node:child_process';
import { createKeeperServer } from './server.mjs';

try {
  const keeper = await createKeeperServer();
  const url = `http://127.0.0.1:${keeper.port}/#phrases`;
  const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const browser = spawn(command, [url], { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log('Open Phrase lab in your browser: ' + url));
  browser.unref();
  console.log('Phrase lab is ready: ' + url + '\nKeep this window open while using Keeper. Close it when you are finished.');
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await keeper.close(); process.exit(0); });
} catch (error) {
  console.error('Keeper could not start. If another Keeper is running, close it normally and try again.\n' + error.message);
  process.exitCode = 1;
}
