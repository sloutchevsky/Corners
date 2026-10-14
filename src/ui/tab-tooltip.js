'use strict';
function render(state) {
  document.body.dataset.theme = state.settings.theme || 'current';
  const data = state.tabTooltip;
  document.getElementById('tab-title').textContent = data?.title || '';
  document.getElementById('tab-memory').textContent = data?.megabytes === null ? '… MB' : (data?.megabytes ?? 0) + ' MB';
}
window.browser.onState(render);
window.browser.call('state').then(result => { if (result.ok) render(result.state); });
