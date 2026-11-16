import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherController, WEATHER_STORAGE, WEATHER_REFRESH_MS, normalizeForecast, normalizeSearch, forecastURL, searchURL, formatTemperature, reportIsStale} from '../public/weather.mjs';

const START = Date.parse('2026-11-15T12:10:00Z');
const CITY = {name: 'Test City', admin1: 'Test State', country: 'Example', latitude: 40, longitude: -80};
const SECOND_CITY = {...CITY, name: 'Other City', longitude: -70};
function data() { return {utc_offset_seconds: 0, timezone: 'UTC', current: {time: '2026-11-15T12:00', temperature_2m: 10, apparent_temperature: 8, wind_speed_10m: 12, weather_code: 3, is_day: 1}, current_units: {temperature_2m: '°C', apparent_temperature: '°C', wind_speed_10m: 'km/h'}, daily: {time: ['2026-11-15', '2026-11-16', '2026-11-17'], temperature_2m_max: [12, 13, 14], temperature_2m_min: [3, 4, 5], weather_code: [3, 2, 61], precipitation_probability_max: [10, 20, 80]}, daily_units: {temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%'}}; }
const response = value => new Response(JSON.stringify(value), {status: 200, headers: {'content-type': 'application/json'}});
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve}; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup({stored, fetchImpl = async () => response(data()), storageFail = false, timeoutMs} = {}) {
  const values = new Map(stored ? [[WEATHER_STORAGE, JSON.stringify(stored)]] : []), timers = new Map(), calls = [];
  let time = START, timerId = 0;
  const storage = {getItem(key) {if (storageFail) throw Error('blocked'); return values.get(key);}, setItem(key, value) {if (storageFail) throw Error('blocked'); values.set(key, value);}, removeItem(key) {if (storageFail) throw Error('blocked'); values.delete(key);}};
  const controller = createWeatherController({fetchImpl: async (...args) => {calls.push(args); return fetchImpl(...args);}, storage, now: () => time, timeoutMs, setTimer: (callback, ms) => {timers.set(++timerId, {callback, ms}); return timerId;}, clearTimer: id => timers.delete(id)});
  return {controller, storage, values, calls, timers, at: value => {time = value;}};
}

test('weather stays off until a location is selected; URLs are fixed and parameters encoded', async () => {
  const env = setup(); env.controller.setVisible(true); await flush();
  assert.equal(env.calls.length, 0); assert.equal(env.timers.size, 0); assert.equal(env.controller.state().status, 'empty');
  const search = new URL(searchURL('A&B / ? city'));
  assert.equal(search.origin, 'https://geocoding-api.open-meteo.com'); assert.equal(search.searchParams.get('name'), 'A&B / ? city');
  const forecast = new URL(forecastURL(CITY)); assert.equal(forecast.origin, 'https://api.open-meteo.com'); assert.equal(forecast.searchParams.get('forecast_days'), '3');
  assert.throws(() => forecastURL({...CITY, latitude: Infinity}));
  env.controller.destroy();
});

test('search validates results, ignores invalid coordinates, and never selects a city automatically', async () => {
  const env = setup({fetchImpl: async () => response({results: [CITY, CITY, {...CITY, latitude: 101}, SECOND_CITY]})});
  env.controller.setVisible(true); await env.controller.search('Test');
  assert.deepEqual(env.controller.state().results, [CITY, SECOND_CITY]);
  assert.equal(env.controller.state().location, null); assert.equal(env.values.size, 0);
  assert.deepEqual(normalizeSearch({generationtime_ms: 1}), []); assert.throws(() => normalizeSearch({results: 'wrong'}));
  env.controller.destroy();
});

test('late search results cannot overwrite a newer query', async () => {
  const first = deferred(), second = deferred(); let count = 0;
  const env = setup({fetchImpl: () => ++count === 1 ? first.promise : second.promise});
  const a = env.controller.search('First'), b = env.controller.search('Second');
  second.resolve(response({results: [SECOND_CITY]})); await b;
  first.resolve(response({results: [CITY]})); await a; await flush();
  assert.deepEqual(env.controller.state().results, [SECOND_CITY]); env.controller.destroy();
});

test('changing cities clears the old report and ignores late responses for the previous city', async () => {
  const first = deferred(), second = deferred(); let count = 0;
  const env = setup({fetchImpl: () => ++count === 1 ? first.promise : second.promise}); env.controller.setVisible(true);
  const a = env.controller.selectLocation(CITY), b = env.controller.selectLocation(SECOND_CITY);
  const other = data(); other.current.temperature_2m = 20;
  second.resolve(response(other)); await b; first.resolve(response(data())); await a; await flush();
  assert.equal(env.controller.state().location.name, 'Other City'); assert.equal(env.controller.state().report.temperature, 20);
  assert.equal(JSON.parse(env.values.get(WEATHER_STORAGE)).location.name, 'Other City'); env.controller.destroy();
});

test('requests omit credentials and referrer, store only the selected city, and unit changes need no network', async () => {
  const env = setup(); env.controller.setVisible(true); await env.controller.selectLocation(CITY);
  assert.equal(env.calls[0][1].credentials, 'omit'); assert.equal(env.calls[0][1].referrerPolicy, 'no-referrer'); assert.equal(env.calls[0][1].redirect, 'error');
  env.controller.setUnit('f'); assert.equal(env.calls.length, 1); assert.equal(formatTemperature(env.controller.state().report.temperature, 'f'), '50°F');
  const saved = JSON.parse(env.values.get(WEATHER_STORAGE)); assert.deepEqual(Object.keys(saved), ['version', 'location', 'report', 'unit']); assert.equal(saved.unit, 'f');
  assert.throws(() => env.controller.setUnit('kelvin')); env.controller.destroy();
});

test('network failure keeps and accurately ages the last successful report', async () => {
  let fail = false; const env = setup({fetchImpl: async () => {if (fail) throw Error('Offline'); return response(data());}});
  env.controller.setVisible(true); await env.controller.selectLocation(CITY); const old = env.controller.state().report;
  fail = true; env.at(START + WEATHER_REFRESH_MS); await env.controller.refresh({force: true});
  assert.equal(env.controller.state().status, 'error'); assert.equal(env.controller.state().error, 'Offline'); assert.equal(env.controller.state().stale, true); assert.deepEqual(env.controller.state().report, old);
  env.controller.destroy();
});

test('malformed forecast cannot overwrite cached success or pretend missing numbers are zero', async () => {
  let bad = false; const env = setup({fetchImpl: async () => {const value = data(); if (bad) value.current.temperature_2m = null; return response(value);}});
  env.controller.setVisible(true); await env.controller.selectLocation(CITY); bad = true; await env.controller.refresh({force: true});
  assert.equal(env.controller.state().status, 'error'); assert.equal(env.controller.state().report.temperature, 10);
  for (const mutate of [value => {value.daily.time[1] = '2026-99-99';}, value => {value.current.time = '2026-02-31T12:00';}, value => {value.current_units.temperature_2m = '°F';}, value => {value.daily.precipitation_probability_max[1] = null;}, value => {value.daily.time[1] = value.daily.time[0];}]) {
    const value = data(); mutate(value); assert.throws(() => normalizeForecast(value, START));
  }
  env.controller.destroy();
});

test('fresh cache restores without a request until due and old model time is marked stale', async () => {
  const report = normalizeForecast(data(), START), env = setup({stored: {version: 1, location: CITY, unit: 'f', report}});
  assert.equal(env.controller.state().status, 'cached'); assert.equal(env.calls.length, 0);
  env.controller.setVisible(true); await flush(); assert.equal(env.calls.length, 0); assert.equal(env.timers.size, 1); assert.equal(env.controller.state().unit, 'f');
  assert.equal(reportIsStale({...report, modelAt: START - 2 * 3600000}, START), true);
  env.at(START + WEATHER_REFRESH_MS); const timer = [...env.timers.values()][0]; timer.callback(); await flush();
  assert.equal(env.calls.length, 1); env.controller.destroy();
});

test('closing the panel aborts work, cancels timers, and discards a late response', async () => {
  const late = deferred(), env = setup({fetchImpl: () => late.promise}); env.controller.setVisible(true);
  const pending = env.controller.selectLocation(CITY); env.controller.setVisible(false); late.resolve(response(data())); await pending; await flush();
  assert.equal(env.calls[0][1].signal.aborted, true); assert.equal(env.controller.state().report, null); assert.equal(env.timers.size, 0);
  env.controller.destroy();
});

test('clear cancels pending work and erases cached coordinates without late resurrection', async () => {
  const late = deferred(), env = setup({fetchImpl: () => late.promise}); env.controller.setVisible(true);
  const pending = env.controller.selectLocation(CITY); assert.equal(env.values.size, 1); env.controller.clear(); late.resolve(response(data())); await pending; await flush();
  assert.equal(env.controller.state().location, null); assert.equal(env.controller.state().report, null); assert.equal(env.values.size, 0); assert.equal(env.timers.size, 0);
  env.controller.destroy();
});

test('request timeout ends loading even if a fetch implementation ignores cancellation', async () => {
  const env = setup({fetchImpl: () => new Promise(() => {}), timeoutMs: 10}); env.controller.setVisible(true);
  await env.controller.selectLocation(CITY); assert.equal(env.controller.state().status, 'error'); assert.match(env.controller.state().error, /timed out/); assert.equal(env.calls[0][1].signal.aborted, true);
  env.controller.destroy();
});

test('invalid storage does not send requests or poison the application; blocked saves remain usable', async () => {
  const env = setup({stored: {version: 1, location: {...CITY, latitude: '40'}}}); env.controller.setVisible(true); await flush(); assert.equal(env.calls.length, 0); env.controller.destroy();
  const blocked = setup({storageFail: true}); blocked.controller.setVisible(true); await blocked.controller.selectLocation(CITY);
  assert.equal(blocked.controller.state().report.temperature, 10); assert.equal(blocked.controller.state().persisted, false);
  blocked.controller.clear(); assert.equal(blocked.controller.state().location, null); assert.match(blocked.controller.state().error, /could not erase/); blocked.controller.destroy();
});

test('reports older than a week are discarded while the chosen city is retained', () => {
  const env = setup({stored: {version: 1, location: CITY, unit: 'c', report: {...normalizeForecast(data(), START), fetchedAt: START - 8 * 86400000}}});
  assert.deepEqual(env.controller.state().location, CITY); assert.equal(env.controller.state().report, null); assert.equal(env.calls.length, 0); env.controller.destroy();
});

test('oversized and rate-limited responses stop cleanly without caching their body', async () => {
  for (const responseValue of [new Response('x'.repeat(129 * 1024)), new Response('{}', {status: 429})]) {
    const env = setup({fetchImpl: async () => responseValue}); env.controller.setVisible(true); await env.controller.selectLocation(CITY);
    assert.equal(env.controller.state().status, 'error'); assert.equal(env.controller.state().report, null);
    assert.match(env.controller.state().error, /too large|busy/); env.controller.destroy();
  }
});
