'use strict';
window.FlashbornSupport = (() => {
  const selection = { amount: 5, frequency: 'one-time' };
  let state, frame;
  const names = { paypal: 'PayPal', venmo: 'Venmo', link: 'Link' };
  const $ = selector => document.querySelector(selector);
  function markup() {
    return `<section class="support-section" id="about-support" aria-labelledby="support-heading"><div class="support-divider"></div><h2 class="page-headline" id="support-heading">Buy me a coffee</h2><p class="support-description">Enjoying Flashborn? A little support goes a long way.</p><div class="support-amounts" role="group" aria-label="Support amount">${[3,5,10].map(amount => `<button type="button" data-support-amount="${amount}" aria-pressed="${selection.amount === amount}">$${amount}</button>`).join('')}<label class="support-other"><span>Other</span><span>$<input type="number" inputmode="decimal" min="1" max="10000" step="0.01" aria-label="Other support amount in US dollars" placeholder="Amount"></span></label></div><fieldset class="support-frequency"><legend class="visually-hidden">Support frequency</legend>${[['one-time','One-time'],['monthly','Monthly'],['yearly','Yearly']].map(([value,label]) => `<label><input type="radio" name="support-frequency" value="${value}" ${selection.frequency === value ? 'checked' : ''}>${label}</label>`).join('')}</fieldset><div class="support-methods" role="group" aria-label="Payment method">${Object.entries(names).map(([key,name]) => `<button type="button" data-support-provider="${key}">${name}</button>`).join('')}</div><p class="support-status" role="status" aria-live="polite"></p></section>`;
  }
  function refresh(next) {
    state = next;
    const section = $('#about-support'); if (!section) return;
    const amountInput = $('.support-other input');
    if (!amountInput.value && ![3, 5, 10].includes(selection.amount)) amountInput.value = selection.amount;
    const valid = !amountInput.value || Number.isFinite(Number(amountInput.value)) && Number(amountInput.value) >= 1 && Number(amountInput.value) <= 10000;
    let connected = false;
    for (const button of section.querySelectorAll('[data-support-provider]')) {
      const provider = button.dataset.supportProvider;
      const available = !!state.support?.[provider]?.[selection.frequency] && !(provider === 'venmo' && selection.frequency !== 'one-time');
      connected ||= available; button.disabled = !available || !valid;
      button.title = available ? `Continue with ${names[provider]}` : 'Payment link will be added later';
    }
    $('.support-status').textContent = !valid ? 'Enter an amount between $1 and $10,000.' : !connected ? 'Payment options will be available soon.' : 'Confirm the amount and billing frequency at checkout.';
    section.querySelectorAll('[data-support-amount]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.supportAmount) === selection.amount && !amountInput.value)));
  }
  function scroll() {
    const container = $('#content'), target = $('#about-support'); if (!target) return;
    target.classList.add('support-focused');
    cancelAnimationFrame(frame);
    const start = container.scrollTop;
    const end = Math.min(container.scrollHeight - container.clientHeight, start + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 20);
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) { container.scrollTop = end; return; }
    const began = performance.now();
    const step = now => { const t = Math.min(1, (now - began) / 320); container.scrollTop = start + (end - start) * (1 - Math.pow(1 - t, 3)); frame = t < 1 ? requestAnimationFrame(step) : 0; };
    frame = requestAnimationFrame(step);
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-support-jump')) { scroll(); return; }
    if (button.dataset.supportAmount) { selection.amount = Number(button.dataset.supportAmount); $('.support-other input').value = ''; refresh(state); }
    if (button.dataset.supportProvider && !button.disabled) {
      button.disabled = true;
      const result = await window.browser.call('support-checkout', { provider: button.dataset.supportProvider, ...selection });
      refresh(result.state || state);
      $('.support-status').textContent = result.ok ? 'Checkout opened in your default browser.' : result.error;
    }
  });
  document.addEventListener('change', event => {
    if (event.target.name === 'support-frequency') { selection.frequency = event.target.value; refresh(state); }
  });
  document.addEventListener('input', event => {
    if (!event.target.matches('.support-other input')) return;
    const value = Number(event.target.value); if (!event.target.value.trim()) selection.amount = 5; else if (Number.isFinite(value) && value >= 1 && value <= 10000) selection.amount = Math.round(value * 100) / 100;
    refresh(state);
  });
  return { markup, refresh };
})();
