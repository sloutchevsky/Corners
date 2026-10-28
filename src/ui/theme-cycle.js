(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FlashbornTheme=api;
})(typeof window==='object'?window:this,function(){
  'use strict';
  const states=Object.freeze([
    Object.freeze({theme:'current',highContrast:true,label:'Black',angle:0}),
    Object.freeze({theme:'current',highContrast:false,label:'Dark grey',angle:90}),
    Object.freeze({theme:'light',highContrast:true,label:'White',angle:180}),
    Object.freeze({theme:'light',highContrast:false,label:'Light grey',angle:270})
  ]);
  function index(settings={}){
    return (settings.theme==='light'?2:0)+(settings.highContrast===true?0:1);
  }
  function current(settings){return states[index(settings)];}
  function next(settings){return states[(index(settings)+1)%states.length];}
  return {states,index,current,next};
});
