// This classic script runs in the document head, before styles and content,
// so a night visit does not first render the daylight interface.
(() => {
  'use strict';
  const storageKey = 'doodletick-theme-v1';
  const defaults = Object.freeze({ mode: 'auto', start: '21:00', end: '07:00' });
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  function validate(value) {
    if (!value || !['auto', 'day', 'night'].includes(value.mode) || !validTime(value.start) || !validTime(value.end)) throw new Error('Choose a theme and valid start and end times.');
    if (value.start === value.end) throw new Error('Choose different start and end times. Use Red night to keep night mode on.');
    return { mode: value.mode, start: value.start, end: value.end };
  }
  function readPreferences() {
    try { const saved = localStorage.getItem(storageKey); return saved ? validate(JSON.parse(saved)) : { ...defaults }; }
    catch { return { ...defaults }; }
  }
  let preferences = readPreferences(), resolved = '', timer, timeSource = () => Date.now();
  function apply() {
    const now = new Date(timeSource()), at = now.getHours() * 60 + now.getMinutes();
    const start = minutes(preferences.start), end = minutes(preferences.end);
    const scheduled = start > end ? at >= start || at < end : at >= start && at < end;
    const theme = preferences.mode === 'auto' ? (scheduled ? 'night' : 'day') : preferences.mode;
    const changed = resolved !== theme || document.documentElement.dataset.themeMode !== preferences.mode;
    resolved = theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeMode = preferences.mode;
    document.documentElement.style.colorScheme = theme === 'night' ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#120c0d' : '#20251e');
    if (changed) window.dispatchEvent(new CustomEvent('keeper-themechange'));
    return theme;
  }
  function poll() {
    clearTimeout(timer);
    apply();
    // Also catches device-clock/time-zone changes. Align to minute boundaries.
    timer = setTimeout(poll, Math.min(30000, 60000 - Date.now() % 60000));
  }
  window.KeeperTheme = Object.freeze({
    getState: () => ({ ...preferences, theme: resolved }),
    setPreferences(value) {
      preferences = validate(value);
      let persisted = true;
      try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { persisted = false; }
      poll();
      window.dispatchEvent(new CustomEvent('keeper-themechange'));
      return { ...preferences, theme: resolved, persisted };
    },
    reset: () => window.KeeperTheme.setPreferences(defaults),
    // The app supplies its projected Keeper clock after loading. Time zones and
    // the user's day/night hours stay local; this never changes an OS clock.
    setTimeSource(source) { if (typeof source !== 'function') throw new Error('Choose a clock function.'); timeSource = source; poll(); },
    refresh: poll,
  });
  window.addEventListener('storage', event => { if (event.key === storageKey || event.key === null) { preferences = readPreferences(); poll(); window.dispatchEvent(new CustomEvent('keeper-themechange')); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  window.addEventListener('focus', poll);
  window.addEventListener('pageshow', poll);
  window.addEventListener('pagehide', () => clearTimeout(timer));
  poll();
})();
