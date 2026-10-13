'use strict';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function render(state) {
  document.body.dataset.theme = state.settings.theme || 'current';
  const data = state.suggestions;
  document.getElementById('suggestions').innerHTML = (data?.items || []).map((item, index) => `<button role="option" aria-selected="${index === data.selected}" data-index="${index}"><span>${escape(item.title)}</span><small>${escape(item.url)}</small></button>`).join('');
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-index]');
  if (button) window.browser.call('suggest-open', { index: Number(button.dataset.index) });
});
window.browser.onState(render);
window.browser.call('state').then(result => { if (result.ok) render(result.state); });
