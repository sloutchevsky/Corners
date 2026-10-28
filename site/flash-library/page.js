(function () {
  'use strict';
  var defaults = JSON.parse(document.getElementById('library-data').textContent);
  var data = JSON.parse(JSON.stringify(defaults)), managed = false, pending = {}, sequence = 0, editorId = null, imageId = null, noticeTimer;
  var storageKey = 'flashborn.library.v1', query = '', grab = null, drag = null, preview = null, placement = null, ignoreClickUntil = 0;
  var featureZoom = 2, featurePress = null;
  var $ = function (s) { return document.querySelector(s); };
  var escape = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var icon = function (name) { return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; };
  function safeURL(value) { try { var u = new URL(value); return /^(https?:)$/.test(u.protocol) && !u.username && !u.password ? u.href : null; } catch (_) { return null; } }
  function notice(text) { $('#notice').textContent = text; $('#notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(function () { $('#notice').hidden = true; }, 4200); }
  function request(action, args) {
    return new Promise(function (resolve, reject) {
      var id = String(++sequence), timer = setTimeout(function () { delete pending[id]; reject(Error('Flashborn did not respond. Please try again.')); }, action === 'state' ? 10000 : 180000);
      pending[id] = {resolve:resolve,reject:reject,timer:timer};
      window.postMessage({type:'flashborn-library-request',id:id,action:action,args:args || {}}, location.origin === 'null' ? '*' : location.origin);
    });
  }
  window.addEventListener('message', function (event) {
    if (event.source !== window || event.origin !== location.origin || !event.data || event.data.type !== 'flashborn-library-response') return;
    var message = event.data, task = pending[message.id];
    if (message.state) applyState(message.state);
    if (!task) return;
    clearTimeout(task.timer); delete pending[message.id];
    if (message.ok) task.resolve(message.state); else task.reject(Error(message.error || 'This change could not be saved.'));
  });
  function applyState(state) {
    if (!state || !Array.isArray(state.items)) return;
    managed = true; data.items = state.items;
    data.introduction = state.heading && state.heading.subtitle || defaults.introduction;
    document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'current';
    $('#browse-page').hidden = false; renderCards(); renderIntroduction();
  }
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(data)); return true; } catch (_) { notice('Storage is full. Try a smaller thumbnail image.'); return false; } }
  async function change(action, args, localChange) {
    if (managed) await request(action, args);
    else { localChange(); persist(); renderCards(); renderIntroduction(); }
  }
  function renderFeature() {
    var feature = data.feature, url = safeURL(feature.url), destination = safeURL(feature.pageURL);
    $('#feature-title').textContent = feature.title;
    $('#feature-credit').innerHTML = '<em>' + escape(feature.createdBy) + '</em>' + (feature.year && feature.createdBy ? ' ' : '') + escape(feature.year);
    if (destination) $('#feature-caption-link').href = destination;
    if (/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(feature.image || '')) {
      $('#feature-stage').dataset.kind='image';
      $('#feature-stage').innerHTML=(destination ? '<a href="'+escape(destination)+'" target="_blank" rel="noopener" aria-label="Open '+escape(feature.title)+'">' : '')+'<img id="feature-image" src="'+feature.image+'" alt="'+escape(feature.title)+'" draggable="false">'+(destination ? '</a>' : '');
      return;
    }
    if (!url) return;
    $('#feature-stage').innerHTML = '<object id="freedomDemo" data="' + escape(url) + '" type="application/x-shockwave-flash" width="100%" height="100%"><param name="movie" value="' + escape(url) + '"><param name="quality" value="high"><param name="bgcolor" value="#e1e2e3"><param name="wmode" value="opaque"><param name="menu" value="true"><param name="allowScriptAccess" value="never"><param name="allowFullScreen" value="false"><div class="flash-fallback"><div>Live Freedom + Partners demo<a href="' + escape(destination || url) + '" target="_blank" rel="noopener">Open Freedom + Partners</a></div></div></object>';
  }
  function setFeatureZoom(value) { featureZoom=Math.max(1,Math.min(8,value));var movie=$('#freedomDemo');if(movie){movie.style.width=movie.style.height=(featureZoom*100)+'%';movie.style.left=movie.style.top=((1-featureZoom)*50)+'%';}$('#feature-stage').dataset.zoom=String(featureZoom); }
  $('#feature-stage').addEventListener('wheel',function(event){if($('#feature-stage').dataset.kind==='image')return;var delta=event.deltaY||event.deltaX;if(!delta)return;event.preventDefault();event.stopPropagation();var pixels=delta*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);setFeatureZoom(featureZoom*Math.exp(-Math.max(-100,Math.min(100,pixels))*.0015));},{passive:false,capture:true});
  $('#feature-stage').addEventListener('mousedown',function(event){featurePress=event.button===0&&!event.target.closest('a')?{x:event.clientX,y:event.clientY,moved:false}:null;},true);
  $('#feature-stage').addEventListener('mousemove',function(event){if(featurePress&&Math.hypot(event.clientX-featurePress.x,event.clientY-featurePress.y)>=6)featurePress.moved=true;},true);
  $('#feature-stage').addEventListener('mouseup',function(event){var press=featurePress;featurePress=null;if(event.button!==0||!press||press.moved||Math.hypot(event.clientX-press.x,event.clientY-press.y)>=6)return;var destination=safeURL(data.feature.pageURL);if(destination)window.open(destination,'_blank','noopener');},true);
  window.addEventListener('blur',function(){featurePress=null;});
  function renderIntroduction() { $('#edit-introduction').textContent = data.introduction; }
  function renderCards() {
    if (drag) return;
    var items = data.items.filter(function (item) { return !query || (item.title + ' ' + (item.url || item.path || '') + ' ' + (item.description || '')).toLowerCase().indexOf(query) >= 0; });
    $('#cards').innerHTML = items.map(function (item) {
      var source = item.path || item.url, image = item.imageData || item.image || '', title = escape(item.title), credit = (item.createdBy ? '<em>' + escape(item.createdBy) + '</em>' : '') + (item.year && item.createdBy ? ' ' : '') + escape(item.year || '');
      var validImage = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(image);
      var color = /^#[a-f0-9]{6}$/i.test(item.color || '') || /^oklch\(68% 0?\.16 \d{1,3}\)$/.test(item.color || '') ? item.color : '#b2a000';
      if (!CSS.supports('color',color)) { var hue = / (\d{1,3})\)$/.exec(color); color = hue ? 'hsl('+hue[1]+',65%,44%)' : '#b2a000'; }
      return '<article class="card" role="link" data-open="' + escape(item.id) + '" data-reorder-id="' + escape(item.id) + '" tabindex="0" aria-label="Open ' + title + '" aria-description="Drag to reorder, or press Alt and Up or Down"><div class="card-art" style="background:' + color + '">' + (validImage ? '<img alt="" src="' + image + '" draggable="false">' : '') + '</div><div class="card-copy"><span class="card-title">' + title + '</span><p class="card-credit">' + credit + '</p><p class="card-description">' + escape(item.description || source) + '</p></div><div class="card-actions"><button class="icon-button" data-edit="' + escape(item.id) + '" aria-label="Edit ' + title + '" title="Edit">' + icon('edit') + '</button><button class="icon-button" data-remove="' + escape(item.id) + '" aria-label="Remove ' + title + '" title="Remove">' + icon('close') + '</button></div></article>';
    }).join('');
    $('#empty').hidden = items.length > 0;
  }
  function editItem(id) {
    editorId = id || null; var item = data.items.find(function (item) { return item.id === id; }) || {};
    var form = $('#page-form'); form.reset();
    ['title','year','createdBy','description'].forEach(function (name) { form.elements[name].value = item[name] || ''; });
    form.elements.source.value = item.path || item.url || '';
    $('#editor-title').textContent = id ? 'Edit Flash page' : 'Add a Flash page';
    $('#change-page-image').hidden = !id;
    $('#page-editor').showModal(); form.elements.title.focus();
  }
  $('#add-page').addEventListener('click', function () { editItem(null); });
  document.querySelectorAll('[data-close-editor]').forEach(function (button) { button.addEventListener('click', function () { $('#page-editor').close(); }); });
  $('#filter').addEventListener('input', function () { query = this.value.toLowerCase(); renderCards(); });
  $('#page-form').addEventListener('submit', async function (event) {
    event.preventDefault(); var form = this, args = {id:editorId,title:form.elements.title.value.trim(),year:form.elements.year.value.trim(),createdBy:form.elements.createdBy.value.trim(),description:form.elements.description.value.trim(),source:form.elements.source.value.trim()};
    try {
      if (!args.title) throw Error('Enter a title.');
      if (managed) await request(editorId ? 'update' : 'add', args);
      else {
        var url = safeURL(args.source); if (!url) throw Error('Enter an HTTP or HTTPS page address. Open local HTML files in Flashborn.');
        var existing = data.items.find(function (item) { return item.id === editorId; });
        if (existing) Object.assign(existing, args, {url:url});
        else data.items.push({id:'page-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8),title:args.title,year:args.year,createdBy:args.createdBy,description:args.description,url:url,color:'#' + Math.floor(0x555555 + Math.random() * 0xaaaaaa).toString(16).padStart(6,'0')});
        persist(); renderCards();
      }
      $('#page-editor').close(); notice('Saved on this device.');
    } catch (error) { notice(error.message); }
  });
  $('#browse-page').addEventListener('click', async function () { try { await request('browse'); $('#page-editor').close(); } catch (error) { notice(error.message); } });
  $('#change-page-image').addEventListener('click', async function () { if (!editorId) return; try { if (managed) await request('image',{id:editorId}); else {imageId=editorId;$('#image-picker').click();} } catch (error) { notice(error.message); } });
  $('#edit-introduction').addEventListener('click', function () { $('#introduction-form').elements.introduction.value = data.introduction; $('#introduction-editor').showModal(); });
  $('#cancel-introduction').addEventListener('click', function () { $('#introduction-editor').close(); });
  $('#introduction-form').addEventListener('submit', async function (event) { event.preventDefault(); var text = this.elements.introduction.value.trim(); try { await change('heading',{subtitle:text},function () {data.introduction = text;}); $('#introduction-editor').close(); notice('Saved on this device.'); } catch (error) { notice(error.message); } });
  $('#image-picker').addEventListener('change', function () {
    var file = this.files[0], id = imageId; this.value = ''; if (!file || !id) return;
    if (!/^image\//.test(file.type) || file.size > 5 * 1024 * 1024) { notice('Choose an image smaller than 5 MB.'); return; }
    var reader = new FileReader(); reader.onload = function () { var image = new Image(); image.onload = function () { var canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256; var scale = Math.max(512 / image.width,256 / image.height); canvas.getContext('2d').drawImage(image,(512-image.width*scale)/2,(256-image.height*scale)/2,image.width*scale,image.height*scale); var item = data.items.find(function (item) { return item.id === id; }); if (item) { item.image = canvas.toDataURL('image/jpeg',.85); persist(); renderCards(); } }; image.src = reader.result; }; reader.readAsDataURL(file);
  });
  document.addEventListener('click', async function (event) {
    if (Date.now() < ignoreClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    var control = event.target.closest('[data-edit],[data-remove],[data-open]'), d = control && control.dataset; if (!d) return;
    try {
      if (d.edit) editItem(d.edit);
      else if (d.open) { var item = data.items.find(function (item) {return item.id === d.open;}); if (managed) await request('open',{id:d.open}); else if (item && safeURL(item.url)) window.open(item.url,'_blank','noopener'); }
      else if (d.remove) await change('remove',{id:d.remove},function () {data.items = data.items.filter(function (item) {return item.id !== d.remove;});});
    } catch (error) { notice(error.message); }
  },true);
  function clearDrag() { var held = grab; grab = null; drag = null; placement = null; if (preview) preview.remove(); preview = null; $('#reorder-line').hidden = true; document.querySelectorAll('.dragging').forEach(function (row) {row.classList.remove('dragging');}); if (held && held.row.hasPointerCapture(held.pointerId)) held.row.releasePointerCapture(held.pointerId); }
  function place(x,y) {
    var cards = $('#cards'), bounds = cards.getBoundingClientRect(), rows = Array.from(cards.children).filter(function (row) {return row.dataset.reorderId !== drag;});
    if (!rows.length || x < bounds.left || x > bounds.right || y < bounds.top || y > Math.min(bounds.bottom,innerHeight)) {placement = null; $('#reorder-line').hidden = true; return;}
    var before = rows.find(function (row) {var r=row.getBoundingClientRect();return y<r.top+r.height/2;}), target = before || rows[rows.length-1], rect = target.getBoundingClientRect();
    placement={id:drag,targetId:target.dataset.reorderId,position:before?'before':'after'};
    var line=$('#reorder-line'); line.hidden=false; line.style.left=bounds.left+'px';line.style.width=bounds.width+'px';line.style.top=(before?rect.top-4:rect.bottom+4)+'px';
  }
  async function reorder(move) { await change('reorder',move,function () {var from=data.items.findIndex(function (i) {return i.id===move.id;}), target=data.items.find(function (i) {return i.id===move.targetId;}); if(from<0||!target)return;var item=data.items.splice(from,1)[0],to=data.items.indexOf(target)+(move.position==='after'?1:0);data.items.splice(to,0,item);}); }
  document.addEventListener('pointerdown',function (event) { if(event.button!==0||!event.isPrimary||event.target.closest('input,textarea,dialog'))return;var row=event.target.closest('[data-reorder-id]');if(!row)return;clearDrag();grab={row:row,pointerId:event.pointerId,x:event.clientX,y:event.clientY}; });
  document.addEventListener('pointermove',function (event) { if(!grab||event.pointerId!==grab.pointerId)return;if(!(event.buttons&1)){clearDrag();return;}if(!drag){if(Math.hypot(event.clientX-grab.x,event.clientY-grab.y)<6)return;drag=grab.row.dataset.reorderId;preview=new FlashbornDragPreview(grab.row,grab.x,grab.y);grab.row.classList.add('dragging');grab.row.setPointerCapture(event.pointerId);}event.preventDefault();preview.move(event.clientX,event.clientY);place(event.clientX,event.clientY);if(event.clientY<35)window.scrollBy(0,-10);else if(event.clientY>innerHeight-35)window.scrollBy(0,10); },{capture:true,passive:false});
  document.addEventListener('pointerup',async function (event) { if(!grab||event.pointerId!==grab.pointerId)return;var moved=!!drag,move=placement;clearDrag();if(!moved)return;event.preventDefault();ignoreClickUntil=Date.now()+250;try{if(move)await reorder(move);else renderCards();}catch(error){notice(error.message);} },true);
  document.addEventListener('pointercancel',clearDrag);window.addEventListener('blur',clearDrag);
  document.addEventListener('lostpointercapture',function(event){if(grab&&grab.pointerId===event.pointerId)clearDrag();});
  document.addEventListener('keydown',function(event){if(event.target.matches('.card')&&(event.key==='Enter'||event.key===' ')&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.target.click();}});
  document.addEventListener('keydown',async function (event) { if(event.key==='Escape'&&grab){event.preventDefault();clearDrag();return;}if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;var row=event.target.closest('[data-reorder-id]');if(!row)return;var i=data.items.findIndex(function (item) {return item.id===row.dataset.reorderId;}),target=data.items[i+(event.key==='ArrowUp'?-1:1)];if(!target)return;event.preventDefault();try{await reorder({id:row.dataset.reorderId,targetId:target.id,position:event.key==='ArrowUp'?'before':'after'});var next=document.querySelector('[data-reorder-id="'+row.dataset.reorderId+'"]');if(next)next.focus();}catch(error){notice(error.message);} });
  document.addEventListener('dragstart',function (event) {if(event.target.closest('[data-reorder-id]'))event.preventDefault();});
  try {var saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&saved.version===1&&Array.isArray(saved.items)) {data.items=saved.items;data.introduction=String(saved.introduction||defaults.introduction);}} catch (_) {}
  renderFeature();setFeatureZoom(data.feature.image ? 1 : 2);renderIntroduction();renderCards();request('state').catch(function () {});
})();
