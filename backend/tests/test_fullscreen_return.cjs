// Real browser regression: no account, database, SMTP or LiveKit connection.
// CHROME_EXECUTABLE may override the Windows Chrome installation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'labmec-fullscreen-return-'));
  const file=path.join(folder,'fixture.html');
  fs.writeFileSync(file,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>.hidden{display:none!important}.modal-closing{opacity:0}.note-fullscreen{position:fixed;inset:0}section{background:white;color:black;padding:20px}</style></head><body><button id="app">Hub</button><section id="note" class="hidden"><button id="note-full">Tela cheia</button><button id="note-back">Voltar</button></section><section id="call" class="hidden"><button id="call-full">Tela cheia</button><button id="call-back">Voltar</button></section></body></html>');
  const application=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const home=application.match(/<button class="icon-btn" id="home-btn"[\s\S]*?<\/button>/)[0];
  const profile=application.match(/<section class="profile-page hidden" id="view-profile-modal"[\s\S]*?<\/section>/)[0];
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('</body>',home+'<div id="sections-container">'+profile+'</div></body>'));
  const browser=spawn(process.env.CHROME_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+path.join(folder,'profile'),'about:blank',
  ],{windowsHide:true,stdio:'ignore'});
  let ws;
  try{
    const portFile=path.join(folder,'profile','DevToolsActivePort');
    for(let i=0;i<100&&!fs.existsSync(portFile);i++)await pause(100);
    const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split('\n');
    ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let id=0;const pending=new Map();
    ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(message.error):p.resolve(message.result);}};
    const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params,sessionId}));});
    const {targetId}=await call('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
    const tab=(method,params)=>call(method,params,sessionId);
    const evaluate=async expression=>{
      const result=await tab('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
      if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
      return result.result.value;
    };
    await tab('Page.enable');
    await tab('Page.navigate',{url:require('node:url').pathToFileURL(file).href});await pause(250);
    const sources=['note-fullscreen.js','call-fullscreen.js'].map(name=>fs.readFileSync(path.join(root,'assets',name),'utf8').replace(/export /g,'')).join('\n');
    await evaluate(sources+`;window.uiClicks=0;document.getElementById('app').onclick=()=>uiClicks++;
      window.noteController=initializeNoteFullscreen({modal:document.getElementById('note'),button:document.getElementById('note-full')});
      initializeCallFullscreen({modal:document.getElementById('call'),button:document.getElementById('call-full')});
      window.until=async predicate=>{const start=Date.now();while(!predicate()){if(Date.now()-start>2500)throw Error('Fullscreen transition timed out');await new Promise(r=>setTimeout(r,20));}};
      for(const name of ['note','call'])document.getElementById(name+'-back').onclick=()=>{
        const modal=document.getElementById(name);modal.classList.add('modal-closing');setTimeout(()=>{modal.classList.add('hidden');modal.classList.remove('modal-closing');},40);
      };
      window.cycle=async name=>{
        const modal=document.getElementById(name);modal.classList.remove('hidden','modal-closing');
        document.getElementById(name+'-full').click();await until(()=>document.fullscreenElement===modal);
        document.getElementById(name+'-back').click();await until(()=>!document.fullscreenElement&&modal.classList.contains('hidden'));
        document.getElementById('app').click();return {clicks:uiClicks,unlocked:!document.fullscreenElement,buttonReady:!document.getElementById(name+'-full').disabled};
      };
    `);
    let expected=0;
    for(const name of ['note','call'])for(let attempt=0;attempt<5;attempt++){
      const result=await evaluate(`cycle('${name}')`);
      assert.equal(result.clicks,++expected);assert.equal(result.unlocked,true);assert.equal(result.buttonReady,true);
    }
    console.log('Native fullscreen: five note/back and five call/back cycles passed; Hub remains interactive.');
    // Closing a child panel must not end whole-Hub fullscreen.
    assert.equal(await evaluate(`(async()=>{await document.documentElement.requestFullscreen();const note=document.getElementById('note');note.classList.remove('hidden','modal-closing');document.getElementById('note-back').click();await until(()=>note.classList.contains('hidden'));const preserved=document.fullscreenElement===document.documentElement;await document.exitFullscreen();return preserved;})()`),true);
    console.log('Whole-Hub fullscreen is preserved when a child panel closes.');
    // Fallback mode and repeated exit calls must not create observer loops either.
    assert.equal(await evaluate(`(async()=>{const note=document.getElementById('note');note.classList.remove('hidden','modal-closing');note.classList.add('note-fullscreen');document.getElementById('note-back').click();await until(()=>!note.classList.contains('note-fullscreen')&&note.classList.contains('hidden'));await Promise.all([noteController.exit(),noteController.exit()]);return true;})()`),true);
    console.log('Fallback fullscreen and repeated exit cleanup passed.');
    const profileHandlers=application.slice(application.indexOf('function closeViewProfile(restorePosition=true)'),application.indexOf('// Clique nos avatares de outras pessoas'));
    const header=fs.readFileSync(path.join(root,'assets/header-back.js'),'utf8').replace(/export /g,'');
    await evaluate(`const viewProfileModal=document.getElementById('view-profile-modal'),profilePageContainer=document.getElementById('sections-container');let profileReturnConversation=null,profileEntranceAnimation=null,profileReturnScroll=0,profileReturnFocus=document.getElementById('app');const currentUid='test-only';`+profileHandlers+header+`;document.getElementById('view-profile-back').addEventListener('click',returnFromViewProfile);initializeHeaderBack(document.getElementById('home-btn'),()=>{});`);
    assert.equal(await evaluate(`(async()=>{viewProfileModal.classList.remove('hidden');profilePageContainer.classList.add('profile-page-active');document.body.classList.add('profile-page-open');await document.documentElement.requestFullscreen();document.getElementById('home-btn').click();await until(()=>viewProfileModal.classList.contains('hidden'));document.getElementById('app').click();const ok=document.fullscreenElement===document.documentElement&&!document.body.classList.contains('profile-page-open');await document.exitFullscreen();return ok;})()`),true);
    console.log('Whole-Hub fullscreen + real profile + Home return passed.');
    await call('Browser.close');
  }finally{if(ws)ws.close();browser.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
