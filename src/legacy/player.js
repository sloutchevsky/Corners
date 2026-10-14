'use strict';
const stage = document.getElementById('stage');
const status = document.getElementById('player-status');
let movie, source, paused = false;
let readyTimer, background = '#ffffff';
const buttons = Array.from(document.querySelectorAll('.controls button'));
buttons.forEach(b => b.disabled = true);
async function load() {
  source = await (await fetch('/config.json')).json();
  document.getElementById('movie-title').textContent = source.title || 'Flash movie';
  document.title = source.title || 'Flash movie';
  document.getElementById('flash-engine').textContent = 'Adobe Flash ' + source.flashVersion;
  movie = document.createElement('embed');
  movie.id = 'flash-movie'; movie.type = 'application/x-shockwave-flash';
  movie.src = source.path ? '/movie.swf' : source.url; movie.setAttribute('allowScriptAccess', 'always'); movie.setAttribute('allowFullScreen', 'true');
  movie.setAttribute('base', source.path ? 'flashnative://player/assets/' : new URL('.', source.url).href);
  document.documentElement.dataset.theme = source.theme === 'light' ? 'light' : 'current';
  background = source.background || '#ffffff';
  stage.style.backgroundColor = background; document.getElementById('background-swatch').style.backgroundColor = background;
  movie.setAttribute('wmode', 'direct'); movie.setAttribute('quality', source.quality || 'high'); movie.setAttribute('bgcolor', background);
  while (stage.firstChild) stage.removeChild(stage.firstChild);
  stage.appendChild(movie);
  waitUntilReady();
}
function waitUntilReady(restore) {
  clearInterval(readyTimer);
  const deadline = Date.now() + 60000;
  readyTimer = setInterval(() => {
    try {
      if (typeof movie.PercentLoaded === 'function' && movie.PercentLoaded() === 100) {
        clearInterval(readyTimer);
        if (restore) { movie.GotoFrame(restore.frame); restore.playing ? movie.Play() : movie.StopPlay(); }
        buttons.forEach(b => b.disabled = false); document.body.dataset.ready = 'true';
        try { document.body.dataset.flashVersion = movie.GetVariable('$version'); } catch { /* Some movies restrict Flash scripting. Readiness is independent of version access. */ }
        status.textContent = 'Ready · ' + (document.body.dataset.flashVersion || 'Adobe Flash ' + source.flashVersion);
      } else if (Date.now() > deadline) { clearInterval(readyTimer); status.textContent = 'Movie did not finish loading. Check its companion files and network connection.'; }
    } catch (e) { if (Date.now() > deadline) { clearInterval(readyTimer); status.textContent = e.message; } }
  }, 150);
}
document.getElementById('pause').addEventListener('click', () => { paused = !paused; paused ? movie.StopPlay() : movie.Play(); document.getElementById('pause').textContent = paused ? 'Resume' : 'Pause'; status.textContent = paused ? 'Timeline paused' : 'Playing'; });
document.getElementById('restart').addEventListener('click', () => { movie.Rewind(); movie.Play(); paused = false; document.getElementById('pause').textContent = 'Pause'; status.textContent = 'Restarted'; });
document.getElementById('mute').addEventListener('click', async () => { const muted = await window.nativePlayer.mute(); document.getElementById('mute').textContent = muted ? 'Unmute' : 'Mute'; });
document.getElementById('fullscreen').addEventListener('click', () => window.nativePlayer.fullscreen());
document.getElementById('background').addEventListener('click', () => window.nativePlayer.color());
window.nativePlayer.onState(next => {
  if (typeof next.fullscreen === 'boolean') document.getElementById('fullscreen').textContent = next.fullscreen ? 'Exit full screen' : 'Full screen';
  if (!/^#[0-9a-f]{6}$/i.test(next.background || '') || next.background === background) return;
  background = next.background; stage.style.backgroundColor = background;
  document.getElementById('background-swatch').style.backgroundColor = background;
  if (!movie) return;
  let restore;
  try { restore = { frame: movie.CurrentFrame(), playing: movie.IsPlaying() }; } catch {}
  // PPAPI reads BGCOLOR when constructing its instance, not on attribute changes.
  const replacement = movie.cloneNode(false); replacement.setAttribute('bgcolor', background);
  stage.replaceChild(replacement, movie); movie = replacement; document.body.dataset.ready = 'false';
  buttons.forEach(button => button.disabled = true); waitUntilReady(restore);
});
load().catch(e => { status.textContent = e.message; document.body.dataset.error = e.message; });
