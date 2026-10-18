'use strict';
let state, viewKey = '', filter = '', toastTimer;
let aboutBolt, homeBolt;
let dragging = null;
let editingLibraryId = null;
const predictiveFields = new Map();
let activePrediction = null;
let tabRenderKey = '', listRenderKey = '';
const tabMemory = new Map();
const memoryRequests = new Map();
let hoveredTab = null, tabHoverRevision = 0;
let summaryRenderKey = '';
let summaryFrame = 0, summaryTargetHeight = 0, summaryVisibleStamp = '';
const revealDuration = 190;
let sidebarFrame = 0, sidebarWidth = 248, lastCollapsed;
const libraryOpenKind = 'html';
const $ = selector => document.querySelector(selector);
const sidebarToggle = $('[data-action="collapse"]');
let sidebarHovered = false, sidebarPreviewLatched = false;
function renderSidebarIcon() {
  const collapsed = !!state?.collapsed;
  const preview = sidebarHovered && !sidebarPreviewLatched;
  sidebarToggle.dataset.divider = (preview ? !collapsed : collapsed) ? 'left' : 'right';
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
}
sidebarToggle.addEventListener('pointerenter', () => {
  sidebarHovered = true; sidebarPreviewLatched = false; renderSidebarIcon();
});
sidebarToggle.addEventListener('pointerleave', () => {
  sidebarHovered = false; sidebarPreviewLatched = false; renderSidebarIcon();
});
sidebarToggle.addEventListener('pointercancel', () => {
  sidebarHovered = false; sidebarPreviewLatched = false; renderSidebarIcon();
});
sidebarToggle.addEventListener('click', () => { sidebarPreviewLatched = true; });
const themeToggle = $('#theme-button');
let themeHovered = false, themePreviewLatched = false;
function renderThemeIcon() {
  const light = state?.settings.theme === 'light';
  const preview = themeHovered && !themePreviewLatched;
  $('#theme-icon').style.transform = `rotate(${(preview ? !light : light) ? 180 : 0}deg)`;
  themeToggle.setAttribute('aria-pressed', String(light));
}
themeToggle.addEventListener('pointerenter', () => {
  themeHovered = true; themePreviewLatched = false; renderThemeIcon();
});
themeToggle.addEventListener('pointerleave', () => {
  themeHovered = false; themePreviewLatched = false; renderThemeIcon();
});
themeToggle.addEventListener('pointercancel', () => {
  themeHovered = false; themePreviewLatched = false; renderThemeIcon();
});
themeToggle.addEventListener('click', () => { themePreviewLatched = true; });
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
function headline(text, tag = 'h1') {
  return `<${tag} class="page-headline">${escape(text)}</${tag}>`;
}
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
function hideTabMemory() {
  hoveredTab?.classList.remove('show-memory');
  hoveredTab = null; tabHoverRevision++;
}
function showTabMemory(row, tab) {
  const mb = tabMemory.get(tab.id)?.megabytes;
  const visible = !state.collapsed && hoveredTab === row && Number.isFinite(mb);
  row.querySelector('.tab-memory').textContent = visible ? mb + ' MB' : '';
  row.classList.toggle('show-memory', visible);
}
async function measureTab(event) {
  const row = event.target.closest('.tab');
  if (!row || state.collapsed || row.contains(event.relatedTarget) || dragging || hoveredTab === row) return;
  const id = row.dataset.reorderId, tab = state?.tabs.find(t => t.id === id);
  if (!tab) return;
  hoveredTab = row;
  const revision = ++tabHoverRevision;
  showTabMemory(row, tab);
  const cached = tabMemory.get(id);
  if (!cached || cached.page !== memoryKey(tab) || Date.now() - cached.measuredAt > 2000) {
    if (!memoryRequests.has(id)) {
      const page = memoryKey(tab);
      const request = window.browser.call('tab-memory', { id }).then(result => {
        const currentTab = state?.tabs.find(t => t.id === id);
        if (result.ok && result.state.tabMemory.id === id && memoryKey(currentTab) === page) {
          tabMemory.set(id, { ...result.state.tabMemory, page, measuredAt: Date.now() });
        }
      }).catch(() => {}).finally(() => memoryRequests.delete(id));
      memoryRequests.set(id, request);
    }
    await memoryRequests.get(id);
  }
  if (revision === tabHoverRevision && hoveredTab === row && row.isConnected) showTabMemory(row, tab);
}
document.getElementById('tabs').addEventListener('pointerover', measureTab);
document.getElementById('tabs').addEventListener('pointermove', measureTab);
document.getElementById('tabs').addEventListener('pointerout', event => {
  if (hoveredTab && !hoveredTab.contains(event.relatedTarget)) hideTabMemory();
});
document.getElementById('tabs').addEventListener('pointerleave', hideTabMemory);
document.getElementById('tabs').addEventListener('scroll', hideTabMemory);
window.addEventListener('blur', hideTabMemory);
const loadingBolt = new GoldLightning(document.getElementById('loading-bolt'));
const boltRevisions = new Map();
const titleBolt = new GoldLightning(document.getElementById('title-bolt'));
const navigationIcons = [...document.querySelectorAll('[data-nav-icon]')].map(canvas => new GoldNavigation(canvas));
function renderSummary() {
  const section = $('#page-summary'), summary = state.pageSummary;
  const visible = !!summary && !state.panel && !state.fullscreen && !current()?.error;
  section.classList.toggle('hidden', !visible);
  if (!visible) {
    cancelAnimationFrame(summaryFrame); summaryFrame = 0; summaryTargetHeight = 0; summaryVisibleStamp = '';
    section.style.height = '0px'; section.classList.remove('summary-settled'); summaryRenderKey = '';
    document.documentElement.style.setProperty('--summary-height', '0px'); return;
  }
  const stamp = state.activeId + '|' + summary.url, reveal = summaryVisibleStamp !== stamp;
  summaryVisibleStamp = stamp;
  const left = Math.max(16, Math.min(innerWidth - (state.collapsed ? 68 : 248) - 220, summary.layout?.left || 40));
  section.style.setProperty('--summary-left', left + 'px');
  section.style.setProperty('--summary-width', (summary.layout?.width || 760) + 'px');
  const key = JSON.stringify([state.activeId, summary]);
  if (key !== summaryRenderKey) {
    summaryRenderKey = key;
    const numbers = new Map(summary.sources.map((source, i) => [source.index, i + 1]));
    const passages = summary.passages.map(item => escape(item.text) + '<sup>' + numbers.get(item.source) + '</sup>');
    $('#summary-inner').innerHTML = '<div class="summary-heading">Search summary</div><div class="summary-text"><p>' + passages[0] + '</p>' + (passages.length > 1 ? '<ul>' + passages.slice(1).map(text => '<li>' + text + '</li>').join('') + '</ul>' : '') + '</div><div class="summary-sources"><span>From these results</span>' + summary.sources.map(source => '<a data-browser-url href="' + escape(source.url) + '" title="' + escape(source.title) + '">' + numbers.get(source.index) + ' · ' + escape(source.domain) + '</a>').join('') + '</div>';
  }
  measureSummary(reveal);
}
function setSummaryHeight(height) {
  const section = $('#page-summary');
  section.style.height = height + 'px';
  document.documentElement.style.setProperty('--summary-height', height + 'px');
  const stamp = state.activeId + '|' + state.pageSummary.url + '|' + height;
  if (section.dataset.measure !== stamp) {
    section.dataset.measure = stamp;
    window.browser.call('summary-height', { id: state.activeId, url: state.pageSummary.url, height }).catch(() => {});
  }
}
function measureSummary(animate = false) {
  const section = $('#page-summary');
  if (!state?.pageSummary || state.panel || state.fullscreen || section.classList.contains('hidden')) return;
  const height = Math.min(Math.max(120, innerHeight - 300), Math.ceil($('#summary-inner').getBoundingClientRect().height) + 1);
  if (summaryFrame && height === summaryTargetHeight) return;
  cancelAnimationFrame(summaryFrame); summaryFrame = 0; summaryTargetHeight = height;
  if (!animate || matchMedia('(prefers-reduced-motion:reduce)').matches) { setSummaryHeight(height); section.classList.add('summary-settled'); return; }
  const started = performance.now(), stamp = summaryVisibleStamp;
  section.classList.remove('summary-settled');
  setSummaryHeight(0);
  const step = now => {
    if (summaryVisibleStamp !== stamp || !state.pageSummary || state.panel || state.fullscreen) { summaryFrame = 0; return; }
    const progress = Math.min(1, (now - started) / revealDuration);
    setSummaryHeight(Math.round(height * (1 - Math.pow(1 - progress, 3))));
    summaryFrame = progress < 1 ? requestAnimationFrame(step) : 0;
    if (progress === 1) section.classList.add('summary-settled');
  };
  summaryFrame = requestAnimationFrame(step);
}
new ResizeObserver(() => measureSummary()).observe($('#summary-inner'));
function renderSidebar() {
  const target = state.collapsed ? 68 : 248;
  if (lastCollapsed === state.collapsed) return;
  cancelAnimationFrame(sidebarFrame); sidebarFrame = 0;
  const initial = lastCollapsed === undefined;
  lastCollapsed = state.collapsed;
  const apply = width => {
    sidebarWidth = Math.round(width);
    document.body.style.setProperty('--sidebar-width', sidebarWidth + 'px');
    document.body.style.setProperty('--sidebar-reveal', Math.max(0, Math.min(1, (width - 100) / 148)));
    window.browser.call('sidebar-width', { width: sidebarWidth }).catch(() => {});
  };
  if (initial || matchMedia('(prefers-reduced-motion:reduce)').matches) { document.body.classList.remove('sidebar-animating'); apply(target); return; }
  const from = sidebarWidth, started = performance.now();
  document.body.classList.add('sidebar-animating');
  const step = now => {
    const progress = Math.min(1, (now - started) / revealDuration);
    apply(from + (target - from) * (1 - Math.pow(1 - progress, 3)));
    sidebarFrame = progress < 1 ? requestAnimationFrame(step) : 0;
    if (progress === 1) document.body.classList.remove('sidebar-animating');
  };
  sidebarFrame = requestAnimationFrame(step);
}
function render(next) {
  state = next;
  for (const [id, measured] of tabMemory) if (measured.page !== memoryKey(state.tabs.find(t => t.id === id))) tabMemory.delete(id);
  document.body.classList.toggle('collapsed', state.collapsed);
  renderSidebarIcon();
  if (state.collapsed) hideTabMemory();
  renderSidebar();
  document.body.classList.toggle('fullscreen', state.fullscreen);
  const theme = state.settings.theme || 'current';
  document.body.dataset.theme = theme;
  [loadingBolt, titleBolt, homeBolt, aboutBolt].filter(Boolean).forEach(bolt => bolt.setTheme(theme));
  navigationIcons.forEach(item => item.setTheme(theme));
  renderThemeIcon();
  $('#theme-button').title = `Theme: ${theme === 'current' ? 'dark grey' : theme === 'light' ? 'light grey' : 'dark'} — click to change`;
  $('#theme-button').setAttribute('aria-label', $('#theme-button').title);
  const t = current();
  renderSummary();
  document.body.classList.toggle('flashcognito', !!t?.private);
  navigationIcons.filter(item => ['history', 'downloads'].includes(item.kind)).forEach(item => item.setMetal(t?.private ? 'silver' : 'gold'));
  loadingBolt.setMetal(t?.private ? 'silver' : 'gold');
  loadingBolt.setOutlined(!t?.flashDetected);
  titleBolt.setMetal(t?.private ? 'silver' : 'gold');
  $('#private-badge').classList.toggle('hidden', !t?.private);
  loadingBolt.setLoading(!!t?.loading, t?.id);
  if ((t?.boltRevision || 0) > (boltRevisions.get(t?.id) || 0)) loadingBolt.spinOnce();
  if (t) boltRevisions.set(t.id, t.boltRevision || 0);
  for (const id of boltRevisions.keys()) if (!state.tabs.some(tab => tab.id === id)) boltRevisions.delete(id);
  document.title = (t?.title || 'New tab') + ' · Flashborn';
  $('#tab-count').textContent = state.tabs.length;
  $('#tab-count').title = `${state.tabs.length} open tabs`;
  const nextTabKey = JSON.stringify([state.tabs, state.activeId, state.panel]);
  if (!dragging && nextTabKey !== tabRenderKey) {
    hideTabMemory();
    tabRenderKey = nextTabKey;
    $('#tabs').innerHTML = state.tabs.map(tab => `<div class="tab ${tab.private ? 'private-tab' : ''} ${tab.id === state.activeId && !state.panel ? 'active' : ''}" draggable="true" data-collection="tabs" data-reorder-id="${tab.id}"><button class="tab-select" data-tab="${tab.id}" aria-label="Switch to ${escape(tab.title)}${tab.private ? ' (Flashcognito)' : ''}" aria-description="Drag to reorder, or press Alt and Up or Down. Right-click to duplicate or close."><span class="tab-icon kind-${tab.kind}">${tab.loading ? '<span class="spinner"></span>' : tab.private ? icon('lock') : tab.kind === 'home' ? icon('globe') : escape(tab.title.charAt(0).toUpperCase())}</span><span class="tab-title">${escape(tab.title)}</span><span class="tab-memory" aria-hidden="true"></span></button><button class="tab-close" data-close-tab="${tab.id}" aria-label="Close ${escape(tab.title)}">${icon('close')}</button></div>`).join('');
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
  $('#address-icon').innerHTML = `<use href="#i-${t?.url.startsWith('https:') ? 'lock' : t?.url ? 'globe' : 'search'}"/>`;
  $('#native-mode').disabled = false;
  $('#native-mode').classList.toggle('native-active', !!t?.flashDetected);
  $('#native-mode').setAttribute('aria-pressed', String(!!t?.flashDetected));
  $('#native-mode').title = t?.flashDetected ? 'Flash toggle: Flash detected. Click to reload the player.' : 'Flash toggle: check this page for Flash.';
  $('#native-mode').setAttribute('aria-label', $('#native-mode').title);
  $('#menu-button').setAttribute('aria-expanded', String(state.menuOpen));
  for (const [id, controller] of predictiveFields) controller.input.setAttribute('aria-expanded', String(state.suggestions?.field === id));
  const downloads = state.downloads.filter(d => d.state === 'progressing').length;
  $('#download-count').textContent = downloads || '';
  const newDownloads = state.downloads.some(d => d.state === 'completed' && d.isNew);
  $('#download-new').classList.toggle('hidden', !newDownloads);
  $('.sidebar [data-panel="downloads"]').setAttribute('aria-label', newDownloads ? 'Downloads — new completed downloads' : 'Downloads');
  $('#page-status').textContent = state.panel ? ({ library: 'Your Flash collection', bookmarks: 'Saved for later', history: 'Recently visited', downloads: 'Your downloads', extensions: 'Extensions', settings: 'Settings', about: 'Flashborn ' + state.version }[state.panel]) : t?.loading ? 'Loading…' : t?.kind === 'home' ? 'Make yourself at home.' : t?.url || '';
  $('#status-right').textContent = t?.private ? 'Flashcognito · temporary session' : t?.audible ? (t.muted ? 'Audio muted' : 'Audio playing') : t?.native ? 'Native Adobe Flash' : 'Chromium · Adobe Flash';
  const key = state.panel ? state.panel + (state.panelSection ? ':' + state.panelSection : '') + (t?.private ? ':private' : '') : (t?.error ? 'error:' + t.id + t.error : t?.kind === 'home' ? t.private ? 'private-home' : 'home' : 'web');
  if (key !== viewKey) { filter = ''; viewKey = key; renderContent(); }
  else if (state.panel && !['settings', 'about'].includes(state.panel)) renderList();
  else if (key === 'home' || key === 'private-home') renderQuickLinks();
  FlashbornSupport.refresh(state);
}
function home() {
  const privateMode = !!current()?.private;
  return `<section class="home${privateMode ? ' flashcognito-home' : ''}">${headline(privateMode ? 'A little more private.' : 'Where would you like to go?')}<p class="home-description">${privateMode ? 'A fresh session. No saved browsing trail.' : 'A fresh start. An old favorite. Something unexpected.'}</p><form id="home-search" class="search-box">${icon('search')}<input id="home-input" aria-label="${privateMode ? 'Search the web privately' : 'Search the web'}" placeholder="Search the web or paste a link" spellcheck="false" autocomplete="off"><button class="search-submit" title="Go" aria-label="Go">${icon('arrow')}</button></form><div id="quick-links" class="quick-links"></div><div class="home-divider"></div><div class="home-bottom"><button class="flash-library-link" data-panel="library"><span class="flash-card-icon"><canvas id="home-bolt" width="128" height="128" role="img" aria-label="${privateMode ? 'Silver' : 'Gold'} lightning bolt"></canvas></span><span class="flash-copy"><span class="flash-card-title">${privateMode ? 'Old favorites are still welcome.' : 'Some things never get old.'}</span><span class="flash-card-description">${privateMode ? 'Open your Flash library.' : 'Your favorite Flash websites, ready to explore again.'}</span></span></button></div><div class="home-footnote">${icon('lock')}${privateMode ? 'Bookmarks and downloaded files you keep remain on your device.<br>Flashcognito doesn’t hide your activity from websites or your network.' : 'Your history and bookmarks stay on this device.'}</div></section>`;
}
function renderQuickLinks() {
  const target = $('#quick-links'); if (!target) return;
  const defaults = [{ title: 'Wikipedia', url: 'https://www.wikipedia.org/' }, { title: 'Internet Archive', url: 'https://archive.org/' }, { title: 'Flash Browser', url: 'https://flash.pm/' }];
  target.innerHTML = (state.bookmarks.length ? state.bookmarks.slice(0, 5) : defaults).map(b => `<button class="quick-link" data-url="${escape(b.url)}">${icon(state.bookmarks.length ? 'star' : 'globe')}${escape(b.title.slice(0, 24))}</button>`).join('');
}
function panelHeader(name, description, actions) {
  const subdued = current()?.private && ['history', 'downloads'].includes(state.panel);
  return `<section class="panel${subdued ? ' flashcognito-panel' : ''}" data-kind="${state.panel}">${headline(name)}<p class="description">${description}</p>${actions ? '<div class="panel-actions">' + actions + '</div>' : ''}<div id="item-list" class="item-list"></div></section>`;
}
function renderContent() {
  editingLibraryId = null;
  listRenderKey = '';
  for (const [id, controller] of predictiveFields) if (id !== 'address') { clearTimeout(controller.timer); predictiveFields.delete(id); }
  if (activePrediction?.input.id !== 'address') activePrediction = null;
  if (aboutBolt) { aboutBolt.dispose(); aboutBolt = null; }
  if (homeBolt) { homeBolt.dispose(); homeBolt = null; }
  const t = current();
  let html = '';
  if (state.panel === 'library') html = panelHeader('Flash library', 'Your Flash websites and HTML pages, from local files or the web.', `<input class="filter-input" id="filter" placeholder="Find in your collection" aria-label="Filter Flash library"><div class="library-open-buttons"><button class="secondary-button" data-action="library-folder" title="Open the local Flash Library folder">${icon('folder')}Library folder</button><button class="primary-button" data-open-library="html">${icon('plus')}Add a Flash page</button></div><form id="library-open-form" class="library-open-form hidden"><label id="library-open-label" for="library-open-address">Open a website or HTML file</label><div><input id="library-open-address" placeholder="Web URL or local file path" aria-label="Flash URL or local file path" spellcheck="false" autocomplete="off"><button type="button" class="secondary-button" id="library-browse">Browse…</button><button class="primary-button" type="submit">Add</button></div></form>`);
  else if (state.panel === 'bookmarks') html = panelHeader('Bookmarks', 'Good places, saved for later. Press Ctrl+D on any page to bookmark it.', '<input class="filter-input" id="filter" placeholder="Find a bookmark" aria-label="Filter bookmarks">');
  else if (state.panel === 'history') html = panelHeader('History', t?.private ? 'Flashcognito doesn’t save your browsing history.' : 'Pick up where you left off.', t?.private ? '' : '<input class="filter-input" id="filter" placeholder="Search history" aria-label="Filter history"><button class="secondary-button danger-button" id="clear-history">Clear history</button>');
  else if (state.panel === 'downloads') html = panelHeader('Downloads', t?.private ? 'Downloads from this Flashcognito session. Saved files remain after these tabs close.' : 'Everything you have saved from the web.', '<span></span><button class="secondary-button" data-action="download-clear">Clear finished</button>');
  else if (state.panel === 'extensions') html = panelHeader('Extensions', 'A little extra, when you need it.', '<p class="extensions-support">Compatible Chrome extensions run in regular modern tabs. Extensions are off in Flashcognito and the separate Flash engine. Load an unpacked extension folder to add your own; Chrome Web Store installation and some Chrome APIs are not supported.</p><button class="secondary-button" data-action="extension-install">'+icon('plus')+'Load unpacked…</button>');
  else if (state.panel === 'settings') html = settings();
  else if (state.panel === 'about') html = about();
  else if (t?.error) html = `<section class="error-page">${icon('globe')}${headline('This page couldn’t open.')}<p>${escape(t.error)}</p><button class="primary-button" data-action="reload">${icon('reload')}Try again</button><code>${escape(t.url)}</code></section>`;
  else if (t?.kind === 'home') html = home();
  $('#content').innerHTML = html;
  FlashbornSupport.refresh(state);
  if (state.panel === 'settings' && state.panelSection === 'privacy') $('#privacy')?.scrollIntoView({ block: 'start' });
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
  const deletionForm = $('#delete-data-form');
  if (deletionForm) {
    const button = $('#delete-data');
    deletionForm.addEventListener('change', () => { button.disabled = !deletionForm.querySelector('input:checked:not(:disabled)'); });
    deletionForm.addEventListener('submit', async event => {
      event.preventDefault();
      const choices = Object.fromEntries(['history', 'cookies', 'cache'].map(name => [name, deletionForm.elements[name].checked && !deletionForm.elements[name].disabled]));
      if (!Object.values(choices).some(Boolean)) return;
      button.disabled = true; button.textContent = 'Deleting…';
      const result = await call('delete-browsing-data', choices);
      if (result) $('#delete-data-status').textContent = 'Selected browsing data deleted.';
      button.disabled = false; button.textContent = 'Delete data';
    });
  }
}
const confirmations = new Map();
function confirmAction(action, message, args = {}) {
  const key = action + JSON.stringify(args);
  if ((confirmations.get(key) || 0) > Date.now()) { confirmations.delete(key); call(action, args); }
  else { confirmations.set(key, Date.now() + 6000); toast(message); }
}
function empty(name, title, description, button = '') { return `<div class="empty">${icon(name)}${title ? headline(title, 'h2') : ''}<p>${description}</p>${button}</div>`; }
function renderList() {
  if (dragging) return;
  if (editingLibraryId && document.querySelector('.library-edit-form')) return;
  if (state.panel === 'extensions') { renderExtensions(); return; }
  const container = $('#item-list'); if (!container) return;
  const p = state.panel; const collection = p === 'library' ? state.library : state[p] || [];
    const items = collection.filter(e => !filter || `${e.title || e.filename || ''} ${e.url || e.path || ''}`.toLowerCase().includes(filter));
  const nextListKey = JSON.stringify([p, filter, items]);
  if (nextListKey === listRenderKey) return;
  listRenderKey = nextListKey;
  if (!items.length) {
    container.innerHTML = filter ? empty('search', 'Nothing here yet.', 'Try a different search.') : ({ library: empty('flash', 'Your favorites live here.', 'Add a website URL or a local HTML page containing Flash.', `<button class="primary-button" data-open-library="html">${icon('plus')}Add a Flash page</button>`), bookmarks: empty('star', 'A place for good finds.', 'Bookmark a page with the star in the address bar.'), history: empty('history', '', current()?.private ? 'Visits in Flashcognito aren’t recorded.' : 'The websites you visit will appear here.'), downloads: empty('download', '', 'Downloads from websites will appear here.') }[p] || '');
    return;
  }
  container.innerHTML = items.map(item => {
    let title = item.title || item.filename, detail = item.url || item.path || '', actions = '', name = p === 'library' ? 'flash' : p === 'bookmarks' ? 'star' : p === 'history' ? 'history' : 'download', open;
    if (p === 'library') { open = `data-library="${item.id}"`; detail = item.description || item.path || item.url; actions = `<button class="icon-button" data-edit-library="${item.id}" title="Edit title, small line and page address" aria-label="Edit ${escape(title)}">${icon('edit')}</button><button class="icon-button" data-library="${item.id}" title="Play" aria-label="Play ${escape(title)}">${icon('play')}</button><button class="icon-button" data-remove-library="${item.id}" title="Remove from library" aria-label="Remove from library">${icon('close')}</button>`; }
    else if (p === 'bookmarks') { open = `data-url="${escape(item.url)}"`; actions = `<button class="icon-button" data-remove-bookmark="${item.id}" title="Remove bookmark" aria-label="Remove bookmark">${icon('close')}</button>`; }
    else if (p === 'history') { open = `data-url="${escape(item.url)}"`; detail = date(item.visitedAt) + ' · ' + item.url; }
    else {
      open = `data-download-open="${item.id}"`; detail = `${size(item.received)}${item.total ? ' / ' + size(item.total) : ''} · ${item.state === 'completed' ? 'Saved' : item.state === 'progressing' ? 'Downloading' : item.state === 'cancelled' ? 'Cancelled' : 'Interrupted'}`;
      actions = item.state === 'progressing' ? `<button class="icon-button" data-download-cancel="${item.id}" title="Cancel download" aria-label="Cancel download">${icon('close')}</button>` : item.state === 'completed' ? `<button class="icon-button" data-download-reveal="${item.id}" title="Show in folder" aria-label="Show in folder">${icon('folder')}</button>` : '';
    }
    const reorder = ['library', 'downloads', 'bookmarks'].includes(p);
    const thumbnail = p === 'library' ? `<div class="library-art"><button class="library-thumbnail ${item.image ? 'has-image' : ''}" data-library-image="${item.id}" title="${item.image ? 'Change image' : 'Choose a 2:1 image or drop one here'}" aria-label="${item.image ? 'Change' : 'Choose'} image for ${escape(title)}">${item.image ? `<img src="/library-image/${item.id}?v=${escape(item.image)}" alt="" draggable="false">` : ''}<span class="thumbnail-plus">${icon('plus')}</span></button>${item.image ? `<button class="thumbnail-remove" data-remove-library-image="${item.id}" title="Remove image" aria-label="Remove image for ${escape(title)}">${icon('close')}</button>` : ''}</div>` : `<span class="item-icon">${icon(name)}</span>`;
    if (p === 'library' && item.id === editingLibraryId) return `<article class="list-item library-editing">${thumbnail}<form class="library-edit-form" data-library-edit="${item.id}"><label>Title<input name="title" value="${escape(title)}" maxlength="300" required></label><label>Year<input name="year" value="${escape(item.year || '')}" maxlength="40" placeholder="2001"></label><label>Description<textarea name="description" rows="3" placeholder="${escape(item.path || item.url)}" maxlength="4000">${escape(item.description || '')}</textarea></label><label>Website or local HTML file<input name="source" value="${escape(item.path || item.url)}" required></label><div><button class="secondary-button" type="submit">Save</button><button class="secondary-button" type="button" data-cancel-library-edit="${item.id}">Cancel</button></div></form></article>`;
    return `<article class="list-item" ${reorder ? `draggable="true" tabindex="0" aria-description="Drag to reorder, or press Alt and Up or Down" data-collection="${p}" data-reorder-id="${item.id}"` : ''}>${thumbnail}<div class="item-copy"><button class="item-title" ${open}>${escape(title)}</button>${p === 'library' ? `<button class="library-year" data-edit-library="${item.id}" title="Edit year" aria-label="Edit year for ${escape(title)}">${escape(item.year || '')}</button><button class="item-detail library-small-line" data-edit-library="${item.id}" title="Edit description">${escape(detail)}</button>` : `<p class="item-detail" title="${escape(item.path || item.url || '')}">${escape(detail)}</p>`}${p === 'downloads' && item.state === 'progressing' ? `<div class="progress"><span style="--progress:${item.total ? Math.min(100, Math.round(item.received / item.total * 100)) : 15}%"></span></div>` : ''}</div><div class="item-actions">${actions}</div></article>`;
  }).join('');
  if (p === 'library') for (const item of items) {
    const thumbnail = [...container.querySelectorAll('[data-library-image]')].find(el => el.dataset.libraryImage === item.id);
    if (thumbnail && /^oklch\(68% 0\.16 \d{1,3}\)$/.test(item.color || '')) thumbnail.style.backgroundColor = item.color;
  }
}
function renderExtensions() {
  const container = $('#item-list'); if (!container) return;
  const privateMode = !!current()?.private;
  const key = JSON.stringify([state.extensions, privateMode]); if (key === listRenderKey) return; listRenderKey = key;
  container.innerHTML = `<article class="extension-card flash-runtime-card"><div class="extension-heading"><span class="item-icon">${icon('flash')}</span><div class="item-copy"><h2>Adobe Flash Player</h2><p>${escape(state.flashVersion)} · Built in</p></div><label class="switch"><input type="checkbox" checked disabled aria-label="Adobe Flash Player is built in"><span></span></label></div><p class="extension-description">Original Adobe Flash playback in a separate browser engine. Use the lightning button to switch a website into Flash mode.</p><p class="extension-status">${state.flashReady ? 'Bundled and ready' : 'Runtime missing. Reinstall Flashborn.'}</p></article>` + state.extensions.map(item => `<article class="extension-card" data-extension="${escape(item.key)}"><div class="extension-heading"><span class="item-icon">${icon('extension')}</span><div class="item-copy"><h2>${escape(item.name)}</h2><p>${escape(item.version)}${item.bundled ? ' · Bundled · Adblock, Inc.' : ''}</p></div><label class="switch"><input type="checkbox" data-extension-toggle="${escape(item.key)}" ${item.enabled ? 'checked' : ''} aria-label="Enable ${escape(item.name)}"><span></span></label></div><p class="extension-description">${item.bundled ? 'The official AdBlock extension, with its original scripts, filters, options and site controls.' : escape(item.description)}</p><p class="extension-status${item.error ? ' extension-error' : ''}" role="status">${item.error ? escape(item.error) : !item.enabled ? 'Off' : privateMode ? 'Off in Flashcognito · enabled in regular tabs' : item.loaded ? 'Enabled in regular modern tabs' : 'Not loaded'}</p><div class="extension-actions">${item.popup ? `<button class="secondary-button" data-extension-page="${escape(item.key)}" data-extension-kind="popup" ${privateMode ? 'disabled' : ''}>${item.bundled ? 'Open AdBlock' : 'Open'}</button>` : ''}${item.options ? `<button class="secondary-button" data-extension-page="${escape(item.key)}" data-extension-kind="options">Options</button>` : ''}<button class="secondary-button" data-extension-reload="${escape(item.key)}">Reload</button>${item.bundled ? '' : `<button class="secondary-button" data-extension-remove="${escape(item.key)}">Remove</button>`}</div>${item.permissions?.length ? `<details class="extension-permissions"><summary>Permissions</summary><p>${item.permissions.map(escape).join('<br>')}</p></details>` : ''}</article>`).join('');
}
function settings() {
  const s = state.settings;
  return `<section class="panel">${headline('Settings')}<p class="description">Just the essentials. Settle in.</p><div class="setting-heading">Browsing</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Search engine</h2><p>Used when you type a search in the address bar.</p></div><select id="search-engine" aria-label="Search engine">${[['duckduckgo','DuckDuckGo'],['google','Google'],['bing','Bing']].map(([id,label])=>`<option value="${id}" ${s.searchEngine===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="setting-row"><div class="setting-copy"><h2>Generate search summaries</h2><p>An overview of several search results. Turn off to show results without a summary.</p></div><label class="switch"><input id="pageSummaries" type="checkbox" ${s.pageSummaries?'checked':''} aria-label="Generate search summaries"><span></span></label></div><div class="setting-row"><div class="setting-copy"><h2>Restore tabs on startup</h2><p>Reopen your previous websites when you return.</p></div><label class="switch"><input id="restoreTabs" type="checkbox" ${s.restoreTabs?'checked':''} aria-label="Restore tabs on startup"><span></span></label></div></div><div class="setting-heading">Flash</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Automatically use native Flash on websites</h2><p>Open detected Flash pages with the bundled Adobe player.<br>Use the lightning button for sites that hide Flash behind plugin detection.</p></div><label class="switch"><input id="flashEnabled" type="checkbox" ${s.flashEnabled?'checked':''} aria-label="Play embedded Flash"><span></span></label></div></div><div class="setting-heading" id="privacy">Privacy</div><form id="delete-data-form" class="settings-group"><div class="privacy-options"><label class="privacy-option"><input type="checkbox" name="history" ${current()?.private ? 'disabled' : 'checked'}>Delete browsing history</label><label class="privacy-option"><input type="checkbox" name="cookies" checked>Cookies and other site data</label><label class="privacy-option"><input type="checkbox" name="cache" checked>Cached images and files</label><p class="privacy-help">${current()?.private ? 'Delete data from this Flashcognito session. Saved browsing history is kept.' : 'Choose what to delete from all time. Deleting cookies signs you out of websites.'}<br>Bookmarks, your Flash library and downloaded files are kept.</p></div><div class="privacy-footer"><button id="delete-data" type="submit" class="secondary-button danger-button">Delete data</button><span id="delete-data-status" role="status" aria-live="polite"></span></div></form><p class="about-note">Ctrl+L address · Ctrl+T new tab · Ctrl+W close tab · Ctrl+Shift+T reopen tab<br>Ctrl+O open file · Ctrl+F find · Ctrl+D bookmark · F11 full screen</p></section>`;
}
function about() {
  return `<section class="panel about-panel"><button class="about-support-jump" type="button" data-support-jump>${icon('coffee')}Buy me a coffee</button><canvas id="about-bolt" class="about-bolt" width="336" height="336" role="img" aria-label="Spinning gold lightning bolt"></canvas><div class="about-copy"><h1 class="brand-wordmark about-wordmark" role="img" aria-label="flashborn"></h1><div class="about-text"><p class="about-motto">A quieter kind of browsing. Original Adobe Flash playback.</p><p class="about-dedication">This browser is dedicated to the team at <em>Firstborn</em>, one of the first digital design groups to help shape UI design as we know it today. Back in the early 2000s, <em>Firstborn</em> mostly used Flash to create and share its work with the world. <strong>Flashborn</strong> was designed to preserve their legacy after browser support for Flash was discontinued in 2021. Please enjoy the browser and send your comments or support to&nbsp;<span class="about-email-wrap"><a class="about-email" data-contact-email href="mailto:sloutchevsky@gmail.com" aria-label="Copy email address">sloutchevsky@gmail.com</a><span class="email-copied hidden" role="status" aria-live="polite"></span></span>.</p><dl class="about-detail"><dt>Version</dt><dd>${escape(state.version)}</dd><dt>Modern browser</dt><dd>Chromium ${escape(state.chromium)}</dd><dt>Flash player</dt><dd>Adobe Flash ${escape(state.flashVersion)} · PPAPI</dd><dt>Flash runtime</dt><dd>Electron ${escape(state.flashRuntime)} · separate process</dd><dt>Platform</dt><dd>Windows · 64-bit</dd><dt>Native Flash</dt><dd>${state.flashReady ? 'Bundled and ready' : 'Runtime missing. Reinstall Flashborn.'}</dd></dl><p class="about-note">Flash playback uses the original, unmodified Adobe player from Flash Browser. Its required legacy Chromium runtime no longer receives security updates. Use Flash mode for trusted legacy content. Ordinary pages use the current browser engine; Flash pages use the legacy runtime. The lightning button switches a website between modes.</p><a class="about-copyright" data-browser-url href="https://www.sloutchevsky.com/">© 2026 Vas Sloutchevsky</a><details class="about-license"><summary>MIT open source license</summary><p>Flashborn’s application source is free to use, copy, modify, merge, publish, distribute, sublicense, and sell under the MIT License. Third-party components, including Adobe Flash Player, retain their own licenses.</p><p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:</p><p>The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.</p><p>THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p></details>${FlashbornSupport.markup()}</div></div></section>`;
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
  else if (d.extensionPage) await call('extension-page', { key: d.extensionPage, kind: d.extensionKind });
  else if (d.extensionReload) await call('extension-reload', { key: d.extensionReload });
  else if (d.extensionRemove) confirmAction('extension-remove', 'Click Remove again to remove this extension.', { key: d.extensionRemove });
  else if (d.openLibrary) { $('#library-open-form').classList.remove('hidden'); $('#library-open-label').textContent = 'Open a website or HTML file'; $('#library-open-address').placeholder = 'https://example.com/ or a local HTML file path'; $('#library-open-address').focus(); }
  else if (d.panel) await call('panel', { name: d.panel });
  else if (d.tab) await call('select-tab', { id: d.tab });
  else if (d.closeTab) await call('close-tab', { id: d.closeTab });
  else if (d.url) await call('navigate', { value: d.url });
  else if (d.library) await call('play-library', { id: d.library });
  else if (d.removeLibrary) await call('remove-library', { id: d.removeLibrary });
  else if (d.editLibrary) { editingLibraryId = d.editLibrary; listRenderKey = ''; renderList(); document.querySelector('.library-edit-form input')?.focus(); }
  else if (d.cancelLibraryEdit) { editingLibraryId = null; listRenderKey = ''; renderList(); }
  else if (d.libraryImage) await call('library-image', { id: d.libraryImage });
  else if (d.removeLibraryImage) await call('library-image-remove', { id: d.removeLibraryImage });
  else if (d.removeBookmark) await call('remove-bookmark', { id: d.removeBookmark });
  else if (d.downloadOpen) await call('download-open', { id: d.downloadOpen });
  else if (d.downloadReveal) await call('download-reveal', { id: d.downloadReveal });
  else if (d.downloadCancel) await call('download-cancel', { id: d.downloadCancel });
  else if (d.zoom) await call('zoom', { direction: Number(d.zoom) });
});
document.addEventListener('change', event => {
  if (event.target.matches('[data-extension-toggle]')) call('extension-toggle', { key: event.target.dataset.extensionToggle });
});
document.addEventListener('submit', async event => {
  const form = event.target.closest('.library-edit-form'); if (!form) return;
  event.preventDefault();
  const result = await call('library-update', { id: form.dataset.libraryEdit, title: form.elements.title.value, year: form.elements.year.value, description: form.elements.description.value, source: form.elements.source.value });
  if (result) { editingLibraryId = null; listRenderKey = ''; renderList(); }
});
document.addEventListener('contextmenu', event => {
  const tab = event.target.closest('[data-collection="tabs"]');
  if (!tab) return;
  hideTabMemory();
  event.preventDefault();
  call('tab-menu', { id: tab.dataset.reorderId, x: event.clientX, y: event.clientY });
});
function clearDropIndicators() { document.querySelectorAll('.drop-before,.drop-after').forEach(row => row.classList.remove('drop-before', 'drop-after')); }
function finishDragging() { dragging = null; clearDropIndicators(); document.querySelectorAll('.dragging').forEach(row => row.classList.remove('dragging')); }
document.addEventListener('dragstart', event => {
  if (event.target.closest('input,textarea,.library-edit-form')) { event.preventDefault(); return; }
  const row = event.target.closest('[data-reorder-id]'); if (!row) return;
  hideTabMemory();
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
window.browser.onBlurFields(() => { if (document.activeElement?.matches('input')) document.activeElement.blur(); });
window.browser.onFind(result => {
  if (result.open) { $('#find-form').classList.remove('hidden'); $('#find-input').focus(); $('#find-input').select(); }
  else $('#find-count').textContent = `${result.activeMatchOrdinal} / ${result.matches}`;
});
call('state');
