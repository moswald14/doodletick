import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.length !== 2) {
  console.error('Usage: node scripts/test.mjs'); process.exitCode = 1;
} else {
  const files = [];
  for (const directory of ['keeper/tests', 'doodletick/tests']) {
    const names = (await readdir(path.join(root, directory), { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs')).map(entry => entry.name).sort();
    if (!names.length) throw new Error(`No tests found in ${directory}.`);
    files.push(...names.map(name => path.join(directory, name)));
  }
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) { console.error(result.error.message); process.exitCode = 1; }
  else process.exitCode = result.status ?? 1;
}
