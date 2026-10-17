'use strict';
function deletionChoices(input = {}) {
  return { history: input.history === true, cookies: input.cookies === true, cache: input.cache === true };
}
async function clearSessionData(session, input, extensionOrigins = []) {
  const choices = deletionChoices(input);
  if (!session) return;
  if (choices.cookies) {
    if (typeof session.clearData === 'function') {
      await session.clearData({ dataTypes: ['cookies', 'fileSystems', 'indexedDB', 'localStorage', 'serviceWorkers', 'webSQL', 'backgroundFetch'], ...(extensionOrigins.length ? { excludeOrigins: extensionOrigins } : {}) });
    } else {
      await session.clearStorageData({ storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'websql', 'serviceworkers', 'cachestorage'] });
    }
    await session.clearAuthCache();
  }
  if (choices.cache) {
    await session.clearCache();
    if (typeof session.clearCodeCaches === 'function') await session.clearCodeCaches({ urls: [] });
  }
}
module.exports = { deletionChoices, clearSessionData };
