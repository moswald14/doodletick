// Copyright © 2026 moswald14 and contributors. GPL-3.0-only.
// Weather data: Open-Meteo, CC BY 4.0. Free endpoint is for non-commercial use.
export const WEATHER_STORAGE = 'doodletick-weather-v1';
export const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const MAX_JSON = 128 * 1024;
const cleanText = (value, max = 100) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const dateString = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function normalizeLocation(value) {
  if (!value || !finite(value.latitude, -90, 90) || !finite(value.longitude, -180, 180)) throw Error('The location returned invalid coordinates.');
  const name = cleanText(value.name, 80);
  if (!name) throw Error('The location needs a name.');
  return {name, admin1: cleanText(value.admin1, 80), country: cleanText(value.country, 80), latitude: value.latitude, longitude: value.longitude};
}
export function locationLabel(location) {
  return [...new Set([location.name, location.admin1, location.country].filter(Boolean))].join(', ');
}
export function locationKey(location) { return `${location.latitude},${location.longitude}`; }
export function searchURL(query) {
  const name = cleanText(query, 100);
  if (name.length < 2) throw Error('Enter at least two letters of a city name.');
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({name, count: '6', language: 'en', format: 'json'}).toString();
  return url.href;
}
export function forecastURL(location) {
  const checked = normalizeLocation(location), url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({latitude: String(checked.latitude), longitude: String(checked.longitude), current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', forecast_days: '3', temperature_unit: 'celsius', wind_speed_unit: 'kmh'}).toString();
  return url.href;
}
export function normalizeSearch(data) {
  if (!data || typeof data !== 'object' || data.error) throw Error('Weather search returned an invalid response.');
  if (data.results === undefined) return [];
  if (!Array.isArray(data.results) || data.results.length > 100) throw Error('Weather search returned an invalid response.');
  const results = [];
  for (const raw of data.results.slice(0, 6)) {
    try { const value = normalizeLocation(raw); if (!results.some(item => locationKey(item) === locationKey(value))) results.push(value); } catch {}
  }
  return results;
}
export function normalizeForecast(data, fetchedAt) {
  const current = data?.current, daily = data?.daily;
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0 || !current || !daily || data.error ||
      data.current_units?.temperature_2m !== '°C' || data.current_units?.apparent_temperature !== '°C' || data.current_units?.wind_speed_10m !== 'km/h' ||
      data.daily_units?.temperature_2m_max !== '°C' || data.daily_units?.temperature_2m_min !== '°C' || data.daily_units?.precipitation_probability_max !== '%' ||
      !finite(data.utc_offset_seconds, -86400, 86400) || !finite(current.temperature_2m, -100, 70) || !finite(current.apparent_temperature, -150, 100) ||
      !finite(current.wind_speed_10m, 0, 500) || !Number.isInteger(current.weather_code) || ![0, 1].includes(current.is_day) ||
      typeof current.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(current.time)) throw Error('Weather data was incomplete; the previous report is unchanged.');
  const localAt = Date.parse(current.time + 'Z'), modelAt = localAt - data.utc_offset_seconds * 1000;
  if (!Number.isFinite(modelAt) || new Date(localAt).toISOString().slice(0, 16) !== current.time.slice(0, 16)) throw Error('Weather data had an invalid observation time.');
  const keys = ['time', 'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'];
  if (!keys.every(key => Array.isArray(daily[key]) && daily[key].length === 3)) throw Error('The three-day forecast was incomplete.');
  const days = daily.time.map((date, i) => {
    const high = daily.temperature_2m_max[i], low = daily.temperature_2m_min[i], rain = daily.precipitation_probability_max[i], code = daily.weather_code[i];
    if (!dateString(date) || !finite(high, -100, 70) || !finite(low, -100, 70) || low > high || !finite(rain, 0, 100) || !Number.isInteger(code)) throw Error('The three-day forecast was invalid.');
    if (i && Date.parse(date) - Date.parse(daily.time[i - 1]) !== 86400000) throw Error('The forecast dates were invalid.');
    return {date, high, low, rain, code};
  });
  return {fetchedAt, modelAt, localTime: current.time, timezone: cleanText(data.timezone, 80) || 'local forecast time', temperature: current.temperature_2m, feelsLike: current.apparent_temperature, wind: current.wind_speed_10m, code: current.weather_code, isDay: current.is_day === 1, days};
}
function normalizedSavedReport(value, now) {
  if (!value || !Number.isSafeInteger(value.fetchedAt) || value.fetchedAt > now + 300000 || now - value.fetchedAt > 7 * 86400000) return null;
  try {
    const offset = (Date.parse(value.localTime + 'Z') - value.modelAt) / 1000;
    return normalizeForecast({utc_offset_seconds: offset, timezone: value.timezone, current: {time: value.localTime, temperature_2m: value.temperature, apparent_temperature: value.feelsLike, weather_code: value.code, wind_speed_10m: value.wind, is_day: value.isDay ? 1 : 0}, current_units: {temperature_2m: '°C', apparent_temperature: '°C', wind_speed_10m: 'km/h'}, daily: {time: value.days.map(d => d.date), weather_code: value.days.map(d => d.code), temperature_2m_max: value.days.map(d => d.high), temperature_2m_min: value.days.map(d => d.low), precipitation_probability_max: value.days.map(d => d.rain)}, daily_units: {temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%'}}, value.fetchedAt);
  } catch { return null; }
}
export function reportIsStale(report, now = Date.now()) {
  return !report || now - report.fetchedAt >= WEATHER_REFRESH_MS || now - report.modelAt > 90 * 60 * 1000 || report.modelAt > now + 30 * 60 * 1000;
}
export function formatTemperature(celsius, unit = 'c') { return `${Math.round(unit === 'f' ? celsius * 9 / 5 + 32 : celsius)}°${unit === 'f' ? 'F' : 'C'}`; }
export function weatherDescription(code, isDay = true) {
  if (code === 0) return {label: 'Clear', symbol: isDay ? '☀' : '☾'};
  if ([1, 2].includes(code)) return {label: code === 1 ? 'Mostly clear' : 'Partly cloudy', symbol: '◒'};
  if (code === 3) return {label: 'Overcast', symbol: '☁'};
  if ([45, 48].includes(code)) return {label: 'Fog', symbol: '≋'};
  if ([51, 53, 55, 56, 57].includes(code)) return {label: 'Drizzle', symbol: '☂'};
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return {label: 'Rain', symbol: '☂'};
  if ([71, 73, 75, 77, 85, 86].includes(code)) return {label: 'Snow', symbol: '❄'};
  if ([95, 96, 99].includes(code)) return {label: 'Thunderstorms', symbol: 'ϟ'};
  return {label: 'Conditions unavailable', symbol: '·'};
}

async function fetchJSON(url, {fetchImpl, signal, timeoutMs}) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  signal.addEventListener('abort', onAbort, {once: true});
  let timeout;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error'});
        if (!response.ok) throw Error(response.status === 429 ? 'Weather provider is busy. Try again later.' : 'Weather is unavailable right now. Try again later.');
        if (Number(response.headers?.get('content-length')) > MAX_JSON) throw Error('Weather response was too large.');
        let raw;
        if (response.body?.getReader) {
          const reader = response.body.getReader(), decoder = new TextDecoder();
          let size = 0; raw = '';
          try {
            while (true) {
              const chunk = await reader.read(); if (chunk.done) break;
              size += chunk.value.byteLength;
              if (size > MAX_JSON) { await reader.cancel(); throw Error('Weather response was too large.'); }
              raw += decoder.decode(chunk.value, {stream: true});
            }
            raw += decoder.decode();
          } finally { reader.releaseLock(); }
        } else raw = await response.text();
        if (raw.length > MAX_JSON) throw Error('Weather response was too large.');
        try { return JSON.parse(raw); } catch { throw Error('Weather returned an unreadable response.'); }
      })(),
      new Promise((_, reject) => { timeout = setTimeout(() => { reject(Error('Weather request timed out. Try again.')); controller.abort(); }, timeoutMs); }),
      new Promise((_, reject) => { controller.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), {once: true}); })
    ]);
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', onAbort); }
}

