(function(){
  'use strict';
  var media=window.matchMedia('(prefers-color-scheme: light)'),contrastMedia=window.matchMedia('(prefers-contrast: more)'),managed=false,sequence=0;
  var pending={},embedded=window.parent!==window&&location.hash==='#flashborn-stage';
  if(embedded){document.documentElement.classList.add('embedded');if(/^corners-gallery-/.test(window.name))document.documentElement.classList.add('exterior-scrollbars');document.body.style.setProperty('--heading-top','60px');}
  if(embedded)window.addEventListener('pointerdown',function(event){if(event.isTrusted)window.parent.postMessage({type:'flashborn-gallery-pointer'},'*');},true);
  function request(action,args){
    var id='gallery-'+(++sequence);
    (embedded?window.parent:window).postMessage({type:'flashborn-library-request',id:id,action:action,args:args||{}},embedded?'*':location.origin==='null'?'*':location.origin);
    return id;
  }
  window.flashbornGallery={state:null,managed:false,stage:function(masked){if(embedded)window.parent.postMessage({type:'flashborn-gallery-stage',masked:!!masked},'*');},open:function(project){
    if(managed){var id=request('open',{id:project.projectId});pending[id]=true;return;}
    if(/^https?:\/\//i.test(project.url||''))window.open(project.url,'_blank','noopener');
  }};
  function apply(theme,contrast){
    document.documentElement.dataset.theme=theme==='light'?'light':'current';
    document.documentElement.dataset.contrast=contrast?'high':'normal';
  }
  function systemTheme(){if(!managed)apply(media.matches?'light':'current',contrastMedia.matches);}
  systemTheme();
  if(media.addEventListener)media.addEventListener('change',systemTheme);else media.addListener(systemTheme);
  if(contrastMedia.addEventListener)contrastMedia.addEventListener('change',systemTheme);else contrastMedia.addListener(systemTheme);
  window.addEventListener('message',function(event){
    if(event.source!==(embedded?window.parent:window)||event.origin!==(embedded?'flashborn://ui':location.origin)||!event.data||event.data.type!=='flashborn-library-response')return;
    if(pending[event.data.id]){
      delete pending[event.data.id];
      if(event.data.ok===false)window.dispatchEvent(new CustomEvent('flashborn-gallery-error',{detail:event.data.error||'The project could not be opened.'}));
    }
    var state=event.data.state;
    if(!state)return;
    if(embedded)document.body.style.setProperty('--heading-top',(state.stageTop===0?0:60)+'px');
    if(['current','light'].indexOf(state.theme)!==-1){managed=true;apply(state.theme,state.highContrast===true);}
    window.flashbornGallery.managed=managed;
    window.flashbornGallery.state=state;
    window.dispatchEvent(new CustomEvent('flashborn-gallery-state',{detail:state}));
  });
  function requestTheme(){request('state');}
  requestTheme();
  window.addEventListener('pageshow',requestTheme);
})();
