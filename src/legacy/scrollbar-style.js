'use strict';
const css=require('fs').readFileSync(require('path').join(__dirname,'page-scrollbars.css'),'utf8');
function scrollbarStyle(light){
 const colors=light?['#aaa','#777','#000']:['#333','#808080','#fff'];
 return ':root{--flashborn-scroll-thumb:'+colors[0]+'!important;--flashborn-scroll-hover:'+colors[1]+'!important;--flashborn-scroll-active:'+colors[2]+'!important}\n'+css;
}
module.exports={scrollbarStyle};
