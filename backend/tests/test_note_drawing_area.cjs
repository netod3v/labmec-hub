// Run with PLAYWRIGHT_MODULE pointing to playwright-core and EDGE_EXECUTABLE set.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const geometry = fs.readFileSync(path.join(root, 'assets/note-drawing-area.js'), 'utf8').replace(/export /g, '');
const toolbarSource = fs.readFileSync(path.join(root, 'assets/note-drawing-toolbar.js'), 'utf8').replace(/export /g, '');
const toolbarCSS = fs.readFileSync(path.join(root, 'assets/note-drawing-toolbar.css'), 'utf8');
const core = source.slice(source.indexOf('let noteSavedRange = null;'), source.indexOf('function renderNoteStudio(){'));
const handlers = source.slice(source.indexOf("noteDrawCanvas.addEventListener('pointerdown'"), source.indexOf('function updateActiveTabTitle(){'));
const controls = ['noteDrawPen','noteDrawEraser','noteDrawPan','noteDrawSelect','noteDrawUndo','noteDrawRedo','noteDrawClear','noteZoomIn','noteZoomOut','noteInkType','noteEraserMode','noteShapeTool','noteDrawSize','noteDrawColor'];

(async()=>{
  const browser = await chromium.launch({headless:true, executablePath:process.env.EDGE_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1100},hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://localhost/drawing-test',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
    await page.route('http://localhost/assets/labiomec-logo-transparent.png',route=>route.fulfill({body:fs.readFileSync(path.join(root,'assets/labiomec-logo-transparent.png')),contentType:'image/png'}));
    await page.goto('http://localhost/drawing-test');
    await page.setContent('<canvas width="1400" height="760" style="touch-action:none"></canvas><div id="controls"></div>');
    await page.evaluate(({core,handlers,geometry,controls,toolbarSource})=>{
      const noteDrawCanvas=document.querySelector('canvas');noteDrawCanvas.tabIndex=0;
      const noteStudioModal=document.body,noteStudioBody=document.body;noteStudioBody.dataset.mode='draw';
      const noteDrawViewport=document.body;
      const noteZoomLabel=document.createElement('span');
      const noteAreaTools=document.getElementById('controls');
      noteAreaTools.innerHTML=['area','crop'].map(x=>`<button data-area-tool="${x}">${x}</button>`).join('')+
        ['crop','copy','paste','delete','cancel'].map(x=>`<button data-area-action="${x}">${x}</button>`).join('')+'<span class="note-area-hint"></span>';
      const noteAreaHint=noteAreaTools.querySelector('span');
      const elements=Object.fromEntries(controls.map(name=>[name,document.createElement('button')]));
      for(const [name,values] of Object.entries({noteDrawSize:['2','5','9'],noteInkType:['pen','pencil','highlighter'],noteEraserMode:['partial','stroke'],noteShapeTool:['none','line','rect','ellipse']})){
        elements[name]=document.createElement('select');for(const value of values)elements[name].add(new Option(value,value));
      }
      elements.noteDrawSize.value='5';elements.noteDrawColor.value='#ff0000';elements.noteShapeTool.value='none';elements.noteEraserMode.value='partial';
      const tab={id:'test'};let saves=0;
      const getActiveTab=()=>tab,saveNoteState=()=>{saves++;};
      const code=geometry+'\n'+toolbarSource+'\n'+core+'\n'+handlers+`
        window.drawingTest={
          seed(){noteDrawCanvas.width=1400;noteDrawCanvas.height=760;noteDrawObjects=[{id:'line',type:'stroke',points:[{x:0,y:50},{x:150,y:50}],width:6,color:'#ff0000'}];noteLegacyImage=null;noteSelectedObjectId=null;clearNoteArea();noteDrawHistory.clear();noteDrawRedoHistory.clear();noteDrawPendingHistory=null;noteDrawZoom=1;applyNoteDrawZoom();renderNoteDrawing();},
          tool:selectNoteDrawTool,
          undo(){noteDrawUndo.click();},
          pixel(x,y){return [...noteDrawingSnapshot().getContext('2d').getImageData(x,y,1,1).data];},
          state(){return {width:noteDrawCanvas.width,height:noteDrawCanvas.height,objects:noteDrawObjects.length,saved:getActiveTab(),selection:noteAreaRect};},
          reload(){const data=JSON.parse(JSON.stringify(getActiveTab()));noteBitmapCache.clear();restoreNoteDrawing({objects:data.drawingObjects,width:data.drawingWidth,height:data.drawingHeight,legacy:data.drawing});},
          zoom(){noteZoomIn.click();},
          async legacy(){const c=document.createElement('canvas');c.width=1400;c.height=760;c.getContext('2d').fillRect(0,0,1400,760);noteLegacyImage=new Image();noteLegacyImage.src=c.toDataURL();await noteLegacyImage.decode();noteDrawObjects=[];renderNoteDrawing();},
          clear(){noteDrawClear.click();}
          ,initializeBar(){
            const panel=document.createElement('div');panel.className='note-draw-panel';document.body.append(panel);panel.append(noteDrawCanvas,noteAreaTools);
            const toolbar=document.createElement('div');toolbar.className='whiteboard-toolbar';panel.append(toolbar);
            for(const item of [noteDrawPen,noteDrawEraser,noteDrawPan,noteDrawSelect,noteDrawUndo,noteDrawRedo,noteDrawClear,noteZoomIn,noteZoomOut]){item.className='whiteboard-tool';item.innerHTML='<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>';}
            noteDrawPen.id='note-draw-pen';noteZoomLabel.id='note-zoom-label';noteAreaTools.className='note-area-tools';
            noteDrawingToolbar=initializeDrawingToolbar({toolbar,areaTools:noteAreaTools,pen:noteDrawPen,eraser:noteDrawEraser,pan:noteDrawPan,select:noteDrawSelect,color:noteDrawColor,size:noteDrawSize,ink:noteInkType,eraserMode:noteEraserMode,shape:noteShapeTool,undo:noteDrawUndo,redo:noteDrawRedo,clear:noteDrawClear,zoomIn:noteZoomIn,zoomOut:noteZoomOut,zoomLabel:noteZoomLabel,getState:()=>({tool:noteDrawTool,lineStyle:noteLineStyle,hasArea:!!noteAreaRect}),setTool:selectNoteDrawTool,setLineStyle:value=>{noteLineStyle=value;},stamp:async()=>{await prepareNoteLogo();selectNoteDrawTool('stamp');},close:()=>{document.body.dataset.mode='text';}});
          }
          ,toolState(){return {tool:noteDrawTool,ink:noteInkType.value,size:noteDrawSize.value,lineStyle:noteLineStyle};}
          ,stampPixels(){const data=noteDrawingSnapshot().getContext('2d').getImageData(520,320,160,160).data;return data.some((v,i)=>i%4===3&&v>0);}
        };
      `;
      // Tests execute the editor's actual functions and pointer/button handlers.
      new Function('noteStudioModal','noteStudioBody','noteDrawCanvas','noteDrawViewport','noteZoomLabel','noteAreaTools','noteAreaHint','getActiveTab','saveNoteState',...controls,code)(noteStudioModal,noteStudioBody,noteDrawCanvas,noteDrawViewport,noteZoomLabel,noteAreaTools,noteAreaHint,getActiveTab,saveNoteState,...controls.map(x=>elements[x]));
    },{core,handlers,geometry,controls,toolbarSource});
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

    await run(()=>{drawingTest.seed();drawingTest.tool('area');});
    await drag(20,30,80,70);
    await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');
    assert.equal((await run(()=>drawingTest.state())).objects,2,'Ctrl+C and Ctrl+V copy the area');
    await page.keyboard.press('Control+z');
    assert.equal((await run(()=>drawingTest.state())).objects,1,'Ctrl+Z undoes paste');
    await page.keyboard.press('Control+y');
    assert.equal((await run(()=>drawingTest.state())).objects,2,'Ctrl+Y redoes paste');
    await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+z');
    assert.equal((await run(()=>drawingTest.state())).objects,2,'Ctrl+Shift+Z also redoes');
    await page.keyboard.press('Control+z');
    await run(()=>drawingTest.clear());await page.keyboard.press('Control+y');
    assert.equal((await run(()=>drawingTest.state())).objects,0,'a new edit discards the redo branch');
    await page.keyboard.press('Control+z');
    assert.equal((await run(()=>drawingTest.state())).objects,1);

    // Keyboard events for text and hidden editors must remain untouched.
    const native=await page.evaluate(()=>{
      const input=document.createElement('textarea');document.body.append(input);input.focus();
      const event=new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true});input.dispatchEvent(event);
      const textPrevented=event.defaultPrevented;input.remove();
      document.body.dataset.mode='text';
      const textMode=new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(textMode);
      document.body.dataset.mode='draw';document.body.classList.add('hidden');
      const hidden=new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(hidden);
      document.body.classList.remove('hidden');
      return {textPrevented,textModePrevented:textMode.defaultPrevented,hiddenPrevented:hidden.defaultPrevented};
    });
    assert.deepEqual(native,{textPrevented:false,textModePrevented:false,hiddenPrevented:false});
    await run(()=>{drawingTest.seed();drawingTest.initializeBar();});
    await page.click('[aria-label="Lápis"]');
    assert.equal((await run(()=>drawingTest.toolState())).ink,'pencil');
    await page.click('#note-draw-pen');
    assert.equal((await run(()=>drawingTest.toolState())).ink,'pen','pen restores pen ink after pencil');
    await page.click('[aria-label="Cor #ef4444"]');
    await page.locator('[aria-label="Espessura do traço"]').fill('12');
    assert.equal((await run(()=>drawingTest.toolState())).size,'12');
    await page.click('[aria-label="Traço tracejado"]');
    assert.equal((await run(()=>drawingTest.toolState())).lineStyle,'dashed');
    await page.locator('canvas').scrollIntoViewIfNeeded();
    await drag(350,150,650,150);
    assert.equal((await run(()=>drawingTest.pixel(398,150)))[3],0,'dashed ink leaves visible gaps');
    await run(()=>drawingTest.undo());
    await page.click('#note-draw-pen');
    await page.click('[aria-label="Traço com seta"]');
    await page.locator('canvas').scrollIntoViewIfNeeded();
    await drag(350,150,650,150);
    assert.ok((await run(()=>drawingTest.pixel(630,138)))[3]>0,'arrow ink draws an arrowhead');
    await run(()=>drawingTest.undo());
    await page.click('[aria-label="Carimbo com a logo do Hub"]');
    assert.equal((await run(()=>drawingTest.toolState())).tool,'stamp');
    await page.locator('canvas').scrollIntoViewIfNeeded();
    let stampBox=await page.locator('canvas').boundingBox();
    await page.mouse.click(stampBox.x+600,stampBox.y+400);
    assert.equal((await run(()=>drawingTest.state())).objects,2,'logo inserts a movable bitmap object; errors='+JSON.stringify(errors));
    assert.equal(await run(()=>drawingTest.stampPixels()),true,'stamp contains actual logo pixels');
    await run(()=>drawingTest.reload());await page.waitForTimeout(150);
    assert.equal(await run(()=>drawingTest.stampPixels()),true,'logo persists after reopening');
    await page.keyboard.press('Control+z');
    assert.equal((await run(()=>drawingTest.state())).objects,1,'logo stamp can be undone');
    await page.keyboard.press('Control+y');
    assert.equal((await run(()=>drawingTest.state())).objects,2,'logo stamp can be redone');

    await page.addStyleTag({content:':root{--paper:#fff;--parchment:#f7f9fc;--ink:#172332;--border:#d5e0ec;--forest:#195d85;}body{margin:0;background:#f7f9fc}.note-draw-panel{position:relative;height:700px;overflow:hidden}.whiteboard-toolbar{position:absolute;display:flex;transform:translateX(-50%);z-index:12}.whiteboard-tool{display:grid;place-items:center;padding:0;background:transparent;cursor:pointer}.whiteboard-tool svg{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.note-area-tools[data-visible="false"]{display:none}'+toolbarCSS});
    await page.setViewportSize({width:1360,height:820});
    await page.click('#note-draw-pen');
    await page.screenshot({path:path.join(process.env.TEMP||'/tmp','labmec-drawing-toolbar-desktop.png')});
    for(const width of [768,390]){
      await page.setViewportSize({width,height:820});
      const bounds=await page.locator('.note-reference-toolbar').boundingBox();
      assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,'toolbar fits viewport '+width);
      assert.equal(await page.locator('.note-pen-popover').isVisible(),true);
    }
    await page.screenshot({path:path.join(process.env.TEMP||'/tmp','labmec-drawing-toolbar-mobile.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: drawing tools, shortcuts, toolbar palette/weight, logo stamp persistence/undo, desktop/tablet/mobile layout');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
