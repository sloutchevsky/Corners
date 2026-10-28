'use strict';
let state, viewKey = '', filter = '', toastTimer;
let aboutBolt, homeBolt;
let dragging = null;
let editingLibraryId = null;
let editingCollection = false;
let presentedSerial = 0;
const predictiveFields = new Map();
let activePrediction = null;
let tabRenderKey = '', listRenderKey = '';
let collectionThumbnailKey = '', collectionThumbnailRequest = 0;
const collectionThumbnails = new Map();
const tabMemory = new Map();
const memoryRequests = new Map();
let hoveredTab = null, tabHoverRevision = 0;
let summaryRenderKey = '';
let summaryFrame = 0, summaryTargetHeight = 0, summaryVisibleStamp = '';
const revealDuration = 190;
let sidebarFrame = 0, sidebarWidth = 320, lastCollapsed;
const tabPreviews = new FlashbornTabPreviews();
const libraryOpenKind = 'html';
const $ = selector => document.querySelector(selector);
const sidebarNavigation = $('.sidebar-bottom');
const sidebarSelection = $('.sidebar-selection');
const sidebarButtons = [...sidebarNavigation.querySelectorAll('[data-panel]')];
let sidebarHoverButton = null, sidebarFocusButton = null, sidebarSelectedButton = null;
function positionSidebarSelection() {
  const button = [sidebarHoverButton,sidebarFocusButton,sidebarSelectedButton].find(button=>button && !button.hidden);
  if (button) {
    sidebarSelection.style.height = button.offsetHeight + 'px';
    sidebarSelection.style.transform = `translateY(${button.offsetTop}px)`;
  }
  sidebarSelection.classList.toggle('visible', !!button);
}
function renderSidebarSelection() {
  sidebarSelectedButton = sidebarButtons.find(button => !button.hidden && button.dataset.panel === state.panel) || null;
  positionSidebarSelection();
}
for (const button of sidebarButtons) {
  button.addEventListener('pointerenter', () => { sidebarHoverButton = button; positionSidebarSelection(); });
  button.addEventListener('pointerleave', () => { sidebarHoverButton = null; positionSidebarSelection(); });
  button.addEventListener('click', () => { sidebarSelectedButton = button; positionSidebarSelection(); });
  button.addEventListener('focus', () => {
    sidebarFocusButton = button.matches(':focus-visible') ? button : null;
    positionSidebarSelection();
  });
  button.addEventListener('blur', () => { sidebarFocusButton = null; positionSidebarSelection(); });
}
function clearSidebarPreview() {
  sidebarHoverButton = null; sidebarFocusButton = null; positionSidebarSelection();
}
sidebarNavigation.addEventListener('pointerleave', clearSidebarPreview);
sidebarNavigation.addEventListener('pointercancel', clearSidebarPreview);
window.addEventListener('blur', clearSidebarPreview);
new ResizeObserver(positionSidebarSelection).observe(sidebarNavigation);
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
let themeIndex = null, themeRotation = 0;
function renderThemeIcon() {
  const settings = state?.settings || {}, index = FlashbornTheme.index(settings);
  if(themeIndex===null)themeRotation=index*90;
  else themeRotation+=((index-themeIndex+4)%4)*90;
  themeIndex=index;
  const preview = themeHovered && !themePreviewLatched;
  $('#theme-icon').style.transform = `rotate(${themeRotation+(preview?90:0)}deg)`;
  themeToggle.dataset.position = String(index);
  themeToggle.title = `Theme: ${FlashbornTheme.current(settings).label}. Next: ${FlashbornTheme.next(settings).label}.`;
  themeToggle.setAttribute('aria-label', themeToggle.title);
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
function renderTabRows() {
  const container = $('#tabs'), rows = new Map([...container.children].map(row => [row.dataset.reorderId, row]));
  state.tabs.forEach((tab, index) => {
    let row = rows.get(tab.id);
    if (!row) {
      row = document.createElement('div'); row.className = 'tab'; row.draggable = false;
      row.dataset.collection = 'tabs'; row.dataset.reorderId = tab.id;
      row.innerHTML = `<button class="tab-select"><span class="tab-thumbnail" aria-hidden="true"><img alt="" draggable="false" hidden><span class="tab-thumbnail-placeholder"></span></span><span class="tab-icon"></span><span class="tab-copy"><span class="tab-title"></span></span><span class="tab-memory" aria-hidden="true"></span></button><button class="tab-close">${icon('close')}</button>`;
      row.querySelector('.tab-select').dataset.tab = tab.id;
      row.querySelector('.tab-select').setAttribute('aria-description', 'Drag to reorder, or press Alt and Up or Down. Right-click to duplicate or close.');
      row.querySelector('.tab-close').dataset.closeTab = tab.id;
    }
    rows.delete(tab.id);
    row.classList.toggle('private-tab', !!tab.private);
    row.classList.toggle('placeholder-tab', !!tab.private || tab.kind === 'home');
    row.classList.toggle('active', tab.id === state.activeId && !state.panel);
    const title = row.querySelector('.tab-title'); if (title.textContent !== tab.title) title.textContent = tab.title;
    row.querySelector('.tab-select').setAttribute('aria-label', `Switch to ${tab.title}${tab.private ? ' (Flashcognito)' : ''}`);
    row.querySelector('.tab-close').setAttribute('aria-label', `Close ${tab.title}`);
    const glyph = row.querySelector('.tab-icon'); glyph.className = 'tab-icon kind-' + tab.kind;
    const art = tab.private ? icon('lock') : tab.loading ? '<span class="spinner"></span>' : tab.kind === 'home' ? icon('globe') : escape(tab.title.charAt(0).toUpperCase());
    if (glyph.innerHTML !== art) glyph.innerHTML = art;
    const placeholder = row.querySelector('.tab-thumbnail-placeholder'), placeholderArt = tab.private ? icon('lock') : icon('globe');
    if (placeholder.innerHTML !== placeholderArt) placeholder.innerHTML = placeholderArt;
    if (container.children[index] !== row) container.insertBefore(row, container.children[index] || null);
  });
  for (const row of rows.values()) row.remove();
}
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
  const left = Math.max(16, Math.min(innerWidth - (state.collapsed ? 160 : 320) - 220, summary.layout?.left || 40));
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
  const target = state.collapsed ? 160 : 320;
  if (lastCollapsed === state.collapsed) return;
  cancelAnimationFrame(sidebarFrame); sidebarFrame = 0;
  const initial = lastCollapsed === undefined;
  lastCollapsed = state.collapsed;
  const apply = (width, finished = false) => {
    sidebarWidth = Math.round(width);
    document.body.style.setProperty('--sidebar-width', sidebarWidth + 'px');
    window.browser.call('sidebar-width', { width: sidebarWidth, finished }).catch(() => {});
  };
  if (initial || matchMedia('(prefers-reduced-motion:reduce)').matches) { document.body.classList.remove('sidebar-animating'); apply(target, true); return; }
  const from = sidebarWidth, started = performance.now();
  document.body.classList.add('sidebar-animating');
  const step = now => {
    const progress = Math.min(1, (now - started) / revealDuration);
    apply(from + (target - from) * (1 - Math.pow(1 - progress, 3)), progress === 1);
    sidebarFrame = progress < 1 ? requestAnimationFrame(step) : 0;
    if (progress === 1) document.body.classList.remove('sidebar-animating');
  };
  sidebarFrame = requestAnimationFrame(step);
}
function render(next) {
  const addressContextChanged = state?.panel !== next.panel || state?.activeId !== next.activeId;
  state = next;
  renderGalleryStages();
  document.body.classList.toggle('special-page',!!state.compactChrome);
  if(addressContextChanged)document.body.classList.remove('address-editing');
  for (const [id, measured] of tabMemory) if (measured.page !== memoryKey(state.tabs.find(t => t.id === id))) tabMemory.delete(id);
  document.body.classList.toggle('collapsed', state.collapsed);
  renderSidebarIcon();
  if (state.collapsed) hideTabMemory();
  renderSidebar();
  document.body.classList.toggle('fullscreen', state.fullscreen);
  const theme = state.settings.theme || 'current';
  document.body.dataset.theme = theme;
  document.body.dataset.contrast = state.settings.highContrast ? 'high' : 'normal';
  [homeBolt, aboutBolt].filter(Boolean).forEach(bolt => bolt.setTheme(theme));
  navigationIcons.forEach(item => item.setTheme(theme));
  renderThemeIcon();
  const t = state.panelPage || current();
  renderSummary();
  document.body.classList.toggle('flashcognito', !!t?.private);
  navigationIcons.filter(item => ['history', 'downloads'].includes(item.kind)).forEach(item => item.setMetal(t?.private ? 'silver' : 'gold'));
  $('#private-badge').classList.toggle('hidden', !t?.private);
  document.title = (t?.title || 'New tab') + ' · Corners';
  $('#tab-count').textContent = state.tabs.length;
  $('#tab-count').title = `${state.tabs.length} open tabs`;
  const nextTabKey = JSON.stringify([state.tabs, state.activeId, state.panel]);
  if (!dragging && nextTabKey !== tabRenderKey) {
    hideTabMemory();
    tabRenderKey = nextTabKey;
    renderTabRows();
  }
  tabPreviews.render(state);
  document.querySelectorAll('[data-panel]').forEach(el => el.classList.toggle('active', el.dataset.panel === state.panel));
  $('.sidebar-bottom [data-panel="support"]').hidden=!!state.supporter;
  navigationIcons.find(item=>item.kind==='support').setReminderEnabled(!state.supporter);
  renderSidebarSelection();
  $('#back').disabled = !!state.panel || !t?.canBack;
  $('#forward').disabled = !!state.panel || !t?.canForward;
  $('#reload').disabled = !t && !state.panel;
  $('#reload').dataset.action = t?.loading ? 'stop' : 'reload';
  $('#reload').innerHTML = icon(t?.loading ? 'close' : 'reload');
  $('#reload').title = t?.loading ? 'Stop loading' : 'Reload (Ctrl+R)';
  const address = $('#address'), addressURL = state.panel === 'library' ? state.panelPage?.url || state.libraryPageURL : state.panel ? '' : t?.url || '';
  $('#bookmark').disabled = !addressURL.startsWith('http');
  $('#bookmark').classList.toggle('bookmarked', !!addressURL && state.bookmarks.some(b => b.url === addressURL));
  if (addressContextChanged || document.activeElement !== address) {
    address.value = addressURL;
    const prediction = predictiveFields.get('address');
    if (prediction) { clearTimeout(prediction.timer); prediction.revision++; prediction.typed = addressURL; prediction.inline = null; }
  }
  $('#address-icon').innerHTML = `<use href="#i-${addressURL.startsWith('https:') ? 'lock' : addressURL ? 'globe' : 'search'}"/>`;
  $('#menu-button').setAttribute('aria-expanded', String(state.menuOpen));
  for (const [id, controller] of predictiveFields) controller.input.setAttribute('aria-expanded', String(state.suggestions?.field === id));
  const downloads = state.downloads.filter(d => d.state === 'progressing').length;
  $('#download-count').textContent = downloads || '';
  const newDownloads = state.downloads.some(d => d.state === 'completed' && d.isNew);
  $('#download-new').classList.toggle('hidden', !newDownloads);
  $('.sidebar [data-panel="downloads"]').setAttribute('aria-label', newDownloads ? 'Downloads — new completed downloads' : 'Downloads');
  $('#page-status').textContent = state.panel ? ({ library: 'Your Flash collection', bookmarks: 'Saved for later', history: 'Recently visited', downloads: 'Your downloads', extensions: 'Extensions', settings: 'Settings', support:'Support Corners', about: 'Corners ' + state.version }[state.panel]) : t?.loading ? 'Loading…' : t?.kind === 'home' ? 'Make yourself at home.' : t?.url || '';
  $('#status-right').textContent = t?.private ? 'Flashcognito · temporary session' : t?.audible ? (t.muted ? 'Audio muted' : 'Audio playing') : t?.native ? 'Native Adobe Flash' : 'Chromium · Adobe Flash';
  const contentTab = state.presentationHome || t;
  $('#content').inert = !!state.presentationHome;
  const key = state.panel ? state.panel + (state.panelSection ? ':' + state.panelSection : '') + (t?.private ? ':private' : '') + (state.panelPage?.error || '') : (contentTab?.error ? 'error:' + contentTab.id + contentTab.error : contentTab?.kind === 'home' ? contentTab.private ? 'private-home' : 'home' : 'web');
  if (key !== viewKey) { filter = ''; viewKey = key; renderContent(); }
  else if (state.panel && !['settings', 'about', 'library','support'].includes(state.panel)) renderList();
  else if (key === 'home' || key === 'private-home') renderQuickLinks();
  if ($('#darkTheme')) $('#darkTheme').checked = theme !== 'light';
  if ($('#highContrast')) $('#highContrast').checked = !!state.settings.highContrast;
  if(gallerySharedState)for(const iframe of galleryFrames.values())postGalleryState(iframe,gallerySharedState);
  if (state.tabPresentation && presentedSerial !== state.tabPresentation) {
    presentedSerial = state.tabPresentation;
    const serial = presentedSerial;
    requestAnimationFrame(() => requestAnimationFrame(() => call('tab-presented', { serial })));
  }
  FlashbornSupport.refresh(state);
}
function home() {
  const privateMode = !!(state.presentationHome || current())?.private;
  return `<section class="home${privateMode ? ' flashcognito-home' : ''}">${headline(privateMode ? 'A little more private.' : 'Where would you like to go?')}<p class="home-description">${privateMode ? 'A fresh session. No saved browsing trail.' : 'A fresh start. An old favorite. Something unexpected.'}</p><form id="home-search" class="search-box">${icon('search')}<input id="home-input" aria-label="${privateMode ? 'Search the web privately' : 'Search the web'}" placeholder="Search the web or paste a link" spellcheck="false" autocomplete="off"><button class="search-submit" title="Go" aria-label="Go">${icon('arrow')}</button></form><div id="quick-links" class="quick-links"></div><div class="home-divider"></div><div class="home-bottom"><button class="flash-library-link" data-panel="library"><span class="flash-card-icon"><canvas id="home-bolt" width="128" height="128" role="img" aria-label="${privateMode ? 'Silver' : 'Gold'} lightning bolt"></canvas></span><span class="flash-copy"><span class="flash-card-title">${privateMode ? 'Old favorites are still welcome.' : 'Some things never get old.'}</span><span class="flash-card-description">${privateMode ? 'Open your Flash gallery.' : 'Your favorite Flash websites, ready to explore again.'}</span></span></button></div><div class="home-footnote">${icon('lock')}<span>${privateMode ? 'Bookmarks and downloaded files you keep remain on your device.<br>Flashcognito doesn’t hide your activity from websites or your network.' : 'Your history and bookmarks stay on this device.'}</span></div></section>`;
}
function renderQuickLinks() {
  const target = $('#quick-links'); if (!target) return;
  const defaults = [{ title: 'Wikipedia', url: 'https://www.wikipedia.org/' }, { title: 'Internet Archive', url: 'https://archive.org/' }, { title: 'Flash Browser', url: 'https://flash.pm/' }];
  target.innerHTML = (state.bookmarks.length ? state.bookmarks.slice(0, 5) : defaults).map(b => `<button class="quick-link" data-url="${escape(b.url)}">${icon(state.bookmarks.length ? 'star' : 'globe')}${escape(b.title.slice(0, 24))}</button>`).join('');
}
function panelHeader(name, description, actions) {
  const subdued = current()?.private && ['history', 'downloads'].includes(state.panel);
  return `<section class="panel${subdued ? ' flashcognito-panel' : ''}" data-kind="${state.panel}">${headline(name)}<p class="description">${description}</p>${actions ? '<div class="panel-actions">' + actions + '</div>' : ''}${state.panel === 'library' ? '<div id="library-collection-heading" class="library-collection-heading"></div>' : ''}<div id="item-list" class="item-list"></div></section>`;
}
function renderContent() {
  editingLibraryId = null;
  editingCollection = false;
  listRenderKey = '';
  for (const [id, controller] of predictiveFields) if (id !== 'address') { clearTimeout(controller.timer); predictiveFields.delete(id); }
  if (activePrediction?.input.id !== 'address') activePrediction = null;
  if (aboutBolt) { aboutBolt.dispose(); aboutBolt = null; }
  if (homeBolt) { homeBolt.dispose(); homeBolt = null; }
  const t = state.panelPage || state.presentationHome || current();
  let html = '';
  if (state.panel === 'library') html = t?.error ? `<section class="error-page">${icon('globe')}${headline('Flash Gallery couldn’t open.')}<p>${escape(t.error)}</p><button class="primary-button" data-action="reload">${icon('reload')}Try again</button></section>` : '';
  else if (state.panel === 'bookmarks') html = panelHeader('Bookmarks', 'Good places, saved for later. Press Ctrl+D on any page to bookmark it.', '<input class="filter-input" id="filter" placeholder="Find a bookmark" aria-label="Filter bookmarks">');
  else if (state.panel === 'history') html = panelHeader('History', t?.private ? 'Flashcognito doesn’t save your browsing history.' : 'Pick up where you left off.', t?.private ? '' : '<input class="filter-input" id="filter" placeholder="Search history" aria-label="Filter history"><button class="secondary-button danger-button" id="clear-history">Clear history</button>');
  else if (state.panel === 'downloads') html = panelHeader('Downloads', t?.private ? 'Downloads from this Flashcognito session. Saved files remain after these tabs close.' : 'Everything you have saved from the web.', '<span></span><button class="secondary-button" data-action="download-clear">Clear finished</button>');
  else if (state.panel === 'extensions') html = panelHeader('Extensions', 'A little extra, when you need it.', '<p class="extensions-support">Compatible Chrome extensions run in regular modern tabs. Extensions are off in Flashcognito and the separate Flash engine. Load an unpacked extension folder to add your own; Chrome Web Store installation and some Chrome APIs are not supported.</p><button class="secondary-button" data-action="extension-install">'+icon('plus')+'Load unpacked…</button>');
  else if (state.panel === 'settings') html = settings();
  else if (state.panel === 'about') html = about();
  else if (state.panel === 'support') html = FlashbornSupport.page(headline);
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
  for (const setting of ['darkTheme', 'highContrast', 'restoreTabs', 'autoCloseTabs', 'pageSummaries', 'flashEnabled']) if ($(`#${setting}`)) $(`#${setting}`).addEventListener('change', e => { call('settings', { [setting]: e.target.checked }); if(setting==='autoCloseTabs')$('#tab-limit').disabled=!e.target.checked; if (setting === 'flashEnabled') toast('Reload open websites to apply the Flash setting.'); });
  const tabLimit=$('#tab-limit');
  if(tabLimit){
    tabLimit.addEventListener('input',()=>$('#tab-limit-value').value=tabLimit.value+' tabs');
    tabLimit.addEventListener('change',()=>call('settings',{tabLimit:Number(tabLimit.value)}));
  }
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
function renderCollectionHeading() {
  const container = $('#library-collection-heading'); if (!container) return;
  const heading = state.libraryHeading || { title: 'Vas Sloutchevsky', subtitle: 'Flash design portfolio' };
  if (editingCollection && container.querySelector('form')) return;
  const key = JSON.stringify([heading, editingCollection]); if (container.dataset.key === key) return;
  container.dataset.key = key;
  container.innerHTML = editingCollection ? `<form id="library-heading-form" class="library-edit-form"><label>Subtitle<input name="collectionSubtitle" maxlength="600" value="${escape(heading.subtitle)}"></label><div><button class="secondary-button" type="submit">Save</button><button class="secondary-button" type="button" data-cancel-collection>Cancel</button></div></form>` : `<p><button data-edit-collection title="Edit portfolio subtitle">${escape(heading.subtitle) || 'Subtitle'}</button></p>`;
}
function applyCollectionThumbnails() {
  for (const art of document.querySelectorAll('.collection-thumbnail[data-site-url]')) {
    const frame = collectionThumbnails.get(art.dataset.siteUrl), image = art.querySelector('img');
    art.classList.toggle('has-snapshot', !!frame);
    image.hidden = !frame;
    if (frame) {
      if (image.getAttribute('src') !== frame.data) image.src = frame.data;
      image.dataset.capturedAt = frame.capturedAt;
    } else { image.removeAttribute('src'); delete image.dataset.capturedAt; }
  }
}
function syncCollectionThumbnails(panel, items) {
  if (!['bookmarks', 'history'].includes(panel)) return;
  const urls = [...new Set(items.map(item => item.url))], key = JSON.stringify([panel, urls, state.thumbnailRevision]);
  if (key === collectionThumbnailKey) return;
  collectionThumbnailKey = key;
  const request = ++collectionThumbnailRequest;
  window.browser.call('collection-thumbnails', { urls }).then(result => {
    if (request !== collectionThumbnailRequest) return;
    if (!result.ok) { collectionThumbnailKey = ''; return; }
    collectionThumbnails.clear();
    for (const frame of result.state.thumbnails) if (frame.data) collectionThumbnails.set(frame.url, frame);
    applyCollectionThumbnails();
  }).catch(() => { if (request === collectionThumbnailRequest) collectionThumbnailKey = ''; });
}
function downloadIcon(item) {
  const filename = (item.filename || item.path || item.url || '').split(/[?#]/)[0];
  if (/\.(zip|7z|rar|tar|gz|tgz|bz2|xz)$/i.test(filename)) return 'archive';
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?|heic)$/i.test(filename)) return 'image';
  return 'globe';
}
function renderList() {
  if (dragging || pointerGrab) return;
  if (editingLibraryId && document.querySelector('.library-edit-form')) return;
  if (state.panel === 'extensions') { renderExtensions(); return; }
  renderCollectionHeading();
  const container = $('#item-list'); if (!container) return;
  const p = state.panel; const collection = p === 'library' ? state.library : state[p] || [];
    const items = collection.filter(e => !filter || `${e.title || e.filename || ''} ${e.url || e.path || ''}`.toLowerCase().includes(filter));
  syncCollectionThumbnails(p, items);
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
    const thumbnail = p === 'library' ? `<div class="library-art"><button class="library-thumbnail ${item.image ? 'has-image' : ''}" data-library-image="${item.id}" title="${item.image ? 'Change image' : 'Choose a 2:1 image or drop one here'}" aria-label="${item.image ? 'Change' : 'Choose'} image for ${escape(title)}">${item.image ? `<img src="/library-image/${item.id}?v=${escape(item.image)}" alt="" draggable="false">` : ''}<span class="thumbnail-plus">${icon('plus')}</span></button>${item.image ? `<button class="thumbnail-remove" data-remove-library-image="${item.id}" title="Remove image" aria-label="Remove image for ${escape(title)}">${icon('close')}</button>` : ''}</div>` : `<button class="collection-thumbnail" ${open} ${p === 'downloads' ? '' : `data-site-url="${escape(item.url)}"`} aria-label="Open ${escape(title)}">${p === 'downloads' ? '' : '<img alt="" draggable="false" hidden>'}${icon(p === 'downloads' ? downloadIcon(item) : 'globe')}</button>`;
    if (p === 'library' && item.id === editingLibraryId) return `<article class="list-item library-editing">${thumbnail}<form class="library-edit-form" data-library-edit="${item.id}"><label>Title<input name="title" value="${escape(title)}" maxlength="300" required></label><div class="library-credit-fields"><label>Year<input name="year" value="${escape(item.year || '')}" maxlength="40" placeholder="2006"></label><label>Created by<input name="createdBy" value="${escape(item.createdBy || '')}" maxlength="300" placeholder="Firstborn"></label></div><label>Description<textarea name="description" rows="3" placeholder="${escape(item.path || item.url)}" maxlength="4000">${escape(item.description || '')}</textarea></label><label>Website or local HTML file<input name="source" value="${escape(item.path || item.url)}" required></label><div><button class="secondary-button" type="submit">Save</button><button class="secondary-button" type="button" data-cancel-library-edit="${item.id}">Cancel</button></div></form></article>`;
    return `<article class="list-item${p === 'library' ? '' : ' collection-row'}" ${reorder ? `draggable="false" tabindex="0" aria-description="Drag to reorder, or press Alt and Up or Down" data-collection="${p}" data-reorder-id="${item.id}"` : ''}>${thumbnail}<div class="item-copy"><button class="item-title" ${open}>${escape(title)}</button>${p === 'library' ? `<button class="library-year" data-edit-library="${item.id}" title="Edit year" aria-label="Edit year for ${escape(title)}">${escape(item.year || '')}${item.year && item.createdBy ? ', ' : ''}${item.createdBy ? `<em>${escape(item.createdBy)}</em>` : ''}</button><button class="item-detail library-small-line" data-edit-library="${item.id}" title="Edit description">${escape(detail)}</button>` : `<p class="item-detail" title="${escape(item.path || item.url || '')}">${escape(detail)}</p>`}${p === 'downloads' && item.state === 'progressing' ? `<div class="progress"><span style="--progress:${item.total ? Math.min(100, Math.round(item.received / item.total * 100)) : 15}%"></span></div>` : ''}</div><div class="item-actions">${actions}</div></article>`;
  }).join('');
  applyCollectionThumbnails();
  if (p === 'library') for (const item of items) {
    const thumbnail = [...container.querySelectorAll('[data-library-image]')].find(el => el.dataset.libraryImage === item.id);
    if (thumbnail && /^oklch\(68% 0\.16 \d{1,3}\)$/.test(item.color || '')) thumbnail.style.backgroundColor = item.color;
  }
}
function renderExtensions() {
  const container = $('#item-list'); if (!container) return;
  const privateMode = !!current()?.private;
  const key = JSON.stringify([state.extensions, privateMode]); if (key === listRenderKey) return; listRenderKey = key;
  container.innerHTML = `<article class="extension-card flash-runtime-card"><div class="extension-heading"><span class="item-icon">${icon('flash')}</span><div class="item-copy"><h2>Adobe Flash Player</h2><p>${escape(state.flashVersion)} · Built in</p></div><label class="switch"><input type="checkbox" checked disabled aria-label="Adobe Flash Player is built in"><span></span></label></div><p class="extension-description">Original Adobe Flash playback in a separate browser engine. Use the lightning button to switch a website into Flash mode.</p><p class="extension-status">${state.flashReady ? 'Bundled and ready' : 'Runtime missing. Reinstall Corners.'}</p></article>` + state.extensions.map(item => `<article class="extension-card" data-extension="${escape(item.key)}"><div class="extension-heading"><span class="item-icon">${icon('extension')}</span><div class="item-copy"><h2>${escape(item.name)}</h2><p>${escape(item.version)}${item.bundled ? ' · Bundled · Adblock, Inc.' : ''}</p></div><label class="switch"><input type="checkbox" data-extension-toggle="${escape(item.key)}" ${item.enabled ? 'checked' : ''} aria-label="Enable ${escape(item.name)}"><span></span></label></div><p class="extension-description">${item.bundled ? 'The official AdBlock extension, with its original scripts, filters, options and site controls.' : escape(item.description)}</p><p class="extension-status${item.error ? ' extension-error' : ''}" role="status">${item.error ? escape(item.error) : !item.enabled ? 'Off' : privateMode ? 'Off in Flashcognito · enabled in regular tabs' : item.loaded ? 'Enabled in regular modern tabs' : 'Not loaded'}</p><div class="extension-actions">${item.popup ? `<button class="secondary-button" data-extension-page="${escape(item.key)}" data-extension-kind="popup" ${privateMode ? 'disabled' : ''}>${item.bundled ? 'Open AdBlock' : 'Open'}</button>` : ''}${item.options ? `<button class="secondary-button" data-extension-page="${escape(item.key)}" data-extension-kind="options">Options</button>` : ''}<button class="secondary-button" data-extension-reload="${escape(item.key)}">Reload</button>${item.bundled ? '' : `<button class="secondary-button" data-extension-remove="${escape(item.key)}">Remove</button>`}</div>${item.permissions?.length ? `<details class="extension-permissions"><summary>Permissions</summary><p>${item.permissions.map(escape).join('<br>')}</p></details>` : ''}</article>`).join('');
}
function settings() {
  const s = state.settings;
  const appearance=`<div class="setting-heading">Appearance</div><div class="settings-group appearance-settings"><div class="setting-row"><div class="setting-copy"><h2>Dark theme</h2><p>Use a dark background. Turn off for the light theme.</p></div><label class="switch"><input id="darkTheme" type="checkbox" ${s.theme!=='light'?'checked':''} aria-label="Dark theme"><span></span></label></div><div class="setting-row"><div class="setting-copy"><h2>High contrast</h2><p>Use black in the dark theme and white in the light theme.<br>Turn off for the current grey backgrounds.</p></div><label class="switch"><input id="highContrast" type="checkbox" ${s.highContrast?'checked':''} aria-label="High contrast"><span></span></label></div></div>`;
  const tabManagement=`<div class="setting-heading">Tab memory</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Auto-close bottom tabs</h2><p>Close inactive tabs from the bottom when the limit is exceeded.<br>Keep the current tab, audible tabs and active downloads.</p></div><label class="switch"><input id="autoCloseTabs" type="checkbox" ${s.autoCloseTabs?'checked':''} aria-label="Auto-close bottom tabs"><span></span></label></div><div class="setting-row"><div class="setting-copy"><h2>Maximum open tabs</h2><p>20–100 tabs. Reopen closed regular tabs with Ctrl+Shift+T.</p></div><div class="tab-limit-control"><input id="tab-limit" type="range" min="20" max="100" step="1" value="${s.tabLimit}" ${s.autoCloseTabs?'':'disabled'} aria-label="Maximum open tabs" aria-describedby="tab-limit-value"><output id="tab-limit-value" for="tab-limit">${s.tabLimit} tabs</output></div></div></div>`;
  return `<section class="panel">${headline('Settings')}<p class="description">Just the essentials. Settle in.</p>${appearance}<div class="setting-heading">Browsing</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Search engine</h2><p>Used when you type a search in the address bar.</p></div><select id="search-engine" aria-label="Search engine">${[['duckduckgo','DuckDuckGo'],['google','Google'],['bing','Bing']].map(([id,label])=>`<option value="${id}" ${s.searchEngine===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="setting-row"><div class="setting-copy"><h2>Generate search summaries</h2><p>An overview of several search results. Turn off to show results without a summary.</p></div><label class="switch"><input id="pageSummaries" type="checkbox" ${s.pageSummaries?'checked':''} aria-label="Generate search summaries"><span></span></label></div><div class="setting-row"><div class="setting-copy"><h2>Restore tabs on startup</h2><p>Reopen your previous websites when you return.</p></div><label class="switch"><input id="restoreTabs" type="checkbox" ${s.restoreTabs?'checked':''} aria-label="Restore tabs on startup"><span></span></label></div></div>${tabManagement}<div class="setting-heading">Flash</div><div class="settings-group"><div class="setting-row"><div class="setting-copy"><h2>Automatically use native Flash on websites</h2><p>Open detected Flash pages with the bundled Adobe player.<br>Use the lightning button for sites that hide Flash behind plugin detection.</p></div><label class="switch"><input id="flashEnabled" type="checkbox" ${s.flashEnabled?'checked':''} aria-label="Play embedded Flash"><span></span></label></div></div><div class="setting-heading" id="privacy">Privacy</div><form id="delete-data-form" class="settings-group"><div class="privacy-options"><label class="privacy-option"><input type="checkbox" name="history" ${current()?.private ? 'disabled' : 'checked'}>Delete browsing history</label><label class="privacy-option"><input type="checkbox" name="cookies" checked>Cookies and other site data</label><label class="privacy-option"><input type="checkbox" name="cache" checked>Cached images and files</label><p class="privacy-help">${current()?.private ? 'Delete data from this Flashcognito session. Saved browsing history is kept.' : 'Choose what to delete from all time. Deleting cookies signs you out of websites.'}<br>Bookmarks, your Flash gallery and downloaded files are kept.</p></div><div class="privacy-footer"><button id="delete-data" type="submit" class="secondary-button danger-button">Delete data</button><span id="delete-data-status" role="status" aria-live="polite"></span></div></form><p class="about-note">Ctrl+L address · Ctrl+T new tab · Ctrl+W close tab · Ctrl+Shift+T reopen tab<br>Ctrl+O open file · Ctrl+F find · Ctrl+D bookmark · F11 full screen</p></section>`;
}
function about() {
  return `<section class="panel about-panel"><div class="about-copy"><div class="about-text"><p class="about-motto">A browser built around a clearer, more responsive interface.</p><p class="about-dedication">This browser is dedicated to the team at <em>Firstborn</em>, one of the first digital design groups to help shape UI design as we know it today. Back in the early 2000s, <em>Firstborn</em> mostly used Flash to create and share its work with the world. <strong>Corners</strong> builds on that spirit with an interface designed around fluid grids, clear controls and direct window interaction. Please enjoy the browser and send your comments to&nbsp;<span class="about-email-wrap"><a class="about-email" data-contact-email href="mailto:sloutchevsky@gmail.com" aria-label="Copy email address">sloutchevsky@gmail.com</a><span class="email-copied hidden" role="status" aria-live="polite"></span></span>.</p><dl class="about-detail"><dt>Version</dt><dd>${escape(state.version)}</dd><dt>Modern browser</dt><dd>Chromium ${escape(state.chromium)}</dd><dt>Flash player</dt><dd>Adobe Flash ${escape(state.flashVersion)} · PPAPI</dd><dt>Flash runtime</dt><dd>Electron ${escape(state.flashRuntime)} · separate process</dd><dt>Platform</dt><dd>Windows · 64-bit</dd><dt>Native Flash</dt><dd>${state.flashReady ? 'Bundled and ready' : 'Runtime missing. Reinstall Corners.'}</dd></dl><p class="about-note">Flash playback uses the original, unmodified Adobe player from Flash Browser. Its required legacy Chromium runtime no longer receives security updates. Use Flash mode for trusted legacy content. Ordinary pages use the current browser engine; Flash pages use the legacy runtime.</p><a class="about-copyright" data-browser-url href="https://www.sloutchevsky.com/">© 2026 Vas Sloutchevsky</a><details class="about-license"><summary>MIT open source license</summary><p>Corners’s application source is free to use, copy, modify, merge, publish, distribute, sublicense, and sell under the MIT License. Third-party components, including Adobe Flash Player, retain their own licenses.</p><p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:</p><p>The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.</p><p>THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p></details><button class="about-support-link" type="button" data-panel="support">Support Corners</button></div></div></section>`;
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
  else if (d.editCollection !== undefined) { editingCollection = true; renderCollectionHeading(); $('#library-heading-form input')?.focus(); }
  else if (d.cancelCollection !== undefined) { editingCollection = false; renderCollectionHeading(); }
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
  if (event.target.id === 'library-heading-form') {
    event.preventDefault(); const form = event.target;
    const result = await call('library-heading', { ...state.libraryHeading, subtitle: form.elements.collectionSubtitle.value });
    if (result) { editingCollection = false; renderCollectionHeading(); }
    return;
  }
  const form = event.target.closest('.library-edit-form'); if (!form) return;
  event.preventDefault();
  const result = await call('library-update', { id: form.dataset.libraryEdit, title: form.elements.title.value, year: form.elements.year.value, createdBy: form.elements.createdBy.value, description: form.elements.description.value, source: form.elements.source.value });
  if (result) { editingLibraryId = null; listRenderKey = ''; renderList(); }
});
document.addEventListener('contextmenu', event => {
  const tab = event.target.closest('[data-collection="tabs"]');
  if (!tab) return;
  hideTabMemory();
  event.preventDefault();
  call('tab-menu', { id: tab.dataset.reorderId, x: event.clientX, y: event.clientY });
});
let dragFrame = 0, dragPoint = null, dragPlacement = null, ignoreDragClickUntil = 0, pointerGrab = null, dragPreview = null;
function clearDropIndicators() { $('#reorder-line').hidden = true; dragPlacement = null; }
function finishDragging() {
  const grab = pointerGrab; pointerGrab = null;
  dragging = null; dragPoint = null; cancelAnimationFrame(dragFrame); dragFrame = 0;
  dragPreview?.remove(); dragPreview = null;
  delete document.body.dataset.reordering; clearDropIndicators();
  document.querySelectorAll('.dragging').forEach(row => row.classList.remove('dragging'));
  if (grab?.row.hasPointerCapture(grab.pointerId)) grab.row.releasePointerCapture(grab.pointerId);
}
function dragContainer() { return dragging?.collection === 'tabs' ? $('#tabs') : state?.panel === dragging?.collection ? $('#item-list') : null; }
function placeDraggedRow(x, y) {
  const container = dragContainer(); if (!container) { clearDropIndicators(); return; }
  const bounds = container.getBoundingClientRect(), viewport = dragging.collection === 'tabs' ? bounds : $('#content').getBoundingClientRect();
  if (x < bounds.left || x > bounds.right || y < Math.max(bounds.top, viewport.top) || y > viewport.bottom) { clearDropIndicators(); return; }
  const rows = [...container.querySelectorAll('[data-reorder-id]')].filter(row => row.dataset.collection === dragging.collection && row.dataset.reorderId !== dragging.id);
  if (!rows.length) { clearDropIndicators(); return; }
  const before = rows.find(row => { const r = row.getBoundingClientRect(); return y < r.top + r.height / 2; });
  const target = before || rows[rows.length - 1], rect = target.getBoundingClientRect(), gap = dragging.collection === 'tabs' ? 0 : 8;
  dragPlacement = { ...dragging, targetId: target.dataset.reorderId, position: before ? 'before' : 'after' };
  const line = $('#reorder-line'); line.hidden = false;
  line.style.left = bounds.left + 'px'; line.style.width = bounds.width + 'px';
  line.style.top = Math.max(viewport.top, Math.min(viewport.bottom - 2, before ? rect.top - gap / 2 : rect.bottom + gap / 2)) + 'px';
}
function scrollDuringDrag() {
  if (!dragging || !dragPoint) { dragFrame = 0; return; }
  const container = dragContainer(), scroller = dragging.collection === 'tabs' ? container : $('#content');
  if (container && scroller) {
    const rect = scroller.getBoundingClientRect(), { x, y } = dragPoint;
    if (x >= rect.left && x <= rect.right) {
      const delta = y < rect.top + 30 ? -Math.ceil((rect.top + 30 - y) / 3) : y > rect.bottom - 30 ? Math.ceil((y - rect.bottom + 30) / 3) : 0;
      if (delta) { scroller.scrollTop += Math.max(-12, Math.min(12, delta)); placeDraggedRow(x, y); }
    }
  }
  dragFrame = requestAnimationFrame(scrollDuringDrag);
}
document.addEventListener('click', event => { if (Date.now() < ignoreDragClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
document.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary || event.target.closest('input,textarea,select,[contenteditable="true"],.library-edit-form')) return;
  const row = event.target.closest('[data-reorder-id]'); if (!row) return;
  finishDragging();
  pointerGrab = { row, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
});
document.addEventListener('pointermove', event => {
  const grab = pointerGrab;
  if (!grab || event.pointerId !== grab.pointerId) return;
  if (!(event.buttons & 1) || !grab.row.isConnected) { finishDragging(); return; }
  if (!dragging) {
    if (Math.hypot(event.clientX - grab.x, event.clientY - grab.y) < 6) return;
    hideTabMemory(); tabPreviews.close();
    dragging = { collection: grab.row.dataset.collection, id: grab.row.dataset.reorderId };
    document.body.dataset.reordering = dragging.collection;
    dragPreview = new FlashbornDragPreview(grab.row, grab.x, grab.y);
    grab.row.classList.add('dragging'); grab.row.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  dragPreview?.move(event.clientX, event.clientY);
  dragPoint = { x: event.clientX, y: event.clientY }; placeDraggedRow(dragPoint.x, dragPoint.y);
  if (!dragFrame) dragFrame = requestAnimationFrame(scrollDuringDrag);
}, { capture: true, passive: false });
document.addEventListener('pointerup', event => {
  if (!pointerGrab || event.pointerId !== pointerGrab.pointerId) return;
  if (!dragging) {
    finishDragging();
    requestAnimationFrame(() => { if (state && !pointerGrab && !dragging) render(state); });
    return;
  }
  placeDraggedRow(event.clientX, event.clientY); const move = dragPlacement;
  event.preventDefault(); finishDragging(); ignoreDragClickUntil = Date.now() + 200;
  if (move) call('reorder', move); else if (state) render(state);
}, true);
function cancelReordering() {
  const held = !!pointerGrab, moved = !!dragging; finishDragging();
  if (moved) ignoreDragClickUntil = Date.now() + 200;
  if (held && state) render(state);
}
document.addEventListener('pointercancel', cancelReordering);
document.addEventListener('lostpointercapture', event => {
  if (pointerGrab?.pointerId === event.pointerId) cancelReordering();
});
window.addEventListener('blur', cancelReordering);
document.addEventListener('dragstart', event => {
  if (event.target.closest('[data-reorder-id]')) event.preventDefault();
});

document.addEventListener('keydown', event => {
  if (!state?.menuOpen || event.ctrlKey || event.metaKey || event.altKey || !['Escape', 'ArrowDown', 'ArrowUp', 'Tab', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  call('menu-key', { key: event.key, shift: event.shiftKey });
}, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && pointerGrab) { event.preventDefault(); cancelReordering(); return; }
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
const menuButton = $('#menu-button');
function toggleBrowserMenu(keyboard = false) {
  call('menu', { keyboard });
}
menuButton.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  toggleBrowserMenu();
});
menuButton.addEventListener('click', event => {
  // Pointer presses already toggle on mouse-down, matching a native menu.
  // Keyboard/assistive activation still arrives as a click without detail.
  if (event.detail === 0) toggleBrowserMenu(true);
});
function find(next = false, forward = true) { call('find', { text: $('#find-input').value, next, forward }); }
$('#find-input').addEventListener('input', () => find());
$('#find-form').addEventListener('submit', e => { e.preventDefault(); find(true); });
$('#find-prev').addEventListener('click', () => find(true, false));
$('#find-close').addEventListener('click', () => { $('#find-form').classList.add('hidden'); call('find', { text: '' }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#find-form').classList.contains('hidden')) $('#find-close').click(); });
const galleryFrames=new Map();
let gallerySharedState=null;
function updateGalleryMask(iframe){iframe.style.clipPath='inset(0px 0px 0px)';}
function postGalleryState(iframe,value){
  if(!value)return;
  iframe.contentWindow.postMessage({type:'flashborn-library-response',ok:true,state:{...value,theme:state.settings.theme,highContrast:!!state.settings.highContrast,embedded:true,stageTop:state.fullscreen?0:60}},new URL(state.libraryPageURL).origin);
}
function renderGalleryStages(){
  const page=state.panelPage||current(),active=(!state.panel||state.panel==='library')&&page?.galleryFrame;
  document.body.classList.toggle('gallery-page',!!active);document.body.classList.toggle('maximized',!!state.maximized);
  if(active&&!galleryFrames.has(page.id)){
    const iframe=document.createElement('iframe'),url=new URL(page.url);url.hash='flashborn-stage';
    iframe.name='corners-gallery-'+page.id;iframe.className='gallery-stage';iframe.title='Flash Gallery';iframe.dataset.pageId=page.id;iframe.dataset.pane=String(state.panel==='library');iframe.setAttribute('sandbox','allow-scripts allow-same-origin');iframe.src=url.href;
    if(page.private)iframe.setAttribute('credentialless','');
    iframe.addEventListener('load',()=>{if(gallerySharedState)postGalleryState(iframe,gallerySharedState);});
    galleryFrames.set(page.id,iframe);$('#gallery-stages').appendChild(iframe);
  }
  for(const [id,iframe]of galleryFrames){
    iframe.hidden=!active||id!==page.id;
    updateGalleryMask(iframe);
    if(iframe.dataset.fullscreen!==String(state.fullscreen)){iframe.dataset.fullscreen=String(state.fullscreen);postGalleryState(iframe,gallerySharedState);}
    if(!state.tabs.some(t=>t.private)&&iframe.dataset.private==='true'||iframe.dataset.pane==='false'&&!state.tabs.some(t=>t.id===id&&t.galleryFrame)){iframe.remove();galleryFrames.delete(id);}
    if(id===page?.id)iframe.dataset.private=String(!!page.private);
  }
}
window.addEventListener('message',async event=>{
  const iframe=[...galleryFrames.values()].find(frame=>frame.contentWindow===event.source);
  if(!iframe||event.origin!==new URL(state.libraryPageURL).origin)return;
  if(event.data?.type==='flashborn-gallery-stage'&&typeof event.data.masked==='boolean'){iframe.dataset.stageReady=String(event.data.masked);updateGalleryMask(iframe);return;}
  if(!iframe.hidden&&event.data?.type==='flashborn-gallery-pointer'){window.browser.menuOutside();return;}
  if(iframe.hidden||event.data?.type!=='flashborn-library-request')return;
  try{const response=await window.browser.galleryRequest(event.data);if(response.state){gallerySharedState=response.state;response.state={...response.state,embedded:true,stageTop:state.fullscreen?0:60};}iframe.contentWindow.postMessage({type:'flashborn-library-response',...response},event.origin);}catch{}
});
window.browser.onGalleryState(value=>{gallerySharedState=value;for(const iframe of galleryFrames.values())postGalleryState(iframe,value);});
window.browser.onGalleryReload(id=>{const iframe=galleryFrames.get(id);if(iframe){iframe.dataset.stageReady='false';iframe.style.transition='none';updateGalleryMask(iframe);requestAnimationFrame(()=>requestAnimationFrame(()=>iframe.style.transition=''));iframe.src=iframe.src;}});
window.browser.onSpecialReload(()=>{filter='';renderContent();$('#content').scrollTop=0;});
window.browser.onState(render);
window.browser.onNotice(toast);
window.browser.onFocusAddress(() => {
  if(state.compactChrome)document.body.classList.add('address-editing');
  $('#address').focus(); $('#address').select();
});
$('#address').addEventListener('blur',()=>document.body.classList.remove('address-editing'));
$('#address').addEventListener('keydown',event=>{if(event.key==='Escape'&&state.compactChrome){document.body.classList.remove('address-editing');$('#address').blur();}});
window.browser.onBlurFields(() => { if (document.activeElement?.matches('input')) document.activeElement.blur(); });
window.browser.onFind(result => {
  if (result.open) { $('#find-form').classList.remove('hidden'); $('#find-input').focus(); $('#find-input').select(); }
  else $('#find-count').textContent = `${result.activeMatchOrdinal} / ${result.matches}`;
});
call('state');

