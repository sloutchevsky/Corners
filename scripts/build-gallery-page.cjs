'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'site/flash-gallery');
const prototype=JSON.parse(fs.readFileSync(path.join(directory,'prototype-projects.json'),'utf8')).map(item=>{
 const mime=/\.svg$/i.test(item.image)?'image/svg+xml':'image/png';
 return {...item,thumbnail:'data:'+mime+';base64,'+fs.readFileSync(path.join(directory,'images',item.image)).toString('base64')};
});
const html=fs.readFileSync(path.join(directory,'page.html'),'utf8')
 .replace('/* FONT */',fs.readFileSync(path.join(root,'src/ui/fonts/Flashborn75Bold.ttf')).toString('base64'))
 .replace('/* MATTER */',fs.readFileSync(path.join(directory,'planck.min.js'),'utf8'))
 .replace('/* THEME */',fs.readFileSync(path.join(directory,'theme.js'),'utf8'))
 .replace('/* PROJECTS */',JSON.stringify(JSON.parse(fs.readFileSync(path.join(directory,'projects.json'),'utf8'))).replace(/</g,'\\u003c'))
 .replace('/* PROTOTYPE */',JSON.stringify(prototype).replace(/</g,'\\u003c'))
 .replace('/* GRID */',fs.readFileSync(path.join(directory,'magnetic-grid.js'),'utf8'))
 .replace('/* PHYSICS */',fs.readFileSync(path.join(directory,'physics.js'),'utf8'))
 .replace('<!-- MATTER_LICENSE -->','<!--\nPlanck.js 1.5.1\n'+fs.readFileSync(path.join(directory,'PLANCK-LICENSE.txt'),'utf8')+'\n-->')
 .replace(/\r\n?/g,'\n');
const output=path.join(directory,'flash.gallery.html');
fs.writeFileSync(output,html);console.log(output+' ('+Buffer.byteLength(html)+' bytes)');
