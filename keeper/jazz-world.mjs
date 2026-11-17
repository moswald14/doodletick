// Copyright © 2026 moswald14 and contributors. GPL-3.0-only.
import { tickAt } from './public/core.mjs';
import { weatherDescription } from './public/weather.mjs';

export const JAZZ_NEWS_REFRESH_MS = 60 * 60 * 1000;
export const JAZZ_WEATHER_REFRESH_MS = 30 * 60 * 1000;
export const JAZZ_NEWS_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const WEATHER_MAX_AGE_MS = 90 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 30 * 60 * 1000;
const MAX_FEED_BYTES = 1024 * 1024, MAX_WEATHER_BYTES = 64 * 1024;

// Publisher-owned RSS, not third-party summaries. Only a short attributed
// headline is read; no article bodies, generated stories or invented fallbacks.
export const JAZZ_NEWS_SOURCES = Object.freeze([
  Object.freeze({ name: 'NASA', url: 'https://www.nasa.gov/news-release/feed/', hosts: Object.freeze(['www.nasa.gov', 'nasa.gov', 'science.nasa.gov']) }),
  Object.freeze({ name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', hosts: Object.freeze(['news.un.org']) })
]);
export const JAZZ_WORLD_CITIES = Object.freeze([
  Object.freeze({ name: 'New York', country: 'United States', latitude: 40.7128, longitude: -74.0060 }),
  Object.freeze({ name: 'Rio de Janeiro', country: 'Brazil', latitude: -22.9068, longitude: -43.1729 }),
  Object.freeze({ name: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 }),
  Object.freeze({ name: 'Nairobi', country: 'Kenya', latitude: -1.2921, longitude: 36.8219 }),
  Object.freeze({ name: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503 }),
  Object.freeze({ name: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093 })
]);
const weatherURL = new URL('https://api.open-meteo.com/v1/forecast');
weatherURL.search = new URLSearchParams({
  latitude: JAZZ_WORLD_CITIES.map(city => city.latitude).join(','), longitude: JAZZ_WORLD_CITIES.map(city => city.longitude).join(','),
  current: 'temperature_2m,weather_code,is_day', temperature_unit: 'celsius', timeformat: 'unixtime', timezone: 'UTC', forecast_days: '1'
}).toString();
export const JAZZ_WORLD_WEATHER_URL = weatherURL.href;
export const JAZZ_WORLD_WEATHER_CREDIT_URL = 'https://open-meteo.com/en/licence';

const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim() : '';
function decodeXML(value) {
  return value.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos|nbsp);/gi, (whole, code) => {
    if (code[0] !== '#') return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[code.toLowerCase()];
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return number >= 32 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : ' ';
  });
}
function tagText(item, tag) {
  const value = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i'))?.[1] || '';
  return clean(decodeXML(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]*>/g, ' '));
}
// Deliberately conservative: an encouraging keyword never overrides an adverse
// event, a warning or a proposal. Missing suitable news means silence about news.
const POSITIVE = /\b(discover(?:y|ies|ed|s)?|breakthroughs?|success(?:ful|fully|es)?|milestones?|achieve(?:d|ment|ments|s)?|celebrat(?:e|es|ed|ion)|improv(?:e|es|ed|ement|ements)|restor(?:e|es|ed|ation)|recover(?:y|ies|ed|s)?|eradicat(?:e|es|ed|ion)|eliminat(?:e|es|ed|ion)|renewable|conservation|launch(?:es|ed)?|complet(?:e|es|ed|ion))\b/i;
const ADVERSE = /\b(war|wars|conflict|attack(?:s|ed)?|dead(?:ly)?|deaths?|dies?|dying|kill(?:s|ed|ing)?|disaster|emergency|disease|hunger|crisis|crises|violen(?:ce|t)|fail(?:s|ed|ure)?|threat(?:s|en|ens)?|cuts?|loss(?:es)?|declin(?:e|es|ed)|warn(?:s|ed|ing)?|risk(?:s|y)?|could|may|might|should|must|urges?|needs?|not|never)\b|\bcall(?:s|ed)? for\b/i;
function shortHeadline(value) {
  const words = value.split(' '), kept = [];
  for (const word of words.slice(0, 22)) { if ([...kept, word].join(' ').length > 170) break; kept.push(word); }
  return kept.join(' ') + (kept.length < words.length ? '…' : '');
}
export function parseJazzNews(xml, source, now = Date.now()) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > MAX_FEED_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<rss\b/i.test(xml)) throw Error('Unreadable news feed.');
  const headlines = [], seen = new Set();
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi)) {
    if (headlines.length >= 40) break;
    const item = match[1], title = tagText(item, 'title'), link = tagText(item, 'link');
    const publishedAt = Date.parse(tagText(item, 'pubDate') || tagText(item, 'dc:date'));
    if (!title || title.length > 500 || !POSITIVE.test(title) || ADVERSE.test(title) || !Number.isFinite(publishedAt) || publishedAt > now + 5 * 60 * 1000 || now - publishedAt > JAZZ_NEWS_MAX_AGE_MS) continue;
    let url;
    try { url = new URL(link); } catch { continue; }
    if (url.protocol !== 'https:' || !source.hosts.includes(url.hostname) || url.username || url.password || url.port || url.href.length > 600 || seen.has(url.href)) continue;
    seen.add(url.href); headlines.push({ headline: shortHeadline(title), url: url.href, publishedAt, source: source.name });
  }
  return headlines.sort((a, b) => b.publishedAt - a.publishedAt);
}

