// Copyright © 2026 moswald14 and contributors. GPL-3.0-only.
import {createWeatherController, formatTemperature, locationLabel, weatherDescription} from './weather.mjs';

export function createWeatherUI(root, options = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  let storage = options.storage;
  if (storage === undefined) { try { storage = win.localStorage; } catch {} }
  root.classList.add('weather-panel');
  root.innerHTML = `<div class="weather-heading"><div><span class="section-kicker">OUTSIDE YOUR WINDOW</span><h2>Weather</h2></div><label class="weather-unit-label">Degrees<select data-weather="unit" aria-label="Weather temperature units"><option value="c">Celsius °C</option><option value="f">Fahrenheit °F</option></select></label></div>
    <p class="weather-place" data-weather="place">Choose a city to bring the outside in.</p>
    <div class="weather-actions"><button class="text-button" type="button" data-weather="change" hidden>Change city</button><button class="text-button" type="button" data-weather="refresh" hidden>Refresh weather</button><button class="text-button" type="button" data-weather="clear" hidden>Clear location</button></div>
    <form class="weather-search" data-weather="form"><label>City name<input data-weather="query" type="search" maxlength="100" minlength="2" required autocomplete="off" placeholder="e.g. London, Ontario"></label><button type="submit" class="button quiet" data-weather="search">Find city</button></form>
    <p class="weather-privacy" data-weather="privacy">Search sends the city name to Open-Meteo. Choosing a result saves it on this device and sends that city’s coordinates for forecasts. No precise location is requested.</p>
    <p class="weather-status" data-weather="search-status" role="status" aria-live="polite"></p><div class="weather-results" data-weather="results"></div>
    <p class="weather-status" data-weather="status" role="status" aria-live="polite">Weather is off until you choose a city.</p>
    <div data-weather="report" hidden><div class="weather-now"><span class="weather-symbol" data-weather="symbol" aria-hidden="true"></span><div><strong data-weather="temperature"></strong><span data-weather="condition"></span></div></div><p class="weather-details" data-weather="details"></p><ul class="weather-days" data-weather="days" aria-label="Three-day forecast"></ul><p class="weather-updated" data-weather="updated"></p></div>
    <p class="weather-storage" data-weather="storage" hidden></p>
    <p class="weather-attribution">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Locations by <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>. Forecast data, not a local sensor. <a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener noreferrer">Free personal, non-commercial use</a>.</p>`;
  const el = key => root.querySelector(`[data-weather="${key}"]`);
  let editing = false, panelVisible = false, destroyed = false;
  const controller = createWeatherController({...options, storage, onChange: render});
  function render(state) {
    if (destroyed) return;
    el('place').textContent = state.location ? locationLabel(state.location) : 'Choose a city to bring the outside in.';
    el('unit').value = state.unit;
    for (const key of ['change', 'refresh', 'clear']) el(key).hidden = !state.location;
    el('refresh').disabled = state.status === 'loading';
    el('form').hidden = Boolean(state.location) && !editing;
    el('privacy').hidden = Boolean(state.location) && !editing;
    el('search').disabled = state.searchStatus === 'loading';
    el('search-status').textContent = state.searchStatus === 'loading' ? 'Finding cities…' : state.searchStatus === 'empty' ? 'No matching city. Try a nearby city or include the country.' : state.searchStatus === 'error' ? state.searchError : state.searchStatus === 'results' ? 'Choose the matching city:' : '';
    el('results').replaceChildren();
    for (const location of state.results) {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'weather-result'; button.textContent = locationLabel(location);
      button.addEventListener('click', () => { editing = false; controller.selectLocation(location); });
      el('results').append(button);
    }
    const loading = state.status === 'loading', hasReport = Boolean(state.report);
    el('status').textContent = state.error || (loading ? (hasReport ? 'Updating… showing the saved report below.' : 'Getting the forecast…') : !state.location ? 'Weather is off until you choose a city.' : !hasReport ? 'Open this panel to load the forecast.' : state.stale ? 'Saved forecast · out of date. Refresh when connected.' : state.status === 'cached' ? 'Saved forecast · updates while this panel is open.' : 'Forecast updated · refreshes every 30 minutes while this panel is open.');
    if (state.error && hasReport) el('status').textContent += ' Showing the saved report below.';
    el('report').hidden = !hasReport;
    if (hasReport) {
      const report = state.report, condition = weatherDescription(report.code, report.isDay);
      el('symbol').textContent = condition.symbol; el('temperature').textContent = formatTemperature(report.temperature, state.unit); el('condition').textContent = condition.label;
      const wind = state.unit === 'f' ? `${Math.round(report.wind / 1.609344)} mph` : `${Math.round(report.wind)} km/h`;
      el('details').textContent = `Feels like ${formatTemperature(report.feelsLike, state.unit)} · Wind ${wind}`;
      el('days').replaceChildren();
      for (const day of report.days) {
        const item = doc.createElement('li'), date = doc.createElement('span'), temperatures = doc.createElement('strong'), description = doc.createElement('span'), rain = doc.createElement('small');
        date.textContent = new Intl.DateTimeFormat(undefined, {weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC'}).format(new Date(day.date + 'T12:00:00Z'));
        temperatures.textContent = `${formatTemperature(day.high, state.unit)} / ${formatTemperature(day.low, state.unit)}`;
        description.textContent = weatherDescription(day.code).label; rain.textContent = `${Math.round(day.rain)}% precipitation`;
        item.append(date, temperatures, description, rain); el('days').append(item);
      }
      const fetched = new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}).format(new Date(report.fetchedAt));
      el('updated').textContent = `Fetched ${fetched} on this device. Conditions for ${report.localTime.replace('T', ' ')} (${report.timezone}).${state.stale ? ' This report is out of date.' : ''}`;
    }
    el('storage').hidden = state.persisted;
    el('storage').textContent = 'Browser storage is unavailable. Changes apply to this visit only.';
  }
  el('form').addEventListener('submit', event => { event.preventDefault(); controller.search(el('query').value); });
  el('change').addEventListener('click', () => { editing = !editing; render(controller.state()); if (editing) el('query').focus(); });
  el('clear').addEventListener('click', () => { editing = false; el('query').value = ''; controller.clear(); });
  el('refresh').addEventListener('click', () => controller.refresh({force: true}));
  el('unit').addEventListener('change', () => controller.setUnit(el('unit').value));
  function visibility() { controller.setVisible(panelVisible && !doc.hidden); }
  doc.addEventListener('visibilitychange', visibility);
  render(controller.state());
  return {
    setVisible(value) { panelVisible = Boolean(value); visibility(); },
    destroy() { if (destroyed) return; destroyed = true; controller.destroy(); doc.removeEventListener('visibilitychange', visibility); root.replaceChildren(); }
  };
}
