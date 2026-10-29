const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const source = fs.readFileSync(path.join(root,'assets/auth-recovery.js'),'utf8');
function element(id){
  const classes = new Set();
  return {id,value:'',hidden:true,type:'password',style:{},listeners:{},disabled:false,
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(){}},
    addEventListener(name,fn){this.listeners[name]=fn;},focus(){this.focused=true;},
    reset(){this.value='';},setCustomValidity(text){this.invalid=text;},reportValidity(){return !this.invalid;},
  };
}
(async()=>{
  const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],element(m[1])]));
  elements['recovery-password-form'].reportValidity=()=>!elements['recovery-confirmation'].invalid;
  let fail=false,closed=0,success='',resolvePending;
  const calls=[];
  const api=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    if(fail)throw Error('Código inválido.');
    if(resolvePending===true)return new Promise(resolve=>{resolvePending=resolve;});
    return url.includes('verify-')?{token:'private-grant'}:{message:'Concluído.'};
  };
  const context=vm.createContext({document:{getElementById:id=>elements[id]}});
  vm.runInContext(source.replace(/^import .*;\r?\n/,'').replace('export function','function'),context);
  context.initializeAuthRecovery=vm.runInContext('initializeAuthRecovery',context);
  const ui=context.initializeAuthRecovery({api,onClose:()=>closed++,onSuccess:message=>{success=message;}});
  const submit=id=>elements[id].listeners.submit({preventDefault(){}});
  ui.start('person@example.invalid');
  assert.equal(elements['auth-recovery'].hidden,false);
  assert.equal(elements['recovery-password-form'].hidden,true);
  assert.equal(elements['recovery-code'].focused,true);
  const markup=html.slice(html.indexOf('<section id="auth-recovery"'),html.indexOf('<button class="login-toggle"'));
  assert.doesNotMatch(markup,/type="email"/);
  assert.match(markup,/autocomplete="one-time-code"/);
  elements['recovery-code'].value='012345'; fail=true;
  await submit('recovery-code-form');
  assert.equal(elements['recovery-password-form'].hidden,true);
  assert.equal(elements['recovery-verify'].disabled,false);
  fail=false;await elements['recovery-resend'].listeners.click();
  assert.equal(calls.at(-1).body.email,'person@example.invalid');
  elements['recovery-code'].value='012345';await submit('recovery-code-form');
  assert.equal(calls.at(-1).body.email,'person@example.invalid');
  assert.equal(elements['recovery-password-form'].hidden,false);
  elements['recovery-password'].value='a-new-secure-password';
  elements['recovery-confirmation'].value='mismatch';const before=calls.length;
  await submit('recovery-password-form');assert.equal(calls.length,before);
  elements['recovery-confirmation'].value='a-new-secure-password';
  await submit('recovery-password-form');
  assert.equal(calls.at(-1).body.token,'private-grant');
  assert.equal(closed,1);assert.equal(success,'Concluído.');
  assert.equal(elements['auth-recovery'].hidden,true);
  // A verification response arriving after cancellation cannot reopen the flow.
  ui.start('person@example.invalid');elements['recovery-code'].value='012345';resolvePending=true;
  const pending=submit('recovery-code-form');
  await elements['recovery-back'].listeners.click();resolvePending({token:'stale'});await pending;
  assert.equal(elements['auth-recovery'].hidden,true);
  assert.equal(closed,2);
  console.log('Inline recovery: retained email, code-only form, errors, resend, reset and stale-response cancellation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