function parseWeather(raw, now) {
  const values = JSON.parse(raw);
  if (!Array.isArray(values) || values.length !== JAZZ_WORLD_CITIES.length) throw Error('Incomplete world weather.');
  return values.map((value, index) => {
    const city = JAZZ_WORLD_CITIES[index], current = value?.current, modelAt = current?.time * 1000;
    if (value?.error || typeof value?.latitude !== 'number' || typeof value?.longitude !== 'number' ||
      !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || Math.abs(value.latitude - city.latitude) > 1 || Math.abs(value.longitude - city.longitude) > 1 ||
      value.current_units?.temperature_2m !== '°C' || typeof current?.temperature_2m !== 'number' || !Number.isFinite(current.temperature_2m) || current.temperature_2m < -100 || current.temperature_2m > 70 ||
      typeof current.time !== 'number' || !Number.isFinite(modelAt) || now - modelAt > WEATHER_MAX_AGE_MS || modelAt > now + FUTURE_TOLERANCE_MS ||
      !Number.isInteger(current.weather_code) || ![0, 1].includes(current.is_day)) throw Error('World weather was invalid or old.');
    const condition = weatherDescription(current.weather_code, current.is_day === 1).label;
    if (condition === 'Conditions unavailable') throw Error('Unknown world weather condition.');
    return { name: city.name, country: city.country, temperature: current.temperature_2m, condition: condition.toLowerCase(), modelAt };
  });
}

async function readLimited(response, maxBytes, signal) {
  if (signal.aborted) { void response?.body?.cancel?.().catch(() => {}); throw Error('Source request cancelled.'); }
  if (!response?.ok || Number(response.headers?.get('content-length')) > maxBytes) throw Error('Source unavailable or too large.');
  const reader = response.body?.getReader?.();
  if (!reader) { const raw = await response.text(); if (Buffer.byteLength(raw) > maxBytes) throw Error('Source too large.'); return raw; }
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', onAbort, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true }); let raw = '', bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { void reader.cancel().catch(() => {}); throw Error('Source too large.'); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    return raw + decoder.decode();
  } finally { signal.removeEventListener('abort', onAbort); reader.releaseLock(); }
}

