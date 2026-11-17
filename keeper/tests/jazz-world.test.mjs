import test from 'node:test';
import assert from 'node:assert/strict';
import { tickAt } from '../public/core.mjs';
import { createJazzWorld, parseJazzNews, JAZZ_NEWS_SOURCES, JAZZ_WORLD_CITIES, JAZZ_NEWS_REFRESH_MS, JAZZ_WEATHER_REFRESH_MS, JAZZ_NEWS_MAX_AGE_MS, JAZZ_WORLD_WEATHER_URL } from '../jazz-world.mjs';

const START = Date.parse('2026-11-17T12:10:00Z');
const item = ({ title = 'Scientists celebrate successful renewable energy milestone', url = 'https://www.nasa.gov/news-release/test-milestone/', at = START - 3600000 } = {}) => `<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${new Date(at).toUTCString()}</pubDate></item>`;
const rss = (...items) => `<?xml version="1.0"?><rss version="2.0"><channel>${items.join('')}</channel></rss>`;
const newsResponse = (source, at = START) => new Response(rss(item({ at: at - 3600000, url: source.name === 'NASA' ? 'https://www.nasa.gov/news-release/test-milestone/' : 'https://news.un.org/en/story/2026/11/test-milestone' })), { headers: { 'content-type': 'application/rss+xml' } });
function weatherData(at = START) { return JAZZ_WORLD_CITIES.map((city, index) => ({ latitude: city.latitude, longitude: city.longitude, current: { time: Math.floor((at - 600000) / 1000), temperature_2m: 10 + index, weather_code: 3, is_day: index % 2 }, current_units: { temperature_2m: '°C', time: 'unixtime' } })); }
function setup({ fetchImpl, timeoutMs } = {}) {
  let time = START; const calls = [];
  const world = createJazzWorld({ now: () => time, timeoutMs, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (fetchImpl) return fetchImpl(url, options, time);
    return url === JAZZ_WORLD_WEATHER_URL ? new Response(JSON.stringify(weatherData(time))) : newsResponse(JAZZ_NEWS_SOURCES.find(source => source.url === url), time);
  } });
  return { world, calls, at: value => { time = value; } };
}

test('world briefs stay idle until requested, fetch fixed sources, rotate geography and report the actual Doodle color', async () => {
  const env = setup(); assert.equal(env.calls.length, 0);
  const first = await env.world.brief(), second = await env.world.brief();
  assert.equal(env.calls.length, 3); assert.equal(first.news.status, 'fresh'); assert.equal(first.news.source, 'NASA'); assert.equal(second.news.source, 'UN News');
  assert.deepEqual(first.weather.cities.map(city => city.name), ['New York', 'Rio de Janeiro', 'London']);
  assert.deepEqual(second.weather.cities.map(city => city.name), ['Nairobi', 'Tokyo', 'Sydney']);
  assert.equal(first.color.hex, tickAt(START).color); assert.equal(first.color.index, tickAt(START).index);
  assert.match(first.text, /modeled weather/); assert(first.text.length <= 650); assert(second.text.length <= 650);
  assert.equal(first.sourceUrls[0].url, first.news.url); assert(first.sourceUrls.some(source => source.label.includes('CC BY 4.0')));
  assert.deepEqual(new Set(env.calls.map(call => new URL(call.url).hostname)), new Set(['www.nasa.gov', 'news.un.org', 'api.open-meteo.com']));
  for (const call of env.calls) { assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.referrerPolicy, 'no-referrer'); assert.equal(call.options.redirect, 'error'); }
  const url = new URL(JAZZ_WORLD_WEATHER_URL); assert.equal(url.searchParams.get('latitude').split(',').length, 6); assert.equal(url.searchParams.get('timeformat'), 'unixtime');
  env.world.close();
});

test('only short, recent, encouraging publisher headlines survive parsing; scripts, external links and bad dates cannot become news', () => {
  const source = JAZZ_NEWS_SOURCES[0];
  const parsed = parseJazzNews(rss(
    item({ title: 'NASA celebrates a successful research milestone &amp; discovery' }),
    item({ title: 'Successful launch ends in deadly disaster' }),
    item({ title: 'Scientists may discover a breakthrough next year' }),
    item({ at: START - JAZZ_NEWS_MAX_AGE_MS - 1 }),
    item({ at: START + 600000 }),
    item({ url: 'http://www.nasa.gov/story' }), item({ url: 'https://www.nasa.gov.evil.invalid/story' }),
    item({ url: 'https://user:password@www.nasa.gov/story' }), item({ url: 'javascript:alert(1)' })
  ), source, START);
  assert.equal(parsed.length, 1); assert.equal(parsed[0].headline, 'NASA celebrates a successful research milestone & discovery');
  assert.throws(() => parseJazzNews('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>', source, START));
  const long = parseJazzNews(rss(item({ title: 'Scientists celebrate successful ' + 'discovery '.repeat(40) })), source, START)[0];
  assert(long.headline.split(' ').length <= 22); assert(long.headline.length <= 171); assert(long.headline.endsWith('…'));
});