export function createWeatherController({fetchImpl = (...args) => fetch(...args), storage, now = () => Date.now(), onChange = () => {}, timeoutMs = 12000, setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  let saved, persisted = true;
  try { const text = storage?.getItem(WEATHER_STORAGE); if (text && text.length <= MAX_JSON) saved = JSON.parse(text); } catch { persisted = false; }
  let location = null, report = null, unit = saved?.unit === 'f' ? 'f' : 'c';
  try { if (saved?.version === 1 && saved.location) { location = normalizeLocation(saved.location); report = normalizedSavedReport(saved.report, now()); } } catch {}
  let status = location ? (report ? 'cached' : 'idle') : 'empty', error = '', searchStatus = 'idle', searchError = '', results = [];
  let visible = false, destroyed = false, forecastEpoch = 0, searchEpoch = 0, forecastAbort, searchAbort, timer, nextAttempt = 0;
  function state() { return structuredClone({location, report, unit, status, error, searchStatus, searchError, results, persisted, stale: reportIsStale(report, now())}); }
  function emit() { if (!destroyed) onChange(state()); }
  function save() {
    try { if (!storage) throw Error('Unavailable'); storage.setItem(WEATHER_STORAGE, JSON.stringify({version: 1, location, report, unit})); persisted = true; } catch { persisted = false; }
  }
  function schedule() {
    clearTimer(timer); timer = undefined;
    if (visible && location && !destroyed) timer = setTimer(() => { timer = undefined; refresh(); }, Math.max(1000, nextAttempt - now()));
  }
  async function search(query) {
    if (destroyed) return;
    const epoch = ++searchEpoch; searchAbort?.abort(); searchAbort = new AbortController(); results = []; searchError = ''; searchStatus = 'loading'; emit();
    try {
      const found = normalizeSearch(await fetchJSON(searchURL(query), {fetchImpl, signal: searchAbort.signal, timeoutMs}));
      if (destroyed || epoch !== searchEpoch) return;
      results = found; searchStatus = found.length ? 'results' : 'empty';
    } catch (e) { if (destroyed || epoch !== searchEpoch) return; searchStatus = 'error'; searchError = e.name === 'AbortError' ? 'Search cancelled.' : (e.message || 'Search could not connect.'); }
    emit();
  }
  async function refresh({force = false} = {}) {
    if (destroyed || !visible || !location || status === 'loading' || (!force && now() < nextAttempt)) { schedule(); return; }
    const epoch = ++forecastEpoch, selected = location; forecastAbort?.abort(); forecastAbort = new AbortController(); status = 'loading'; error = ''; nextAttempt = now() + WEATHER_REFRESH_MS; emit();
    try {
      const value = normalizeForecast(await fetchJSON(forecastURL(selected), {fetchImpl, signal: forecastAbort.signal, timeoutMs}), now());
      if (destroyed || epoch !== forecastEpoch) return;
      report = value; status = 'ready'; save();
    } catch (e) {
      if (destroyed || epoch !== forecastEpoch) return;
      status = 'error'; error = e.name === 'AbortError' ? 'Weather request cancelled. Try again.' : (e.message || 'Weather could not connect.');
    }
    emit(); schedule();
  }
  function selectLocation(value) {
    if (destroyed) return;
    location = normalizeLocation(value); forecastEpoch++; forecastAbort?.abort(); searchEpoch++; searchAbort?.abort(); results = []; searchStatus = 'idle'; searchError = ''; report = null; status = 'idle'; error = ''; nextAttempt = 0; save(); emit(); return refresh();
  }
  function setUnit(value) { if (!['c', 'f'].includes(value)) throw Error('Choose Celsius or Fahrenheit.'); if (destroyed) return; unit = value; if (location) save(); emit(); }
  function clear() {
    forecastEpoch++; searchEpoch++; forecastAbort?.abort(); searchAbort?.abort(); clearTimer(timer); timer = undefined; location = null; report = null; results = []; status = 'empty'; error = ''; searchStatus = 'idle'; searchError = ''; nextAttempt = 0;
    try { storage?.removeItem(WEATHER_STORAGE); persisted = !!storage; } catch { persisted = false; error = 'This browser could not erase the saved location. Clear this site’s stored data to remove it permanently.'; }
    emit();
  }
  function setVisible(value) {
    if (destroyed) return;
    visible = Boolean(value);
    if (!visible) { forecastEpoch++; searchEpoch++; forecastAbort?.abort(); searchAbort?.abort(); clearTimer(timer); timer = undefined; if (status === 'loading') { status = report ? 'cached' : 'idle'; nextAttempt = 0; } if (searchStatus === 'loading') searchStatus = 'idle'; }
    else { if (report && status === 'cached') nextAttempt = Math.max(0, report.fetchedAt + WEATHER_REFRESH_MS); refresh(); }
    emit();
  }
  function destroy() { setVisible(false); destroyed = true; }
  return {state, search, selectLocation, refresh, setUnit, clear, setVisible, destroy};
}