export function createJazzWorld({ fetchImpl = (...args) => fetch(...args), now = () => Date.now(), timeoutMs = 8000 } = {}) {
  if (typeof fetchImpl !== 'function' || typeof now !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('Invalid world brief options.');
  const feeds = JAZZ_NEWS_SOURCES.map(source => ({ source, items: [], fetchedAt: null, nextAttempt: 0, error: '', pending: null }));
  const weather = { cities: [], fetchedAt: null, nextAttempt: 0, error: '', pending: null };
  const controllers = new Set(); let closed = false, ordinal = 0;
  async function request(url, maxBytes) {
    const controller = new AbortController(); controllers.add(controller); let timer;
    try {
      return await Promise.race([
        (async () => readLimited(await fetchImpl(url, { signal: controller.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', headers: { Accept: 'application/rss+xml, application/xml, application/json' } }), maxBytes, controller.signal))(),
        new Promise((_, reject) => { timer = setTimeout(() => { reject(Error('Source request timed out.')); controller.abort(); }, timeoutMs); }),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Source request cancelled.')), { once: true }))
      ]);
    } finally { clearTimeout(timer); controllers.delete(controller); controller.abort(); }
  }
  function refresh(entry, interval, url, maxBytes, parse, key) {
    if (entry.pending) return entry.pending;
    if (closed || now() < entry.nextAttempt) return Promise.resolve();
    entry.nextAttempt = now() + interval;
    entry.pending = (async () => {
      try { const parsed = parse(await request(url, maxBytes), now()); if (!closed) { entry[key] = parsed; entry.fetchedAt = now(); entry.error = ''; } }
      catch { if (!closed) entry.error = 'The remote source could not refresh.'; }
      finally { entry.pending = null; }
    })();
    return entry.pending;
  }
  async function brief() {
    const turn = ordinal++;
    await Promise.all([
      ...feeds.map(entry => refresh(entry, JAZZ_NEWS_REFRESH_MS, entry.source.url, MAX_FEED_BYTES, (raw, stamp) => parseJazzNews(raw, entry.source, stamp), 'items')),
      refresh(weather, JAZZ_WEATHER_REFRESH_MS, JAZZ_WORLD_WEATHER_URL, MAX_WEATHER_BYTES, parseWeather, 'cities')
    ]);
    const stamp = now(), colorTick = tickAt(stamp), color = { hex: colorTick.color, index: colorTick.index };
    let news = { status: 'unavailable', headline: null, url: null, publishedAt: null, source: null, fetchedAt: null };
    for (let offset = 0; offset < feeds.length; offset++) {
      const entry = feeds[(turn + offset) % feeds.length], items = entry.items.filter(item => item.publishedAt <= stamp + 300000 && stamp - item.publishedAt <= JAZZ_NEWS_MAX_AGE_MS);
      if (!items.length) continue;
      news = { ...items[Math.floor(turn / feeds.length) % items.length], status: entry.error || stamp - entry.fetchedAt >= JAZZ_NEWS_REFRESH_MS ? 'cached' : 'fresh', fetchedAt: entry.fetchedAt }; break;
    }
    const usable = weather.cities.length && weather.cities.every(city => stamp - city.modelAt <= WEATHER_MAX_AGE_MS && city.modelAt <= stamp + FUTURE_TOLERANCE_MS);
    const cities = usable ? Array.from({ length: 3 }, (_, index) => ({ ...weather.cities[(turn * 3 + index) % weather.cities.length] })) : [];
    const report = { status: cities.length ? (weather.error || stamp - weather.fetchedAt >= JAZZ_WEATHER_REFRESH_MS ? 'cached' : 'fresh') : 'unavailable', cities, source: 'Open-Meteo', fetchedAt: weather.fetchedAt };
    const date = value => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(value);
    const newsText = news.headline ? `${news.status === 'cached' ? 'News refresh unavailable. Cached ' : ''}${news.source} headline, ${date(news.publishedAt)}: ${news.headline}.` : 'No recent good-news headline is available from our sources.';
    const clockText = `Doodle clock color: hexadecimal ${color.hex.slice(1).split('').join(' ')}.`;
    const weatherText = () => report.cities.length ? `${report.status === 'cached' ? `Weather refresh unavailable. Cached model, ${Math.max(0, Math.round((stamp - Math.min(...report.cities.map(city => city.modelAt))) / 60000))} minutes old` : 'Open-Meteo modeled weather'}: ${report.cities.map(city => `${city.name}, ${Math.round(city.temperature)} degrees Celsius, ${city.condition}`).join('; ')}.` : 'World weather is unavailable right now.';
    let text = `${newsText} ${weatherText()} ${clockText}`;
    if (text.length > 650 && report.cities.length > 2) { report.cities = report.cities.slice(0, 2); text = `${newsText} ${weatherText()} ${clockText}`; }
    const sourceUrls = [];
    if (news.url) sourceUrls.push({ label: news.source, url: news.url });
    if (report.cities.length) sourceUrls.push({ label: 'Open-Meteo weather model', url: JAZZ_WORLD_WEATHER_URL }, { label: 'Open-Meteo · CC BY 4.0', url: JAZZ_WORLD_WEATHER_CREDIT_URL });
    return { text, generatedAt: stamp, fetchedAt: Math.max(news.fetchedAt || 0, report.fetchedAt || 0) || null, news, weather: report, color, sourceUrls };
  }
  function close() { closed = true; for (const controller of controllers) controller.abort(); }
  return { brief, close };
}
