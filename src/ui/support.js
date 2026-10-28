'use strict';
window.FlashbornSupport = (() => {
  const selection={amount:5,frequency:'one-time'};
  let custom=false,state;
  const names={paypal:'PayPal',venmo:'Venmo',link:'Link'};
  const $=selector=>document.querySelector(selector);
  const introduction=supported=>supported
    ? 'Thank you for supporting Corners. The sidebar Support tab and its reminders are hidden on this device. You can return here any time from About or the menu.'
    : 'Your support helps keep Corners free and preserves original Flash websites. After your first donation, choose “I’ve donated” below to hide the sidebar Support tab and its reminders on this device. You can always return from About or the menu.';
  function markup(){
    return `<div class="support-section" id="support-payment"><div class="support-body"><div class="support-amounts" role="group" aria-label="Support amount">${[3,5,10].map(amount=>`<button type="button" data-support-amount="${amount}" aria-pressed="${!custom&&selection.amount===amount}"><span>$${amount}</span></button>`).join('')}<label class="support-other"><span>Other</span><span class="support-other-pill" data-selected="${custom}"><span>$</span><input type="number" inputmode="decimal" min="1" max="10000" step="0.01" aria-label="Other support amount in US dollars" placeholder="Amount" value="${custom?selection.amount:''}"></span></label></div><fieldset class="support-frequency"><legend class="visually-hidden">Support frequency</legend>${[['one-time','One-time'],['monthly','Monthly'],['yearly','Yearly']].map(([value,label])=>`<label><input type="radio" name="support-frequency" value="${value}" ${selection.frequency===value?'checked':''}>${label}</label>`).join('')}</fieldset><div class="support-methods" role="group" aria-label="Payment method">${Object.entries(names).map(([key,name])=>`<button type="button" data-support-provider="${key}">${name}</button>`).join('')}</div><p class="support-status" role="status" aria-live="polite"></p></div><div class="support-acknowledgement"><button type="button" class="secondary-button" data-support-confirm>I’ve donated</button><p class="support-confirmation-note">Already supported Corners? Confirm here to hide the sidebar tab and reminders.</p><p class="support-thanks" role="status" hidden>Thank you for supporting Corners.</p></div></div>`;
  }
  function page(headline){
    return `<section class="panel support-panel" data-kind="support">${headline('Support Corners')}<p class="description" id="support-intro">${introduction(!!state?.supporter)}</p>${markup()}</section>`;
  }
  function refresh(next){
    state=next;
    const section=$('#support-payment');if(!section)return;
    $('#support-intro').textContent=introduction(!!state.supporter);
    section.querySelector('[data-support-confirm]').hidden=!!state.supporter;
    section.querySelector('.support-confirmation-note').hidden=!!state.supporter;
    section.querySelector('.support-thanks').hidden=!state.supporter;
    const input=section.querySelector('.support-other input');
    const valid=!input.value || Number.isFinite(Number(input.value))&&Number(input.value)>=1&&Number(input.value)<=10000;
    const pending=input.value ? !custom||Number(input.value)!==selection.amount : custom;
    let connected=false;
    for(const button of section.querySelectorAll('[data-support-provider]')){
      const provider=button.dataset.supportProvider;
      const available=!!state.support?.[provider]?.[selection.frequency] && !(provider==='venmo'&&selection.frequency!=='one-time');
      connected ||= available;button.disabled=!available||!valid||pending;
      button.title=available?`Continue with ${names[provider]}`:'Payment link will be added later';
    }
    section.querySelector('.support-status').textContent=!valid?'Enter an amount between $1 and $10,000.':pending?'Press Enter to select this amount.':!connected?'Payment options will be available soon.':'Confirm the amount and billing frequency at checkout.';
    section.querySelectorAll('[data-support-amount]').forEach(button=>button.setAttribute('aria-pressed',String(!custom&&Number(button.dataset.supportAmount)===selection.amount)));
    section.querySelector('.support-other-pill').dataset.selected=String(custom);
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button'),section=$('#support-payment');if(!button||!section)return;
    if(button.dataset.supportAmount){custom=false;selection.amount=Number(button.dataset.supportAmount);section.querySelector('.support-other input').value='';refresh(state);}
    if(button.hasAttribute('data-support-confirm')){
      button.disabled=true;
      const result=await window.browser.call('support-confirm');
      refresh(result.state||state);
      if(!result.ok&&section.isConnected){button.disabled=false;section.querySelector('.support-status').textContent=result.error;}
    }
    if(button.dataset.supportProvider&&!button.disabled){
      button.disabled=true;
      const result=await window.browser.call('support-checkout',{provider:button.dataset.supportProvider,...selection});
      refresh(result.state||state);
      if(section.isConnected)section.querySelector('.support-status').textContent=result.ok?'Checkout opened in your default browser.':result.error;
    }
  });
  document.addEventListener('change',event=>{if(event.target.name==='support-frequency'){selection.frequency=event.target.value;refresh(state);}});
  document.addEventListener('input',event=>{if(event.target.matches('.support-other input'))refresh(state);});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||!event.target.matches('.support-other input'))return;
    event.preventDefault();const value=Number(event.target.value);
    if(event.target.value.trim()&&Number.isFinite(value)&&value>=1&&value<=10000){selection.amount=Math.round(value*100)/100;custom=true;event.target.value=String(selection.amount);event.target.blur();}
    refresh(state);
  });
  return {page,refresh};
})();
