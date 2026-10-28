(function () {
  'use strict';
  var Vec=planck.Vec2,unit=100,dt=1/240,step=dt*1000;
  planck.Settings.linearSlop=.0005;
  planck.Settings.angularSlop=.0005;
  planck.Settings.velocityThreshold=.65;
  // Pixel-scale rest tolerances let tiny contact corrections go to sleep.
  planck.Settings.linearSleepTolerance=.05;
  planck.Settings.angularSleepTolerance=.08;
  planck.Settings.timeToSleep=.7;
  // Scaling time to 75% requires gravity divided by the square of that scale.
  var dropTimeScale=.75,world=new planck.World({gravity:Vec(0,9.81*.75/(dropTimeScale*dropTimeScale)),allowSleep:true});
  var scene=document.getElementById('scene');
  var count=20,width=document.documentElement.clientWidth,height=innerHeight,renderHeight=height;
  var floorY=height,looseTop=0,gridExtent=height,resizing=false;
  var baseWidth=0,looseRight=width,resizeHoldUntil=0,resizeSettling=false,resizeSettleAt=0;
  var resizeKick=0,resizeKickEnd=0;
  var blocks=[],walls=[],elapsed=0,nextDrop=250*dropTimeScale,pending=null,resizeCount=0;
  var pileQuietSince=0,resizeMotion=false,lastResizeAt=0;
  var accumulator=0,lastTime=0,raf=0,stopped=false,layoutDirty=false;
  var gridRail=null,railVisual=null,cellVisual=null,gridColumns=2;
  var hoveredId=null,featuredId=null,hoverAnchor=null,hoverPoint=null,hoverExitAt=Infinity,lastPointer=null,pressedId=null,touchArmed=false;
  var loadedCount=0,projectCount=document.getElementById('project-count'),headingContent=document.getElementById('heading-content');

  var ui=document.getElementById('sorting'),indices=document.getElementById('indices'),search=document.getElementById('search'),line=document.getElementById('magnet-line');
  var empty=document.getElementById('empty'),status=document.getElementById('status'),cardList=document.getElementById('card-list');
  var sortingContent=document.getElementById('sorting-content');
  var selectedYear=1999,query='',ready=false,phase='falling',captureAt=Infinity,quietSince=0,finalDropAt=Infinity,finalLandedAt=Infinity,matches=[];
  var captureQueue=[],nextCaptureAt=Infinity,captureSpacing=40;
  var initialFeaturePending=true;
  var introPending=true,introPhase='heading',introCheckAt=0;
  var palette=[[9,204,232],[255,187,10],[0,235,46],[246,60,182],[153,104,248],[242,105,38]];
  function makeDeck(items){
    // Prototype display content never overwrites the saved collection. Keep
    // its launch IDs separately, so only the explicit Launch button opens it.
    var saved=items.filter(function(item){return item&&item.id&&(item.path||/^https?:\/\//i.test(item.url||''));});
    var templates=window.galleryPrototype||[];
    return Array.from({length:Math.max(saved.length,templates.length)},function(_,i){
      var item=saved[i]||{},prototype=templates[i%templates.length]||item;
      var title=String(prototype.title||'Untitled project'),year=Number(prototype.year)||1999;
      return {id:i+1,projectId:item.id?String(item.id):null,letter:title.trim().charAt(0).toUpperCase(),title:title,year:year,demoYear:true,url:item.url||'',path:item.path||'',createdBy:prototype.createdBy||'Firstborn',caption:prototype.caption||'',thumbnail:prototype.thumbnail||'',color:prototype.color||'#7c63df',order:i};
    });
  }
  var deck=makeDeck(window.galleryProjects||[]),collectionKey='';
  count=deck.length;
  var loadingLabel=document.getElementById('loading-label');
  function updateLoadedCount(){
    projectCount.textContent=String(loadedCount);
    headingContent.classList.toggle('is-loaded',loadedCount>=count);
    loadingLabel.setAttribute('aria-hidden',String(loadedCount>=count));
  }
  // Bake opaque theme variants once. Resting cards require no translucent
  // compositing layer, and hover restores the untouched source artwork.
  var artworkCache=new Map(),tintQueue=[],tintFrame=0,backdrop='rgb(23, 23, 23)';
  function queueTint(art,color){
    if(!art.ready||Object.prototype.hasOwnProperty.call(art.tints,color))return;
    art.tints[color]=null;tintQueue.push({art:art,color:color});
    if(!tintFrame)tintFrame=requestAnimationFrame(flushTints);
  }
  function queueThemeTints(art){
    [backdrop,'rgb(23, 23, 23)','rgb(222, 222, 222)','rgb(0, 0, 0)','rgb(255, 255, 255)'].forEach(function(color){queueTint(art,color);});
  }
  function flushTints(){
    tintFrame=0;
    for(var n=0;n<2&&tintQueue.length;n++){
      var job=tintQueue.shift(),art=job.art,canvas=document.createElement('canvas');
      canvas.width=art.image.naturalWidth;canvas.height=art.image.naturalHeight;
      var context=canvas.getContext('2d',{alpha:false});
      context.drawImage(art.image,0,0);context.globalAlpha=.5;context.fillStyle=job.color;context.fillRect(0,0,canvas.width,canvas.height);
      art.tints[job.color]=canvas.toDataURL('image/png');
      blocks.forEach(function(block){if(block.art===art)refreshArtwork(block);});
    }
    if(tintQueue.length)tintFrame=requestAnimationFrame(flushTints);
  }
  function getArtwork(source){
    var art=artworkCache.get(source);if(art)return art;
    art={image:new Image(),tints:{},ready:false};artworkCache.set(source,art);
    art.image.onload=function(){art.ready=true;queueThemeTints(art);};art.image.src=source;
    return art;
  }
  function refreshArtwork(block){
    var active=block.id===hoveredId||block.id===featuredId;
    var source=active?block.metadata.thumbnail:block.art.tints[backdrop]||block.metadata.thumbnail;
    if(block.imageSource!==source){block.image.src=source;block.imageSource=source;}
    if(block.artActive!==active){block.paper.style.backgroundColor=active?'#fff':'var(--tile-idle-paper)';block.artActive=active;}
  }
  function refreshBackdrop(){
    backdrop=getComputedStyle(document.documentElement).getPropertyValue('--gallery-bg').trim();
    if(/^#[0-9a-f]{6}$/i.test(backdrop))backdrop='rgb('+[1,3,5].map(function(i){return parseInt(backdrop.slice(i,i+2),16);}).join(', ')+')';
    else if(/^#[0-9a-f]{3}$/i.test(backdrop))backdrop='rgb('+[1,2,3].map(function(i){return parseInt(backdrop[i]+backdrop[i],16);}).join(', ')+')';
    var rgb=backdrop.match(/[\d.]+/g).slice(0,3).map(Number);
    document.body.style.setProperty('--tile-idle-paper','rgb('+rgb.map(function(v){return Math.round((255+v)/2);}).join(',')+')');
    artworkCache.forEach(function(art){queueTint(art,backdrop);});
    blocks.forEach(refreshArtwork);
  }
  function controlsMetrics(rail){
    var searchWidth=Math.min(100,Math.max(72,rail*.1)),gap=Math.min(24,Math.max(8,rail*.025));
    return {search:searchWidth,gap:gap,indices:Math.max(1,rail-searchWidth-gap)};
  }
  function initialYear(){return 'all';}
  selectedYear=initialYear();
  function yearLabel(year){return year?'\u2019'+String(year).slice(-2):'';}
  function describeDeck(){
    cardList.textContent='';
    deck.forEach(function(item){var row=document.createElement('li');row.textContent=item.title+(item.year?', '+item.year:'');cardList.appendChild(row);});
  }
  describeDeck();
  function normalize(value){return value.toUpperCase().replace(/['\u2018\u2019]/g,'').trim();}
  function searchMatches(item){
    var tokens=normalize(query).split(/[^A-Z0-9]+/).filter(Boolean),short=item.year?String(item.year).slice(-2):'',full=item.year?String(item.year):'';
    var text=normalize(item.title+' '+item.createdBy+' '+item.caption);
    return tokens.every(function(token){
      if(/^[A-Z]$/.test(token))return item.letter===token||text.indexOf(token)!==-1;
      if(/^\d+$/.test(token))return token===short||token===full;
      return text.indexOf(token)!==-1||item.letter+short===token||item.letter+full===token;
    });
  }
  function selectedItems(){
    if(query.trim())return deck.filter(searchMatches);
    return deck.filter(function(item){return selectedYear==='all'||item.year===selectedYear;});
  }
  var marker=document.getElementById('index-marker');
  var markerDot=document.getElementById('index-marker-dot'),sortingPanel=sortingContent.parentElement;
  function revealSortingDot(){
    if(!ready||introPhase!=='controls')return;
    ui.classList.add('is-dot-ready');introPhase='dot';
  }
  function finishIntroduction(){
    if(!ready||introPhase!=='dot')return;
    introPhase='complete';
    if(introPending){introPending=false;captureMatches();draw();}
  }
  sortingPanel.addEventListener('transitionend',function(event){
    if(event.target!==sortingPanel||event.propertyName!=='left'||!ready)return;
    revealSortingDot();
  });
  markerDot.addEventListener('transitionend',function(event){
    if(event.target!==markerDot||event.propertyName.indexOf('transform')===-1)return;
    finishIntroduction();
  });
  function checkIntroduction(){
    if(!ready||!introPending||elapsed<introCheckAt)return;
    introCheckAt=elapsed+50;
    // A resize can cancel a transitionend event. Advance only when the
    // actual animated style reaches its endpoint, never on a fixed timeout.
    if(introPhase==='controls'){
      var panel=getComputedStyle(sortingPanel);
      if(Math.abs(parseFloat(panel.left))<.01&&parseFloat(panel.opacity)>.999)revealSortingDot();
    }
    if(introPhase==='dot'){
      var dot=getComputedStyle(markerDot),transform=dot.transform,x=0;
      if(transform!=='none'){
        var values=transform.slice(transform.indexOf('(')+1,-1).split(',').map(Number);
        x=values.length===16?values[12]:values[4];
      }
      if(isFinite(x)&&Math.abs(x)<.01&&parseFloat(dot.opacity)>.999)finishIntroduction();
    }
  }
  function moveMarker(){
    var active=indices.querySelector('[aria-pressed="true"]');
    marker.style.visibility=active?'visible':'hidden';
    if(!active)return;
    // The year row has equal flex items and space-between distribution.
    // Compute its marker from that same geometry without a forced layout
    // after every animated width write.
    var railWidth=controlsMetrics(railVisual?railVisual.width:ui.clientWidth).indices,n=indices.children.length;
    var size=Math.min(40,railWidth/n),index=Array.prototype.indexOf.call(indices.children,active);
    var x=n>1?index*(railWidth-size)/(n-1):0,y=(40-size)/2;
    marker.style.width=size+'px';marker.style.height=size+'px';marker.style.transform='translate3d('+x+'px,'+y+'px,0)';
  }
  function updateControls(){
    resizeMotion=false;marker.style.transition='';
    while(indices.firstChild)indices.removeChild(indices.firstChild);
    var options=Array.from({length:11},function(_,i){return i+1999;}).concat('all');
    options.forEach(function(value){
      var button=document.createElement('button');
      button.type='button';button.className='index';button.dataset.value=String(value);button.textContent=value==='all'?'All':yearLabel(value);
      var selected=!query.trim()&&value===selectedYear;
      button.disabled=selected;button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-label',value==='all'?'All years':String(value));
      button.addEventListener('click',function(){if(!query.trim()&&value===selectedYear)return;selectedYear=value;query='';search.value='';requestSelection();});
      indices.appendChild(button);
    });
    moveMarker();
  }
  function releaseAll(retained){
    captureQueue=[];nextCaptureAt=Infinity;
    hoveredId=null;if(!retained||!retained.has(featuredId))featuredId=null;hoverAnchor=null;hoverPoint=null;hoverExitAt=Infinity;pressedId=null;
    blocks.forEach(function(block){
      if(!block.target)return;
      if(retained&&retained.has(block.id))return;
      var body=block.body,visual=block.visual;
      if(visual){
        body.setTransform(Vec(visual.x/unit,visual.y/unit),visual.angle);
        // Hand off the visible size exactly. Enlarged previews then shrink
        // during free fall, with the collision box following every frame.
        setBodySize(block,visual.width,visual.height);
        block.releaseSize=block.preview?{width:baseWidth,height:baseWidth/2}:null;
      }
      block.preview=false;block.assemblyMotion=null;
      block.target=null;block.visual=null;block.motion=null;block.docked=false;block.clearOfPile=false;block.laidOut=false;block.tint=0;body.setActive(true);
      if(extent(vertices(block)).top<looseTop){block.entered=false;block.fixture.setFilterCategoryBits(2);}
      body.setGravityScale(1);body.setAwake(true);block.fixture.setFilterMaskBits(0xffff);
      // Release the off-center load from the magnet without a sideways or
      // upward nudge. Its heavier corner begins turning from the current
      // angle, rather than snapping to a new pose or disturbing a resting pile.
      var turnScale=block.releaseSize?Math.min(1,block.releaseSize.width/block.width):1;
      var turn=body.getLocalCenter().x/(block.width/unit)*18*turnScale,offset=body.getWorldVector(body.getLocalCenter());
      body.setAngularVelocity(turn);body.setLinearVelocity(Vec(-turn*offset.y,turn*offset.x));
    });
    matches=matches.filter(function(block){return block.target;});
  }
  function requestSelection(keepMatches){
    pileQuietSince=0;introPending=false;initialFeaturePending=false;
    var retained=keepMatches?new Set(selectedItems().map(function(item){return item.id;})):null;
    if(!keepMatches)window.scrollTo(0,0);
    releaseAll(retained);updateControls();empty.hidden=true;phase='released';
    layoutTargets();
    captureAt=elapsed+440;
  }
  function layoutTargets(allowFloorShrink){
    var bounds=ui.getBoundingClientRect();
    if(bounds.width<1)return;
    var frame=MagneticGrid.frame(bounds.width,bounds.left+bounds.width/2);
    // Every arrival uses the shared current cell size, including mid-resize.
    if(!blocks.length&&!pending)baseWidth=frame.cellWidth;
    var rowWidth=frame.width,rowLeft=frame.left,center=bounds.left+bounds.width/2;
    var lineY=bounds.top+window.scrollY+line.offsetTop+line.offsetHeight;
    if(!railVisual)railVisual={x:center,y:lineY,width:frame.railWidth,height:0,angle:0};
    if(!cellVisual)cellVisual={x:0,y:0,width:frame.cellWidth,height:frame.cellHeight,angle:0};
    // Only the viewport retargets this frame. Hover and falling objects
    // cannot change its dimensions. Keep both margins equal throughout.
    railVisual.x=center;railVisual.y=lineY;railVisual.width=frame.railWidth;
    if(resizing&&gridRail){
      // Scale only by the changing LINE, never by the new column size.
      // The latter would instantaneously enlarge every tile on a wrap.
      var scale=frame.width/gridRail.width,previous=gridRail;
      cellVisual.width*=scale;cellVisual.height*=scale;
      matches.forEach(function(block){
        [block.visual,block.motion,block.assemblyMotion&&block.assemblyMotion.from].forEach(function(v){
          if(!v)return;
          v.x=rowLeft+(v.x-previous.left)*scale;v.y=lineY+(v.y-previous.lineY)*scale;
          v.width*=scale;v.height*=scale;
          if(v.velocity)Object.keys(v.velocity).forEach(function(key){if(key!=='angle')v.velocity[key]*=scale;});
        });
      });
      if(hoverAnchor){
        hoverAnchor.left=rowLeft+(hoverAnchor.left-previous.left)*scale;
        hoverAnchor.top=lineY+(hoverAnchor.top-previous.lineY)*scale;
        hoverAnchor.width*=scale;hoverAnchor.height*=scale;
      }
    }
    gridColumns=frame.columns;
    gridRail={center:center,left:rowLeft,width:rowWidth,availableWidth:bounds.width,displayWidth:railVisual.width,lineY:lineY,targetCenter:center,targetLeft:rowLeft,targetWidth:frame.railWidth,targetLineY:lineY,gap:frame.gap,cellWidth:frame.cellWidth,cellHeight:frame.cellHeight};
    scaleLooseBodies();
    var active=matches.find(function(b){return b.id===hoveredId;});
    var anchor=hoverAnchor;
    if(active&&hoverPoint)anchor={x:hoverPoint.x,y:hoverPoint.y+window.scrollY,left:hoverAnchor.left,top:hoverAnchor.top,width:hoverAnchor.width,height:hoverAnchor.height};
    var planned=matches.concat(captureQueue).sort(function(a,b){return (a.year||Infinity)-(b.year||Infinity)||a.id-b.id;});
    var plan=MagneticGrid.plan({frame:frame,top:lineY+frame.gap,viewportWidth:width,items:planned,active:active?active.id:null,anchor:anchor,featured:featuredId});
    gridRail.gridTop=plan.gridTop;
    matches.forEach(function(block){
      var target=plan.targets[block.id];
      block.target=target;
      // Keep the current visible pose and ease toward the new slot. The card
      // remains selected and inactive in the rigid-body simulation throughout.
      if(block.docked&&(Math.hypot(block.visual.x-target.x,block.visual.y-target.y)>.01||Math.abs(block.visual.width-target.width)>.01||Math.abs(block.visual.height-target.height)>.01))block.docked=false;
    });
    gridExtent=planned.length?plan.bottom+frame.gap:height;
    updateLooseRegion(selectedClearance(),allowFloorShrink);
    sizeScene();
  }
  function selectedClearance(){
    // Reserve a normal row before the controls arrive, too. Otherwise a
    // short viewport can fill up to the spawn point before loading finishes.
    var top=gridRail?gridRail.lineY+gridRail.gap+gridRail.cellHeight+gridRail.gap:0;
    if(matches.length||captureQueue.length)top=Math.max(top,gridExtent);
    matches.forEach(function(b){if(b.laidOut)top=Math.max(top,extent(vertices(b)).bottom+24);});
    return top;
  }
  function updateLooseRegion(top,allowFloorShrink){
    var whites=blocks.filter(function(b){return !b.target;}),oldTop=looseTop,oldFloor=floorY;
    looseTop=top;
    // Selecting a year does not relocate the pile or preallocate empty space
    // beneath it. Its original floor stays put until the window grows or the
    // actual pile needs clearance from the selected grid.
    floorY=whites.length?Math.max(oldFloor,height):Math.max(height,gridExtent);
    if(!blocks.length)floorY=Math.max(floorY,looseTop+Math.hypot(baseWidth,baseWidth/2)+baseWidth*.5);
    if(walls.length){
      walls[3].setPosition(Vec(0,looseTop/unit));
      // Moving boundaries advance with simulation time, never by running
      // hundreds of invisible physics steps inside a resize event.
      if(!whites.length)walls[2].setPosition(Vec(0,floorY/unit));
    }
    whites.forEach(function(b){
      if(oldTop!==looseTop){var entered=extent(vertices(b)).top>=looseTop+.1;if(entered!==b.entered){b.entered=entered;b.fixture.setFilterCategoryBits(entered?1:2);}}
      if(oldFloor!==floorY)b.body.setAwake(true);
    });
  }
  function introPile(whites){
    var byBody=new Map(),members=new Set(),queue=[walls[2]];
    whites.forEach(function(b){byBody.set(b.body,b);if(b.inPile){members.add(b);queue.push(b.body);}});
    // Follow the floor's touching contact group. Airborne arrivals must not
    // lower the floor merely because they are still above the viewport.
    while(queue.length){
      var body=queue.pop();
      for(var edge=body.getContactList();edge;edge=edge.next){
        var block=byBody.get(edge.other);
        if(block&&!members.has(block)&&edge.contact.isTouching()){
          block.inPile=true;members.add(block);queue.push(block.body);
        }
      }
    }
    return members;
  }
  function lowerIntroPile(whites){
    var members=introPile(whites);
    if(!members.size)return;
    var top=Infinity;
    members.forEach(function(b){top=Math.min(top,extent(vertices(b)).top);});
    var lead=baseWidth*.5,headroom=0,free=new Map(),seen=new Set();
    whites.forEach(function(b){if(!members.has(b))free.set(b.body,b);});
    // Start lowering before an arrival lands. Use its full turning radius,
    // and treat touching airborne tiles as one incoming contact group.
    free.forEach(function(first){
      if(seen.has(first))return;
      var queue=[first],lo=Infinity,hi=-Infinity,velocity=0,entering=false;
      seen.add(first);
      while(queue.length){
        var b=queue.pop(),p=b.body.getPosition(),radius=Math.hypot(b.width,b.height)/2;
        lo=Math.min(lo,p.y*unit-radius);hi=Math.max(hi,p.y*unit+radius);
        velocity=Math.max(velocity,b.body.getLinearVelocity().y*unit);entering=entering||!b.entered;
        for(var edge=b.body.getContactList();edge;edge=edge.next){
          var other=free.get(edge.other);
          if(other&&!seen.has(other)&&edge.contact.isTouching()){seen.add(other);queue.push(other);}
        }
      }
      var gravity=world.getGravity().y*unit,distance=Math.max(0,top-hi);
      var arrival=(Math.sqrt(velocity*velocity+2*gravity*distance)-velocity)/gravity;
      if(entering&&arrival<.9)headroom=Math.max(headroom,hi-lo);
    });
    var distance=looseTop+lead+headroom-top;
    if(distance<=.02)return;
    var shift=Math.min(distance*(1-Math.exp(-10*dt)),baseWidth*6*dt);
    // Shift the settled contact group and floor together without rebuilding
    // their contacts. Restore free-flight bodies so their fall is unchanged.
    world.shiftOrigin(Vec(0,-shift/unit));
    whites.forEach(function(b){if(!members.has(b)){var p=b.body.getPosition();b.body.setPosition(Vec(p.x,p.y-shift/unit));}});
    floorY+=shift;
    walls[3].setPosition(Vec(0,looseTop/unit));
    sizeScene();
  }
  function positionWhitePile(whites){
    if(!whites.length)return;
    if(elapsed<resizeHoldUntil)return;
    if(!ready||introPending){lowerIntroPile(whites);return;}
    if(phase!=='magnetized'&&phase!=='assembling')return;
    var top=Infinity;
    whites.forEach(function(b){top=Math.min(top,extent(vertices(b)).top);});
    var clearance=looseTop+24,visibleDepth=Math.min(height*.32,baseWidth*1.6);
    var visibleTop=Math.max(clearance,height-visibleDepth),goal=top;
    if(elapsed<resizeKickEnd&&top>=clearance)return;
    if(resizeSettling)goal=visibleTop;
    else if(top<clearance)goal=clearance;
    else if(top>visibleTop)goal=visibleTop;
    var distance=goal-top;
    if(resizeSettling&&(Math.abs(distance)<.2||elapsed-resizeSettleAt>2400))resizeSettling=false;
    if(Math.abs(distance)<.05)return;
    var shift=distance*(1-Math.exp(-3*dt));
    // Leave a naturally resting pile alone. Only growth into the clearance
    // zone or loss of visibility moves its shared region, gradually. Moving
    // the floor with every body preserves contacts and relative rock motion.
    // Changing the simulation origin preserves contact caches and sleeping
    // state. Repositioning each body separately kept waking the resting pile.
    world.shiftOrigin(Vec(0,-shift/unit));
    floorY+=shift;
    if(walls.length){walls[3].setPosition(Vec(0,looseTop/unit));sizeScene();}
  }
  function settleWhitePile(whites){
    if(!ready||phase!=='magnetized'||resizing||resizeMotion||resizeSettling||elapsed<resizeHoldUntil||elapsed<resizeKickEnd)return;
    var byBody=new Map(),seen=new Set();
    whites.forEach(function(b){byBody.set(b.body,b);});
    whites.forEach(function(first){
      if(seen.has(first))return;
      var queue=[first],group=[],supported=false,quiet=true;seen.add(first);
      while(queue.length){
        var b=queue.pop(),body=b.body,p=body.getPosition(),angle=body.getAngle(),rest=b.restPose;
        group.push(b);
        // A solver-only wake is not an impact. Keep the quiet interval
        // unless a real velocity change or visible pose change interrupts it.
        var impact=body.isAwake()&&b.wasSleeping&&(body.getLinearVelocity().length()>.05||Math.abs(body.getAngularVelocity())>.08);
        if(!rest||impact||Math.hypot(p.x*unit-rest.x,p.y*unit-rest.y)>.4||Math.abs(angle-rest.angle)>.004){
          b.restPose={x:p.x*unit,y:p.y*unit,angle:angle,since:elapsed};quiet=false;
        }else if(elapsed-rest.since<600)quiet=false;
        b.wasSleeping=!body.isAwake();
        for(var edge=body.getContactList();edge;edge=edge.next){
          if(!edge.contact.isTouching())continue;
          if(edge.other===walls[2])supported=true;
          var other=byBody.get(edge.other);
          if(other&&!seen.has(other)){seen.add(other);queue.push(other);}
        }
      }
      // Settle each supported contact island independently. Subpixel solver
      // corrections cannot keep a still pile rocking, while a real impact,
      // fall or resize wakes it through the normal contact graph.
      if(supported&&quiet)group.forEach(function(b){b.body.setAwake(false);b.wasSleeping=true;});
    });
  }
  function sizeScene(){
    // Repacking near the bottom must not shorten the document underneath a
    // stationary pointer. Chromium would clamp scrollY and move the active
    // tile even though its page-space animation still contains the pointer.
    renderHeight=Math.max(hoveredId!==null?renderHeight:0,height,Math.ceil(gridExtent+(matches.length||captureQueue.length?96:0)),Math.ceil(floorY+24));
    document.body.style.minHeight=renderHeight+'px';
    scene.style.height=renderHeight+'px';
  }
  function captureMatches(){
    var selected=selectedItems().slice().sort(function(a,b){return (a.year||Infinity)-(b.year||Infinity)||a.order-b.order;});
    captureQueue=selected.map(function(item){return blocks.find(function(block){return block.id===item.id;});}).filter(function(block){return block&&!block.target;});
    nextCaptureAt=captureQueue.length?elapsed:Infinity;
    phase=captureQueue.length?'assembling':'magnetized';layoutTargets();captureAt=Infinity;
    empty.hidden=!!selected.length;
    empty.textContent=query.trim()?'No matching projects.':selectedYear==='all'?'No projects saved.':'No projects saved for '+yearLabel(selectedYear)+'.';
    status.textContent=selected.length+' matching '+(selected.length===1?'project.':'projects.');
  }
  function captureNextMatch(){
    if(!captureQueue.length||elapsed<nextCaptureAt)return;
    var block=captureQueue.shift(),p=block.body.getPosition(),angle=block.body.getAngle();
    block.releaseSize=null;block.resizeHeld=null;block.restPose=null;
    block.accent=palette[matches.length%palette.length];block.docked=false;block.dockedAt=null;block.clearOfPile=false;block.laidOut=false;
    block.motion=null;block.visual={x:p.x*unit,y:p.y*unit,angle:Math.atan2(Math.sin(angle),Math.cos(angle)),vx:0,vy:0,width:block.width,height:block.height};
    // Equal flight durations preserve the arrival order even when one tile
    // starts much deeper in the pile than its neighbor.
    block.assemblyMotion={start:elapsed,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:260,from:Object.assign({},block.visual)};
    block.capturedAt=elapsed;block.body.setActive(false);matches.push(block);
    nextCaptureAt=captureQueue.length?elapsed+captureSpacing:Infinity;
    layoutTargets();
  }
  function updateSorting(){
    if(!ready&&blocks.length===count&&blocks.every(function(b){return b.entered;})){
      var quiet=blocks.every(function(b){return !b.body.isAwake()||b.body.getLinearVelocity().length()<.015;});
      if(quiet){if(!quietSince)quietSince=elapsed;}else quietSince=0;
      var flight=Math.sqrt(2*height/unit/world.getGravity().y)*1000;
      if(elapsed-finalLandedAt>80||quietSince&&elapsed-quietSince>150||elapsed-finalDropAt>flight+350){
        ready=true;phase='revealing';introPhase='controls';ui.inert=false;ui.setAttribute('aria-hidden','false');ui.classList.add('is-ready');captureAt=Infinity;
        if(window.flashbornGallery&&window.flashbornGallery.stage)window.flashbornGallery.stage(true);
      }
    }
    if(ready&&elapsed>=captureAt)captureMatches();
    checkIntroduction();
    captureNextMatch();
    if(phase==='assembling'&&!captureQueue.length&&matches.every(function(b){return b.docked;}))phase='magnetized';
    if(initialFeaturePending&&phase==='magnetized'&&matches.length===count&&matches.every(function(b){return b.docked;})){
      initialFeaturePending=false;
      var square=deck.find(function(item){return item.title==='Square'&&item.year===1999;});
      if(square)feature(matches.find(function(block){return block.id===square.id;}),false);
    }
  }
  function applyMagnets(){
    // Layout retargeting does not consume visible animation time.
    if(resizing)return;
    if(gridRail&&railVisual){
      // The line follows the viewport directly. Only the tiles animate
      // when another whole tile no longer fits on a row.
      if(resizeMotion&&elapsed-lastResizeAt>160&&Math.abs(railVisual.width-gridRail.targetWidth)<.01){resizeMotion=false;marker.style.transition='';}
      MagneticGrid.approach(cellVisual,{x:0,y:0,width:gridRail.cellWidth,height:gridRail.cellHeight,angle:0},dt,18);
      scaleLooseBodies();
    }
    var group=matches.filter(function(b){return b.id!==featuredId;});
    var fitGroup=phase!=='assembling'&&hoveredId===null&&group.length>=gridColumns&&group.every(function(b){return b.laidOut;});
    var whiteTop=Infinity;
    blocks.forEach(function(b){if(!b.target)whiteTop=Math.min(whiteTop,extent(vertices(b)).top);});
    matches.forEach(function(block){
      if(!fitGroup||block.id===featuredId)block.motion=null;
      else if(!block.motion)block.motion=Object.assign({},block.visual,{velocity:Object.assign({},block.visual.velocity)});
      if(!block.target||block.docked)return;
      var visual=block.motion||block.visual,oldX=visual.x,oldY=visual.y;
      if(block.assemblyMotion){
        var flight=block.assemblyMotion,t=flight.duration?Math.min(1,(elapsed-flight.start)/flight.duration):1,ease=1-Math.pow(1-t,3),from=flight.from;
        visual.x=from.x+(block.target.x-from.x)*ease;visual.y=from.y+(block.target.y-from.y)*ease;
        visual.angle=from.angle*(1-ease);visual.width=cellVisual.width;visual.height=cellVisual.height;
        visual.vx=(visual.x-oldX)/dt;visual.vy=(visual.y-oldY)/dt;
        if(t===1){block.assemblyMotion=null;block.clearOfPile=true;}
        else return;
      }
      var halfHeight=Math.abs(Math.sin(visual.angle))*visual.width/2+Math.abs(Math.cos(visual.angle))*visual.height/2;
      var ceiling=whiteTop-24-halfHeight,goalY=block.id===hoveredId?block.target.y:Math.min(block.target.y,ceiling);
      MagneticGrid.approach(visual,{x:block.target.x,y:goalY,width:block.target.width,height:block.target.height,angle:0},dt,18);
      if(block.clearOfPile&&block.id!==hoveredId)visual.y=Math.min(visual.y,ceiling);
      if(block.id===hoveredId&&hoverPoint){
        MagneticGrid.hold(visual,hoverAnchor,block.target,{x:hoverPoint.x,y:hoverPoint.y+window.scrollY});
      }
      halfHeight=Math.abs(Math.sin(visual.angle))*visual.width/2+Math.abs(Math.cos(visual.angle))*visual.height/2;
      if(visual.y+halfHeight<=whiteTop-12)block.clearOfPile=true;
      visual.vx=(visual.x-oldX)/dt;visual.vy=(visual.y-oldY)/dt;
      if(block.clearOfPile&&Math.hypot(block.target.x-visual.x,block.target.y-visual.y)<.005&&Math.abs(visual.width-block.target.width)<.005&&Math.abs(visual.height-block.target.height)<.005&&Math.abs(visual.angle)<.00001){
        // Preserve the visible coordinates on the final frame, too.
        block.docked=true;block.dockedAt=elapsed;block.laidOut=true;
        if(block.id!==hoveredId&&block.id!==featuredId)block.preview=false;
      }
    });
    if(fitGroup){
      var fitted=MagneticGrid.fit(group.map(function(b){return b.motion;}),gridRail.left,gridRail.width);
      group.forEach(function(block,i){
        var before=block.visual,v=fitted[i];
        v.vx=(v.x-before.x)/dt;v.vy=(v.y-before.y)/dt;
        v.velocity.x=v.vx;v.velocity.width=(v.width-before.width)/dt;
        block.visual=v;
      });
    }
    var reserved=selectedClearance();
    if(Math.abs(reserved-looseTop)>.1)updateLooseRegion(reserved);
  }
  function setHovered(block,point){
    if(block&&block.id===featuredId)block=null;
    var id=block&&block.id||null;
    if(id===hoveredId){
      if(!block||!point||!block.target)return;
      hoverPoint={x:point.x,y:point.y};hoverExitAt=Infinity;
      var target=block.target,py=point.y+window.scrollY;
      // A real pointer move acquires the tile's CURRENT visible footprint,
      // even when ownership stays on this tile during an interrupted grow.
      // Holding an older footprint could let the newly acquired edge retreat.
      var current=block.element.getBoundingClientRect();
      hoverAnchor={x:point.x,y:py,left:current.left,top:current.top+window.scrollY,width:current.width,height:current.height};
      if(MagneticGrid.contains(target,{x:point.x,y:py},1))return;
      // The pointer can travel inside a tile before it finishes enlarging.
      // Refresh the anchor if the new point would leave its destination.
    }
    hoveredId=id;hoverAnchor=null;hoverPoint=point&&block?{x:point.x,y:point.y}:null;hoverExitAt=Infinity;
    if(block){
      block.preview=true;
      var rect=block.element.getBoundingClientRect();
      hoverAnchor={x:point?point.x:rect.left+rect.width/2,y:(point?point.y:rect.top+rect.height/2)+window.scrollY,left:rect.left,top:rect.top+window.scrollY,width:rect.width,height:rect.height};
    }
    layoutTargets();draw();
  }
  function blockAt(element){var tile=element&&element.closest('.block[data-interactive=true]');return tile&&blocks.find(function(b){return b.element===tile;});}
  document.addEventListener('pointermove',function(event){
    if(event.pointerType==='touch'||lastPointer&&lastPointer.x===event.clientX&&lastPointer.y===event.clientY)return;
    lastPointer={x:event.clientX,y:event.clientY};
    var block=blockAt(document.elementFromPoint(event.clientX,event.clientY));
    if(block)setHovered(block,lastPointer);
    else if(hoveredId!==null){
      // Crossing a gutter must not collapse and repack the grid in the one
      // frame before the pointer reaches the next tile.
      if(event.target.closest('input,button')||gridRail&&event.clientY+window.scrollY<gridRail.lineY)setHovered(null);
      else if(hoverExitAt===Infinity)hoverExitAt=elapsed+110;
    }
  });
  document.addEventListener('pointerdown',function(event){
    var block=blockAt(event.target);
    pressedId=block?block.id:null;
    touchArmed=event.pointerType==='touch'&&block&&block.id!==hoveredId;
    if(block)setHovered(block,{x:event.clientX,y:event.clientY});else setHovered(null);
  });
  document.addEventListener('pointercancel',function(){pressedId=null;touchArmed=false;});
  function feature(block,scroll){
    if(!block||!block.target||block.id===featuredId)return;
    var previous=matches.find(function(item){return item.id===featuredId;});
    if(previous){previous.preview=true;previous.laidOut=false;}
    featuredId=block.id;block.preview=true;
    hoveredId=null;hoverAnchor=null;hoverPoint=null;hoverExitAt=Infinity;
    layoutTargets();draw();
    var target=block.target,top=target.y-target.height/2,bottom=target.y+target.height/2,gap=gridRail.gap;
    if(scroll!==false&&(top<scrollY+gap||bottom>scrollY+innerHeight-gap)){
      var scrollTop=top<scrollY+gap?top-gap:Math.min(top-gap,bottom-innerHeight+gap);
      window.scrollTo({top:Math.max(0,scrollTop),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }
    status.textContent='Full-width preview: '+deck.find(function(item){return item.id===block.id;}).title+'.';
  }
  document.addEventListener('click',function(event){
    if(event.target.closest('.tile-launch'))return;
    var block=blockAt(event.target),pressed=pressedId;pressedId=null;
    if(touchArmed){touchArmed=false;return;}
    if(!block||pressed&&pressed!==block.id)return;
    if(block.id===featuredId)return;
    if(block.id!==hoveredId){setHovered(block);return;}
    feature(block);
  });
  document.addEventListener('focusin',function(event){var block=blocks.find(function(b){return b.element===event.target&&b.clearOfPile;});if(block)setHovered(block);});
  document.addEventListener('focusout',function(event){if(event.target.closest('.block')&&!pressedId&&!blockAt(event.relatedTarget))setHovered(null);});
  document.addEventListener('pointerleave',function(){setHovered(null);});
  window.addEventListener('wheel',function(){setHovered(null);},{passive:true});
  window.addEventListener('blur',function(){setHovered(null);});
  document.addEventListener('keydown',function(event){
    if(event.target.closest('.tile-launch'))return;
    if(event.key==='Escape')setHovered(null);
    var block=blockAt(event.target);
    if((event.key==='Enter'||event.key===' ')&&block){event.preventDefault();feature(block);}
  });
  window.addEventListener('flashborn-gallery-error',function(event){status.textContent=String(event.detail);});
  function loadCollection(state){
    if(!state||!Array.isArray(state.items))return;
    var next=makeDeck(state.items),key=JSON.stringify(next);
    if(key===collectionKey)return;
    collectionKey=key;
    if(JSON.stringify(deck)===key)return;
    blocks.forEach(function(block){world.destroyBody(block.body);block.element.remove();});
    blocks=[];deck=next;count=deck.length;pending=null;matches=[];captureQueue=[];nextCaptureAt=Infinity;hoveredId=null;featuredId=null;hoverAnchor=null;hoverPoint=null;hoverExitAt=Infinity;lastPointer=null;
    loadedCount=0;updateLoadedCount();ready=false;phase='falling';introPhase='heading';introPending=true;initialFeaturePending=true;introCheckAt=0;
    if(window.flashbornGallery&&window.flashbornGallery.stage)window.flashbornGallery.stage(false);
    selectedYear=initialYear();query='';search.value='';elapsed=0;nextDrop=250*dropTimeScale;
    finalDropAt=count?Infinity:0;finalLandedAt=count?Infinity:0;quietSince=0;captureAt=Infinity;pileQuietSince=0;
    floorY=height;looseTop=0;gridExtent=height;gridRail=null;railVisual=null;cellVisual=null;
    looseRight=width;resizeHoldUntil=0;resizeSettling=false;resizeKick=0;resizeKickEnd=0;
    walls[2].setPosition(Vec(0,height/unit));walls[3].setPosition(Vec(0,0));
    ui.classList.remove('is-ready','is-dot-ready');ui.inert=true;ui.setAttribute('aria-hidden','true');empty.hidden=true;
    describeDeck();updateControls();layoutTargets(true);draw();
  }
  window.addEventListener('flashborn-gallery-state',function(event){loadCollection(event.detail);});
  search.addEventListener('input',function(){query=search.value;requestSelection(true);});
  search.addEventListener('search',function(){if(query!==search.value){query=search.value;requestSelection(true);}});
  search.addEventListener('keydown',function(event){if(event.key==='Escape'&&search.value){search.value='';query='';requestSelection(true);event.preventDefault();}});
  updateControls();
  function random(min,max){return min+Math.random()*(max-min);}
  function scaleLooseBodies(){
    if(!cellVisual||!baseWidth)return;
    var next=cellVisual.width,scale=next/baseWidth,oldRight=looseRight;
    if(Math.abs(next-baseWidth)<.001&&oldRight===width)return;
    // During loading, expanding around the distant floor lifts the whole
    // pile into the reserved row. Scale its shared origin at the clearance
    // instead; the pile and its floor grow downward together.
    var anchorY=scale>1&&(!ready||introPending)?Math.min(floorY,looseTop+baseWidth*.5):floorY;
    var nextFloor=anchorY+(floorY-anchorY)*scale;
    blocks.forEach(function(b){
      if(b.target)return;
      var body=b.body,p=body.getPosition(),v=body.getLinearVelocity(),angle=body.getAngle(),spin=body.getAngularVelocity(),awake=body.isAwake();
      var x=width+(p.x*unit-oldRight)*scale,y=anchorY+(p.y*unit-anchorY)*scale;
      setBodySize(b,b.releaseSize?b.width*scale:next,b.releaseSize?b.height*scale:next/2);
      body.setTransform(Vec(x/unit,y/unit),angle);body.setLinearVelocity(Vec(v.x*scale,v.y*scale));body.setAngularVelocity(spin);
      if(!awake)body.setAwake(false);
      if(b.releaseSize){b.releaseSize.width=next;b.releaseSize.height=next/2;}
      if(b.resizeHeld){b.resizeHeld.x*=scale;b.resizeHeld.y*=scale;}
      b.restPose=null;
    });
    if(Math.abs(nextFloor-floorY)>.001){floorY=nextFloor;walls[2].setPosition(Vec(0,floorY/unit));}
    baseWidth=next;looseRight=width;
    if(pending)pending=null;
  }
  function holdLooseBodies(distance){
    resizeHoldUntil=elapsed+160;resizeSettling=true;resizeSettleAt=resizeHoldUntil;
    resizeKick=Math.max(resizeKick,Math.min(190,Math.max(120,baseWidth*.9)+Math.sqrt(distance)*2)/unit);
    blocks.forEach(function(b){
      if(b.target||b.resizeHeld)return;
      var v=b.body.getLinearVelocity();b.resizeHeld={x:v.x,y:v.y,spin:b.body.getAngularVelocity()};
      b.body.setActive(false);b.restPose=null;
    });
  }
  function resumeLooseBodies(){
    if(elapsed<resizeHoldUntil)return;
    var launched=false;
    blocks.forEach(function(b){
      if(!b.resizeHeld)return;
      var saved=b.resizeHeld;b.resizeHeld=null;
      if(b.target)return;
      var up=Math.min(2.1,Math.max(resizeKick,-saved.y));
      b.body.setActive(true);b.body.setLinearVelocity(Vec(saved.x,-up));b.body.setAngularVelocity(saved.spin);b.body.setAwake(true);launched=true;
    });
    if(launched){resizeKickEnd=elapsed+2*resizeKick/world.getGravity().y*1000+80;resizeKick=0;}
    else if(!blocks.some(function(b){return b.resizeHeld;}))resizeKick=0;
  }
  function weightBody(block){
    var weight=block.ballast,w=block.width/unit,h=block.height/unit;
    if(!weight)return;
    // A heavier patch near a different bottom corner changes impact torque
    // without adding an external nudge or an extra collision shape.
    var area=w*h,extra=area*weight.mass,total=area+extra,x=w*weight.x,y=h*weight.y;
    block.body.setMassData({mass:total,center:Vec(extra*x/total,extra*y/total),I:area*(w*w+h*h)/12+extra*(x*x+y*y+(w*w+h*h)*.002)});
  }
  function setBodySize(block,w,h){
    if(Math.abs(block.width-w)<.000001&&Math.abs(block.height-h)<.000001)return;
    var category=block.fixture.getFilterCategoryBits(),mask=block.fixture.getFilterMaskBits();
    block.body.destroyFixture(block.fixture);
    block.width=w;block.height=h;
    block.fixture=block.body.createFixture(planck.Box(w/unit/2,h/unit/2),{density:1,friction:.3,restitution:.08,filterCategoryBits:category,filterMaskBits:mask});
    weightBody(block);
  }
  function shrinkReleased(){
    blocks.forEach(function(block){
      if(block.target||!block.releaseSize)return;
      var goal=block.releaseSize,blend=1-Math.exp(-9*dt),w=block.width+(goal.width-block.width)*blend,h=block.height+(goal.height-block.height)*blend;
      if(Math.abs(w-goal.width)<.005&&Math.abs(h-goal.height)<.005){w=goal.width;h=goal.height;block.releaseSize=null;}
      setBodySize(block,w,h);
    });
  }
  function wall(x,y,vertical,moving,mask){
    var body=world.createBody({type:moving?'kinematic':'static',position:Vec(x/unit,y/unit)});
    // Solid boundaries retain rocks during compression on a fast resize.
    // A zero-thickness edge could let a squeezed body pass through the floor.
    var shape=vertical?planck.Box(50,200,Vec(x===0?-50:50,0)):planck.Box(200,50,Vec(0,mask===1?-50:50));
    body.createFixture(shape,{friction:.3,restitution:.08,filterCategoryBits:mask===1?8:4,filterMaskBits:mask||0xffff});
    return body;
  }
  function createWalls(){
    walls=[wall(0,0,true),wall(width,0,true,true),wall(0,height,false,true),wall(0,0,false,false,1)];
  }
  function vertices(block){
    var visual=block.target&&block.visual;
    var p=visual?{x:visual.x/unit,y:visual.y/unit}:block.body?block.body.getPosition():{x:block.x/unit,y:block.y/unit};
    var angle=visual?visual.angle:block.body?block.body.getAngle():block.angle,c=Math.cos(angle),s=Math.sin(angle),w=(visual?visual.width:block.width)/2,h=(visual?visual.height:block.height)/2;
    return [[-w,-h],[w,-h],[w,h],[-w,h]].map(function(v){return {x:p.x*unit+v[0]*c-v[1]*s,y:p.y*unit+v[0]*s+v[1]*c};});
  }
  function extent(points){
    var left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(var i=0;i<points.length;i++){left=Math.min(left,points[i].x);right=Math.max(right,points[i].x);top=Math.min(top,points[i].y);bottom=Math.max(bottom,points[i].y);}
    return {left:left,right:right,top:top,bottom:bottom};
  }
  function overlap(first,second){
    var depth=Infinity;
    for(var shape=0;shape<2;shape++){
      var points=shape?second:first;
      for(var edge=0;edge<2;edge++){
        var dx=points[edge+1].x-points[edge].x,dy=points[edge+1].y-points[edge].y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
        var amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
        for(var v=0;v<4;v++){
          var a=first[v].x*nx+first[v].y*ny,b=second[v].x*nx+second[v].y*ny;
          amin=Math.min(amin,a);amax=Math.max(amax,a);bmin=Math.min(bmin,b);bmax=Math.max(bmax,b);
        }
        var distance=Math.min(amax,bmax)-Math.max(amin,bmin);
        if(distance<=0)return 0;
        depth=Math.min(depth,distance);
      }
    }
    return depth;
  }
  function afterStep(){
    for(var i=0;i<blocks.length;i++){
      var block=blocks[i],body=block.body;
      if(!block.counted&&extent(vertices(block)).bottom>=0){block.counted=true;loadedCount++;updateLoadedCount();}
      if(block.target)continue;
      // Arrivals pass through the top until fully inside. The ceiling then
      // becomes solid for subsequent bounces and resizing.
      if(!block.target&&!block.entered&&extent(vertices(block)).top>=looseTop+.1){block.entered=true;block.fixture.setFilterCategoryBits(1);}
      if(blocks.length===count&&block===blocks[count-1]&&block.entered&&finalLandedAt===Infinity){
        for(var edge=body.getContactList();edge;edge=edge.next){
          if(edge.contact.isTouching()&&edge.other!==walls[0]&&edge.other!==walls[1]&&edge.other!==walls[3]){finalLandedAt=elapsed;break;}
        }
      }
      var velocity=body.getLinearVelocity(),speed=Math.hypot(velocity.x,velocity.y);
      if(speed>12)body.setLinearVelocity(Vec(velocity.x*12/speed,velocity.y*12/speed));
      if(Math.abs(body.getAngularVelocity())>5)body.setAngularVelocity(Math.max(-5,Math.min(5,body.getAngularVelocity())));
    }
    if(!resizing){var whites=blocks.filter(function(b){return !b.target;});positionWhitePile(whites);settleWhitePile(whites);}
  }
  function moveBoundaries(){
    if(elapsed<resizeHoldUntil){walls[1].setLinearVelocity(Vec(0,0));walls[2].setLinearVelocity(Vec(0,0));return;}
    var loose=blocks.some(function(b){return !b.target;}),limit=8*unit*dt;
    [[walls[1],width,'x'],[walls[2],floorY,'y']].forEach(function(entry){
      var body=entry[0],goal=entry[1],axis=entry[2],p=body.getPosition();
      if(!loose){body.setLinearVelocity(Vec(0,0));body.setPosition(axis==='x'?Vec(goal/unit,0):Vec(0,goal/unit));return;}
      var delta=Math.max(-limit,Math.min(limit,goal-p[axis]*unit));
      if(Math.abs(delta)<.02){body.setLinearVelocity(Vec(0,0));body.setAwake(false);return;}
      body.setLinearVelocity(axis==='x'?Vec(delta/unit/dt,0):Vec(0,delta/unit/dt));
    });
  }
  function simulate(){applyMagnets();updateCaptions();shrinkReleased();resumeLooseBodies();moveBoundaries();world.step(dt,24,24);afterStep();}
  function resize(){
    var nextWidth=document.documentElement.clientWidth,nextHeight=innerHeight;
    if(nextWidth<1||nextHeight<1)return;
    if(nextWidth===width&&nextHeight===height&&scene.style.height)return;
    pending=null;
    holdLooseBodies(Math.abs(nextWidth-width)+Math.abs(nextHeight-height));
    resizeMotion=true;lastResizeAt=elapsed;marker.style.transition='none';
    resizing=true;pileQuietSince=0;width=nextWidth;height=nextHeight;
    layoutTargets(true);
    blocks.forEach(function(b){if(!b.target&&!b.resizeHeld)b.body.setAwake(true);});
    // Retarget once. The next regular physics ticks move the walls; the
    // selected grid continues from its current pose and velocity.
    resizing=false;layoutDirty=false;
    moveMarker();resizeCount++;draw();
  }
  function drop(){
    if(elapsed<resizeHoldUntil)return;
    if(blocks.length>=count)return;
    if(!pending){
      var w=baseWidth,h=w/2,angle=random(-Math.PI*.48,Math.PI*.48);
      var ex=Math.abs(Math.cos(angle))*w/2+Math.abs(Math.sin(angle))*h/2;
      var ey=Math.abs(Math.sin(angle))*w/2+Math.abs(Math.cos(angle))*h/2;
      pending={x:Math.max(ex+8,width-ex-8-random(0,Math.min(width*.35,w*3))),y:-ey-8,width:w,height:h,angle:angle,entered:false};
    }
    var candidate=vertices(pending);
    for(var i=0;i<blocks.length;i++)if(overlap(candidate,vertices(blocks[i]))>0)return;
    var block=pending,metadata=deck[blocks.length];block.id=metadata.id;block.letter=metadata.letter;block.year=metadata.year;block.counted=false;block.target=null;block.visual=null;block.docked=false;block.clearOfPile=false;block.laidOut=false;block.tint=0;block.accent=palette[0];
    block.body=world.createDynamicBody({position:Vec(block.x/unit,block.y/unit),angle:block.angle,linearDamping:.17,angularDamping:.22,bullet:true});
    block.fixture=block.body.createFixture(planck.Box(block.width/unit/2,block.height/unit/2),{density:1,friction:.3,restitution:.08,filterCategoryBits:2});
    var seed=(Math.imul(block.id,2654435761)>>>0);
    block.ballast={x:((seed%997)/996-.5)*.7,y:.25+((seed>>>10)%991)/990*.15,mass:.4+((seed>>>20)%983)/982*1.1};
    weightBody(block);
    var element=document.createElement('article');
    element.className='block';element.dataset.id=String(block.id);element.setAttribute('role','button');element.setAttribute('aria-label','Enlarge '+metadata.title+(block.year?', '+block.year:''));
    element.style.width=block.width+'px';element.style.height=block.height+'px';
    element.style.setProperty('--pad',Math.min(14,Math.max(6,block.height*.15))+'px');
    element.style.setProperty('--letter-size',Math.min(22,Math.max(12,block.height*.35))+'px');
    element.style.setProperty('--year-size',Math.min(12,Math.max(10,block.height*.22))+'px');
    block.metadata=metadata;buildTileContent(block,element);
    scene.appendChild(element);block.element=element;
    blocks.push(block);pending=null;nextDrop=elapsed+random(370,510)*dropTimeScale;if(blocks.length===count)finalDropAt=elapsed;
  }
  function advance(){
    elapsed+=step;
    if(elapsed>=hoverExitAt)setHovered(null);
    if(elapsed>=nextDrop)drop();
    simulate();updateSorting();
  }
  function captionMetrics(item,w,full){
    var title=Math.min(22,Math.max(11,w*.04)),creator=Math.min(16,Math.max(10,w*.022)),text=Math.min(13,Math.max(9,w*.018));
    var arrow=Math.min(44,Math.max(24,w*.07)),gap=Math.min(20,Math.max(10,w*.025)),launchFont=Math.min(13,Math.max(10,w*.025));
    var launch=launchFont*4+gap+arrow+16,copyWidth=Math.max(80,w-launch-16);
    var lines=Math.min(3,Math.max(1,Math.ceil(item.caption.length*text*.49/copyWidth)));
    var height=full?12+title*1.3+9+creator*1.3+9+lines*text*1.5+8:10+title*1.3+4;
    return {height:height,title:title,creator:creator,text:text,launch:launch,arrow:arrow,gap:gap,launchFont:launchFont};
  }
  function updateCaptions(){
    blocks.forEach(function(block){
      if(!block.captionState)return;
      var targetTint=Number(!!block.target&&block.clearOfPile);
      block.tint+=(targetTint-block.tint)*(1-Math.exp(-12*dt));
      if(Math.abs(targetTint-block.tint)<.0001)block.tint=targetTint;
      var full=block.id===featuredId,show=!!block.target&&(full||block.id===hoveredId);
      var metrics=captionMetrics(block.metadata,block.target?block.target.width:block.width,full);
      MagneticGrid.approach(block.captionState,{height:show?metrics.height:0},dt,18);
    });
  }
  function buildTileContent(block,element){
    var item=block.metadata,paper=document.createElement('div'),media=document.createElement('div'),image=document.createElement('img'),caption=document.createElement('div'),title=document.createElement('h2'),details=document.createElement('div'),creator=document.createElement('p'),summary=document.createElement('p'),launch=document.createElement('button'),label=document.createElement('span');
    paper.className='tile-paper';
    media.className='tile-artwork';image.className='tile-image';image.src=item.thumbnail;image.alt='';image.draggable=false;
    media.appendChild(image);caption.className='tile-caption';title.className='tile-title';title.textContent=item.title+' '+yearLabel(item.year);
    details.className='tile-details';creator.className='tile-creator';creator.textContent=item.createdBy;summary.className='tile-summary';summary.textContent=item.caption;
    details.appendChild(creator);details.appendChild(summary);launch.type='button';launch.className='tile-launch';launch.setAttribute('aria-label','Launch '+item.title);label.textContent='Launch';
    var svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
    svg.setAttribute('viewBox','0 0 48 48');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');path.setAttribute('d','M4 24H42M26 8L42 24 26 40');svg.appendChild(path);launch.appendChild(label);launch.appendChild(svg);
    launch.addEventListener('click',function(event){event.stopPropagation();if(block.id===featuredId&&(item.projectId||item.url)&&window.flashbornGallery)window.flashbornGallery.open(item);});
    caption.appendChild(title);caption.appendChild(details);caption.appendChild(launch);element.appendChild(paper);element.appendChild(media);element.appendChild(caption);
    block.paper=paper;block.media=media;block.image=image;block.art=getArtwork(item.thumbnail);block.captionElement=caption;block.launch=launch;block.captionState={x:0,y:0,width:0,height:0,angle:0};
    refreshArtwork(block);
  }
  function draw(){
    if(gridRail){
      var displayWidth=railVisual.width;
      var offset=(gridRail.availableWidth-displayWidth)/2;
      document.body.style.setProperty('--rail-width',displayWidth+'px');
      var controls=controlsMetrics(displayWidth);
      document.body.style.setProperty('--gallery-search-width',controls.search+'px');
      document.body.style.setProperty('--controls-gap',controls.gap+'px');
      document.body.style.setProperty('--index-width',controls.indices+'px');
      sortingContent.style.width=displayWidth+'px';sortingContent.style.transform='translateX('+offset+'px)';
      headingContent.style.width=displayWidth+'px';headingContent.style.transform='translateX('+offset+'px)';
      gridRail.displayWidth=displayWidth;
      moveMarker();
    }
    for(var i=0;i<blocks.length;i++){
      var block=blocks[i],visual=block.target&&block.visual,p=visual||{x:block.body.getPosition().x*unit,y:block.body.getPosition().y*unit,angle:block.body.getAngle()};
      refreshArtwork(block);
      block.media.style.opacity=block.tint;
      block.paper.style.opacity=block.tint>.9999?0:1-block.tint;
      block.element.dataset.selected=String(!!block.target);
      var w=visual?visual.width:block.width,h=visual?visual.height:block.height;
      var full=block.id===featuredId,metrics=captionMetrics(block.metadata,w,full),reveal=Math.min(h*.78,Math.max(0,block.captionState.height));
      if(reveal<.01)reveal=0;
      block.element.style.setProperty('--art-height',h+'px');
      block.element.style.setProperty('--caption-title-size',metrics.title+'px');
      block.element.style.setProperty('--caption-creator-size',metrics.creator+'px');
      block.element.style.setProperty('--caption-text-size',metrics.text+'px');
      block.element.style.setProperty('--launch-space',metrics.launch+'px');
      block.element.style.setProperty('--launch-arrow-size',metrics.arrow+'px');
      block.element.style.setProperty('--launch-gap',metrics.gap+'px');
      block.element.style.setProperty('--launch-font-size',metrics.launchFont+'px');
      block.media.style.bottom=reveal+'px';block.captionElement.style.height=reveal+'px';
      block.captionElement.setAttribute('aria-hidden',String(!visual||!reveal));
      block.launch.disabled=!full||!(block.metadata.projectId||/^https?:\/\//i.test(block.metadata.url));
      block.launch.tabIndex=full&&block.docked&&!block.launch.disabled?0:-1;
      block.element.dataset.interactive=String(phase==='magnetized'&&!!visual&&block.clearOfPile&&block.laidOut);
      block.element.dataset.expanded=String(block.id===hoveredId);
      block.element.dataset.size=block.id===featuredId?'xlg':block.id===hoveredId?'large':'normal';
      block.element.setAttribute('role',full?'group':'button');
      block.element.setAttribute('aria-pressed',String(block.id===featuredId));
      block.element.tabIndex=!full&&phase==='magnetized'&&visual&&block.clearOfPile&&block.laidOut?0:-1;
      block.element.style.width=w+'px';block.element.style.height=h+'px';
      block.element.style.transform='translate('+(p.x-w/2)+'px,'+(p.y-h/2)+'px) rotate('+p.angle+'rad)';
    }
  }
  function frame(now){
    if(stopped)return;
    // A retained hidden iframe has a zero-size layout. Preserve its physical
    // coordinate system until visible; scaling through zero corrupts poses.
    if(document.documentElement.clientWidth<1||innerHeight<1){lastTime=0;accumulator=0;raf=requestAnimationFrame(frame);return;}
    if(width!==document.documentElement.clientWidth||height!==innerHeight)resize();
    else if(layoutDirty){layoutDirty=false;layoutTargets();}
    if(!lastTime)lastTime=now;
    accumulator+=Math.min(now-lastTime,50);lastTime=now;
    for(var loops=0;accumulator>=step&&loops<12;loops++){advance();accumulator-=step;}
    draw();raf=requestAnimationFrame(frame);
  }
  window.addEventListener('resize',function(){layoutDirty=true;});
  // Font loading and scrollbar/layout changes can alter the grid without a
  // separate window resize. Re-measure the actual line in those cases too.
  var layoutObserver=new ResizeObserver(function(){layoutDirty=true;});
  layoutObserver.observe(document.documentElement);layoutObserver.observe(ui);
  document.fonts.ready.then(function(){layoutDirty=true;});
  document.addEventListener('visibilitychange',function(){lastTime=0;accumulator=0;});
  window.addEventListener('pagehide',function(){cancelAnimationFrame(raf);stopped=true;});
  window.addEventListener('pageshow',function(event){if(event.persisted){stopped=false;lastTime=0;raf=requestAnimationFrame(frame);}});
  new MutationObserver(refreshBackdrop).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-contrast']});
  refreshBackdrop();deck.forEach(function(item){getArtwork(item.thumbnail);});updateLoadedCount();
  sizeScene();createWalls();layoutTargets(true);draw();
  if(window.flashbornGallery)loadCollection(window.flashbornGallery.state);
  raf=requestAnimationFrame(frame);

  window.galleryPhysics={snapshot:function(){
    var maxOverlap=0,outside=0,polygons=blocks.map(vertices);
    for(var a=0;a<blocks.length;a++){
      var limits=extent(polygons[a]);outside=Math.max(outside,-limits.left,blocks[a].entered&&!blocks[a].target?looseTop-limits.top:0,limits.right-width,limits.bottom-(blocks[a].target?renderHeight:floorY));
      for(var j=a+1;j<blocks.length;j++)maxOverlap=Math.max(maxOverlap,overlap(polygons[a],polygons[j]));
    }
    return {ready:ready,phase:phase,introPhase:introPhase,loadedCount:loadedCount,finalDropAt:finalDropAt,finalLandedAt:finalLandedAt,hoveredId:hoveredId,featuredId:featuredId,mode:'chronological',option:selectedYear,query:query,gravity:world.getGravity().y,columns:gridColumns,gridRail:gridRail,matchIds:matches.map(function(b){return b.id;}),pendingCaptureIds:captureQueue.map(function(b){return b.id;}),resizeHoldUntil:resizeHoldUntil,resizeKickEnd:resizeKickEnd,deck:deck,count:blocks.length,width:width,height:height,renderHeight:renderHeight,floorY:floorY,looseTop:looseTop,elapsed:elapsed,resizes:resizeCount,maxOverlap:maxOverlap,maxOutside:outside,bodies:blocks.map(function(b,i){var p=b.body.getPosition(),v=b.body.getLinearVelocity(),visual=b.target&&b.visual;return {id:b.id,letter:b.letter,year:b.year,docked:b.docked,capturedAt:b.capturedAt,dockedAt:b.dockedAt,assembling:!!b.assemblyMotion,resizeHeld:!!b.resizeHeld,clearOfPile:b.clearOfPile,target:b.target,x:visual?visual.x:p.x*unit,y:visual?visual.y:p.y*unit,vx:visual?visual.vx:v.x*unit,vy:visual?visual.vy:v.y*unit,angularVelocity:visual?0:b.body.getAngularVelocity(),pendingCollision:false,angle:visual?visual.angle:b.body.getAngle(),width:visual?visual.width:b.width,height:visual?visual.height:b.height,baseWidth:b.width,baseHeight:b.height,entered:b.entered,sleeping:b.docked||!b.body.isAwake(),speed:visual?Math.hypot(visual.vx,visual.vy):Math.hypot(v.x,v.y)*unit,vertices:polygons[i]};})};
  }};
})();


