'use strict';
const MAX_OPEN_TABS=100;
const tabLimit=value=>Number.isInteger(value) && value>=20 && value<=MAX_OPEN_TABS ? value : 50;
function excessTabs(tabs,activeId,settings,protectedIds=new Set()) {
  if(!settings.autoCloseTabs)return [];
  let excess=tabs.length-tabLimit(settings.tabLimit);
  const victims=[];
  for(let i=tabs.length-1;i>=0 && excess>0;i--){
    const tab=tabs[i];
    if(tab.id===activeId || protectedIds.has(tab.id))continue;
    victims.push(tab.id);excess--;
  }
  return victims;
}
module.exports={MAX_OPEN_TABS,tabLimit,excessTabs};
