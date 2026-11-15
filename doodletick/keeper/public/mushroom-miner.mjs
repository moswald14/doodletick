import { searchMiningWork } from './mushroom-mining.mjs';

let run = 0;
self.onmessage = async ({ data }) => {
  const ticket = ++run;
  if (data?.type !== 'start') return;
  try {
    const result = await searchMiningWork(data.challenge, { remainingMs: data.remainingMs,
      shouldStop: () => run !== ticket,
      onProgress: progress => { if (run === ticket) self.postMessage({ type: 'progress', ...progress }); } });
    if (run === ticket && !result.stopped) self.postMessage({ type: 'solved', ...result });
  } catch (error) { if (run === ticket) self.postMessage({ type: 'error', message: error.message }); }
};
