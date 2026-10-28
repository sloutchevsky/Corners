'use strict';
const menu = document.querySelector('.browser-menu');
const menuRows = [...menu.querySelectorAll(':scope > button,:scope > .menu-control-row')];
let hoveredRow = null, selectedRow = null, clickedRow = null, keyboardButton = null;
function rowFor(button) { return button?.closest('.menu-control-row') || (button?.parentElement === menu ? button : null); }
function positionSelection() {
  const row = hoveredRow || rowFor(keyboardButton) || selectedRow;
  if (row) {
    menu.style.setProperty('--selection-y', row.offsetTop + 'px');
    menu.style.setProperty('--selection-height', row.offsetHeight + 'px');
  }
  menu.classList.toggle('selection-visible', !!row);
}
for (const row of menuRows) {
  row.addEventListener('pointerenter', () => {
    if (row.matches('button:disabled')) return;
    hoveredRow = row; positionSelection();
  });
  row.addEventListener('pointerleave', () => { hoveredRow = null; positionSelection(); });
}
function clearHover() { hoveredRow = null; positionSelection(); }
menu.addEventListener('pointerleave', clearHover);
menu.addEventListener('pointercancel', clearHover);
window.addEventListener('blur', clearHover);
new ResizeObserver(positionSelection).observe(menu);
function render(state) {
  document.body.dataset.theme = state.settings.theme || 'current';
  document.body.dataset.contrast = state.settings.highContrast ? 'high' : 'normal';
  const tab = state.panelPage || state.tabs.find(tab => tab.id === state.activeId);
  const zoom = tab?.zoom || 100;
  document.getElementById('zoom-reset').textContent = zoom + '%';
  document.getElementById('zoom-out').disabled = zoom <= 25 || !tab?.url;
  document.getElementById('zoom-in').disabled = zoom >= 500 || !tab?.url;
  document.getElementById('zoom-reset').disabled = !tab?.url;
  document.getElementById('menu-native').disabled = false;
  document.getElementById('menu-native').setAttribute('aria-pressed', String(!!tab?.flashDetected));
  document.getElementById('menu-mute').firstElementChild.textContent = tab?.muted ? 'Unmute tab' : 'Mute tab';
  document.querySelectorAll('[data-quality]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.quality === (tab?.flashQuality || state.settings.flashQuality))));
  selectedRow = clickedRow || menuRows.find(row => row.dataset.panel === state.panel && !row.dataset.section) || null;
  positionSelection();
}
async function call(action, args = {}) {
  const result = await window.browser.call(action, args);
  if (result.ok && result.state) render(result.state);
  else if (!result.ok) document.getElementById('menu-error').textContent = result.error;
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!event.target.closest('.menu-surface')) { call('menu-close'); return; }
  if (!button || button.disabled) return;
  clickedRow = selectedRow = rowFor(button); positionSelection();
  const data = button.dataset;
  if (data.zoom) call('zoom', { direction: Number(data.zoom) });
  else if (data.quality) call('flash-quality', { quality: data.quality });
  else if (data.panel) call('panel', { name: data.panel, section: data.section });
  else if (data.action) call(data.action);
});
function menuKey(key, shift = false) {
  if (key === 'Escape') call('menu-close');
  if (['ArrowDown', 'ArrowUp', 'Tab'].includes(key)) {
    const buttons = Array.from(document.querySelectorAll('button:not(:disabled)'));
    const index = buttons.indexOf(keyboardButton);
    const forward = key === 'ArrowDown' || key === 'Tab' && !shift;
    keyboardButton?.classList.remove('keyboard-active');
    keyboardButton = buttons[index < 0 ? forward ? 0 : buttons.length - 1 : (index + (forward ? 1 : buttons.length - 1)) % buttons.length];
    keyboardButton?.classList.add('keyboard-active');
    hoveredRow = null; positionSelection();
  }
  if (key === 'Enter' || key === ' ') keyboardButton?.click();
}
document.addEventListener('pointermove', () => { keyboardButton?.classList.remove('keyboard-active'); keyboardButton = null; positionSelection(); });
document.addEventListener('keydown', event => {
  if (!['Escape', 'ArrowDown', 'ArrowUp', 'Tab', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault(); menuKey(event.key, event.shiftKey);
});
window.browser.onMenuKey(({ key, shift }) => menuKey(key, shift));
let menuSlide;
window.resetMenu = () => {
  menuSlide?.cancel();menuSlide=null;
  document.querySelector('.menu-surface').style.transform='translateY(-100%)';
  hoveredRow=selectedRow=clickedRow=null;
  keyboardButton?.classList.remove('keyboard-active');keyboardButton=null;
  menu.scrollTop=0;document.getElementById('menu-error').textContent='';positionSelection();
};
window.animateMenu = (target,duration) => {
  const surface=document.querySelector('.menu-surface');
  const from=getComputedStyle(surface).transform;
  surface.style.transform=from;
  menuSlide?.cancel();
  const to=`translateY(${target ? 0 : -surface.offsetHeight}px)`;
  surface.style.transform=to;
  const animation=menuSlide=surface.animate([{transform:from},{transform:to}],{
    duration,easing:'cubic-bezier(.333333,1,.666667,1)'
  });
  return animation.finished.catch(()=>{}).then(()=>{if(menuSlide===animation)menuSlide=null;});
};
window.browser.onState(render);
call('state');
