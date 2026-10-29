// Run with PLAYWRIGHT_MODULE pointing to playwright-core and EDGE_EXECUTABLE set.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const geometry = fs.readFileSync(path.join(root, 'assets/note-drawing-area.js'), 'utf8').replace(/export /g, '');
const core = source.slice(source.indexOf('let noteSavedRange = null;'), source.indexOf('function renderNoteStudio(){'));
const handlers = source.slice(source.indexOf("noteDrawCanvas.addEventListener('pointerdown'"), source.indexOf('function updateActiveTabTitle(){'));
const controls = ['noteDrawPen','noteDrawEraser','noteDrawPan','noteDrawSelect','noteDrawUndo','noteDrawClear','noteZoomIn','noteZoomOut','noteInkType','noteEraserMode','noteShapeTool','noteDrawSize','noteDrawColor'];

(async()=>{
  const browser = await chromium.launch({headless:true, executablePath:process.env.EDGE_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1100},hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://localhost/drawing-test',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
    await page.goto('http://localhost/drawing-test');
    await page.setContent('<canvas width="1400" height="760" style="touch-action:none"></canvas><div id="controls"></div>');
    await page.evaluate(({core,handlers,geometry,controls})=>{
      const noteDrawCanvas=document.querySelector('canvas');
      const noteDrawViewport=document.body;
      const noteZoomLabel=document.createElement('span');
      const noteAreaTools=document.getElementById('controls');
      noteAreaTools.innerHTML=['area','crop'].map(x=>`<button data-area-tool="${x}">${x}</button>`).join('')+
        ['crop','copy','paste','delete','cancel'].map(x=>`<button data-area-action="${x}">${x}</button>`).join('')+'<span class="note-area-hint"></span>';
      const noteAreaHint=noteAreaTools.querySelector('span');
      const elements=Object.fromEntries(controls.map(name=>[name,document.createElement('button')]));
      elements.noteDrawSize.value='5';elements.noteDrawColor.value='#ff0000';elements.noteShapeTool.value='none';elements.noteEraserMode.value='partial';
      const tab={id:'test'};let saves=0;
      const getActiveTab=()=>tab,saveNoteState=()=>{saves++;};
      const code=geometry+'\n'+core+'\n'+handlers+`
        window.drawingTest={
          seed(){noteDrawCanvas.width=1400;noteDrawCanvas.height=760;noteDrawObjects=[{id:'line',type:'stroke',points:[{x:0,y:50},{x:150,y:50}],width:6,color:'#ff0000'}];noteLegacyImage=null;noteSelectedObjectId=null;clearNoteArea();noteDrawHistory.clear();noteDrawZoom=1;applyNoteDrawZoom();renderNoteDrawing();},
          tool:selectNoteDrawTool,
          undo(){noteDrawUndo.click();},
          pixel(x,y){return [...noteDrawingSnapshot().getContext('2d').getImageData(x,y,1,1).data];},
          state(){return {width:noteDrawCanvas.width,height:noteDrawCanvas.height,objects:noteDrawObjects.length,saved:getActiveTab(),selection:noteAreaRect};},
          reload(){const data=JSON.parse(JSON.stringify(getActiveTab()));noteBitmapCache.clear();restoreNoteDrawing({objects:data.drawingObjects,width:data.drawingWidth,height:data.drawingHeight,legacy:data.drawing});},
          zoom(){noteZoomIn.click();},
          async legacy(){const c=document.createElement('canvas');c.width=1400;c.height=760;c.getContext('2d').fillRect(0,0,1400,760);noteLegacyImage=new Image();noteLegacyImage.src=c.toDataURL();await noteLegacyImage.decode();noteDrawObjects=[];renderNoteDrawing();},
          clear(){noteDrawClear.click();}
        };
      `;
      // Tests execute the editor's actual functions and pointer/button handlers.
      new Function('noteDrawCanvas','noteDrawViewport','noteZoomLabel','noteAreaTools','noteAreaHint','getActiveTab','saveNoteState',...controls,code)(noteDrawCanvas,noteDrawViewport,noteZoomLabel,noteAreaTools,noteAreaHint,getActiveTab,saveNoteState,...controls.map(x=>elements[x]));
    },{core,handlers,geometry,controls});
    const run=(fn)=>page.evaluate(fn);
    async function drag(x1,y1,x2,y2){
      const box=await page.locator('canvas').boundingBox();
      await page.mouse.move(box.x+x1,box.y+y1);await page.mouse.down();
      await page.mouse.move(box.x+x2,box.y+y2,{steps:8});await page.mouse.up();
    }
    await run(()=>drawingTest.seed());
    await run(()=>drawingTest.tool('crop'));
    await drag(20,20,80,80);
    await page.click('[data-area-action="crop"]');
    assert.equal((await run(()=>drawingTest.state())).width,60);
    assert.equal((await run(()=>drawingTest.state())).saved.drawingHeight,60);
    assert.equal((await run(()=>drawingTest.pixel(20,30)))[0],255);
    await run(()=>drawingTest.reload());
    await page.waitForTimeout(150);
    assert.equal((await run(()=>drawingTest.pixel(20,30)))[3],255,'crop persists after reopen');
    await run(()=>drawingTest.tool('eraser'));
    const cropped=await page.locator('canvas').boundingBox();
    await page.mouse.click(cropped.x+20,cropped.y+30);
    assert.equal((await run(()=>drawingTest.pixel(20,30)))[3],0,'partial eraser works on cropped image');
    await run(()=>drawingTest.undo());
    await run(()=>drawingTest.undo());
    assert.equal((await run(()=>drawingTest.state())).width,1400);
    assert.equal((await run(()=>drawingTest.pixel(100,50)))[3],255,'undo restores pixels outside crop');

    await run(()=>{drawingTest.seed();drawingTest.tool('area');});
    await drag(20,30,80,70);
    await page.click('[data-area-action="copy"]');
    await page.click('[data-area-action="paste"]');
    assert.equal((await run(()=>drawingTest.state())).objects,2);
    await run(()=>drawingTest.undo());
    assert.equal((await run(()=>drawingTest.state())).objects,1);
    await run(()=>drawingTest.tool('area'));await drag(20,30,80,70);
    await page.click('[data-area-action="delete"]');
    assert.equal((await run(()=>drawingTest.pixel(50,50)))[3],0,'delete cuts the middle of a crossing stroke');
    assert.equal((await run(()=>drawingTest.pixel(100,50)))[3],255,'outside selection stays intact');
    await run(()=>drawingTest.undo());
    assert.equal((await run(()=>drawingTest.pixel(50,50)))[3],255);

    await run(()=>drawingTest.tool('area'));await drag(20,30,80,70);
    await drag(50,50,150,150);
    assert.equal((await run(()=>drawingTest.pixel(50,50)))[3],0);
    assert.equal((await run(()=>drawingTest.pixel(150,150)))[3],255,'selected pixels move');
    await run(()=>drawingTest.undo());
    assert.equal((await run(()=>drawingTest.pixel(50,50)))[3],255);

    await run(()=>{drawingTest.seed();drawingTest.zoom();drawingTest.tool('crop');});
    await drag(100,100,25,25);
    await page.click('[data-area-action="crop"]');
    assert.equal((await run(()=>drawingTest.state())).width,60,'reverse selection honors zoom');

    await run(()=>{drawingTest.seed();drawingTest.tool('crop');});
    const touch=await page.context().newCDPSession(page);
    const box=await page.locator('canvas').boundingBox();
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+20,y:box.y+20}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+80,y:box.y+80}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.click('[data-area-action="crop"]');
    assert.equal((await run(()=>drawingTest.state())).width,60,'touch selection crops the same coordinates');

    await run(()=>{drawingTest.seed();drawingTest.tool('crop');});
    await page.mouse.click(40,40);
    assert.equal(await page.locator('[data-area-action="crop"]').isDisabled(),true,'empty selection cannot crop');

    await run(async()=>{drawingTest.seed();await drawingTest.legacy();drawingTest.tool('crop');});
    await drag(10,10,60,60);await page.click('[data-area-action="crop"]');
    await run(()=>drawingTest.undo());
    assert.equal((await run(()=>drawingTest.pixel(100,100)))[3],255,'legacy image restored by undo');
    await run(()=>drawingTest.clear());await run(()=>drawingTest.undo());
    assert.equal((await run(()=>drawingTest.pixel(100,100)))[3],255,'clear can be undone for legacy drawing');
    assert.deepEqual(errors,[]);
    console.log('PASS: crop, reverse drag, zoom, touch, empty selection, copy/paste, partial delete, move, persistence, legacy drawing and undo');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
