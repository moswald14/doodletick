// SPDX-License-Identifier: GPL-3.0-only
import { createSleepMix } from './sleep-mix.mjs';

self.onmessage = ({ data }) => {
  try {
    const mix = createSleepMix(data?.mushrooms, data?.preferences,
      (completed, total) => self.postMessage({ type: 'progress', completed, total }));
    self.postMessage({ type: 'ready', ...mix }, mix.channels.map(channel => channel.buffer));
  } catch {
    // No recipe names, captured source data or arbitrary exception strings leave
    // the renderer. The parent presents a fixed, recoverable error.
    self.postMessage({ type: 'error' });
  }
};
