'use strict';
let player, options, paused = false, muted = false;
const stage = document.getElementById('stage');
const status = document.getElementById('player-status');
const buttons = [...document.querySelectorAll('.controls button')];
buttons.forEach(b => b.disabled = true);
async function start() {
  const id = new URLSearchParams(location.search).get('movie');
  if (!/^[a-f0-9]{48}$/.test(id || '')) throw new Error('This movie is no longer available. Open it again from your library.');
  const configResponse = await fetch(`flashborn://movie/${id}/config.json`);
  if (!configResponse.ok) throw new Error(await configResponse.text());
  const source = await configResponse.json();
  document.getElementById('movie-title').textContent = source.title || 'Flash movie';
  document.title = source.title || 'Flash movie';
  const response = await fetch(`flashborn://movie/${id}/content.swf`);
  if (!response.ok) throw new Error(await response.text());
  options = { data: new Uint8Array(await response.arrayBuffer()), swfFileName: source.filename, base: source.base, allowScriptAccess: false };
  if (!window.RufflePlayer?.newest) throw new Error('The bundled Flash engine could not start. Reinstall Flashborn to restore it.');
  player = window.RufflePlayer.newest().createPlayer();
  stage.replaceChildren(player);
  await player.ruffle().load(options);
  status.textContent = 'Ready · ' + source.filename;
  buttons.forEach(b => b.disabled = false);
  // Useful to assistive technology and automated playback verification.
  document.body.dataset.ready = 'true';
}
function showError(error) {
  const box = document.createElement('div'); box.className = 'error';
  const title = document.createElement('h1'); title.textContent = 'This movie couldn’t play.';
  const detail = document.createElement('p'); detail.textContent = error.message || String(error);
  const note = document.createElement('small'); note.textContent = 'Flash compatibility varies by title. A game may also depend on assets or servers that are no longer available.';
  box.append(title, detail, note); stage.replaceChildren(box); status.textContent = 'Playback unavailable';
}
document.getElementById('pause').addEventListener('click', () => { paused = !paused; paused ? player.ruffle().suspend() : player.ruffle().resume(); document.getElementById('pause').textContent = paused ? 'Resume' : 'Pause'; status.textContent = paused ? 'Paused' : 'Playing'; });
document.getElementById('restart').addEventListener('click', async () => { buttons.forEach(b => b.disabled = true); try { await player.ruffle().load(options); player.ruffle().volume = muted ? 0 : 1; paused = false; document.getElementById('pause').textContent = 'Pause'; status.textContent = 'Restarted'; buttons.forEach(b => b.disabled = false); } catch (e) { showError(e); } });
document.getElementById('mute').addEventListener('click', () => { muted = !muted; player.ruffle().volume = muted ? 0 : 1; document.getElementById('mute').textContent = muted ? 'Unmute' : 'Mute'; });
document.getElementById('fullscreen').addEventListener('click', () => stage.requestFullscreen().catch(e => { status.textContent = e.message; }));
start().catch(showError);
