'use strict';
const permissionNames = { media:'your camera or microphone', geolocation:'your location', notifications:'notifications', 'clipboard-read':'your clipboard', 'clipboard-sanitized-write':'copy text to your clipboard' };
function originOf(url) {
  try { const value = new URL(url); return ['https:', 'http:'].includes(value.protocol) ? value.origin : null; } catch { return null; }
}
class SitePermissions {
  constructor({ saved = [], save = () => {}, prompt, canPrompt = () => true }) {
    this.decisions = new Map(); this.pending = new Map(); this.revision = 0;
    this.save = save; this.prompt = prompt; this.canPrompt = canPrompt;
    for (const entry of saved) if (entry && originOf(entry.origin) === entry.origin && Object.hasOwn(permissionNames, entry.permission) && typeof entry.allowed === 'boolean') this.decisions.set(`${entry.origin}|${entry.permission}`, entry.allowed);
  }
  entries() {
    return [...this.decisions].map(([key, allowed]) => { const [origin, permission] = key.split('|'); return { origin, permission, allowed }; });
  }
  clear() { this.revision++; this.decisions.clear(); this.pending.clear(); this.save([]); }
  clipboardWrite(wc, requester) {
    if (!wc || wc.isDestroyed() || !requester || requester !== originOf(wc.getURL()) || !this.canPrompt(wc)) return false;
    return this.decisions.get(`${requester}|clipboard-sanitized-write`) !== false;
  }
  check(wc, permission, origin, details = {}) {
    if (permission === 'fullscreen') return true;
    const requester = originOf(origin || details.requestingUrl);
    if (permission === 'clipboard-sanitized-write') return this.clipboardWrite(wc, requester);
    if (permission === 'notifications' && wc && requester !== originOf(wc.getURL())) return false;
    return !!requester && this.decisions.get(`${requester}|${permission}`) === true;
  }
  async request(wc, permission, details = {}) {
    if (permission === 'fullscreen') return true;
    if (!Object.hasOwn(permissionNames, permission) || !wc || wc.isDestroyed()) return false;
    const origin = originOf(details.requestingUrl || wc.getURL()), top = originOf(wc.getURL());
    if (!origin || !top) return false;
    // Writing from the active page is ordinary Copy behavior. Reading clipboard
    // contents remains a separate permission and still requires a user decision.
    if (permission === 'clipboard-sanitized-write') return this.clipboardWrite(wc, origin);
    // Embedded services must not interrupt another site's page with notification
    // prompts. Visit the service itself to choose its notification permission.
    if (permission === 'notifications' && origin !== top) return false;
    const key = `${origin}|${permission}`;
    if (this.decisions.has(key)) return this.decisions.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    if (!this.canPrompt(wc)) return false;
    const revision = this.revision;
    const request = Promise.resolve().then(() => this.prompt(origin, permissionNames[permission])).then(allowed => {
      if (revision !== this.revision || wc.isDestroyed() || originOf(wc.getURL()) !== top) return false;
      this.decisions.set(key, allowed === true); this.save(this.entries()); return allowed === true;
    }).catch(() => false).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request); return request;
  }
  install(session) {
    session.setPermissionCheckHandler((...args) => this.check(...args));
    session.setPermissionRequestHandler((wc, permission, callback, details) => { this.request(wc, permission, details).then(callback, () => callback(false)); });
  }
}
module.exports = { SitePermissions, originOf };
