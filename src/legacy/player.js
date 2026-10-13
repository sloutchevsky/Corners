'use strict';
const stage = document.getElementById('stage');
const status = document.getElementById('player-status');
let movie, source, paused = false;
const buttons = Array.from(document.querySelectorAll('.controls button'));
buttons.forEach(b => b.disabled = true);
async function load() {
  source = await (await fetch('/config.json')).json();
  document.getElementById('movie-title').textContent = source.title || 'Flash movie';
  document.title = source.title || 'Flash movie';
  movie = document.createElement('embed');
  movie.id = 'flash-movie'; movie.type = 'application/x-shockwave-flash';
  movie.src = source.path ? '/movie.swf' : source.url; movie.setAttribute('allowScriptAccess', 'always'); movie.setAttribute('allowFullScreen', 'true');
  movie.setAttribute('base', source.path ? 'flashnative://player/assets/' : new URL('.', source.url).href);
  document.documentElement.dataset.theme = source.theme === 'light' ? 'light' : 'current';
  movie.setAttribute('wmode', 'direct'); movie.setAttribute('quality', source.quality || 'high'); movie.setAttribute('bgcolor', '#141414');
  while (stage.firstChild) stage.removeChild(stage.firstChild);
  stage.appendChild(movie);
  const deadline = Date.now() + 60000;
  const timer = setInterval(() => {
    try {
      if (typeof movie.PercentLoaded === 'function' && movie.PercentLoaded() === 100) {
        clearInterval(timer); buttons.forEach(b => b.disabled = false); document.body.dataset.ready = 'true';
        document.body.dataset.flashVersion = movie.GetVariable('$version'); status.textContent = 'Ready · ' + document.body.dataset.flashVersion;
      } else if (Date.now() > deadline) { clearInterval(timer); status.textContent = 'Movie did not finish loading. Check its companion files and network connection.'; }
    } catch (e) { if (Date.now() > deadline) { clearInterval(timer); status.textContent = e.message; } }
  }, 150);
}
document.getElementById('pause').addEventListener('click', () => { paused = !paused; paused ? movie.StopPlay() : movie.Play(); document.getElementById('pause').textContent = paused ? 'Resume' : 'Pause'; status.textContent = paused ? 'Timeline paused' : 'Playing'; });
document.getElementById('restart').addEventListener('click', () => { movie.Rewind(); movie.Play(); paused = false; document.getElementById('pause').textContent = 'Pause'; status.textContent = 'Restarted'; });
document.getElementById('mute').addEventListener('click', async () => { const muted = await window.nativePlayer.mute(); document.getElementById('mute').textContent = muted ? 'Unmute' : 'Mute'; });
document.getElementById('fullscreen').addEventListener('click', () => stage.requestFullscreen());
load().catch(e => { status.textContent = e.message; document.body.dataset.error = e.message; });
