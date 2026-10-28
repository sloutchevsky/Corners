'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// A service-worker preload realm has no location object of its own.
const extensionContext = process.contextIsolated ? contextBridge.executeInMainWorld({ func: () => globalThis.location?.protocol === 'chrome-extension:' }) : globalThis.location?.protocol === 'chrome-extension:';
if (extensionContext) {
  const api = {
    call: (method, args) => ipcRenderer.invoke('extension:api', method, args),
    listen: callback => ipcRenderer.on('extension:event', (_event, name, args) => callback(name, args)),
    browserInfo: { name: 'Chromium', vendor: 'Corners', version: process.versions.chrome, buildID: process.versions.electron }
  };
  if (process.contextIsolated) contextBridge.exposeInMainWorld('__flashbornExtension', api);
  else globalThis.__flashbornExtension = api;
  const installAPIs = () => {
    const bridge = globalThis.__flashbornExtension, events = new Map();
    const event = name => {
      if (!events.has(name)) {
        const listeners = new Set();
        events.set(name, { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn), hasListener: fn => listeners.has(fn), hasListeners: () => !!listeners.size, dispatch: args => { for (const fn of listeners) { try { fn(...args); } catch (error) { console.error(error); } } } });
      }
      return events.get(name);
    };
    bridge.listen((name, args) => events.get(name)?.dispatch(args));
    const method = name => (...args) => {
      const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      const promise = bridge.call(name, args);
      if (callback) { promise.then(value => callback(value), error => { console.error(name, error); callback(); }); return; }
      return promise;
    };
    const fill = (namespace, methods, eventNames) => {
      const api = chrome[namespace] ||= {};
      for (const name of methods) api[name] = method(namespace + '.' + name);
      for (const name of eventNames) api[name] = event(namespace + '.' + name);
    };
    fill('tabs', ['get', 'getCurrent', 'query', 'create', 'update', 'remove', 'insertCSS', 'removeCSS', 'executeScript'], ['onCreated', 'onRemoved', 'onUpdated', 'onActivated', 'onReplaced']);
    fill('webNavigation', ['getAllFrames', 'getFrame'], ['onBeforeNavigate', 'onCommitted', 'onDOMContentLoaded', 'onCompleted', 'onHistoryStateUpdated', 'onErrorOccurred', 'onCreatedNavigationTarget']);
    fill('windows', ['get', 'getCurrent', 'getLastFocused', 'getAll', 'update'], ['onRemoved', 'onFocusChanged']);
    fill('contextMenus', ['removeAll', 'remove', 'update'], ['onClicked']);
    chrome.contextMenus.create = (options, callback) => { const id = options.id || crypto.randomUUID(); method('contextMenus.create')({ ...options, id }, callback || (() => {})); return id; };
    fill('runtime', ['openOptionsPage', 'setUninstallURL'], []);
    if (!chrome.browserAction) fill('browserAction', ['getPopup', 'setPopup', 'getTitle', 'setTitle', 'getBadgeText', 'setBadgeText', 'getBadgeBackgroundColor', 'setBadgeBackgroundColor', 'setIcon', 'enable', 'disable'], ['onClicked']);
    chrome.runtime.getBrowserInfo ||= callback => { if (callback) { callback(bridge.browserInfo); return; } return Promise.resolve(bridge.browserInfo); };
    // Managed storage is read-only and absent without administrator policies.
    // It must not alias local storage or silently impersonate cloud sync.
    chrome.storage.managed ||= { get: (keys, callback) => { const value = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {}; if (callback) { callback(value); return; } return Promise.resolve(value); } };
    // Current Chromium also exposes a native `browser` namespace. Some
    // extensions choose that directly instead of wrapping `chrome`.
    if (globalThis.browser && globalThis.browser !== chrome) {
      for (const namespace of ['tabs', 'webNavigation', 'windows', 'contextMenus', 'runtime', 'browserAction']) {
        if (!chrome[namespace]) continue;
        const target = globalThis.browser[namespace] ||= {};
        for (const [key, value] of Object.entries(chrome[namespace])) if (!target[key] || namespace === 'tabs' && ['query', 'get', 'getCurrent', 'create', 'update', 'remove', 'insertCSS', 'removeCSS', 'executeScript'].includes(key)) target[key] = value;
      }
      globalThis.browser.storage.managed ||= chrome.storage.managed;
    }
  };
  if (process.contextIsolated) contextBridge.executeInMainWorld({ func: installAPIs });
  else installAPIs();
}
