// Run with PLAYWRIGHT_MODULE pointing to playwright-core and EDGE_EXECUTABLE set.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const geometry = fs.readFileSync(path.join(root, 'assets/note-drawing-area.js'), 'utf8').replace(/export /g, '');
const modelSource = fs.readFileSync(path.join(root, 'assets/note-whiteboard-model.js'), 'utf8').replace(/export /g, '');
const toolbarSource = fs.readFileSync(path.join(root, 'assets/note-drawing-toolbar.js'), 'utf8').replace(/export /g, '');
const toolbarCSS = fs.readFileSync(path.join(root, 'assets/note-drawing-toolbar.css'), 'utf8');
const applicationCSS = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match=>match[1]).join('\n');
const core = source.slice(source.indexOf('let noteSavedRange = null;'), source.indexOf('function renderNoteStudio(){'));
const handlers = source.slice(source.indexOf("noteDrawCanvas.addEventListener('pointerdown'"), source.indexOf('function updateActiveTabTitle(){'));
const controls = ['noteDrawPen','noteDrawEraser','noteDrawPan','noteDrawSelect','noteDrawUndo','noteDrawRedo','noteDrawClear','noteZoomIn','noteZoomOut','noteInkType','noteEraserMode','noteShapeTool','noteDrawSize','noteDrawColor'];

