'use strict';
let state, viewKey = '', filter = '', toastTimer;
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
function render(next) {
  state = next;
  document.body.classList.toggle('collapsed', state.collapsed);
  document.body.classList.toggle('fullscreen', state.fullscreen);
  const t = current();
  document.title = (t?.title || 'New tab') + ' · Flashborn';
  $('#tab-count').textContent = state.tabs.length;
  $('#tabs').innerHTML = state.tabs.map(tab => `<div class="tab ${tab.id === state.activeId && !state.panel ? 'active' : ''}" title="${escape(tab.url || 'New tab')}"><button class="tab-select" data-tab="${tab.id}" aria-label="Switch to ${escape(tab.title)}"><span class="tab-icon kind-${tab.kind}">${tab.loading ? '<span class="spinner"></span>' : tab.kind === 'flash' ? icon('flash') : tab.kind === 'home' ? icon('globe') : escape(tab.title.charAt(0).toUpperCase())}</span><span class="tab-title">${escape(tab.title)}</span></button><button class="tab-close" data-close-tab="${tab.id}" title="Close tab" aria-label="Close ${escape(tab.title)}">${icon('close')}</button></div>`).join('');
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
  $('#zoom-value').textContent = (t?.zoom || 100) + '%';
  const downloads = state.downloads.filter(d => d.state === 'progressing').length;
  $('#download-count').textContent = downloads || '';
  $('#flash-status').textContent = state.flashReady ? 'Flash ready' : state.settings.flashEnabled ? 'Player available' : 'Site Flash disabled';
  $('#flash-dot').style.background = state.flashReady ? '#94baa7' : '#b8a88a';
  $('#page-status').textContent = state.panel ? ({ library: 'Your Flash collection', bookmarks: 'Saved for later', history: 'Recently visited', downloads: 'Your downloads', settings: 'Make it yours', about: 'Flashborn ' + state.version }[state.panel]) : t?.loading ? 'Loading…' : t?.kind === 'home' ? 'Make yourself at home.' : t?.kind === 'flash' ? 'Flash player · Ruffle ' + state.ruffle : t?.url || '';
  $('#status-right').textContent = t?.audible ? (t.muted ? 'Audio muted' : 'Audio playing') : 'Chromium · Ruffle';
  const key = state.panel || (t?.error ? 'error:' + t.id + t.error : t?.kind === 'home' ? 'home' : 'web');
  if (key !== viewKey) { filter = ''; viewKey = key; renderContent(); }
  else if (state.panel && !['settings', 'about'].includes(state.panel)) renderList();
  else if (key === 'home') renderQuickLinks();
}
function home() {
  return `<section class="home"><div class="home-mark">${icon('flash')}<span>Your corner of the web</span></div><h1>Where would you like to go?</h1><p class="home-description">A fresh start. An old favorite. Something unexpected.</p><form id="home-search" class="search-box">${icon('search')}<input id="home-input" aria-label="Search the web" placeholder="Search the web or paste a link" spellcheck="false" autocomplete="off"><button class="search-submit" title="Go" aria-label="Go">${icon('arrow')}</button></form><div id="quick-links" class="quick-links"></div><div class="home-divider"></div><div class="home-bottom"><span class="flash-card-icon">${icon('flash')}</span><div class="flash-copy"><h2>Some things never get old.</h2><p>Your Flash games and movies, ready to play again.</p></div><button class="subtle-button" data-action="open-file">Open a SWF ${icon('forward')}</button></div><div class="home-footnote">${icon('lock')}Your history and bookmarks stay on this device.</div></section>`;
}
function renderQuickLinks() {
  const target = $('#quick-links'); if (!target) return;
  const defaults = [{ title: 'Wikipedia', url: 'https://www.wikipedia.org/' }, { title: 'Internet Archive', url: 'https://archive.org/' }, { title: 'Ruffle', url: 'https://ruffle.rs/' }];
  target.innerHTML = (state.bookmarks.length ? state.bookmarks.slice(0, 5) : defaults).map(b => `<button class="quick-link" data-url="${escape(b.url)}">${icon(state.bookmarks.length ? 'star' : 'globe')}${escape(b.title.slice(0, 24))}</button>`).join('');
}
function panelHeader(name, description, actions) {
  return `<section class="panel"><div class="panel-eyebrow">Your space</div><h1>${name}</h1><p class="description">${description}</p>${actions ? '<div class="panel-actions">' + actions + '</div>' : ''}<div id="item-list" class="item-list"></div></section>`;
}
function renderContent() {
  const t = current();
  let html = '';
  if (state.panel === 'library') html = panelHeader('Flash library', 'Keep the games and movies you love close. Open any SWF file to add it to your collection.', `<input class="filter-input" id="filter" placeholder="Find in your collection" aria-label="Filter Flash library"><button class="primary-button" data-action="open-file">${icon('plus')}Open a SWF</button>`);
  else if (state.panel === 'bookmarks') html = panelHeader('Bookmarks', 'Good places, saved for later. Press Ctrl+D on any page to bookmark it.', '<input class="filter-input" id="filter" placeholder="Find a bookmark" aria-label="Filter bookmarks">');
  else if (state.panel === 'history') html = panelHeader('History', 'Pick up where you left off.', '<input class="filter-input" id="filter" placeholder="Search history" aria-label="Filter history"><button class="secondary-button danger-button" id="clear-history">Clear history</button>');
  else if (state.panel === 'downloads') html = panelHeader('Downloads', 'Everything you have saved from the web.', '<span></span><button class="secondary-button" data-action="download-clear">Clear finished</button>');
  else if (state.panel === 'settings') html = settings();
  else if (state.panel === 'about') html = about();
  else if (t?.error) html = `<section class="error-page">${icon('globe')}<h1>This page couldn’t open.</h1><p>${escape(t.error)}</p><button class="primary-button" data-action="reload">${icon('reload')}Try again</button><code>${escape(t.url)}</code></section>`;
  else if (t?.kind === 'home') html = home();
  $('#content').innerHTML = html;
  renderQuickLinks(); renderList();
  if ($('#home-search')) $('#home-search').addEventListener('submit', e => { e.preventDefault(); call('navigate', { value: $('#home-input').value }); });
  if ($('#filter')) $('#filter').addEventListener('input', e => { filter = e.target.value.toLowerCase(); renderList(); });
  if ($('#search-engine')) $('#search-engine').addEventListener('change', e => call('settings', { searchEngine: e.target.value }));
  for (const setting of ['restoreTabs', 'flashEnabled']) if ($(`#${setting}`)) $(`#${setting}`).addEventListener('change', e => { call('settings', { [setting]: e.target.checked }); if (setting === 'flashEnabled') toast('Reload open websites to apply the Flash setting.'); });
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
  const container = $('#item-list'); if (!container) return;
  const p = state.panel; const collection = p === 'library' ? state.library : state[p] || [];
  const items = collection.filter(e => !filter || `${e.title || e.filename || ''} ${e.url || e.path || ''}`.toLowerCase().includes(filter));
  if (!items.length) {
    container.innerHTML = filter ? empty('search', 'Nothing here yet.', 'Try a different search.') : ({ library: empty('flash', 'Your favorites live here.', 'Open a .swf file from your computer to get started.<br>Original files stay right where you put them.', `<button class="primary-button" data-action="open-file">${icon('folder')}Open a Flash file</button>`), bookmarks: empty('star', 'A place for good finds.', 'Bookmark a page with the star in the address bar.'), history: empty('history', 'A clean slate.', 'The websites you visit will appear here.'), downloads: empty('download', 'All caught up.', 'Downloads from websites will appear here.') }[p] || '');
    return;
  }
  container.innerHTML = items.map(item => {
    let title = item.title || item.filename, detail = item.url || item.path || '', actions = '', name = p === 'library' ? 'flash' : p === 'bookmarks' ? 'star' : p === 'history' ? 'history' : 'download', open;
    if (p === 'library') { open = `data-library="${item.id}"`; detail = item.path; actions = `<button class="icon-button" data-library="${item.id}" title="Play" aria-label="Play ${escape(title)}">${icon('play')}</button><button class="icon-button" data-remove-library="${item.id}" title="Remove from library" aria-label="Remove from library">${icon('close')}</button>`; }
    else if (p === 'bookmarks') { open = `data-url="${escape(item.url)}"`; actions = `<button class="icon-button" data-remove-bookmark="${item.id}" title="Remove bookmark" aria-label="Remove bookmark">${icon('close')}</button>`; }
    else if (p === 'history') { open = `data-url="${escape(item.url)}"`; detail = date(item.visitedAt) + ' · ' + item.url; }
    else {
      open = `data-download-open="${item.id}"`; detail = `${size(item.received)}${item.total ? ' / ' + size(item.total) : ''} · ${item.state === 'completed' ? 'Saved' : item.state === 'progressing' ? 'Downloading' : item.state === 'cancelled' ? 'Cancelled' : 'Interrupted'}`;
      actions = item.state === 'progressing' ? `<button class="icon-button" data-download-cancel="${item.id}" title="Cancel download" aria-label="Cancel download">${icon('close')}</button>` : item.state === 'completed' ? `<button class="icon-button" data-download-reveal="${item.id}" title="Show in folder" aria-label="Show in folder">${icon('folder')}</button>` : '';
    }
    return `<article class="list-item"><span class="item-icon">${icon(name)}</span><div class="item-copy"><button class="item-title" ${open}>${escape(title)}</button><p class="item-detail" title="${escape(item.path || item.url || '')}">${escape(detail)}</p>${p === 'downloads' && item.state === 'progressing' ? `<div class="progress"><span style="--progress:${item.total ? Math.min(100, Math.round(item.received / item.total * 100)) : 15}%"></span></div>` : ''}</div><div class="item-actions">${actions}</div></article>`;
  }).join('');
}
function settings() {
  const s = state.settings;
  return `<section class="panel"><div class="panel-eyebrow">Make it yours</div><h1>Settings</h1><p class="description">Just the essentials. Settle in.</p><div class="setting-heading">Browsing</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Search engine</h2><p>Used when you type a search in the address bar.</p></div><select id="search-engine" aria-label="Search engine">${[['duckduckgo','DuckDuckGo'],['google','Google'],['bing','Bing']].map(([id,label])=>`<option value="${id}" ${s.searchEngine===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="setting-row"><div class="setting-copy"><h2>Restore tabs on startup</h2><p>Reopen your previous websites when you return.</p></div><label class="switch"><input id="restoreTabs" type="checkbox" ${s.restoreTabs?'checked':''} aria-label="Restore tabs on startup"><span></span></label></div></div><div class="setting-heading">Flash</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Play embedded Flash on websites</h2><p>Ruffle automatically replaces supported Flash content.<br>Reload websites after changing this. Local SWF files always work.</p></div><label class="switch"><input id="flashEnabled" type="checkbox" ${s.flashEnabled?'checked':''} aria-label="Play embedded Flash"><span></span></label></div></div><div class="setting-heading">Privacy</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Cookies and cached files</h2><p>Clear site data and sign out of websites.<br>Your bookmarks and Flash library are kept.</p></div><button id="clear-data" class="secondary-button danger-button">Clear site data</button></div><div class="setting-row"><div class="setting-copy"><h2>Browsing history</h2><p>Keep your saved favorites. Clear your recent visits.</p></div><button id="clear-history" class="secondary-button danger-button">Clear history</button></div></div><p class="about-note">Ctrl+L address · Ctrl+T new tab · Ctrl+W close tab · Ctrl+Shift+T reopen tab<br>Ctrl+O open SWF · Ctrl+F find · Ctrl+D bookmark · F11 full screen</p></section>`;
}
function about() {
  return `<section class="panel"><div class="about-mark">${icon('flash')}</div><h1>Flashborn<span class="brand-dot">.</span></h1><p class="description">A quieter kind of browsing. A second life for Flash.</p><dl class="about-detail"><dt>Version</dt><dd>${escape(state.version)}</dd><dt>Browser engine</dt><dd>Chromium ${escape(state.chromium)}</dd><dt>Flash engine</dt><dd>Ruffle ${escape(state.ruffle)}</dd><dt>Platform</dt><dd>Windows · 64-bit</dd><dt>Site Flash support</dt><dd>${state.flashReady ? 'Ready' : state.extensionError ? escape(state.extensionError) : 'Disabled in settings'}</dd></dl><div class="about-links"><button class="secondary-button" data-url="https://ruffle.rs/compatibility">Flash compatibility ${icon('forward')}</button><button class="secondary-button" data-url="https://ruffle.rs/">Ruffle project ${icon('forward')}</button></div><p class="about-note">Flashborn uses the open source Ruffle emulator. Flash compatibility varies by game and movie. This app does not include Adobe Flash Player. Websites requiring DRM video or Chrome-specific extensions may have limited support.</p></section>`;
}
document.addEventListener('click', async e => {
  const button = e.target.closest('button'); if (!button || button.disabled) return;
  const d = button.dataset;
  if (d.action) { $('#menu').classList.add('hidden'); await call(d.action); }
  else if (d.panel) { $('#menu').classList.add('hidden'); await call('panel', { name: d.panel }); }
  else if (d.tab) await call('select-tab', { id: d.tab });
  else if (d.closeTab) await call('close-tab', { id: d.closeTab });
  else if (d.url) await call('navigate', { value: d.url });
  else if (d.library) await call('play-library', { id: d.library });
  else if (d.removeLibrary) await call('remove-library', { id: d.removeLibrary });
  else if (d.removeBookmark) await call('remove-bookmark', { id: d.removeBookmark });
  else if (d.downloadOpen) await call('download-open', { id: d.downloadOpen });
  else if (d.downloadReveal) await call('download-reveal', { id: d.downloadReveal });
  else if (d.downloadCancel) await call('download-cancel', { id: d.downloadCancel });
  else if (d.zoom) await call('zoom', { direction: Number(d.zoom) });
});
$('#address-form').addEventListener('submit', e => { e.preventDefault(); $('#address').blur(); call('navigate', { value: $('#address').value }); });
$('#address').addEventListener('focus', e => e.target.select());
$('#menu-button').addEventListener('click', e => { e.stopPropagation(); $('#menu').classList.toggle('hidden'); });
document.addEventListener('click', e => { if (!e.target.closest('#menu') && !e.target.closest('#menu-button')) $('#menu').classList.add('hidden'); });
function find(next = false, forward = true) { call('find', { text: $('#find-input').value, next, forward }); }
$('#find-input').addEventListener('input', () => find());
$('#find-form').addEventListener('submit', e => { e.preventDefault(); find(true); });
$('#find-prev').addEventListener('click', () => find(true, false));
$('#find-close').addEventListener('click', () => { $('#find-form').classList.add('hidden'); call('find', { text: '' }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#menu').classList.add('hidden'); if (!$('#find-form').classList.contains('hidden')) $('#find-close').click(); } });
window.browser.onState(render);
window.browser.onFocusAddress(() => { $('#address').focus(); $('#address').select(); });
window.browser.onFind(result => {
  if (result.open) { $('#find-form').classList.remove('hidden'); $('#find-input').focus(); $('#find-input').select(); }
  else $('#find-count').textContent = `${result.activeMatchOrdinal} / ${result.matches}`;
});
call('state');
