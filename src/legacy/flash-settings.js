'use strict';
function settingsScript(quality, theme) {
  return `(() => {
    const quality = ${JSON.stringify(quality === 'low' ? 'LOW' : 'HIGH')};
    const theme = ${JSON.stringify(theme === 'light' ? 'light' : 'current')};
    let loading = false, applied = 0;
    function visit(frame) {
      try {
        const doc = frame.document;
        if (frame.location.protocol === 'flashnative:') doc.documentElement.dataset.theme = theme;
        Array.from(doc.querySelectorAll('object,embed')).forEach(movie => {
          const isFlash = /shockwave-flash/i.test(movie.type || '') || /\\.swf(?:[?#]|$)/i.test(movie.getAttribute('src') || movie.getAttribute('data') || '') || typeof movie.SetVariable === 'function';
          if (!isFlash) return;
          if (movie.getAttribute('quality') !== quality.toLowerCase()) movie.setAttribute('quality', quality.toLowerCase());
          Array.from(movie.querySelectorAll('param')).filter(param => param.name.toLowerCase() === 'quality').forEach(param => { param.value = quality.toLowerCase(); });
          try {
            if (typeof movie.PercentLoaded === 'function') loading = loading || movie.PercentLoaded() < 100;
            if (typeof movie.TSetProperty === 'function' && typeof movie.TGetProperty === 'function') {
              // Flash movie property 19 is rendering quality; ordinary GetVariable does not read it.
              if (movie.TGetProperty('/', 19) !== quality) movie.TSetProperty('/', 19, quality);
              applied++;
            } else if (typeof movie.SetVariable === 'function') {
              movie.SetVariable('_root._quality', quality);
              applied++;
            }
          } catch { /* Retry when the Flash instance becomes ready. */ }
        });
        for (let i = 0; i < frame.frames.length; i++) visit(frame.frames[i]);
      } catch { /* Respect the same-origin boundary for third-party frames. */ }
    }
    visit(window);
    return { loading, applied };
  })()`;
}
module.exports = { settingsScript };