(async()=>{
  const browser = await chromium.launch({headless:true, executablePath:process.env.EDGE_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1100},hasTouch:true});
    page.setDefaultTimeout(8000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.context().route('http://localhost/assets/**',route=>{
      const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1),file=path.resolve(root,relative);
      if(!file.startsWith(path.join(root,'assets')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
      const ext=path.extname(file),type=['.js','.mjs'].includes(ext)?'text/javascript':ext==='.css'?'text/css':ext==='.png'?'image/png':'application/octet-stream';
      return route.fulfill({body:fs.readFileSync(file),contentType:type});
    });
    await page.route('http://localhost/drawing-test',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
    await page.route('http://localhost/assets/labiomec-logo-transparent.png',route=>route.fulfill({body:fs.readFileSync(path.join(root,'assets/labiomec-logo-transparent.png')),contentType:'image/png'}));
    await page.goto('http://localhost/drawing-test');
    await page.setContent('<canvas width="1400" height="760" style="touch-action:none"></canvas><div id="controls"></div>');
    await page.evaluate(({core,handlers,geometry,controls,toolbarSource,modelSource})=>{
      const noteDrawCanvas=document.querySelector('canvas');noteDrawCanvas.tabIndex=0;
      const noteStudioModal=document.body,noteStudioBody=document.body;noteStudioBody.dataset.mode='draw';
      let noteDrawViewport=document.body;
      const noteZoomLabel=document.createElement('span');
      const noteAreaTools=document.getElementById('controls');
      noteAreaTools.innerHTML=['area','crop'].map(x=>`<button data-area-tool="${x}">${x}</button>`).join('')+
        ['crop','copy','paste','delete','cancel'].map(x=>`<button data-area-action="${x}">${x}</button>`).join('')+'<span class="note-area-hint"></span>';
      const noteAreaHint=noteAreaTools.querySelector('span');
      const elements=Object.fromEntries(controls.map(name=>[name,document.createElement('button')]));
      elements.noteDrawColor=document.createElement('input');elements.noteDrawColor.type='color';
      for(const [name,values] of Object.entries({noteDrawSize:['2','5','9'],noteInkType:['pen','pencil','highlighter'],noteEraserMode:['partial','stroke'],noteShapeTool:['none','line','rect','ellipse']})){
        elements[name]=document.createElement('select');for(const value of values)elements[name].add(new Option(value,value));
      }
      elements.noteDrawSize.value='5';elements.noteDrawColor.value='#ff0000';elements.noteShapeTool.value='none';elements.noteEraserMode.value='partial';
      const tab={id:'test'};let saves=0;
      const getActiveTab=()=>tab,saveNoteState=()=>{saves++;};
      const code=geometry+'\n'+modelSource+'\n'+toolbarSource+'\n'+core+'\n'+handlers+`
        window.drawingTest={
          seed(){noteShapeTool.value='none';noteInkType.value='pen';noteLineStyle='solid';noteDrawCanvas.width=1400;noteDrawCanvas.height=760;noteDrawObjects=[{id:'line',type:'stroke',points:[{x:0,y:50},{x:150,y:50}],width:6,color:'#ff0000'}];noteLegacyImage=null;noteSelectedObjectId=null;clearNoteArea();noteSelectedIds.clear();noteSelectedObjectId=null;noteLassoPoints=[];noteLaserPoints=[];noteResizeDrag=null;noteBoardSettings=defaultWhiteboardSettings();noteDrawHistory.clear();noteDrawRedoHistory.clear();noteDrawPendingHistory=null;noteDrawZoom=1;applyNoteDrawZoom();renderNoteDrawing();},
          fitViewport(width,height,zoom){
            const viewport=document.createElement('div');viewport.id='note-draw-viewport';viewport.style.cssText='position:fixed;left:0;top:0;width:'+width+'px;height:'+height+'px;overflow:auto';
            document.body.append(viewport);viewport.append(noteDrawCanvas);noteDrawViewport=viewport;noteDrawZoom=zoom;applyNoteDrawZoom();renderNoteDrawing();
          },
          tool:selectNoteDrawTool,
          undo(){noteDrawUndo.click();},
          pixel(x,y){return [...noteDrawingSnapshot().getContext('2d').getImageData(x,y,1,1).data];},
          state(){return {width:noteDrawCanvas.width,height:noteDrawCanvas.height,objects:noteDrawObjects.length,zoom:noteDrawZoom,saved:getActiveTab(),selection:noteAreaRect};},
          reload(){const data=JSON.parse(JSON.stringify(getActiveTab()));noteBitmapCache.clear();restoreNoteDrawing({objects:data.drawingObjects,width:data.drawingWidth,height:data.drawingHeight,legacy:data.drawing});},
          zoom(){noteZoomIn.click();},
          async legacy(){const c=document.createElement('canvas');c.width=1400;c.height=760;c.getContext('2d').fillRect(0,0,1400,760);noteLegacyImage=new Image();noteLegacyImage.src=c.toDataURL();await noteLegacyImage.decode();noteDrawObjects=[];renderNoteDrawing();},
          clear(){noteDrawClear.click();}
          ,initializeBar(){
            const panel=document.createElement('div');panel.className='note-draw-panel';document.body.append(panel);panel.append(noteDrawCanvas,noteAreaTools);
            const toolbar=document.createElement('div');toolbar.className='whiteboard-toolbar';panel.append(toolbar);
            for(const item of [noteDrawPen,noteDrawEraser,noteDrawPan,noteDrawSelect,noteDrawUndo,noteDrawRedo,noteDrawClear,noteZoomIn,noteZoomOut]){item.className='whiteboard-tool';item.innerHTML='<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>';}
            noteDrawPen.id='note-draw-pen';noteZoomLabel.id='note-zoom-label';noteAreaTools.className='note-area-tools';
            noteDrawingToolbar=initializeDrawingToolbar({toolbar,areaTools:noteAreaTools,pen:noteDrawPen,eraser:noteDrawEraser,pan:noteDrawPan,select:noteDrawSelect,color:noteDrawColor,size:noteDrawSize,ink:noteInkType,eraserMode:noteEraserMode,shape:noteShapeTool,undo:noteDrawUndo,redo:noteDrawRedo,clear:noteDrawClear,zoomIn:noteZoomIn,zoomOut:noteZoomOut,zoomLabel:noteZoomLabel,getState:()=>({tool:noteDrawTool,lineStyle:noteLineStyle,hasArea:!!noteAreaRect||noteSelection().length>0,preferences:noteBoardSettings}),setTool:selectNoteDrawTool,selectPen:chooseNotePen,setLineStyle:value=>{noteLineStyle=value;},stamp:async()=>{await prepareNoteLogo();selectNoteDrawTool('stamp');},close:()=>{},text:()=>editNoteText(),settings:()=>window.boardSettings.openWhiteboardSettings({host:document.body,getSettings:()=>noteBoardSettings,setSettings:setNoteBoardPreferences}),setLaserWidth:value=>{noteBoardSettings.laserWidth=value;updateNoteDrawingCursor();},setOpacity:value=>{noteBoardSettings.pens.highlighter.opacity=value;},setPalette:value=>{noteBoardSettings.palette=value;},importFile:async file=>{const canvas=file.type==='application/pdf'?await window.boardFiles.loadWhiteboardPDF(file,chooseNotePDFPage):await window.boardFiles.loadWhiteboardImage(file);if(canvas)addNoteBitmap(canvas);},exportFile:async type=>{const canvas=noteExportCanvas();if(type==='pdf')window.boardFiles.downloadWhiteboard(await window.boardFiles.canvasPDF(canvas),'quadro.pdf');else canvas.toBlob(blob=>window.boardFiles.downloadWhiteboard(blob,'quadro.png'),'image/png');}});
          }
          ,toolState(){return {tool:noteDrawTool,ink:noteInkType.value,size:noteDrawSize.value,color:noteDrawColor.value,lineStyle:noteLineStyle};}
          ,stampPixels(){const data=noteDrawingSnapshot().getContext('2d').getImageData(520,320,160,160).data;return data.some((v,i)=>i%4===3&&v>0);}
          ,settings(){return structuredClone(noteBoardSettings);}
          ,preferences:setNoteBoardPreferences
          ,objects(){return cloneNoteObjects(noteDrawObjects);}
          ,selected(){return noteSelection().map(o=>o.id);}
          ,editText:editNoteText
          ,addImage:addNoteBitmap
          ,exportCanvas:noteExportCanvas
          ,laserCount(){return noteLaserPoints.length;}
          ,newObjects(objects){noteDrawObjects=cloneNoteObjects(objects);noteSelectedIds.clear();noteSelectedObjectId=null;renderNoteDrawing();}
          ,select: setNoteSelection
          ,choosePen:chooseNotePen
          ,inkPreferences(color,width){noteDrawColor.value=color;noteDrawColor.dispatchEvent(new Event('input'));if(![...noteDrawSize.options].some(o=>o.value===String(width)))noteDrawSize.add(new Option(String(width),String(width)));noteDrawSize.value=String(width);noteDrawSize.dispatchEvent(new Event('change'));}
          ,shape(value){noteShapeTool.value=value;selectNoteDrawTool('pen');}
          ,choosePDFPage:chooseNotePDFPage
          ,trackPreferences(){noteSaveBoardPreferences=value=>window.savedBoardPreferences=structuredClone(value);}
          ,clipboardState(){return {objects:noteSelectionClipboard?.length,area:!!noteAreaClipboard,selected:noteSelection().map(o=>o.id),tool:noteDrawTool,copyDisabled:noteAreaTools.querySelector('[data-area-action="copy"]').disabled,pasteDisabled:noteAreaTools.querySelector('[data-area-action="paste"]').disabled};}
        };
      `;
      // Tests execute the editor's actual functions and pointer/button handlers.
      new Function('noteStudioModal','noteStudioBody','noteDrawCanvas','noteDrawViewport','noteZoomLabel','noteAreaTools','noteAreaHint','getActiveTab','saveNoteState',...controls,code)(noteStudioModal,noteStudioBody,noteDrawCanvas,noteDrawViewport,noteZoomLabel,noteAreaTools,noteAreaHint,getActiveTab,saveNoteState,...controls.map(x=>elements[x]));
    },{core,handlers,geometry,controls,toolbarSource,modelSource});
    const run=(fn)=>page.evaluate(fn);
    async function drag(x1,y1,x2,y2){
      await page.evaluate(()=>window.scrollTo(0,0));
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
    await page.click('[data-board-tool="eraser"]');
    assert.equal(await page.locator('.note-eraser-options').isVisible(),true);
    assert.equal(await page.locator('.note-color-palette:not(.note-marker-palette)').isVisible(),false,'eraser popup hides pen colors');
    await page.locator('.note-eraser-options button').nth(1).click();
    assert.equal(await page.locator('.note-eraser-options button').nth(1).getAttribute('aria-pressed'),'true');
    await page.locator('.note-eraser-options button').first().click();
    await page.getByRole('slider',{name:'Espessura da borracha',exact:true}).fill('12');
    assert.equal((await run(()=>drawingTest.toolState())).size,'12');

    await page.click('[data-board-tool="laser"]');
    assert.equal(await page.locator('.note-pen-popover').isVisible(),true);
    assert.equal(await page.locator('.note-line-options').isVisible(),false);
    assert.equal(await page.getByRole('slider',{name:'Espessura da caneta laser',exact:true}).inputValue(),'4');
    await page.getByRole('slider',{name:'Espessura da caneta laser',exact:true}).fill('14');
    assert.equal((await run(()=>drawingTest.settings())).laserWidth,14);
    await page.click('[data-board-tool="pen"]');
    await page.click('[data-board-tool="laser"]');
    assert.equal(await page.getByRole('slider',{name:'Espessura da caneta laser',exact:true}).inputValue(),'14','laser keeps its independent thickness');
    await page.click('[data-board-tool="highlighter"]');
    assert.equal(await page.locator('.note-line-options').isVisible(),false);
    await page.getByRole('slider',{name:'Opacidade do marca-texto',exact:true}).fill('65');
    assert.equal((await run(()=>drawingTest.settings())).pens.highlighter.opacity,.65);
    const beforeHighlight=await run(()=>drawingTest.objects());
    await drag(100,200,200,200);
    assert.equal((await run(()=>drawingTest.objects())).at(-1).opacity,.65,'new highlight stores the chosen opacity');
    assert.ok(Math.abs((await run(()=>drawingTest.pixel(150,200)))[3]-166)<=1,'chosen opacity controls the rendered ink');
    await run(()=>drawingTest.reload());
    assert.equal((await run(()=>drawingTest.objects())).at(-1).opacity,.65,'opacity survives saving and reopening');
    await page.evaluate(objects=>drawingTest.newObjects(objects),beforeHighlight);

    await run(()=>drawingTest.tool('pen'));
    assert.match(await page.locator('canvas').evaluate(el=>getComputedStyle(el).cursor),/data:image\/svg\+xml/,'drawing uses a circular SVG cursor');
    await page.keyboard.down('Space');await page.keyboard.up('Space');
    assert.match(await page.locator('canvas').evaluate(el=>getComputedStyle(el).cursor),/data:image\/svg\+xml/,'releasing pan restores the circular cursor');
    await run(()=>drawingTest.tool('select'));
    assert.equal(await page.locator('canvas').evaluate(el=>getComputedStyle(el).cursor),'default');
    await run(()=>drawingTest.tool('pen'));

    await page.click('[data-board-tool="cube"]');
    assert.equal(await page.locator('.note-shape-palette').isVisible(),true,'shape opens a compact color palette');
    assert.equal(await page.locator('.note-shape-palette .note-color-swatch').count(),14);
    assert.equal(await page.locator('.note-weight-control').first().isVisible(),false,'shape palette hides thickness');
    assert.equal(await page.locator('.note-line-options').isVisible(),false,'shape palette hides pen line options');
    await page.locator('.note-shape-palette [aria-label="Cor #ef4444"]').click();
    assert.equal((await run(()=>drawingTest.toolState())).color,'#ef4444');
    await page.click('[data-board-tool="pen"]');
    assert.equal(await page.locator('.note-toolbar-strip [data-board-tool="crop"]').count(),0,'crop is kept out of the compact primary toolbar');
    assert.equal(await page.locator('.note-drawing-more').isVisible(),false);
    await page.click('[aria-label="Mais ferramentas"]');
    assert.equal(await page.locator('.note-drawing-more').isVisible(),true);
    await page.click('[aria-label="Recortar bordas"]');
    assert.equal((await run(()=>drawingTest.toolState())).tool,'crop');
    assert.equal(await page.locator('.note-drawing-more').isVisible(),false,'choosing a tool closes the extra menu');
    await page.click('[aria-label="Mais ferramentas"]');await page.keyboard.press('Escape');
    assert.equal(await page.locator('.note-drawing-more').isVisible(),false,'Escape closes the extra menu');
    await page.click('[aria-label="Caneta 2"]');
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
    const objectCount=await run(()=>drawingTest.state().objects),originalBar=await page.locator('.note-reference-toolbar').boundingBox();
    let gripBox=await page.locator('.note-toolbar-grip').boundingBox();
    await page.mouse.move(gripBox.x+gripBox.width/2,gripBox.y+gripBox.height/2);await page.mouse.down();await page.mouse.move(gripBox.x+30,0,{steps:8});await page.mouse.up();
    let movedBar=await page.locator('.note-reference-toolbar').boundingBox(),boardBounds=await page.locator('.note-draw-panel').boundingBox();
    assert.ok(movedBar.y<originalBar.y-100&&movedBar.y>=boardBounds.y,'grip moves toolbar and clamps it to the board');
    assert.equal(await run(()=>drawingTest.state().objects),objectCount,'moving toolbar does not draw on the canvas');
    await page.click('#note-draw-pen');
    let paletteBounds=await page.locator('.note-pen-popover').boundingBox();movedBar=await page.locator('.note-reference-toolbar').boundingBox();
    assert.ok(paletteBounds.y>=movedBar.y+movedBar.height,'palette opens below a toolbar near the top');
    await page.click('[aria-label="Mais ferramentas"]');
    let menuBounds=await page.locator('.note-drawing-more').boundingBox();
    assert.ok(menuBounds.y>=movedBar.y+movedBar.height,'extra tools remain reachable near the top edge');
    await page.keyboard.press('Escape');await page.locator('.note-toolbar-grip').focus();await page.keyboard.press('ArrowDown');
    assert.ok((await page.locator('.note-reference-toolbar').boundingBox()).y>movedBar.y,'keyboard can reposition the toolbar');
    for(const width of [768,390]){
      await page.setViewportSize({width,height:820});
      await page.waitForTimeout(50);
      const bounds=await page.locator('.note-reference-toolbar').boundingBox();
      assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,'toolbar fits viewport '+width);
    }
    gripBox=await page.locator('.note-toolbar-grip').boundingBox();movedBar=await page.locator('.note-reference-toolbar').boundingBox();
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:gripBox.x+gripBox.width/2,y:gripBox.y+gripBox.height/2}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:gripBox.x+gripBox.width/2,y:gripBox.y+150}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok((await page.locator('.note-reference-toolbar').boundingBox()).y>movedBar.y+50,'touch can reposition toolbar');
    await page.locator('.note-toolbar-grip').focus();await page.keyboard.press('Home');
    assert.ok((await page.locator('.note-reference-toolbar').boundingBox()).y>500,'Home restores the default bottom position');
    await page.click('#note-draw-pen');
    await page.screenshot({path:path.join(process.env.TEMP||'/tmp','labmec-drawing-toolbar-mobile.png')});
    await page.setViewportSize({width:1600,height:1100});
    await page.click('[aria-label="Recolher ferramentas"]');
    assert.equal(await page.locator('.note-reference-toolbar').isVisible(),false);
    await run(()=>{drawingTest.seed();drawingTest.shape('rect');});await drag(300,200,500,350);
    assert.equal((await run(()=>drawingTest.objects())).at(-1).type,'rect','drawing remains usable with toolbar collapsed');
    await page.click('.note-toolbar-reopen');assert.equal(await page.locator('.note-reference-toolbar').isVisible(),true);
    for(const type of ['ellipse','triangle','cube','cylinder','pyramid','sphere']){
      await run(()=>drawingTest.seed());await page.evaluate(type=>drawingTest.shape(type),type);await drag(300,200,500,350);
      assert.equal((await run(()=>drawingTest.objects())).at(-1).type,type);
      assert.equal(await run(()=>{const data=drawingTest.exportCanvas().getContext('2d').getImageData(290,190,220,170).data;return data.some((v,i)=>i%4!==3&&v<100);}),true,type+' actually paints pixels');
    }

    await run(()=>{drawingTest.seed();drawingTest.tool('laser');});
    await drag(300,250,600,350);
    assert.equal((await run(()=>drawingTest.state())).objects,1,'laser is not saved');
    assert.ok(await run(()=>drawingTest.laserCount())>0);await page.waitForTimeout(1100);
    assert.equal(await run(()=>drawingTest.laserCount()),0,'laser fades away');

    await run(()=>{drawingTest.seed();drawingTest.tool('pen');});
    await page.mouse.move(300,200);await page.mouse.down();await page.mouse.move(450,202,{steps:12});await page.mouse.up();
    assert.equal((await run(()=>drawingTest.objects())).at(-1).type,'line','almost straight ink snaps on release');
    await run(()=>{drawingTest.seed();drawingTest.tool('pen');});
    await page.mouse.move(300,200);await page.mouse.down();
    for(const [x,y]of [[450,200],[450,350],[300,350],[300,200]])await page.mouse.move(x,y,{steps:8});
    await page.waitForTimeout(650);await page.mouse.up();
    assert.equal((await run(()=>drawingTest.objects())).at(-1).type,'rect','hold recognizes a rectangle');
    await run(()=>{drawingTest.seed();drawingTest.preferences({...drawingTest.settings(),recognize:false});drawingTest.tool('pen');});
    await drag(300,200,500,200);
    assert.equal((await run(()=>drawingTest.objects())).at(-1).type,'stroke','recognition can be disabled');
    await page.keyboard.down('Control');await drag(300,300,500,360);await page.keyboard.up('Control');
    assert.equal((await run(()=>drawingTest.objects())).at(-1).type,'line','holding Ctrl forces a straight line');

    await run(()=>{drawingTest.seed();drawingTest.newObjects([{id:'inside',type:'stroke',points:[{x:110,y:110},{x:180,y:180}],color:'#111827',width:4},{id:'outside',type:'stroke',points:[{x:600,y:110},{x:650,y:180}],color:'#111827',width:4}]);drawingTest.tool('lasso');});
    await page.mouse.move(90,90);await page.mouse.down();for(const [x,y]of [[240,90],[240,240],[90,240],[90,90]])await page.mouse.move(x,y,{steps:4});await page.mouse.up();
    assert.deepEqual(await run(()=>drawingTest.selected()),['inside'],'lasso selects only enclosed strokes');
    await drag(180,180,280,280);
    assert.equal((await run(()=>drawingTest.objects()))[0].points.at(-1).x,280,'corner handle resizes selected object');
    await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');
    assert.equal((await run(()=>drawingTest.state())).objects,3,'object selections can be copied '+JSON.stringify(await run(()=>drawingTest.clipboardState()))+' '+JSON.stringify(errors));
    await page.keyboard.press('Delete');assert.equal((await run(()=>drawingTest.state())).objects,2);
    await page.keyboard.press('Control+z');assert.equal((await run(()=>drawingTest.state())).objects,3);

    await run(()=>{drawingTest.seed();drawingTest.trackPreferences();drawingTest.editText();});
    await page.locator('[aria-label="Texto da caixa"]').fill('Pesquisa do laboratório\nNotas do experimento');
    await page.click('button:has-text("Salvar texto")');
    assert.equal((await run(()=>drawingTest.objects())).at(-1).type,'text');
    await run(()=>drawingTest.reload());assert.equal((await run(()=>drawingTest.objects())).at(-1).text.includes('Pesquisa'),true);
    await page.keyboard.press('Control+z');assert.equal((await run(()=>drawingTest.state())).objects,1);

    await page.evaluate(async()=>{
      window.boardFiles=await import('/assets/note-whiteboard-files.js');
      window.boardSettings=await import('/assets/note-whiteboard-settings.js');
      boardSettings.openWhiteboardSettings({host:document.body,getSettings:()=>drawingTest.settings(),setSettings:value=>drawingTest.preferences(value)});
    });
    await page.getByRole('button',{name:'Pontinhos',exact:true}).click();
    await page.locator('[aria-label="Cor dos pontinhos"]').fill('#223344');
    await page.getByRole('button',{name:'Branco',exact:true}).click();
    assert.equal(await page.locator('.note-background-colors input').count(),0,'white background needs no color controls');
    await page.getByRole('button',{name:'Quadriculado',exact:true}).click();
    await page.locator('[aria-label="Cor das linhas"]').fill('#556677');
    await page.click('[role="tab"]:has-text("Comportamento")');
    const recognitionSwitch=page.getByRole('switch',{name:'Reconhecimento de forma',exact:true});
    await recognitionSwitch.uncheck();assert.equal(await recognitionSwitch.isChecked(),false);await recognitionSwitch.check();

    await page.locator('label').filter({hasText:'Ignorar o scroll'}).locator('input').check();
    await page.click('[role="tab"]:has-text("Ferramentas")');
    await page.locator('.note-board-tool-list label').filter({hasText:'Caneta 2'}).locator('input').uncheck();
    await page.click('[role="tab"]:has-text("Atalhos")');
    await page.click('[aria-label="Editar atalho: Caneta 1"]');await page.keyboard.press('Control+c');
    assert.ok((await page.locator('.note-board-settings-message').textContent()).includes('já está em uso'),'fixed copy cannot be reassigned');
    await page.keyboard.press('q');
    await page.click('button:has-text("Salvar preferências")');
    assert.equal((await run(()=>drawingTest.settings())).gridColor,'#556677');assert.equal((await run(()=>drawingTest.settings())).dotsColor,'#223344');
    assert.equal((await run(()=>drawingTest.settings())).background,'grid');assert.equal((await run(()=>drawingTest.settings())).wheel,'none');
    assert.equal((await run(()=>drawingTest.settings())).shortcuts.pen,'q');
    assert.equal(await page.locator('[data-board-tool="secondary"]').isVisible(),false);
    assert.equal(await run(()=>window.savedBoardPreferences.background),'grid','preferences are persisted through the application callback');
    await page.locator('canvas').focus();await page.keyboard.press('q');assert.equal((await run(()=>drawingTest.toolState())).tool,'pen');
    await page.keyboard.press('t');assert.equal(await page.locator('dialog textarea').isVisible(),true);await page.click('dialog button:has-text("Cancelar")');
    let zoom=await run(()=>drawingTest.state().zoom);await page.mouse.move(400,300);await page.mouse.wheel(0,-120);await page.waitForTimeout(40);assert.equal(await run(()=>drawingTest.state().zoom),zoom,'ignored scroll leaves zoom unchanged');
    await run(()=>drawingTest.preferences({...drawingTest.settings(),wheel:'zoom'}));
    await page.mouse.wheel(0,-120);await page.waitForTimeout(50);assert.ok(await run(()=>drawingTest.state().zoom)>zoom,'default wheel zooms');
    await run(()=>{drawingTest.seed();drawingTest.tool('pen');});await page.locator('canvas').focus();await page.keyboard.down('Space');await drag(300,200,400,250);await page.keyboard.up('Space');
    assert.equal((await run(()=>drawingTest.state())).objects,1,'Space+drag pans without drawing');

    await page.evaluate(()=>boardSettings.openWhiteboardSettings({host:document.body,getSettings:()=>drawingTest.settings(),setSettings:value=>drawingTest.preferences(value)}));
    await page.click('button:has-text("Restaurar padrões")');await page.click('button:has-text("Salvar preferências")');
    assert.equal((await run(()=>drawingTest.settings())).shortcuts.pen,'p');assert.equal((await run(()=>drawingTest.settings())).wheel,'zoom');
    assert.equal((await run(()=>drawingTest.settings())).recognize,true);assert.deepEqual((await run(()=>drawingTest.settings())).hiddenTools,[]);
    await run(()=>{drawingTest.choosePen('pen');drawingTest.inkPreferences('#2244aa',6);drawingTest.choosePen('secondary');drawingTest.inkPreferences('#aa2244',10);drawingTest.choosePen('pen');});
    assert.equal((await run(()=>drawingTest.toolState())).color,'#2244aa');assert.equal((await run(()=>drawingTest.toolState())).size,'6');
    await run(()=>drawingTest.choosePen('secondary'));
    assert.equal((await run(()=>drawingTest.toolState())).color,'#aa2244');assert.equal((await run(()=>drawingTest.toolState())).size,'10','second pen keeps independent preferences');
    await page.click('#note-draw-pen');
    await page.click('[aria-label="Cor #111827"]');
    await page.evaluate(()=>{window.savedInputClick=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type==='color')window.colorPickerOpened=true;else savedInputClick.call(this);};});
    await page.click('[aria-label="Cor #111827"]');
    assert.equal(await page.evaluate(()=>window.colorPickerOpened),true,'clicking the selected swatch opens its color picker');
    await page.evaluate(()=>{const input=document.querySelector('.note-color-palette input');input.value='#667788';input.dispatchEvent(new Event('input'));HTMLInputElement.prototype.click=savedInputClick;});
    assert.equal((await run(()=>drawingTest.settings())).palette[0],'#667788','custom swatch color is saved');

    await page.evaluate(()=>{
      window.boardCSPViolations=[];document.addEventListener('securitypolicyviolation',event=>boardCSPViolations.push(event.violatedDirective));
      const meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'";document.head.append(meta);
    });
    const fileResults=await page.evaluate(async()=>{
      drawingTest.seed();
      const png=await new Promise(resolve=>drawingTest.exportCanvas().toBlob(resolve,'image/png'));
      const image=await boardFiles.loadWhiteboardImage(new File([png],'teste.png',{type:'image/png'}));drawingTest.addImage(image);
      const pdf=await boardFiles.canvasPDF(drawingTest.exportCanvas());
      const imported=await boardFiles.loadWhiteboardPDF(new File([pdf],'quadro.pdf',{type:'application/pdf'}));
      let rejected=false;try{await boardFiles.loadWhiteboardImage(new File(['<svg/>'],'unsafe.svg',{type:'image/svg+xml'}));}catch{rejected=true;}
      return {mime:pdf.type,header:(await pdf.text()).slice(0,8),width:imported.width,height:imported.height,objects:drawingTest.state().objects,rejected};
    });
    assert.equal(fileResults.mime,'application/pdf');assert.equal(fileResults.header,'%PDF-1.4');assert.ok(fileResults.width>0&&fileResults.height>0);assert.equal(fileResults.objects,2);assert.equal(fileResults.rejected,true);
    const pngData=await page.evaluate(()=>drawingTest.exportCanvas().toDataURL('image/png').split(',')[1]);
    await page.locator('[data-board-import="image"]').setInputFiles({name:'quadro-teste.png',mimeType:'image/png',buffer:Buffer.from(pngData,'base64')});
    await page.waitForFunction(()=>drawingTest.state().objects===3);
    const download=page.waitForEvent('download');await page.click('[aria-label="Salvar como PDF"]');
    assert.equal((await download).suggestedFilename(),'quadro.pdf');
    await page.evaluate(()=>{window.chosenPDFPage=drawingTest.choosePDFPage(3);});
    await page.locator('dialog input[type="number"]').fill('2');await page.click('button:has-text("Adicionar página")');
    assert.equal(await page.evaluate(()=>window.chosenPDFPage),2,'multi-page PDFs have an explicit page chooser');
    await page.addStyleTag({content:applicationCSS+'\n'+toolbarCSS});
    await page.click('[aria-label="Configurações do quadro"]');assert.equal(await page.locator('.note-board-settings').isVisible(),true);
    await page.screenshot({path:path.join(process.env.TEMP||'/tmp','labmec-board-settings-desktop.png')});
    for(const tab of ['Comportamento','Ferramentas','Atalhos']){
      await page.getByRole('tab',{name:tab,exact:true}).click();
      assert.ok(await page.locator('.note-board-settings-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'settings tab fits without horizontal overflow: '+tab);
      await page.screenshot({path:path.join(process.env.TEMP||'/tmp','labmec-settings-'+tab+'.png')});
    }

    await page.setViewportSize({width:390,height:812});
    const settingsBox=await page.locator('.note-board-settings').boundingBox();assert.ok(settingsBox.x>=0&&settingsBox.width<=390&&settingsBox.height<=812);
    await page.screenshot({path:path.join(process.env.TEMP||'/tmp','labmec-board-settings-mobile.png')});
    await page.click('[aria-label="Fechar configurações"]');
    assert.deepEqual(await page.evaluate(()=>boardCSPViolations),[],'PDF import/export respects the production CSP');
    assert.deepEqual(errors,[]);
    await page.setViewportSize({width:1600,height:1100});
    await run(()=>{drawingTest.seed();drawingTest.fitViewport(1500,900,.5);drawingTest.tool('pen');});
    const expanded=await run(()=>drawingTest.state());
    assert.equal(expanded.width,3000);assert.equal(expanded.height,1800);
    assert.equal((await run(()=>drawingTest.objects()))[0].points[1].x,150,'expanding the board preserves existing coordinates');
    await page.mouse.move(1450,820);await page.mouse.down();await page.mouse.move(1470,840);await page.mouse.up();
    assert.ok((await run(()=>drawingTest.objects())).some(o=>(o.points?.at(-1)?.x??o.x2)>2800),'the formerly empty edge accepts strokes after zooming out');
    assert.equal((await run(()=>drawingTest.state())).saved.drawingWidth,3000,'expanded dimensions are saved with the drawing');
    await run(()=>drawingTest.fitViewport(1500,900,1));
    await page.mouse.move(600,400);await page.keyboard.down('Shift');await page.mouse.wheel(0,180);await page.keyboard.up('Shift');await page.waitForTimeout(80);
    assert.ok(await page.locator('canvas').evaluate(el=>el.parentElement.scrollLeft)>0,'Shift plus wheel pans horizontally');
    assert.equal(await page.locator('canvas').evaluate(el=>el.parentElement.scrollTop),0,'Shift plus wheel does not pan vertically');
    assert.equal(await run(()=>drawingTest.state().zoom),1,'Shift plus wheel leaves zoom unchanged');
    await page.keyboard.down('Shift');await page.mouse.wheel(0,-180);await page.keyboard.up('Shift');await page.waitForTimeout(80);
    assert.equal(await page.locator('canvas').evaluate(el=>el.parentElement.scrollLeft),0,'reverse Shift wheel returns to the left');
    await run(()=>drawingTest.tool('pan'));
    await page.mouse.wheel(0,-160);await page.waitForTimeout(80);
    const moverZoom=await run(()=>drawingTest.state().zoom);
    assert.ok(moverZoom>1,'Mover wheel up zooms in');
    await page.mouse.wheel(0,160);await page.waitForTimeout(80);
    assert.ok(await run(()=>drawingTest.state().zoom)<moverZoom,'Mover wheel down zooms out');
    assert.ok(Math.abs((await run(()=>drawingTest.state().zoom))-1)<.001,'opposite wheel motion returns to initial zoom');
    await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');await page.waitForTimeout(80);
    assert.ok(await run(()=>drawingTest.state().zoom)>1,'zoom modifier still works while Mover is selected');
    await run(()=>drawingTest.newObjects([
      {id:'cube',type:'cube',x1:100,y1:100,x2:300,y2:300,color:'#111827',width:3},
      {id:'sphere',type:'sphere',x1:350,y1:100,x2:550,y2:300,color:'#111827',width:3},
      {id:'cylinder',type:'cylinder',x1:600,y1:100,x2:750,y2:350,color:'#111827',width:3},
      {id:'pyramid',type:'pyramid',x1:100,y1:400,x2:300,y2:600,color:'#111827',width:3}
    ]));
    const hiddenEdge=await run(()=>Array.from({length:100},(_,i)=>drawingTest.pixel(150,120+i)[3]));
    assert.ok(hiddenEdge.some(alpha=>alpha===0)&&hiddenEdge.some(alpha=>alpha>0),'hidden cube edge has visible dashes separated by gaps');
    assert.ok(await run(()=>Array.from({length:100},(_,i)=>drawingTest.pixel(100,170+i)[3]).every(alpha=>alpha>0)),'visible cube edge stays continuous');
    const solidPreview=await run(()=>{const c=document.createElement('canvas');c.width=900;c.height=700;c.getContext('2d').drawImage(drawingTest.exportCanvas(),0,0);return c.toDataURL().split(',')[1];});
    fs.writeFileSync(path.join(process.env.TEMP||'/tmp','labmec-solid-shapes.png'),Buffer.from(solidPreview,'base64'));
    await page.setContent('<div id="note-studio-modal" class="modal-overlay modal-visible"><div class="modal-box note-studio-box"><button id="fullscreen-test" type="button">Tela cheia</button></div></div>');
    await page.addStyleTag({content:applicationCSS+'\n'+toolbarCSS});
    await page.evaluate(async()=>{const {initializeNoteFullscreen}=await import('/assets/note-fullscreen.js');initializeNoteFullscreen({modal:document.getElementById('note-studio-modal'),button:document.getElementById('fullscreen-test')});});
    await page.click('#fullscreen-test');
    await page.waitForFunction(()=>document.getElementById('fullscreen-test').getAttribute('aria-pressed')==='true');
    assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),'note-studio-modal','fullscreen targets the note editor');
    const fullscreenBox=await page.locator('.note-studio-box').boundingBox();
    assert.ok(Math.abs(fullscreenBox.width-1600)<2&&Math.abs(fullscreenBox.height-1100)<2,'editor fills the fullscreen viewport');
    await page.click('#fullscreen-test');await page.waitForFunction(()=>!document.fullscreenElement);
    await page.evaluate(()=>{document.getElementById('note-studio-modal').requestFullscreen=()=>Promise.reject(new Error('unavailable'));});
    await page.click('#fullscreen-test');await page.waitForFunction(()=>document.getElementById('note-studio-modal').classList.contains('note-fullscreen'));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#fullscreen-test').getAttribute('aria-pressed'),'false','Escape exits the fallback fullscreen mode');
    assert.equal(await page.locator('#note-studio-modal').isVisible(),true,'exiting fullscreen keeps the editor open');
    console.log('PASS: legacy drawing, shapes, laser, recognition, lasso/resize, text, custom shortcuts, settings, hide/reopen, mouse/keyboard/touch, image import, PDF round trip, responsive layout');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
