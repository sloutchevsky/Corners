'use strict';
let state, viewKey = '', filter = '', toastTimer;
let aboutBolt, homeBolt, lastTheme, themeTurns = 0;
let dragging = null;
const predictiveFields = new Map();
let activePrediction = null;
let tabRenderKey = '', listRenderKey = '';
const tabMemory = new Map();
const memoryRequests = new Map();
let summaryRenderKey = '';
let libraryOpenKind = 'swf';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const date = value => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const size = bytes => !bytes ? '0 B' : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';
function toast(message) { $('#toast').textContent = message; $('#toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 5000); }
async function call(action, args = {}) {
  const result = await window.browser.call(action, args);
  if (!result.ok) { toast(result.error); return; }
  if (result.state) render(result.state);
  return result.state;
}
function current() { return state?.tabs.find(t => t.id === state.activeId); }
const memoryKey = tab => tab && JSON.stringify([tab.url, tab.kind, !!tab.native]);
function tabTooltip(tab) {
  const measured = tabMemory.get(tab.id);
  return (tab.private ? 'Flashcognito · ' : '') + (tab.url || 'New tab') + (measured ? '\nMemory: ' + (measured.megabytes === null ? 'unavailable' : measured.megabytes + ' MB') + (measured.shared ? '\nShared renderer' : '') : '');
}
async function measureTab(event) {
  const row = event.target.closest('.tab');
  if (!row || row.contains(event.relatedTarget)) return;
  const id = row.dataset.reorderId, tab = state?.tabs.find(t => t.id === id);
  if (!tab) return;
  const cached = tabMemory.get(id);
  if (!cached || cached.page !== memoryKey(tab) || Date.now() - cached.measuredAt > 2000) {
    if (!memoryRequests.has(id)) {
      const page = memoryKey(tab);
      const request = window.browser.call('tab-memory', { id }).then(result => {
        if (result.ok && result.state.tabMemory.id === id && memoryKey(state?.tabs.find(t => t.id === id)) === page) tabMemory.set(id, { ...result.state.tabMemory, page, measuredAt: Date.now() });
      }).catch(() => {}).finally(() => memoryRequests.delete(id));
      memoryRequests.set(id, request);
    }
    await memoryRequests.get(id);
  }
  if (row.isConnected) row.title = tabTooltip(tab);
}
document.getElementById('tabs').addEventListener('pointerover', measureTab);
document.getElementById('tabs').addEventListener('pointermove', measureTab);
document.getElementById('tabs').addEventListener('focusin', measureTab);
const loadingBolt = new GoldLightning(document.getElementById('loading-bolt'));
const titleBolt = new GoldLightning(document.getElementById('title-bolt'));
const navigationIcons = [...document.querySelectorAll('[data-nav-icon]')].map(canvas => new GoldNavigation(canvas));
function renderSummary() {
  const section = $('#page-summary'), summary = state.pageSummary;
  const visible = !!summary && !state.panel && !state.fullscreen && !current()?.error;
  section.classList.toggle('hidden', !visible);
  if (!visible) { document.documentElement.style.setProperty('--summary-height', '0px'); return; }
  const key = JSON.stringify([state.activeId, summary]);
  if (key !== summaryRenderKey) {
    summaryRenderKey = key;
    const numbers = new Map(summary.sources.map((source, i) => [source.index, i + 1]));
    $('#summary-inner').innerHTML = '<div class="summary-heading">Page summary</div><p class="summary-text">' + summary.passages.map(item => escape(item.text) + (summary.provider ? '<sup>' + numbers.get(item.source) + '</sup>' : '')).join(' ') + '</p><div class="summary-sources"><span>From ' + (summary.provider ? 'these results' : 'this page') + '</span>' + summary.sources.map(source => '<a data-browser-url href="' + escape(source.url) + '" title="' + escape(source.title) + '">' + (summary.provider ? numbers.get(source.index) + ' · ' : '') + escape(source.domain) + '</a>').join('') + '</div>';
  }
  measureSummary();
}
function measureSummary() {
  const section = $('#page-summary');
  if (!state?.pageSummary || state.panel || state.fullscreen || section.classList.contains('hidden')) return;
  const height = Math.ceil(section.getBoundingClientRect().height);
  if (!height) return;
  document.documentElement.style.setProperty('--summary-height', height + 'px');
  const stamp = state.activeId + '|' + state.pageSummary.url + '|' + height;
  if (section.dataset.measure !== stamp) {
    section.dataset.measure = stamp;
    window.browser.call('summary-height', { id: state.activeId, url: state.pageSummary.url, height }).catch(() => {});
  }
}
new ResizeObserver(measureSummary).observe($('#page-summary'));
function render(next) {
  state = next;
  for (const [id, measured] of tabMemory) if (measured.page !== memoryKey(state.tabs.find(t => t.id === id))) tabMemory.delete(id);
  document.body.classList.toggle('collapsed', state.collapsed);
  document.body.classList.toggle('fullscreen', state.fullscreen);
  const theme = state.settings.theme || 'current';
  document.body.dataset.theme = theme;
  if (lastTheme && lastTheme !== theme) { themeTurns++; $('#theme-icon').style.transform = `rotate(${themeTurns * 180}deg)`; }
  lastTheme = theme;
  $('#theme-button').title = `Theme: ${theme === 'current' ? 'dark grey' : theme === 'light' ? 'light grey' : 'dark'} — click to change`;
  $('#theme-button').setAttribute('aria-label', $('#theme-button').title);
  const t = current();
  renderSummary();
  document.body.classList.toggle('flashcognito', !!t?.private);
  loadingBolt.setMetal(t?.private ? 'silver' : 'gold');
  titleBolt.setMetal(t?.private ? 'silver' : 'gold');
  $('#private-badge').classList.toggle('hidden', !t?.private);
  const preview = $('#color-pick-preview');
  if (state.colorPreview) { if (preview.src !== state.colorPreview) preview.src = state.colorPreview; preview.classList.remove('hidden'); }
  else { preview.classList.add('hidden'); preview.removeAttribute('src'); }
  loadingBolt.setLoading(!!t?.loading, t?.id);
  document.title = (t?.title || 'New tab') + ' · Flashborn';
  $('#tab-count').textContent = state.tabs.length;
  $('#tab-count').title = `${state.tabs.length} open tabs`;
  const nextTabKey = JSON.stringify([state.tabs, state.activeId, state.panel]);
  if (!dragging && nextTabKey !== tabRenderKey) {
    tabRenderKey = nextTabKey;
    $('#tabs').innerHTML = state.tabs.map(tab => `<div class="tab ${tab.private ? 'private-tab' : ''} ${tab.id === state.activeId && !state.panel ? 'active' : ''}" draggable="true" data-collection="tabs" data-reorder-id="${tab.id}" title="${escape(tabTooltip(tab))}"><button class="tab-select" data-tab="${tab.id}" aria-label="Switch to ${escape(tab.title)}${tab.private ? ' (Flashcognito)' : ''}" aria-description="Drag to reorder, or press Alt and Up or Down. Right-click to duplicate or close."><span class="tab-icon kind-${tab.kind}">${tab.loading ? '<span class="spinner"></span>' : tab.private ? icon('lock') : tab.kind === 'flash' ? icon('flash') : tab.kind === 'home' ? icon('globe') : escape(tab.title.charAt(0).toUpperCase())}</span><span class="tab-title">${escape(tab.title)}</span></button><button class="tab-close" data-close-tab="${tab.id}" title="Close tab" aria-label="Close ${escape(tab.title)}">${icon('close')}</button></div>`).join('');
  }
  document.querySelectorAll('[data-panel]').forEach(el => el.classList.toggle('active', el.dataset.panel === state.panel));
  $('#back').disabled = !t?.canBack;
  $('#forward').disabled = !t?.canForward;
  $('#reload').disabled = !t || t.kind === 'home';
  $('#reload').dataset.action = t?.loading ? 'stop' : 'reload';
  $('#reload').innerHTML = icon(t?.loading ? 'close' : 'reload');
  $('#reload').title = t?.loading ? 'Stop loading' : 'Reload (Ctrl+R)';
  $('#bookmark').disabled = !t?.url?.startsWith('http');
  $('#bookmark').classList.toggle('bookmarked', state.bookmarks.some(b => b.url === t?.url));
  if (document.activeElement !== $('#address')) $('#address').value = t?.url || '';
  $('#address-icon').innerHTML = `<use href="#i-${t?.kind === 'flash' ? 'flash' : t?.url.startsWith('https:') ? 'lock' : t?.url ? 'globe' : 'search'}"/>`;
  $('#native-mode').disabled = !t?.url?.startsWith('http');
  $('#native-mode').classList.toggle('native-active', !!t?.native);
  $('#native-mode').setAttribute('aria-pressed', String(!!t?.native));
  $('#menu-button').setAttribute('aria-expanded', String(state.menuOpen));
  for (const [id, controller] of predictiveFields) controller.input.setAttribute('aria-expanded', String(state.suggestions?.field === id));
  const downloads = state.downloads.filter(d => d.state === 'progressing').length;
  $('#download-count').textContent = downloads || '';
  const newDownloads = state.downloads.some(d => d.state === 'completed' && d.isNew);
  $('#download-new').classList.toggle('hidden', !newDownloads);
  $('.sidebar [data-panel="downloads"]').setAttribute('aria-label', newDownloads ? 'Downloads — new completed downloads' : 'Downloads');
  $('#page-status').textContent = state.panel ? ({ library: 'Your Flash collection', bookmarks: 'Saved for later', history: 'Recently visited', downloads: 'Your downloads', settings: 'Settings', about: 'Flashborn ' + state.version }[state.panel]) : t?.loading ? 'Loading…' : t?.kind === 'home' ? 'Make yourself at home.' : t?.kind === 'flash' ? 'Adobe Flash Player ' + state.flashVersion : t?.url || '';
  $('#status-right').textContent = t?.private ? 'Flashcognito · temporary session' : t?.audible ? (t.muted ? 'Audio muted' : 'Audio playing') : t?.native ? 'Native Adobe Flash' : 'Chromium · Adobe Flash';
  const key = state.panel ? state.panel + (t?.private ? ':private' : '') : (t?.error ? 'error:' + t.id + t.error : t?.kind === 'home' ? t.private ? 'private-home' : 'home' : 'web');
  if (key !== viewKey) { filter = ''; viewKey = key; renderContent(); }
  else if (state.panel && !['settings', 'about'].includes(state.panel)) renderList();
  else if (key === 'home' || key === 'private-home') renderQuickLinks();
}
function home() {
  const privateMode = !!current()?.private;
  return `<section class="home${privateMode ? ' flashcognito-home' : ''}"><h1>${privateMode ? 'A little more private.' : 'Where would you like to go?'}</h1><p class="home-description">${privateMode ? 'A fresh session. No saved browsing trail.' : 'A fresh start. An old favorite. Something unexpected.'}</p><form id="home-search" class="search-box">${icon('search')}<input id="home-input" aria-label="${privateMode ? 'Search the web privately' : 'Search the web'}" placeholder="Search the web or paste a link" spellcheck="false" autocomplete="off"><button class="search-submit" title="Go" aria-label="Go">${icon('arrow')}</button></form><div id="quick-links" class="quick-links"></div><div class="home-divider"></div><div class="home-bottom"><button class="flash-library-link" data-panel="library"><span class="flash-card-icon"><canvas id="home-bolt" width="128" height="128" role="img" aria-label="${privateMode ? 'Silver' : 'Gold'} lightning bolt"></canvas></span><span class="flash-copy"><span class="flash-card-title">${privateMode ? 'Old favorites are still welcome.' : 'Some things never get old.'}</span><span class="flash-card-description">${privateMode ? 'Open your Flash library.' : 'Your Flash games and movies, ready to play again.'}</span></span></button><button class="subtle-button" data-action="open-file">Open a SWF ${icon('forward')}</button></div><div class="home-footnote">${icon('lock')}${privateMode ? 'Bookmarks and downloaded files you keep remain on your device.<br>Flashcognito doesn’t hide your activity from websites or your network.' : 'Your history and bookmarks stay on this device.'}</div></section>`;
}
function renderQuickLinks() {
  const target = $('#quick-links'); if (!target) return;
  const defaults = [{ title: 'Wikipedia', url: 'https://www.wikipedia.org/' }, { title: 'Internet Archive', url: 'https://archive.org/' }, { title: 'Flash Browser', url: 'https://flash.pm/' }];
  target.innerHTML = (state.bookmarks.length ? state.bookmarks.slice(0, 5) : defaults).map(b => `<button class="quick-link" data-url="${escape(b.url)}">${icon(state.bookmarks.length ? 'star' : 'globe')}${escape(b.title.slice(0, 24))}</button>`).join('');
}
function panelHeader(name, description, actions) {
  return `<section class="panel"><h1>${name}</h1><p class="description">${description}</p>${actions ? '<div class="panel-actions">' + actions + '</div>' : ''}<div id="item-list" class="item-list"></div></section>`;
}
function renderContent() {
  listRenderKey = '';
  for (const [id, controller] of predictiveFields) if (id !== 'address') { clearTimeout(controller.timer); predictiveFields.delete(id); }
  if (activePrediction?.input.id !== 'address') activePrediction = null;
  if (aboutBolt) { aboutBolt.dispose(); aboutBolt = null; }
  if (homeBolt) { homeBolt.dispose(); homeBolt = null; }
  const t = current();
  let html = '';
  if (state.panel === 'library') html = panelHeader('Flash library', 'Your Flash movies and pages, from local files or the web.', `<input class="filter-input" id="filter" placeholder="Find in your collection" aria-label="Filter Flash library"><div class="library-open-buttons"><button class="secondary-button" data-open-library="html">${icon('plus')}Open HTML with SWF</button><button class="primary-button" data-open-library="swf">${icon('plus')}Open a SWF</button></div><form id="library-open-form" class="library-open-form hidden"><label id="library-open-label" for="library-open-address">Open a SWF</label><div><input id="library-open-address" placeholder="Web URL or local file path" aria-label="Flash URL or local file path" spellcheck="false" autocomplete="off"><button type="button" class="secondary-button" id="library-browse">Browse…</button><button class="primary-button" type="submit">Open</button></div></form>`);
  else if (state.panel === 'bookmarks') html = panelHeader('Bookmarks', 'Good places, saved for later. Press Ctrl+D on any page to bookmark it.', '<input class="filter-input" id="filter" placeholder="Find a bookmark" aria-label="Filter bookmarks">');
  else if (state.panel === 'history') html = panelHeader('History', t?.private ? 'Flashcognito doesn’t save your browsing history.' : 'Pick up where you left off.', t?.private ? '' : '<input class="filter-input" id="filter" placeholder="Search history" aria-label="Filter history"><button class="secondary-button danger-button" id="clear-history">Clear history</button>');
  else if (state.panel === 'downloads') html = panelHeader('Downloads', t?.private ? 'Downloads from this Flashcognito session. Saved files remain after these tabs close.' : 'Everything you have saved from the web.', '<span></span><button class="secondary-button" data-action="download-clear">Clear finished</button>');
  else if (state.panel === 'settings') html = settings();
  else if (state.panel === 'about') html = about();
  else if (t?.error) html = `<section class="error-page">${icon('globe')}<h1>This page couldn’t open.</h1><p>${escape(t.error)}</p><button class="primary-button" data-action="reload">${icon('reload')}Try again</button><code>${escape(t.url)}</code></section>`;
  else if (t?.kind === 'home') html = home();
  $('#content').innerHTML = html;
  if ($('#about-bolt')) aboutBolt = new GoldLightning($('#about-bolt'), { continuous: true });
  if ($('#home-bolt')) homeBolt = new GoldLightning($('#home-bolt'), { metal: t?.private ? 'silver' : 'gold' });
  renderQuickLinks(); renderList();
  if ($('#home-search')) {
    const controller = bindPredictiveField($('#home-input'), $('#home-search'));
    $('#home-search').addEventListener('submit', e => { e.preventDefault(); controller.submit(); });
  }
  if ($('#library-open-form')) {
    const controller = bindPredictiveField($('#library-open-address'), $('#library-open-address'), { library: true });
    $('#library-open-form').addEventListener('submit', e => { e.preventDefault(); controller.submit(); });
    $('#library-browse').addEventListener('click', () => call('browse-library-source', { kind: libraryOpenKind }));
  }
  if ($('#filter')) $('#filter').addEventListener('input', e => { filter = e.target.value.toLowerCase(); renderList(); });
  if ($('#search-engine')) $('#search-engine').addEventListener('change', e => call('settings', { searchEngine: e.target.value }));
  for (const setting of ['restoreTabs', 'pageSummaries', 'flashEnabled']) if ($(`#${setting}`)) $(`#${setting}`).addEventListener('change', e => { call('settings', { [setting]: e.target.checked }); if (setting === 'flashEnabled') toast('Reload open websites to apply the Flash setting.'); });
  if ($('#clear-history')) $('#clear-history').addEventListener('click', () => confirmAction('clear-history', 'Click again to clear history'));
  if ($('#clear-data')) $('#clear-data').addEventListener('click', () => confirmAction('clear-data', 'Click again to clear cookies and cached files. Websites will sign you out.'));
}
const confirmations = new Map();
function confirmAction(action, message) {
  if ((confirmations.get(action) || 0) > Date.now()) { confirmations.delete(action); call(action).then(() => toast('Cleared.')); }
  else { confirmations.set(action, Date.now() + 6000); toast(message); }
}
function empty(name, title, description, button = '') { return `<div class="empty">${icon(name)}<h2>${title}</h2><p>${description}</p>${button}</div>`; }
function renderList() {
  if (dragging) return;
  const container = $('#item-list'); if (!container) return;
  const p = state.panel; const collection = p === 'library' ? state.library : state[p] || [];
    const items = collection.filter(e => !filter || `${e.title || e.filename || ''} ${e.url || e.path || ''}`.toLowerCase().includes(filter));
  const nextListKey = JSON.stringify([p, filter, items]);
  if (nextListKey === listRenderKey) return;
  listRenderKey = nextListKey;
  if (!items.length) {
    container.innerHTML = filter ? empty('search', 'Nothing here yet.', 'Try a different search.') : ({ library: empty('flash', 'Your favorites live here.', 'Open a .swf file from your computer to get started.<br>Original files stay right where you put them.', `<button class="primary-button" data-action="open-file">${icon('folder')}Open a Flash file</button>`), bookmarks: empty('star', 'A place for good finds.', 'Bookmark a page with the star in the address bar.'), history: empty('history', 'A clean slate.', current()?.private ? 'Visits in Flashcognito aren’t recorded.' : 'The websites you visit will appear here.'), downloads: empty('download', 'All caught up.', 'Downloads from websites will appear here.') }[p] || '');
    return;
  }
  container.innerHTML = items.map(item => {
    let title = item.title || item.filename, detail = item.url || item.path || '', actions = '', name = p === 'library' ? 'flash' : p === 'bookmarks' ? 'star' : p === 'history' ? 'history' : 'download', open;
    if (p === 'library') { open = `data-library="${item.id}"`; detail = (item.kind === 'html' ? 'HTML with SWF · ' : '') + (item.path || item.url); actions = `<button class="icon-button" data-library="${item.id}" title="Play" aria-label="Play ${escape(title)}">${icon('play')}</button><button class="icon-button" data-remove-library="${item.id}" title="Remove from library" aria-label="Remove from library">${icon('close')}</button>`; }
    else if (p === 'bookmarks') { open = `data-url="${escape(item.url)}"`; actions = `<button class="icon-button" data-remove-bookmark="${item.id}" title="Remove bookmark" aria-label="Remove bookmark">${icon('close')}</button>`; }
    else if (p === 'history') { open = `data-url="${escape(item.url)}"`; detail = date(item.visitedAt) + ' · ' + item.url; }
    else {
      open = `data-download-open="${item.id}"`; detail = `${size(item.received)}${item.total ? ' / ' + size(item.total) : ''} · ${item.state === 'completed' ? 'Saved' : item.state === 'progressing' ? 'Downloading' : item.state === 'cancelled' ? 'Cancelled' : 'Interrupted'}`;
      actions = item.state === 'progressing' ? `<button class="icon-button" data-download-cancel="${item.id}" title="Cancel download" aria-label="Cancel download">${icon('close')}</button>` : item.state === 'completed' ? `<button class="icon-button" data-download-reveal="${item.id}" title="Show in folder" aria-label="Show in folder">${icon('folder')}</button>` : '';
    }
    const reorder = ['library', 'downloads', 'bookmarks'].includes(p);
    const thumbnail = p === 'library' ? `<div class="library-art"><button class="library-thumbnail ${item.image ? 'has-image' : ''}" data-library-image="${item.id}" title="${item.image ? 'Change image' : 'Add a 2:1 image or drop one here'}" aria-label="${item.image ? 'Change' : 'Add'} image for ${escape(title)}">${item.image ? `<img src="/library-image/${item.id}?v=${escape(item.image)}" alt="" draggable="false">` : icon('plus') + '<span>Add image</span>'}</button>${item.image ? `<button class="thumbnail-remove" data-remove-library-image="${item.id}" title="Remove image" aria-label="Remove image for ${escape(title)}">${icon('close')}</button>` : ''}</div>` : `<span class="item-icon">${icon(name)}</span>`;
    return `<article class="list-item" ${reorder ? `draggable="true" data-collection="${p}" data-reorder-id="${item.id}"` : ''}>${reorder ? `<button class="reorder-handle" title="Drag to reorder (Alt+↑ / Alt+↓)" aria-label="Reorder ${escape(title)}">${icon('grip')}</button>` : ''}${thumbnail}<div class="item-copy"><button class="item-title" ${open}>${escape(title)}</button><p class="item-detail" title="${escape(item.path || item.url || '')}">${escape(detail)}</p>${p === 'downloads' && item.state === 'progressing' ? `<div class="progress"><span style="--progress:${item.total ? Math.min(100, Math.round(item.received / item.total * 100)) : 15}%"></span></div>` : ''}</div><div class="item-actions">${actions}</div></article>`;
  }).join('');
}
function settings() {
  const s = state.settings;
  return `<section class="panel"><h1>Settings</h1><p class="description">Just the essentials. Settle in.</p><div class="setting-heading">Browsing</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Search engine</h2><p>Used when you type a search in the address bar.</p></div><select id="search-engine" aria-label="Search engine">${[['duckduckgo','DuckDuckGo'],['google','Google'],['bing','Bing']].map(([id,label])=>`<option value="${id}" ${s.searchEngine===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="setting-row"><div class="setting-copy"><h2>Generate page summaries</h2><p>A brief overview above search results. Turn off to show pages without a summary.</p></div><label class="switch"><input id="pageSummaries" type="checkbox" ${s.pageSummaries?'checked':''} aria-label="Generate page summaries"><span></span></label></div><div class="setting-row"><div class="setting-copy"><h2>Restore tabs on startup</h2><p>Reopen your previous websites when you return.</p></div><label class="switch"><input id="restoreTabs" type="checkbox" ${s.restoreTabs?'checked':''} aria-label="Restore tabs on startup"><span></span></label></div></div><div class="setting-heading">Flash</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Automatically use native Flash on websites</h2><p>Open detected Flash pages with the bundled Adobe player.<br>Use the lightning button for sites that hide Flash behind plugin detection.</p></div><label class="switch"><input id="flashEnabled" type="checkbox" ${s.flashEnabled?'checked':''} aria-label="Play embedded Flash"><span></span></label></div></div><div class="setting-heading">Privacy</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Cookies and cached files</h2><p>Clear site data and sign out of websites.<br>Your bookmarks and Flash library are kept.</p></div><button id="clear-data" class="secondary-button danger-button">Clear site data</button></div><div class="setting-row"><div class="setting-copy"><h2>Browsing history</h2><p>Keep your saved favorites. Clear your recent visits.</p></div><button id="clear-history" class="secondary-button danger-button">Clear history</button></div></div><p class="about-note">Ctrl+L address · Ctrl+T new tab · Ctrl+W close tab · Ctrl+Shift+T reopen tab<br>Ctrl+O open SWF or PDF · Ctrl+F find · Ctrl+D bookmark · F11 full screen</p></section>`;
}
function about() {
  return `<section class="panel about-panel"><canvas id="about-bolt" class="about-bolt" width="336" height="336" role="img" aria-label="Spinning gold lightning bolt"></canvas><div class="about-copy"><h1 class="brand-wordmark about-wordmark" role="img" aria-label="flashborn"></h1><div class="about-text"><p class="about-motto">A quieter kind of browsing. Original Adobe Flash playback.</p><p class="about-dedication">This browser is dedicated to the team of <em>Firstborn</em> -- one of the first digital design groups to help shape UI design as we know it today. Back in the early 2000s, <em>Firstborn</em> mostly used Flash to create and share theirs work with the world. <strong>Flashborn</strong> was designed to preserve their legacy after browser support for Flash was discontinued in 2021. Please enjoy the browser, and send your comments or support to&nbsp;<span class="about-email-wrap"><a class="about-email" data-contact-email href="mailto:sloutchevsky@gmail.com" aria-label="Copy email address">sloutchevsky@gmail.com</a><span class="email-copied hidden" role="status" aria-live="polite"></span></span>.</p><dl class="about-detail"><dt>Version</dt><dd>${escape(state.version)}</dd><dt>Modern browser</dt><dd>Chromium ${escape(state.chromium)}</dd><dt>Flash player</dt><dd>Adobe Flash ${escape(state.flashVersion)} · PPAPI</dd><dt>Flash runtime</dt><dd>Electron ${escape(state.flashRuntime)} · separate process</dd><dt>Platform</dt><dd>Windows · 64-bit</dd><dt>Native Flash</dt><dd>${state.flashReady ? 'Bundled and ready' : 'Runtime missing — reinstall Flashborn'}</dd></dl><p class="about-note">The original Adobe player from your installed Flash Browser is bundled without modification. Adobe Flash and its required legacy Chromium runtime no longer receive security updates. Ordinary pages use the current browser engine; Flash pages use the legacy runtime. The lightning button switches a website between modes.</p><a class="about-copyright" data-browser-url href="https://www.sloutchevsky.com/">© 2026 Vas Sloutchevsky</a><details class="about-license"><summary>MIT open source license</summary><p>Flashborn’s application source is free to use, copy, modify, merge, publish, distribute, sublicense, and sell under the MIT License. Third-party components, including Adobe Flash Player, retain their own licenses.</p><p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:</p><p>The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.</p><p>THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p></details></div></div></section>`;
}
document.addEventListener('click', async e => {
  const contact = e.target.closest('[data-contact-email]');
  if (contact) {
    e.preventDefault();
    if (await call('contact-email')) {
      const bubble = contact.parentElement.querySelector('.email-copied');
      clearTimeout(contact.copyTimer); bubble.textContent = 'Copied!'; bubble.classList.remove('hidden');
      contact.copyTimer = setTimeout(() => bubble.classList.add('hidden'), 1600);
    }
    return;
  }
  const link = e.target.closest('a[data-browser-url]');
  if (link) { e.preventDefault(); await call('navigate', { value: link.href }); return; }
  const button = e.target.closest('button'); if (!button || button.disabled) return;
  const d = button.dataset;
  if (d.action) await call(d.action);
  else if (d.openLibrary) { libraryOpenKind = d.openLibrary; $('#library-open-form').classList.remove('hidden'); $('#library-open-label').textContent = libraryOpenKind === 'html' ? 'Open HTML with SWF' : 'Open a SWF'; $('#library-open-address').placeholder = libraryOpenKind === 'html' ? 'https://example.com/page.html or C:\\Sites\\page.html' : 'https://example.com/movie.swf or C:\\Movies\\movie.swf'; $('#library-open-address').focus(); }
  else if (d.panel) await call('panel', { name: d.panel });
  else if (d.tab) await call('select-tab', { id: d.tab });
  else if (d.closeTab) await call('close-tab', { id: d.closeTab });
  else if (d.url) await call('navigate', { value: d.url });
  else if (d.library) await call('play-library', { id: d.library });
  else if (d.removeLibrary) await call('remove-library', { id: d.removeLibrary });
  else if (d.libraryImage) await call('library-image', { id: d.libraryImage });
  else if (d.removeLibraryImage) await call('library-image-remove', { id: d.removeLibraryImage });
  else if (d.removeBookmark) await call('remove-bookmark', { id: d.removeBookmark });
  else if (d.downloadOpen) await call('download-open', { id: d.downloadOpen });
  else if (d.downloadReveal) await call('download-reveal', { id: d.downloadReveal });
  else if (d.downloadCancel) await call('download-cancel', { id: d.downloadCancel });
  else if (d.zoom) await call('zoom', { direction: Number(d.zoom) });
});
document.addEventListener('contextmenu', event => {
  const tab = event.target.closest('[data-collection="tabs"]');
  if (!tab) return;
  event.preventDefault();
  call('tab-menu', { id: tab.dataset.reorderId, x: event.clientX, y: event.clientY });
});
function clearDropIndicators() { document.querySelectorAll('.drop-before,.drop-after').forEach(row => row.classList.remove('drop-before', 'drop-after')); }
function finishDragging() { dragging = null; clearDropIndicators(); document.querySelectorAll('.dragging').forEach(row => row.classList.remove('dragging')); }
document.addEventListener('dragstart', event => {
  const row = event.target.closest('[data-reorder-id]'); if (!row) return;
  dragging = { collection: row.dataset.collection, id: row.dataset.reorderId };
  event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragging.id);
  row.classList.add('dragging');
});
document.addEventListener('dragover', event => {
  const row = event.target.closest('[data-reorder-id]');
  if (!dragging || !row || row.dataset.collection !== dragging.collection) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'move'; clearDropIndicators();
  if (row.dataset.reorderId !== dragging.id) {
    const rect = row.getBoundingClientRect();
    row.classList.add(event.clientY < rect.y + rect.height / 2 ? 'drop-before' : 'drop-after');
  }
});
document.addEventListener('drop', event => {
  const row = event.target.closest('[data-reorder-id]');
  if (!dragging || !row || row.dataset.collection !== dragging.collection) return;
  event.preventDefault();
  const move = { ...dragging, targetId: row.dataset.reorderId, position: row.classList.contains('drop-after') ? 'after' : 'before' };
  finishDragging(); call('reorder', move);
});
document.addEventListener('dragend', () => { finishDragging(); if (state) render(state); });
document.addEventListener('keydown', event => {
  if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const row = event.target.closest('[data-reorder-id]'); if (!row) return;
  event.preventDefault();
  const items = state[row.dataset.collection], index = items.findIndex(item => item.id === row.dataset.reorderId);
  const target = items[index + (event.key === 'ArrowUp' ? -1 : 1)]; if (!target) return;
  call('reorder', { collection: row.dataset.collection, id: row.dataset.reorderId, targetId: target.id, position: event.key === 'ArrowUp' ? 'before' : 'after' }).then(() => {
    document.querySelector(`[data-reorder-id="${row.dataset.reorderId}"] button`)?.focus();
  });
});
function bindPredictiveField(input, container, { selectOnFocus = false, library = false } = {}) {
  const controller = { input, typed: input.value, inline: null, timer: null, revision: 0 };
  predictiveFields.set(input.id, controller);
  input.setAttribute('aria-autocomplete', 'both'); input.setAttribute('aria-expanded', 'false');
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-haspopup', 'listbox');
  controller.submit = () => {
    clearTimeout(controller.timer); controller.revision++;
    const data = state?.suggestions;
    const selected = data?.field === input.id && data.query === controller.typed && (!library || data.libraryKind === libraryOpenKind) ? data.selected : -1;
    if (selected >= 0) call('suggest-open', { index: selected });
    else {
      const value = controller.inline?.value === input.value ? controller.inline.url : input.value.trim();
      call(library ? 'add-library-source' : 'navigate', library ? { kind: libraryOpenKind, value } : { value });
    }
    controller.inline = null; input.blur();
  };
  input.addEventListener('focus', () => { activePrediction = controller; controller.typed = input.value; if (selectOnFocus) input.select(); });
  input.addEventListener('input', event => {
    controller.typed = input.value; controller.inline = null; clearTimeout(controller.timer);
    const revision = ++controller.revision, query = controller.typed;
    if (event.isComposing) return;
    const inline = event.inputType === 'insertText' && !/\s/.test(query);
    if (!query.trim()) { call('suggest-close'); return; }
    controller.timer = setTimeout(async () => {
      if (!input.isConnected || document.activeElement !== input || revision !== controller.revision) return;
      const rect = container.getBoundingClientRect();
      const result = await window.browser.call('suggest', { query, field: input.id, libraryKind: libraryOpenKind, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
      if (!result.ok || document.activeElement !== input || revision !== controller.revision) return;
      render(result.state);
      const suggestion = result.state.suggestions?.items[0];
      if (inline && suggestion?.type === 'url') {
        let completion = suggestion.url;
        if (!/^https?:\/\//i.test(query)) completion = completion.replace(/^https?:\/\//, '');
        if (!/^www\./i.test(query) && !/^https?:\/\//i.test(query)) completion = completion.replace(/^www\./, '');
        if (completion.toLowerCase().startsWith(query.toLowerCase()) && completion.length > query.length) {
          controller.inline = { value: completion, url: suggestion.url };
          input.value = completion; input.setSelectionRange(query.length, completion.length);
        }
      }
    }, 100);
  });
  input.addEventListener('keydown', async event => {
    if (event.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); controller.submit(); return; }
    if (event.key === 'Escape') {
      event.preventDefault(); controller.inline = null; clearTimeout(controller.timer); controller.revision++;
      input.value = controller.typed; call('suggest-close'); return;
    }
    if (state?.suggestions?.field !== input.id || state.suggestions.query !== controller.typed) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); clearTimeout(controller.timer); controller.inline = null;
      const next = await call('suggest-select', { direction: event.key === 'ArrowDown' ? 1 : -1 });
      if (next?.suggestions?.field === input.id) input.value = next.suggestions.items[next.suggestions.selected]?.inputText || controller.typed;
    }
  });
  input.addEventListener('blur', () => {
    clearTimeout(controller.timer); controller.revision++;
    setTimeout(() => { if (document.activeElement !== input && state?.suggestions?.field === input.id) call('suggest-close'); }, 120);
  });
  return controller;
}
const addressPrediction = bindPredictiveField($('#address'), $('#address-form'), { selectOnFocus: true });
$('#address-form').addEventListener('submit', e => { e.preventDefault(); addressPrediction.submit(); });
$('#menu-button').addEventListener('click', () => call('menu'));
function find(next = false, forward = true) { call('find', { text: $('#find-input').value, next, forward }); }
$('#find-input').addEventListener('input', () => find());
$('#find-form').addEventListener('submit', e => { e.preventDefault(); find(true); });
$('#find-prev').addEventListener('click', () => find(true, false));
$('#find-close').addEventListener('click', () => { $('#find-form').classList.add('hidden'); call('find', { text: '' }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#find-form').classList.contains('hidden')) $('#find-close').click(); });
window.browser.onState(render);
window.browser.onNotice(toast);
window.browser.onFocusAddress(() => { $('#address').focus(); $('#address').select(); });
window.browser.onFind(result => {
  if (result.open) { $('#find-form').classList.remove('hidden'); $('#find-input').focus(); $('#find-input').select(); }
  else $('#find-count').textContent = `${result.activeMatchOrdinal} / ${result.matches}`;
});
call('state');