test('failed refreshes reuse only age-checked data, identify cached material aloud, and throttle retries', async () => {
  let failed = false;
  const env = setup({ fetchImpl: async (url, options, time) => { if (failed) throw Error('Offline'); return url === JAZZ_WORLD_WEATHER_URL ? new Response(JSON.stringify(weatherData(time))) : newsResponse(JAZZ_NEWS_SOURCES.find(source => source.url === url), time); } });
  await env.world.brief(); failed = true; env.at(START + JAZZ_NEWS_REFRESH_MS);
  const cached = await env.world.brief();
  assert.equal(cached.news.status, 'cached'); assert.equal(cached.weather.status, 'cached'); assert.match(cached.text, /Cached UN News/); assert.match(cached.text, /Cached model, 70 minutes old/);
  assert(cached.text.length <= 650); const attempts = env.calls.length;
  await env.world.brief(); assert.equal(env.calls.length, attempts);
  env.at(START + 2 * 3600000); const staleWeather = await env.world.brief();
  assert.equal(staleWeather.weather.status, 'unavailable'); assert.deepEqual(staleWeather.weather.cities, []); assert.match(staleWeather.text, /weather is unavailable/);
  env.at(START + JAZZ_NEWS_MAX_AGE_MS + 1); const staleNews = await env.world.brief();
  assert.equal(staleNews.news.status, 'unavailable'); assert.match(staleNews.text, /No recent good-news headline/); assert.equal(staleNews.news.url, null);
  env.world.close();
});

test('weather refresh does not refresh feeds early and concurrent briefs share all in-flight requests', async () => {
  const env = setup(); await Promise.all([env.world.brief(), env.world.brief(), env.world.brief()]); assert.equal(env.calls.length, 3);
  env.at(START + JAZZ_WEATHER_REFRESH_MS); await env.world.brief();
  assert.equal(env.calls.length, 4); assert.equal(env.calls.at(-1).url, JAZZ_WORLD_WEATHER_URL); env.world.close();
});

test('invalid, unknown, old or future weather cannot be presented as current weather', async () => {
  const mutations = [data => { data[0].current.temperature_2m = null; }, data => { data[0].current.weather_code = 9; }, data => { data[0].current.time = (START - 91 * 60000) / 1000; }, data => { data[0].current.time = (START + 31 * 60000) / 1000; }, data => { data[0].latitude = 0; }, data => { data[0].current_units.temperature_2m = '°F'; }, data => { data.pop(); }];
  for (const mutate of mutations) {
    const env = setup({ fetchImpl: async url => { if (url !== JAZZ_WORLD_WEATHER_URL) return newsResponse(JAZZ_NEWS_SOURCES[0]); const data = weatherData(); mutate(data); return new Response(JSON.stringify(data)); } });
    const brief = await env.world.brief(); assert.equal(brief.weather.status, 'unavailable'); assert.match(brief.text, /World weather is unavailable/); env.world.close();
  }
});

test('oversized responses and endpoints that ignore cancellation end with an explicit unavailable brief', async () => {
  for (const fetchImpl of [async () => new Response('x'.repeat(1024 * 1024 + 1)), async () => new Response('small', { headers: { 'content-length': '2000000' } }), () => new Promise(() => {})]) {
    const env = setup({ fetchImpl, timeoutMs: 15 }); const brief = await env.world.brief();
    assert.equal(brief.news.status, 'unavailable'); assert.equal(brief.weather.status, 'unavailable'); assert.deepEqual(brief.sourceUrls, []); assert.match(brief.text, /No recent good-news headline/);
    assert(env.calls.every(call => call.options.signal.aborted)); env.world.close();
  }
});

test('the response-body deadline cancels stalled streams and returned city metadata cannot poison the cache', async () => {
  let cancelled = 0;
  const env = setup({ fetchImpl: async () => new Response(new ReadableStream({ cancel() { cancelled++; } })), timeoutMs: 15 });
  const unavailable = await env.world.brief(); assert.equal(unavailable.weather.status, 'unavailable');
  assert.equal(cancelled, 3); env.world.close();
  const normal = setup(), first = await normal.world.brief(); first.weather.cities[0].name = 'changed';
  await normal.world.brief(); const again = await normal.world.brief(); assert.equal(again.weather.cities[0].name, 'New York'); normal.world.close();
});

test('closing world sources aborts pending requests and prevents later network work', async () => {
  const env = setup({ fetchImpl: () => new Promise(() => {}), timeoutMs: 5000 });
  const pending = env.world.brief(); env.world.close(); const brief = await pending;
  assert.equal(brief.news.status, 'unavailable'); assert(env.calls.every(call => call.options.signal.aborted));
  await env.world.brief(); assert.equal(env.calls.length, 3);
});
