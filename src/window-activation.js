'use strict';

function activationFlags(flags) {
  // Only an activation raise at unchanged geometry. Explicit non-activating
  // tab handoffs, menu placement, moves, resizes and visibility stay untouched.
  return (flags & 3) === 3 && !(flags & (4 | 16 | 64 | 128)) ? flags | 4 : flags;
}
function activationAPI(window) {
  const koffi = require('koffi'), user = koffi.load('user32.dll');
  const foreground = user.func('intptr_t __stdcall GetForegroundWindow()'), owner = user.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t,_Out_ uint32_t*)');
  const type = koffi.struct('FlashbornWindowPos', { hwnd:'intptr_t', after:'intptr_t', x:'int32_t', y:'int32_t', width:'int32_t', height:'int32_t', flags:'uint32_t' });
  return {
    ownForeground(native) { const pid=[0]; owner(foreground(),pid); return pid[0] === process.pid || pid[0] === native.child.pid; },
    read(lParam) { const pointer=koffi.decode(lParam,'void*'); return { pointer,value:koffi.decode(pointer,type) }; },
    write(pointer,value) { koffi.encode(pointer,type,value); }
  };
}
class WindowActivation {
  constructor(window, current, { api=activationAPI(window), now=Date.now }={}) {
    this.window=window; this.current=current; this.api=api; this.now=now; this.until=0; this.prevented=0;
    this.onPointer=()=>this.arm();
    this.onPosition=(_wParam,lParam)=> {
      const native=this.current();
      if (this.until < this.now() || native !== this.armed || !this.eligible(native)) return;
      const {pointer,value}=this.api.read(lParam), flags=activationFlags(value.flags);
      if (value.after !== 0) return; // Never constrain explicit/topmost placement.
      if (flags === value.flags) return;
      value.flags=flags; this.api.write(pointer,value); this.prevented++;
    };
    window.hookWindowMessage(0x0021,this.onPointer);
    window.hookWindowMessage(0x0046,this.onPosition);
  }
  eligible(native) {
    return native?.isPresented() && native.wantedVisible && !native.preparing && !native.retiring && !native.handoff && !native.above && !native.hostMoving && native.nextLayer(native.hwnd,2,native.hostHandle()) === native.hostHandle();
  }
  arm() {
    const native=this.current();
    this.armed=this.eligible(native) && this.api.ownForeground(native) ? native : null;
    this.until=this.armed ? this.now()+350 : 0;
  }
  dispose() { this.until=0; if (!this.window.isDestroyed()) { this.window.unhookWindowMessage(0x0021); this.window.unhookWindowMessage(0x0046); } }
}
module.exports={WindowActivation,activationFlags};
