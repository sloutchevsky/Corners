'use strict';
function settingsScript(quality) {
  return `(() => {
    const quality = ${JSON.stringify(['low', 'medium', 'high'].includes(quality) ? quality.toUpperCase() : 'HIGH')};
    let applied = 0;
    function visit(frame) {
      try {
        const doc = frame.document;
        // A quality command is applied once to each ready plugin instance.
        // Calling into PPAPI repeatedly stalls the movie's rendering/input thread.
        const settings = frame.__flashbornMovieSettings || (frame.__flashbornMovieSettings = new WeakMap());
        Array.from(doc.querySelectorAll('object,embed')).forEach(movie => {
          const isFlash = /shockwave-flash/i.test(movie.type || '') || /\\.swf(?:[?#]|$)/i.test(movie.getAttribute('src') || movie.getAttribute('data') || '') || typeof movie.SetVariable === 'function';
          if (!isFlash) return;
          if (settings.get(movie) === quality) return;
          try {
            if (typeof movie.TSetProperty === 'function') {
              // Flash movie property 19 is rendering quality; ordinary GetVariable does not read it.
              movie.TSetProperty('/', 19, quality);
              applied++;
              settings.set(movie, quality);
            } else if (typeof movie.SetVariable === 'function') {
              movie.SetVariable('_root._quality', quality);
              applied++;
              settings.set(movie, quality);
            }
          } catch { /* The movie may have gone away or may not expose a ready script API. */ }
        });
        for (let i = 0; i < frame.frames.length; i++) visit(frame.frames[i]);
      } catch { /* Respect the same-origin boundary for third-party frames. */ }
    }
    visit(window);
    return { applied };
  })()`;
}
module.exports = { settingsScript };
