'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Grid=require('../site/flash-gallery/magnetic-grid');
let seed=87113;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function valid(plan,frame,active,point,viewport){
 const cards=Object.entries(plan.targets).map(([id,r])=>({...r,id:+id}));
 for(const card of cards){
  for(const k of ['x','y','width','height'])assert.ok(Number.isFinite(card[k])&&card.width>0&&card.height>0);
  assert.ok(card.x-card.width/2>=7.99&&card.x+card.width/2<=viewport-7.99);
 }
 for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
  const a=cards[i],b=cards[j],dx=Math.abs(a.x-b.x)-(a.width+b.width)/2,dy=Math.abs(a.y-b.y)-(a.height+b.height)/2;
  assert.ok(dx>=frame.gap-.001||dy>=frame.gap-.001,JSON.stringify({a,b,frame,dx,dy}));
 }
 if(active){
  const r=plan.targets[active];assert.ok(Grid.contains(r,point,.74),JSON.stringify({active,r,point,frame}));
  assert.ok(Math.abs(r.width-(2*frame.cellWidth+frame.gap))<.001);
  assert.ok(Math.abs(r.height-(2*frame.cellHeight+frame.gap))<.001);
 }
}
test('all positions, column counts and interrupted handoffs keep the target around the pointer',()=>{
 let cases=0;
 for(const viewport of [180,240,320,390,490,640,750,900,1100,1440,1800]){
  const available=Math.min(1454.4,viewport-36),frame=Grid.frame(available,viewport/2,160),items=Array.from({length:28},(_,i)=>({id:i+1}));
  let plan=Grid.plan({frame,items,active:null,top:500,viewportWidth:viewport});
  valid(plan,frame,null,null,viewport);
  for(let n=0;n<280;n++){
   const id=1+Math.floor(random()*items.length),r=plan.targets[id];
   const point={x:r.x+(random()-.5)*(r.width-3),y:r.y+(random()-.5)*(r.height-3)};
   const next=Grid.plan({frame,items,active:id,anchor:{...point,left:r.x-r.width/2,top:r.y-r.height/2},top:500,viewportWidth:viewport});
   valid(next,frame,id,point,viewport);
   assert.equal(Object.keys(next.targets).length,28);
   for(let k=0;k<20;k++){
    const t=next.targets[id],blend=random(),current={x:r.x+(t.x-r.x)*blend,y:r.y+(t.y-r.y)*blend,width:r.width+(t.width-r.width)*blend,height:r.height+(t.height-r.height)*blend};
    // Disturb the proposed frame: cancellation, scroll and a moving pointer
    // must still be handled by projection, not a lucky interpolation path.
    current.x+=(random()-.5)*80;current.y+=(random()-.5)*80;
    Grid.contain(current,point);assert.ok(Grid.contains(current,point,.749));cases++;
   }
   plan=next;
  }
 }
 assert.equal(cases,61600);
});
test('narrow phone grids keep three columns and a preview fills two full tracks',()=>{
 const items=Array.from({length:28},(_,i)=>({id:i+1}));
 for(let available=120;available<530;available+=3.25){
  const viewport=available+96,f=Grid.frame(available,viewport/2);
  assert.equal(f.columns,3);
  const normal=Grid.plan({frame:f,items,active:null,top:440,viewportWidth:viewport});
  for(const id of items.map(i=>i.id))for(const fx of [.001,.5,.999]){
   const r=normal.targets[id],a={x:r.x+(fx-.5)*r.width,y:r.y,left:r.x-r.width/2,top:r.y-r.height/2,width:r.width,height:r.height};
   const p=Grid.plan({frame:f,items,active:id,anchor:a,top:440,viewportWidth:viewport}),b=p.targets[id];
   assert.ok(Math.abs(b.width-(2*f.cellWidth+f.gap))<1e-8);
   assert.ok(b.x-b.width/2>=f.left-1e-8&&b.x+b.width/2<=f.left+f.width+1e-8);
   assert.ok(Grid.contains(b,a));
   valid(p,f,null,null,viewport);
  }
 }
});
test('each three-to-eight-column configuration fills the entire line with equal gutters',()=>{
 const seen=new Set();
 for(let available=80;available<=2000;available+=.25){
  const f=Grid.frame(available,1100);seen.add(f.columns);
  assert.ok(f.columns>=3&&f.columns<=8);
  assert.ok(Math.abs(f.width-available)<1e-7);
  assert.ok(Math.abs(f.left+available/2-1100)<1e-8);
  assert.equal(f.railWidth,available);
  assert.ok(Math.abs(f.width-(f.columns*f.cellWidth+(f.columns-1)*f.gap))<1e-8);
  assert.ok(Math.abs(f.cellWidth-(available-(f.columns-1)*f.gap)/f.columns)<1e-8);
 }
 assert.deepEqual([...seen],[3,4,5,6,7,8]);
});

