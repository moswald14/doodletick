import { copyOfflineData, verifyOfflineData } from '../doodletick/migration.mjs';

try {
  const [command, ...args] = process.argv.slice(2), options = {};
  if (!['copy', 'verify'].includes(command)) throw Error('Invalid command.');
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--offline' && options.offline === undefined) options.offline = true;
    else if (['--source', '--destination'].includes(key) && options[key.slice(2)] === undefined && args[i + 1]) options[key.slice(2)] = args[++i];
    else throw Error('Unexpected or repeated option.');
  }
  if (!options.source || !options.destination) throw Error('Both data directories are required.');
  console.log(JSON.stringify(await (command === 'copy' ? copyOfflineData(options) : verifyOfflineData(options))));
} catch {
  console.error('Offline transfer did not complete. Keep both apps stopped and preserve the original data and backup.');
  console.error('Use: node scripts/migrate-offline.mjs copy|verify --offline --source ABSOLUTE_SOURCE_DATA --destination ABSOLUTE_EMPTY_TARGET');
  process.exitCode = 1;
}
