const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const events={},classes=new Set();let callback,uid='test';
const mobile={matches:true,addEventListener:()=>{}};
const context=vm.createContext({matchMedia:()=>mobile,requestAnimationFrame:fn=>{callback=fn;return 1;},window:{scrollY:0,innerHeight:800,addEventListener:(name,fn)=>events[name]=fn},document:{getElementById:()=>null,documentElement:{scrollHeight:3000,classList:{contains:()=>false}},body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},matches:()=>false},addEventListener:(name,fn)=>events[name]=fn}});
vm.runInContext(fs.readFileSync('assets/mobile-scroll-controls.js','utf8').replace('export function ','function '),context);
context.initializeMobileScrollControls({getUid:()=>uid});
function scroll(y){context.window.scrollY=y;events.scroll();callback();}
scroll(20);assert.equal(classes.size,0);
scroll(50);assert.equal(classes.size,0);
scroll(80);assert.ok(classes.has('mobile-controls-hidden'));
scroll(77);assert.ok(classes.has('mobile-controls-hidden'));
scroll(65);assert.equal(classes.size,0);
scroll(160);assert.ok(classes.has('mobile-controls-hidden'));
scroll(0);assert.equal(classes.size,0);
scroll(120);events.resize();assert.equal(classes.size,0);
mobile.matches=false;scroll(300);assert.equal(classes.size,0);
mobile.matches=true;uid=null;scroll(500);assert.equal(classes.size,0);
let sectionTop=400;
context.document.getElementById=id=>id==='work-nav'?{}:{getBoundingClientRect:()=>({top:sectionTop})};
context.getComputedStyle=()=>({top:'8px'});
uid='test';context.initializeMobileScrollControls({getUid:()=>uid});
scroll(600);assert.ok(classes.has('mobile-controls-hidden'));assert.ok(!classes.has('mobile-work-nav-reached'));
sectionTop=8;scroll(700);assert.ok(classes.has('mobile-work-nav-reached'));assert.ok(classes.has('mobile-controls-hidden'));
scroll(680);assert.ok(!classes.has('mobile-controls-hidden'));
sectionTop=100;scroll(660);assert.ok(!classes.has('mobile-work-nav-reached'));
console.log('Mobile controls: down hides, up reveals, jitter ignored, top/resize reset, desktop and signed-out unaffected.');