test('hover keeps every normal tile the same size and reserves a complete two-by-two grid slot',()=>{
 const items=Array.from({length:28},(_,i)=>({id:i+1})),top=440;
 for(const available of [280,400,550,710,900,1085,1270,1454.4]){
  const viewport=available+96,f=Grid.frame(available,viewport/2),normal=Grid.plan({frame:f,items,active:null,top,viewportWidth:viewport});
  for(const item of items)for(const fx of [.001,.5,.999])for(const fy of [.001,.5,.999]){
   const a=normal.targets[item.id],anchor={left:a.x-a.width/2,top:a.y-a.height/2,width:a.width,height:a.height,x:a.x+(fx-.5)*a.width,y:a.y+(fy-.5)*a.height};
   const plan=Grid.plan({frame:f,items,active:item.id,anchor,top,viewportWidth:viewport});
   for(const [id,r] of Object.entries(plan.targets)){
    const expanded=+id===item.id;
    assert.ok(Math.abs(r.width-(expanded?2*f.cellWidth+f.gap:f.cellWidth))<1e-8,'Hover must not squeeze or stretch neighboring columns');
    assert.ok(Math.abs(r.height-(expanded?2*f.cellHeight+f.gap:f.cellHeight))<1e-8,'Hover must not squeeze or stretch neighboring rows');
    assert.ok(Math.abs(r.x-r.width/2-f.left-r.column*(f.cellWidth+f.gap))<1e-8,'Tile must align to a full grid column');
    assert.ok(Math.abs(r.y-r.height/2-top-r.row*(f.cellHeight+f.gap))<1e-8,'Tile must align to a full grid row');
   }
  }
 }
});

test('native pixel-rounded acquisition prioritizes the pointer over preserving an incompatible footprint',()=>{
 const frame=Grid.frame(861.675,472.4),items=Array.from({length:28},(_,i)=>({id:i+1}));
 const acquired={left:262.98126220703125,top:414.75,width:418.7375183105469,height:221.3625030517578};
 const point={x:262.2056350708008,y:551.0191688537598};
 const layout=Grid.plan({frame,items,active:3,anchor:{...acquired,...point},top:414.75,viewportWidth:944});
 assert.ok(Grid.contains(layout.targets[3],point),'A rounded native hit must select a slot containing the pointer');
 assert.equal(layout.targets[3].column,0);
});

test('full-width selection stays independent of every lower-grid hover and replacement',()=>{
 const items=Array.from({length:28},(_,i)=>({id:i+1})),top=440;
 for(const available of [280,400,550,710,900,1085,1270,1454.4]){
  const viewport=available+96,f=Grid.frame(available,viewport/2);
  for(const featured of items.map(item=>item.id)){
   const base=Grid.plan({frame:f,items,featured,active:null,top});
   const hero=base.targets[featured];
   assert.equal(base.featured,featured);assert.equal(hero.width,f.width);
   assert.ok(Math.abs(hero.x-hero.width/2-f.left)<1e-8);
   assert.ok(Math.abs(hero.y-hero.height/2-top)<1e-8);
   assert.ok(hero.height>=2*f.cellHeight+f.gap-1e-8);
   assert.equal(base.gridTop,top+hero.height+f.gap);
   for(const item of items){
    if(item.id===featured)continue;
    const r=base.targets[item.id];
    for(const fx of [.001,.5,.999]){
     const point={x:r.x+(fx-.5)*r.width,y:r.y},anchor={...point,left:r.x-r.width/2,top:r.y-r.height/2,width:r.width,height:r.height};
     const plan=Grid.plan({frame:f,items,featured,active:item.id,anchor,top});
     assert.deepEqual(plan.targets[featured],hero,'Lower hover must not move or resize the full-width tile');
     assert.equal(Object.keys(plan.targets).length,items.length);
     valid(plan,f,null,null,viewport);
     assert.ok(Grid.contains(plan.targets[item.id],point,Math.min(.74,r.width*.0005)),'Near-edge acquisition must retain its original subpixel inset');
     for(const next of items.filter(i=>i.id!==featured)){
      const t=plan.targets[next.id],big=next.id===item.id;
      assert.ok(Math.abs(t.width-(big?2*f.cellWidth+f.gap:f.cellWidth))<1e-8);
      assert.ok(Math.abs(t.height-(big?2*f.cellHeight+f.gap:f.cellHeight))<1e-8);
      assert.ok(t.y-t.height/2>=plan.gridTop-1e-8);
     }
    }
   }
   const replacement=items[(featured+7)%items.length].id;
   const next=Grid.plan({frame:f,items,featured:replacement,active:null,top});
   assert.equal(next.targets[replacement].width,f.width);
   assert.equal(next.targets[featured].width,f.cellWidth);
  }
 }
});

