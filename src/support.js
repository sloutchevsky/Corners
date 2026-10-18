'use strict';
const fs = require('node:fs');
const path = require('node:path');
const defaults = require('./support-links.json');
const providers = ['paypal', 'venmo', 'link'];
const frequencies = ['one-time', 'monthly', 'yearly'];
const domains = { paypal: ['paypal.com', 'paypal.me'], venmo: ['venmo.com'], link: ['buy.stripe.com', 'checkout.stripe.com'] };
function validatedLink(provider, value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !domains[provider]?.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return null;
    if ((provider === 'link' || url.hostname.endsWith('paypal.me')) && !url.pathname.split('/').filter(Boolean).length) return null;
    return url;
  } catch { return null; }
}
class SupportLinks {
  constructor(directory) {
    this.file = path.join(directory, 'support-links.json');
    if (!fs.existsSync(this.file)) {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(defaults, null, 2) + '\n', 'utf8');
    }
  }
  read() {
    try { const value = JSON.parse(fs.readFileSync(this.file, 'utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : defaults; } catch { return defaults; }
  }
  state() {
    const data = this.read();
    return Object.fromEntries(providers.map(provider => [provider, Object.fromEntries(frequencies.map(frequency => [frequency, !!validatedLink(provider, data[provider]?.[frequency])]))]));
  }
  checkout(provider, frequency, amount) {
    if (!providers.includes(provider) || !frequencies.includes(frequency)) throw new Error('Choose a payment method and frequency.');
    if (!Number.isFinite(amount) || amount < 1 || amount > 10000) throw new Error('Enter an amount between $1 and $10,000.');
    if (provider === 'venmo' && frequency !== 'one-time') throw new Error('Venmo is available for one-time support. Choose PayPal or Link for recurring support.');
    const url = validatedLink(provider, this.read()[provider]?.[frequency]);
    if (!url) throw new Error('This checkout link has not been connected yet.');
    // Only set documented amount parameters for one-off PayPal donation/profile
    // links. Stripe and recurring links own their amount/plan in hosted checkout.
    if (provider === 'paypal' && frequency === 'one-time') {
      if (url.hostname === 'paypal.me' || url.hostname === 'www.paypal.me') {
        url.pathname = '/' + url.pathname.split('/').filter(Boolean)[0] + '/' + amount.toFixed(2) + 'USD';
      } else if (url.pathname.startsWith('/donate')) { url.searchParams.set('amount', amount.toFixed(2)); url.searchParams.set('currency_code', 'USD'); }
    }
    return url.href;
  }
}
module.exports = { SupportLinks, validatedLink };
