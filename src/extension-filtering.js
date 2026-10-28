'use strict';
const { BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const resourceTypes = { mainFrame:'main_frame', subFrame:'sub_frame', xhr:'xmlhttprequest', webSocket:'websocket', cspReport:'csp_report' };
// Electron exposes Chromium's DNR rule storage and matcher, but its page request
// path does not enforce those results. Use that same native matcher and the
// extension's own enabled/static/dynamic rules to complete the request path.
class ExtensionFiltering {
  constructor(session) { this.session = session; this.hosts = new Map(); }
  async add(extension) {
    if (!extension.manifest.declarative_net_request) return;
    const hostFile = '.flashborn-filter-host.html';
    await fs.writeFile(path.join(extension.path, hostFile), '<!doctype html><meta charset="utf-8"><title>Corners extension filtering host</title>');
    const window = new BrowserWindow({ show:false, skipTaskbar:true, webPreferences:{ session:this.session, sandbox:true, contextIsolation:true, nodeIntegration:false, webSecurity:true } });
    window.setMenu(null); window.webContents.setWindowOpenHandler(() => ({action:'deny'})); window.webContents.on('will-navigate', event => event.preventDefault());
    try { await window.loadURL(extension.url + hostFile); }
    catch (error) { window.destroy(); throw error; }
    this.hosts.set(extension.id, { window, extension, rulesets: new Map() });
  }
  remove(id) {
    const host = this.hosts.get(id); this.hosts.delete(id);
    if (host && !host.window.isDestroyed()) host.window.destroy();
  }
  async beforeRequest(details) {
    if (!/^https?:/.test(details.url)) return {};
    const input = { url: details.url, type: resourceTypes[details.resourceType] || details.resourceType || 'other', method: (details.method || 'GET').toLowerCase(), tabId: Math.max(-1, details.webContentsId ?? -1) };
    const pageURL = /^https?:/.test(details.pageURL || '') ? details.pageURL : details.referrer;
    if (/^https?:/.test(details.referrer || pageURL || '')) input.initiator = details.referrer || pageURL;
    for (const [id, host] of this.hosts) {
      if (host.window.isDestroyed()) continue;
      const documentInput = /^https?:/.test(pageURL || '') && input.type !== 'main_frame' ? {...input, url:pageURL, type:'main_frame', method:'get'} : null;
      const data = await host.window.webContents.executeJavaScript(`(async (input,documentInput)=>{const dnr=chrome.declarativeNetRequest;const [outcome,document,dynamic,session]=await Promise.all([dnr.testMatchOutcome(input),documentInput?dnr.testMatchOutcome(documentInput):null,dnr.getDynamicRules(),dnr.getSessionRules()]);return {matched:outcome.matchedRules,document:document?.matchedRules||[],dynamic,session};})(${JSON.stringify(input)},${JSON.stringify(documentInput)})`);
      if (!this.hosts.has(id)) continue;
      const candidates = [];
      const documentRules = [];
      for (const match of [...data.matched, ...data.document.map(match=>({...match,document:true}))]) {
        let rule;
        if (match.rulesetId === '_dynamic') rule = data.dynamic.find(rule => rule.id === match.ruleId);
        else if (match.rulesetId === '_session') rule = data.session.find(rule => rule.id === match.ruleId);
        else {
          let rules = host.rulesets.get(match.rulesetId);
          if (!rules) {
            const resource = host.extension.manifest.declarative_net_request.rule_resources.find(item => item.id === match.rulesetId);
            if (!resource) continue;
            const root = path.resolve(host.extension.path), file = path.resolve(root, resource.path);
            if (!file.startsWith(root + path.sep)) continue;
            rules = new Map(JSON.parse(await fs.readFile(file, 'utf8')).map(rule => [rule.id, rule])); host.rulesets.set(match.rulesetId, rules);
          }
          rule = rules.get(match.ruleId);
        }
        if (rule) (match.document ? documentRules : candidates).push(rule);
      }
      const precedence = { allow:5, allowAllRequests:4, block:3, upgradeScheme:2, redirect:1 };
      candidates.sort((a,b) => (b.priority || 1) - (a.priority || 1) || (precedence[b.action.type] || 0) - (precedence[a.action.type] || 0));
      const inherited = documentRules.filter(rule=>rule.action.type==='allowAllRequests').sort((a,b)=>(b.priority||1)-(a.priority||1))[0];
      const action = inherited && (inherited.priority || 1) >= (candidates[0]?.priority || 1) ? inherited.action : candidates[0]?.action;
      const result = action?.type === 'block' ? {cancel:true} : action?.type === 'upgradeScheme' && details.url.startsWith('http:') ? {redirectURL:details.url.replace(/^http:/,'https:')} : action?.type === 'redirect' && /^https?:/.test(action.redirect?.url || '') ? {redirectURL:action.redirect.url} : {};
      if (result.cancel || result.redirectURL) return result;
    }
    return {};
  }
}
module.exports = { ExtensionFiltering };
