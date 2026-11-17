// SPDX-License-Identifier: GPL-3.0-only
import { createShelfIdleClient } from './shelf-idle-client.mjs';

const card = document.getElementById('idle-game'), status = document.getElementById('idle-status');
let client, timer, leaving = false;
const theme = () => { card.dataset.theme = document.documentElement.dataset.theme || 'day'; };
const message = (text, error = false) => { status.textContent = text; status.classList.toggle('error', error); };
card.setConfig({ title: 'ShelfDEFENSE Idle' });
theme(); window.addEventListener('keeper-themechange', theme);
async function refresh() {
  try { await client.refresh(); message('Saved on this Keeper · everyone here shares this cookie shelf.'); }
  catch (error) { if (!leaving) message(error.message || 'Could not reach this Keeper. Try Refresh.', true); }
}
function connect() {
  leaving = false;
  client = createShelfIdleClient({ onState: value => { card.state = value; } });
  card.transport = async (action, data) => {
    try { const result = await client.action(action, data); message('Saved on this Keeper · everyone here shares this cookie shelf.'); return result; }
    catch (error) { message(error.message || 'That action could not be confirmed.', true); throw error; }
  };
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden && !leaving) void refresh(); }, 5000);
  void refresh();
}
document.getElementById('idle-refresh').addEventListener('click', () => { if (!leaving) void refresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !leaving) void refresh(); });
for (const link of document.querySelectorAll('a[data-leave]')) link.addEventListener('click', async event => {
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); if (leaving) return;
  try { await card.flush(); leaving = true; card.stop(); location.assign(link.href); }
  catch (error) { message('Some taps could not be confirmed. Refresh your shelf before leaving.', true); }
});
window.addEventListener('pagehide', () => { leaving = true; clearInterval(timer); client.close(); card.stop(); });
window.addEventListener('pageshow', event => { if (event.persisted) connect(); });
connect();
