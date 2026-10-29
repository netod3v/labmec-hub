const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../assets/header-back.js'),'utf8');
function control(){return {disabled:false,hiddenParent:false,clicks:0,closest(){return this.hiddenParent;},getClientRects(){return [1];},click(){this.clicks++;}};}
function surface(layer,buttons,dialog=false){return {...control(),layer,matches(){return dialog;},querySelectorAll(){return buttons;}};}
let current=[];
const context=vm.createContext({document:{querySelectorAll(selector){return current.filter(element=>!element.selector||selector.split(',').includes(element.selector));}},getComputedStyle:element=>({zIndex:String(element.layer)})});
vm.runInContext(source.replace(/export /g,''),context);
const back=vm.runInContext('returnFromCurrentScreen',context);
const initialize=vm.runInContext('initializeHeaderBack',context);
const profile=control(),files=control(),notification=control();
// Profiles are inline sections, not modal-overlay elements.
const profilePage=surface('auto',[profile]);profilePage.selector='#view-profile-modal';
current=[profilePage];assert.equal(back(),true);assert.equal(profile.clicks,1);profile.clicks=0;
for(const button of [profile,files,notification]){
  current=[surface('auto',[button])];assert.equal(back(),true);assert.equal(button.clicks,1);
}
const underlying=control(),overlay=control();
current=[surface(1,[underlying]),surface(200,[overlay])];back();assert.equal(overlay.clicks,1);assert.equal(underlying.clicks,0);
const first=control(),last=control();current=[surface(200,[first]),surface(200,[last])];back();assert.equal(last.clicks,1);assert.equal(first.clicks,0);
const hidden=control();hidden.hiddenParent=true;
current=[surface(200,[hidden,overlay])];back();assert.equal(hidden.clicks,0);assert.equal(overlay.clicks,2);
const hiddenPage=surface(300,[hidden]);hiddenPage.hiddenParent=true;
current=[hiddenPage,surface(200,[profile])];back();assert.equal(profile.clicks,2);
const modal=control();current=[surface(10000,[overlay]),surface('auto',[modal],true)];back();assert.equal(modal.clicks,1);
const button={addEventListener(name,fn){this.click=fn;}};let fallback=0;
initialize(button,()=>fallback++);current=[];button.click();assert.equal(fallback,1);
current=[surface(1,[files])];button.click();assert.equal(files.clicks,2);assert.equal(fallback,1);
console.log('Header back: existing return handlers, active layers, hidden pages and root fallback passed.');
