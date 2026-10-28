'use strict';
function render(state) {
  document.body.dataset.theme = state.settings.theme || 'current';
  document.body.dataset.contrast = state.settings.highContrast ? 'high' : 'normal';
  const level = (state.panelPage || state.tabs.find(tab => tab.id === state.activeId))?.zoom || 100;
  document.getElementById('zoom-level').textContent = level + '%';
  document.getElementById('zoom-out').disabled = level <= 25;
  document.getElementById('zoom-in').disabled = level >= 500;
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-zoom]');
  if (button && !button.disabled) window.browser.call('zoom', { direction: Number(button.dataset.zoom) });
});
document.addEventListener('mouseenter', () => window.browser.call('zoom-hold'));
document.addEventListener('mouseleave', () => window.browser.call('zoom-release'));
window.browser.onState(render);
window.browser.call('state').then(result => { if (result.ok) render(result.state); });
