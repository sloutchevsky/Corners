'use strict';
function render(state) {
  document.body.dataset.theme = state.settings.theme || 'current';
  const tab = state.tabs.find(tab => tab.id === state.activeId);
  const zoom = tab?.zoom || 100;
  document.getElementById('zoom-reset').textContent = zoom + '%';
  document.getElementById('zoom-out').disabled = zoom <= 25 || !tab?.url;
  document.getElementById('zoom-in').disabled = zoom >= 500 || !tab?.url;
  document.getElementById('zoom-reset').disabled = !tab?.url;
  document.getElementById('menu-native').disabled = !tab?.url?.startsWith('http');
  document.getElementById('menu-native').setAttribute('aria-pressed', String(!!tab?.native));
  document.getElementById('menu-mute').firstElementChild.textContent = tab?.muted ? 'Unmute tab' : 'Mute tab';
  document.querySelectorAll('[data-quality]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.quality === state.settings.flashQuality)));
}
async function call(action, args = {}) {
  const result = await window.browser.call(action, args);
  if (result.ok && result.state) render(result.state);
  else if (!result.ok) document.getElementById('menu-error').textContent = result.error;
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  const data = button.dataset;
  if (data.zoom) call('zoom', { direction: Number(data.zoom) });
  else if (data.quality) call('flash-quality', { quality: data.quality });
  else if (data.panel) call('panel', { name: data.panel });
  else if (data.action) call(data.action);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') call('menu-close');
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const buttons = Array.from(document.querySelectorAll('button:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
  }
});
window.browser.onState(render);
call('state');
