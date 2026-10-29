// Exercise the recovery UI state machine without contacting SMTP or production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'assets/password-reset.js'), 'utf8');
const markup = fs.readFileSync(path.join(root, 'assets/password-reset.html'), 'utf8');
function element(id) {
  return { id, value:'', hidden:id==='reset-form', disabled:false, textContent:'', type:'password',
    listeners:{}, classList:{toggle(){}}, addEventListener(name,fn){this.listeners[name]=fn;},
    setCustomValidity(value){this.invalid=value;}, reportValidity(){return !this.invalid;},
    reset(){this.wasReset=true;}, focus(){this.focused=true;},
  };
}
(async()=>{
  const ids = [...markup.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  const elements = Object.fromEntries(ids.map(id=>[id,element(id)]));
  elements['reset-form'].reportValidity=()=>!elements['confirm-password'].invalid;
  const back=element('back'), calls=[], saved=new Map([['hub-reset-email','person@example.invalid']]);
  let fail=false;
  const context=vm.createContext({URLSearchParams, location:{hash:'',pathname:'/reset-password',search:''},
    history:{replaceState(){}},sessionStorage:{getItem:key=>saved.get(key),removeItem:key=>saved.delete(key)},
    document:{getElementById:id=>elements[id],querySelector:()=>back},
    request:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body)});
      if(fail)throw new Error('Código inválido ou expirado.');
      return url.includes('verify-')?{token:'private-grant'}:{message:'Solicitação aceita.'};
    },
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/,''),context);
  assert.equal(elements['reset-form'].hidden,true);
  assert.equal(elements['reset-email'].value,'person@example.invalid');
  assert.equal(saved.size,0);
  await elements['resend-code'].listeners.click();
  assert.equal(calls.at(-1).url,'/auth/forgot-password');
  elements['reset-code'].value='012345';fail=true;
  await elements['code-form'].listeners.submit({preventDefault(){}});
  assert.equal(elements['reset-form'].hidden,true);
  assert.equal(elements['code-submit'].disabled,false);
  fail=false;
  await elements['code-form'].listeners.submit({preventDefault(){}});
  assert.equal(calls.at(-1).body.code,'012345');
  assert.equal(elements['code-form'].hidden,true);
  assert.equal(elements['reset-form'].hidden,false);
  elements['new-password'].value='new-secure-password';
  elements['confirm-password'].value='different';
  const count=calls.length;
  await elements['reset-form'].listeners.submit({preventDefault(){}});
  assert.equal(calls.length,count);
  elements['confirm-password'].value='new-secure-password';
  await elements['reset-form'].listeners.submit({preventDefault(){}});
  assert.equal(calls.at(-1).url,'/auth/reset-password');
  assert.equal(calls.at(-1).body.token,'private-grant');
  assert.equal(elements['reset-form'].hidden,true);
  assert.equal(back.focused,true);
  assert.match(markup,/inputmode="numeric"/);
  assert.match(markup,/autocomplete="one-time-code"/);
  assert.match(markup,/name="viewport"/);
  console.log('Recovery UI: request, invalid code, verification, password confirmation and success passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