test('a lone full-width tile and invalid featured IDs have no empty grid bands',()=>{
 const frame=Grid.frame(900,600),items=[{id:'only'}];
 const pinned=Grid.plan({frame,items,featured:'only',top:400});
 assert.equal(pinned.bottom,pinned.targets.only.y+pinned.targets.only.height/2);
 assert.deepEqual(Grid.plan({frame,items,featured:'missing',top:400}),Grid.plan({frame,items,top:400}));
});

test('a shrinking line wraps its rightmost tile first and carries later tiles in order',()=>{
 const items=Array.from({length:28},(_,i)=>({id:i+1})),maximum=160.8,gap=24;
 for(const count of [8,7,6,5,4]){
  const threshold=count*maximum+(count-1)*gap;
  const wide=Grid.frame(threshold+.01,(threshold+.01)/2+48);
  const narrow=Grid.frame(threshold-.01,(threshold-.01)/2+48);
  assert.equal(wide.columns,count);assert.equal(narrow.columns,count-1);
  assert.ok(Math.abs(wide.left-narrow.left)<1e-8);
  assert.ok(Math.abs(wide.railWidth-narrow.railWidth-.02)<1e-8);
  const a=Grid.plan({frame:wide,items,active:null,top:400,viewportWidth:1100});
  const b=Grid.plan({frame:narrow,items,active:null,top:400,viewportWidth:1100});
  // The surviving first-row IDs keep their order and grow to justify the row.
  for(let id=1;id<count;id++){assert.equal(b.targets[id].row,0);assert.equal(b.targets[id].column,id-1);}
  assert.ok(Math.abs(b.targets[count-1].x+b.targets[count-1].width/2-narrow.left-narrow.width)<1e-8);
  assert.equal(b.targets[count].row,1);assert.equal(b.targets[count].column,0);
  // Carry every later item, including subsequent wraps, in source order.
  items.forEach((item,i)=>{assert.equal(b.targets[item.id].row,Math.floor(i/(count-1)));assert.equal(b.targets[item.id].column,i%(count-1));});
  assert.equal(b.targets[count+1].column,1);
  const flying={...a.targets[count],angle:0};
  Grid.approach(flying,b.targets[count],1/60,18);
  assert.ok(flying.x<a.targets[count].x&&flying.x>b.targets[count].x);
  assert.ok(flying.y>a.targets[count].y&&flying.y<b.targets[count].y);
 }
});
test('animated wraps stay fitted to the line without feeding projection into spring state',()=>{
 const items=Array.from({length:28},(_,i)=>({id:i+1}));
 for(const [from,to] of [[1454.41,1454.39],[1269.61,1269.59],[1084.81,1084.79],[900,899],[715.21,715.19],[715.19,715.21],[899,900],[1454.39,1454.41]]){
  const first=Grid.frame(from,from/2+48),last=Grid.frame(to,to/2+48);
  const start=Grid.plan({frame:first,items,active:null,top:400,viewportWidth:1200});
  const end=Grid.plan({frame:last,items,active:null,top:400,viewportWidth:1200});
  const poses=items.map(i=>({...start.targets[i.id],id:i.id,angle:0}));
  let previous=poses.map(r=>({...r}));
  for(let n=0;n<120;n++){
   poses.forEach(r=>Grid.approach(r,end.targets[r.id],1/60,18));
   const unprojected=structuredClone(poses),shown=Grid.fit(poses,last.left,last.width);
   assert.deepEqual(poses,unprojected,'Rendering must not change the underlying trajectory');
   assert.ok(Math.abs(Math.min(...shown.map(r=>r.x-r.width/2))-last.left)<1e-7);
   assert.ok(Math.abs(Math.max(...shown.map(r=>r.x+r.width/2))-last.left-last.width)<1e-7);
   for(let k=0;k<shown.length;k++){
    assert.ok(Math.abs(shown[k].width-previous[k].width)<Math.max(first.cellWidth,last.cellWidth)*.2,'A wrap must not assign the new tile size in one frame');
    assert.ok(shown[k].width<=Math.max(first.cellWidth,last.cellWidth)*1.01,'Group fitting must not overscale the tiles');
   }
   previous=shown;
  }
  previous.forEach(r=>assert.ok(Math.abs(r.width-last.cellWidth)<.001));
 }
 assert.deepEqual(Grid.fit([],0,100),[]);
});
test('stable string and zero IDs, point-only anchors and empty results use the same planner',()=>{
 const frame=Grid.frame(900,600,160),items=[{id:'__proto__'},{id:'constructor'},{id:0},{id:'last'}];
 for(const active of ['__proto__',0]){
  const result=Grid.plan({frame,items,active,anchor:{x:600,y:550},top:500,viewportWidth:1200});
  assert.equal(Object.keys(result.targets).length,4);
  assert.ok(Grid.contains(result.targets[active],{x:600,y:550}));
 }
 const empty=Grid.plan({frame,items:[],active:null,top:500,viewportWidth:1200});
 assert.equal(empty.bottom,500);assert.deepEqual(Object.keys(empty.targets),[]);
});
test('enlargement preserves the acquired footprint through interrupted neighboring handoffs',()=>{
 let acquisitions=0;
 for(const available of [280,400,550,710,900]){
  const viewport=available+96,f=Grid.frame(available,viewport/2,160),items=Array.from({length:28},(_,i)=>({id:i+1}));
  let layout=Grid.plan({frame:f,items,active:null,top:440,viewportWidth:viewport});
  let poses=Object.fromEntries(Object.entries(layout.targets).map(([id,r])=>[id,{...r,angle:0}]));
  for(let n=0;n<300;n++){
   const id=1+(n*11)%28,r=poses[id],point={x:r.x+(n%3-1)*r.width*.45,y:r.y+(n%5/4-.5)*r.height*.9};
   const acquired={left:r.x-r.width/2,top:r.y-r.height/2,width:r.width,height:r.height};
   layout=Grid.plan({frame:f,items,active:id,anchor:{...point,...acquired},top:440,viewportWidth:viewport});
   valid(layout,f,id,point,viewport);
   for(let frame=0;frame<1+n%30;frame++){
    for(const item of items)Grid.approach(poses[item.id],layout.targets[item.id],1/60,18);
    Grid.hold(poses[id],acquired,layout.targets[id]);Grid.contain(poses[id],point);
    assert.ok(Grid.contains(poses[id],point,.749));
    const t=layout.targets[id];
    if(t.x-t.width/2<=acquired.left+.01&&t.x+t.width/2>=acquired.left+acquired.width-.01&&t.y-t.height/2<=acquired.top+.01&&t.y+t.height/2>=acquired.top+acquired.height-.01){
     assert.ok(poses[id].x-poses[id].width/2<=acquired.left+.011);
     assert.ok(poses[id].x+poses[id].width/2>=acquired.left+acquired.width-.011);
     assert.ok(poses[id].y-poses[id].height/2<=acquired.top+.011);
     assert.ok(poses[id].y+poses[id].height/2>=acquired.top+acquired.height-.011);
    }
   }
   acquisitions++;
  }
 }
 assert.equal(acquisitions,1500);
});
test('live retargeting preserves position and velocity, including column changes',()=>{
 const r={x:40,y:500,width:180,height:90,angle:0},target={x:400,y:700,width:240,height:120,angle:0};
 Grid.approach(r,target,.08,18);const before=structuredClone(r);
 const other={x:90,y:900,width:160,height:80,angle:0};
 Grid.approach(r,other,0,18);assert.deepEqual(r,before);
 const split=structuredClone(r),single=structuredClone(r);
 Grid.approach(split,other,1/240,18);Grid.approach(split,other,1/240,18);Grid.approach(single,other,1/120,18);
 for(const key of ['x','y','width','height','angle']){
  assert.ok(Math.abs(split[key]-single[key])<1e-8);
  assert.ok(Math.abs(split.velocity[key]-single.velocity[key])<1e-8);
 }
 // A new column count changes destinations, never the displayed pose or
 // its velocity at the retarget instant.
 for(let width=900;width>=200;width-=.5){
  const f=Grid.frame(width,500,160),plan=Grid.plan({frame:f,items:[{id:1},{id:2},{id:3},{id:4}],active:null,top:400,viewportWidth:1100});
  const old=structuredClone(r);Grid.approach(r,plan.targets[3],0,18);assert.deepEqual(r,old);
  Grid.approach(r,plan.targets[3],1/240,18);
 }
});
test('every entry edge of the middle tile in a three-column row stays inside the preview',()=>{
 const f=Grid.frame(550,400,160),items=Array.from({length:12},(_,i)=>({id:i+1}));
 assert.equal(f.columns,3);
 const normal=Grid.plan({frame:f,items,active:null,top:400,viewportWidth:800}).targets[2];
 const acquired={left:normal.x-normal.width/2,top:normal.y-normal.height/2,width:normal.width,height:normal.height};
 for(const fx of [.001,.5,.999])for(const fy of [.001,.5,.999]){
  const point={x:acquired.left+normal.width*fx,y:acquired.top+normal.height*fy};
  const p=Grid.plan({frame:f,items,active:2,anchor:{...acquired,...point},top:400,viewportWidth:800}),r=p.targets[2];
  assert.ok(r.x-r.width/2<=acquired.left+.01&&r.x+r.width/2>=acquired.left+normal.width-.01);
  assert.ok(r.y-r.height/2<=acquired.top+.01&&r.y+r.height/2>=acquired.top+normal.height-.01);
  assert.equal(r.width,normal.width*2+f.gap);assert.equal(r.height,normal.height*2+f.gap);
  valid(p,f,2,{x:Math.max(acquired.left+.8,Math.min(acquired.left+normal.width-.8,point.x)),y:Math.max(acquired.top+.8,Math.min(acquired.top+normal.height-.8,point.y))},800);
 }
});
test('a subpixel corner entry does not force the acquired tile to retreat',()=>{
 const acquired={left:42.5673446655,top:359.3000183105,width:423.6625061035,height:211.8249969482};
 const point={x:331.5698471069,y:570.9239616394};
 const target={x:254.3923416138,y:465.2187576294,width:423.6750183105,height:211.8375091553,angle:0};
 const r={x:acquired.left+acquired.width/2,y:acquired.top+acquired.height/2,width:acquired.width,height:acquired.height,angle:0,velocity:{x:0,y:200,width:-20,height:-10,angle:0}};
 for(let i=0;i<60;i++){
  Grid.approach(r,target,1/60,18);Grid.hold(r,acquired,target,point);
  assert.ok(Grid.contains(r,point));assert.ok(r.y-r.height/2<=acquired.top+.01);
  assert.ok(r.x-r.width/2<=acquired.left+.01);
 }
});

test('native rounded acquisition edges do not prevent an enlarged tile from docking',()=>{
 const target={x:274.8000011444092,y:786.6374893188477,width:506,height:265,angle:0};
 const acquired={left:21.80000114440918,top:654.132080078125,width:241,height:120.5};
 const point={x:142.3000030517578,y:714.382080078125};
 const r={x:acquired.left+acquired.width/2,y:acquired.top+acquired.height/2,width:241,height:120.5,angle:0};
 for(let n=0;n<720;n++){Grid.approach(r,target,1/240,18);Grid.hold(r,acquired,target,point);assert.ok(Grid.contains(r,point));}
 for(const key of ['x','y','width','height'])assert.ok(Math.abs(r[key]-target[key])<.00001,'Rounded '+key+' must converge fully');
});
