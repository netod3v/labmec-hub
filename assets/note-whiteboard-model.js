export const WHITEBOARD_TOOLS = [
  ['pen','Caneta 1'],['secondary','Caneta 2'],['highlighter','Marca-texto'],['laser','Laser'],['eraser','Borracha'],
  ['line','Linha'],['rect','Retângulo'],['ellipse','Círculo'],['triangle','Triângulo'],['cube','Cubo'],['cylinder','Cilindro'],['pyramid','Pirâmide'],['sphere','Esfera'],
  ['stamp','Carimbo'],['select','Selecionar e redimensionar'],['lasso','Laço'],['area','Selecionar área'],['crop','Recortar'],['pan','Mover quadro'],
  ['zoom','Zoom'],['undo','Desfazer'],['redo','Refazer'],['clear','Limpar'],['pdf','Salvar PDF'],['download','Baixar imagem'],['text','Texto'],['image','Adicionar imagem'],['importPdf','Adicionar PDF']
];
export const WHITEBOARD_SHORTCUTS = [
  ['pan','Mover quadro (segurar)'],['zoomModifier','Zoom com scroll (modificador)'],['straight','Linha reta (segurar)'],['undo','Desfazer'],['redo','Refazer'],['delete','Apagar seleção'],
  ['pen','Caneta 1'],['secondary','Caneta 2'],['eraser','Borracha'],['text','Nova caixa de texto']
];
export function defaultWhiteboardSettings() {
  return {laserWidth:4,gridColor:'#cbd5e1',dotsColor:'#94a3b8',background:'white',color:'#ffffff',recognize:true,recognizeTypes:['ellipse','rect','triangle','line'],wheel:'zoom',hiddenTools:[],palette:['#111827','#ffffff','#ef4444','#2563eb','#16a34a','#f59e0b','#a855f7'],
    shortcuts:{pan:'Space',zoomModifier:'Control',straight:'Control',undo:'Ctrl+z',redo:'Ctrl+y',delete:'Delete',pen:'p',secondary:'h',eraser:'e',text:'t'},
    pens:{pen:{color:'#111827',width:4,lineStyle:'solid'},secondary:{color:'#ef4444',width:4,lineStyle:'solid'},highlighter:{color:'#111827',width:20,lineStyle:'solid',opacity:.4}}};
}
export function normalizeWhiteboardSettings(value) {
  const defaults=defaultWhiteboardSettings(),raw=value&&typeof value==='object'?value:{};
  const settings={...defaults,laserWidth:Number.isFinite(raw.laserWidth)&&raw.laserWidth>=1&&raw.laserWidth<=30?raw.laserWidth:4,gridColor:/^#[a-f\d]{6}$/i.test(raw.gridColor)?raw.gridColor:defaults.gridColor,dotsColor:/^#[a-f\d]{6}$/i.test(raw.dotsColor)?raw.dotsColor:defaults.dotsColor,background:['white','grid','dots','color'].includes(raw.background)?raw.background:defaults.background,
    color:/^#[a-f\d]{6}$/i.test(raw.color)?raw.color:defaults.color,recognize:typeof raw.recognize==='boolean'?raw.recognize:true,
    wheel:['none','pan','zoom'].includes(raw.wheel)?raw.wheel:'zoom',
    recognizeTypes:Array.isArray(raw.recognizeTypes)?raw.recognizeTypes.filter(x=>['ellipse','rect','triangle','line'].includes(x)):defaults.recognizeTypes,
    hiddenTools:Array.isArray(raw.hiddenTools)?raw.hiddenTools.filter(x=>WHITEBOARD_TOOLS.some(([id])=>id===x)):[],
    shortcuts:{...defaults.shortcuts},pens:structuredClone(defaults.pens),palette:Array.isArray(raw.palette)&&raw.palette.length===7&&raw.palette.every(x=>/^#[a-f\d]{6}$/i.test(x))?[...raw.palette]:defaults.palette};
  const used=new Set(['Ctrl+c','Ctrl+v','Escape']);
  for(const [id] of WHITEBOARD_SHORTCUTS){const key=raw.shortcuts?.[id],sharedModifier=['zoomModifier','straight'].includes(id)&&['Control','Shift','Alt'].includes(key);if(typeof key==='string'&&key.length<=35&&(!used.has(key)||sharedModifier)&&/^(?:(?:Ctrl|Alt|Shift)\+)*(?:[a-z0-9]|Space|Control|Shift|Alt|Delete|Backspace|F[1-9]|F1[0-2])$/.test(key)){settings.shortcuts[id]=key;used.add(key);}else used.add(settings.shortcuts[id]);}
  for(const id of Object.keys(defaults.pens)){const pen=raw.pens?.[id];if(!pen||typeof pen!=='object')continue;
    if(/^#[a-f\d]{6}$/i.test(pen.color))settings.pens[id].color=pen.color;
    if(Number.isFinite(pen.width)&&pen.width>=1&&pen.width<=30)settings.pens[id].width=pen.width;
    if(id==='highlighter'&&Number.isFinite(pen.opacity)&&pen.opacity>=.05&&pen.opacity<=1)settings.pens[id].opacity=pen.opacity;
    if(['solid','dashed','dotted','arrow'].includes(pen.lineStyle))settings.pens[id].lineStyle=pen.lineStyle;
  }
  return settings;
}
export function whiteboardKey(event) {
  let key=event.key===' '?'Space':event.key.length===1?event.key.toLowerCase():event.key;
  if(key==='Meta')key='Control';
  const modifiers=[];
  if((event.ctrlKey||event.metaKey)&&key!=='Control')modifiers.push('Ctrl');
  if(event.altKey&&key!=='Alt')modifiers.push('Alt');
  if(event.shiftKey&&key!=='Shift')modifiers.push('Shift');
  return [...modifiers,key].join('+');
}
export function pointInLasso(point,polygon) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
export function boundsOfPoints(points) {
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for(const p of points){x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}
  return {x1,y1,x2,y2};
}
export function recognizedInk(object,allowed) {
  const points=object.points||[];if(points.length<3)return null;
  const b=boundsOfPoints(points),w=b.x2-b.x1,h=b.y2-b.y1,diag=Math.hypot(w,h);if(diag<18)return null;
  const first=points[0],last=points.at(-1),length=Math.hypot(last.x-first.x,last.y-first.y);
  const distance=(p,a,b)=>Math.abs((b.y-a.y)*p.x-(b.x-a.x)*p.y+b.x*a.y-b.y*a.x)/(Math.hypot(b.y-a.y,b.x-a.x)||1);
  if(allowed.includes('line')&&length>18&&points.every(p=>distance(p,first,last)<Math.max(3,length*.035)))return {...object,type:'line',points:undefined,x1:first.x,y1:first.y,x2:last.x,y2:last.y};
  if(Math.hypot(last.x-first.x,last.y-first.y)>diag*.28||w<15||h<15)return null;
  // Polygon candidates must follow all their edges, not merely share a box.
  const candidates=[];
  for(const type of ['rect','triangle']){
    if(!allowed.includes(type))continue;
    const vertices=type==='rect'?[{x:b.x1,y:b.y1},{x:b.x2,y:b.y1},{x:b.x2,y:b.y2},{x:b.x1,y:b.y2}]:[{x:(b.x1+b.x2)/2,y:b.y1},{x:b.x2,y:b.y2},{x:b.x1,y:b.y2}];
    const distances=points.map(p=>Math.min(...vertices.map((v,i)=>{const n=vertices[(i+1)%vertices.length],t=Math.max(0,Math.min(1,((p.x-v.x)*(n.x-v.x)+(p.y-v.y)*(n.y-v.y))/((n.x-v.x)**2+(n.y-v.y)**2)));return Math.hypot(p.x-v.x-t*(n.x-v.x),p.y-v.y-t*(n.y-v.y));})));
    const covers=vertices.every(v=>points.some(p=>Math.hypot(p.x-v.x,p.y-v.y)<diag*.16));
    if(covers)candidates.push({type,score:distances.reduce((a,v)=>a+v,0)/points.length/diag});
  }
  if(allowed.includes('ellipse')){
    const cx=(b.x1+b.x2)/2,cy=(b.y1+b.y2)/2;
    candidates.push({type:'ellipse',score:points.reduce((sum,p)=>sum+Math.abs(Math.hypot((p.x-cx)/(w/2),(p.y-cy)/(h/2))-1),0)/points.length*.22});
  }
  const candidate=candidates.sort((a,b)=>a.score-b.score)[0];
  if(!candidate||candidate.score>.035)return null;
  return {...object,type:candidate.type,points:undefined,...b};
}
export function drawWhiteboardBackground(ctx,width,height,settings) {
  ctx.save();ctx.fillStyle=settings.background==='white'?'#ffffff':settings.color;ctx.fillRect(0,0,width,height);
  if(settings.background==='grid'){ctx.strokeStyle=settings.gridColor||'#cbd5e1';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<=width;x+=24){ctx.moveTo(x,0);ctx.lineTo(x,height);}for(let y=0;y<=height;y+=24){ctx.moveTo(0,y);ctx.lineTo(width,y);}ctx.stroke();}
  if(settings.background==='dots'){ctx.fillStyle=settings.dotsColor||'#94a3b8';for(let x=12;x<width;x+=24)for(let y=12;y<height;y+=24){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}}
  ctx.restore();
}
export function drawWhiteboardSolid(ctx,o) {
  const x=Math.min(o.x1,o.x2),y=Math.min(o.y1,o.y2),w=Math.abs(o.x2-o.x1),h=Math.abs(o.y2-o.y1),cx=x+w/2,cy=y+h/2;
  const path=points=>{ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);};
  if(o.type==='triangle')path([[cx,y],[x+w,y+h],[x,y+h],[cx,y]]);
  if(!['cube','cylinder','pyramid','sphere'].includes(o.type))return;
  ctx.save();ctx.setLineDash([]);ctx.beginPath();
  if(o.type==='cube'){
    const d=Math.min(w,h)*.25;
    path([[x,y+d],[x+w-d,y+d],[x+w-d,y+h],[x,y+h],[x,y+d],[x+d,y],[x+w,y],[x+w,y+h-d],[x+w-d,y+h]]);path([[x+w-d,y+d],[x+w,y]]);
  }
  if(o.type==='cylinder'){
    const r=Math.min(h*.12,w*.14);
    ctx.moveTo(x+w,y+r);ctx.ellipse(cx,y+r,w/2,r,0,0,2*Math.PI);
    path([[x,y+r],[x,y+h-r]]);path([[x+w,y+r],[x+w,y+h-r]]);
    ctx.moveTo(x+w,y+h-r);ctx.ellipse(cx,y+h-r,w/2,r,0,0,Math.PI);
  }
  if(o.type==='pyramid'){
    const apex=[x+w*.46,y],left=[x,y+h],front=[x+w*.72,y+h],right=[x+w,y+h*.75];
    path([apex,left,front,right,apex,front]);
  }
  if(o.type==='sphere'){
    ctx.moveTo(x+w,cy);ctx.ellipse(cx,cy,w/2,h/2,0,0,2*Math.PI);
    ctx.moveTo(x+w,cy);ctx.ellipse(cx,cy,w/2,h*.09,0,0,Math.PI);
    ctx.moveTo(cx,y+h);ctx.ellipse(cx,cy,w*.09,h/2,0,Math.PI/2,Math.PI*1.5);
  }
  ctx.stroke();ctx.beginPath();ctx.setLineDash([Math.max(4,ctx.lineWidth*2.5),Math.max(4,ctx.lineWidth*2.5)]);
  if(o.type==='cube'){const d=Math.min(w,h)*.25;path([[x+d,y],[x+d,y+h-d],[x,y+h]]);path([[x+d,y+h-d],[x+w,y+h-d]]);}
  if(o.type==='cylinder'){const r=Math.min(h*.12,w*.14);ctx.moveTo(x,y+h-r);ctx.ellipse(cx,y+h-r,w/2,r,0,Math.PI,2*Math.PI);}
  if(o.type==='pyramid'){const back=[x+w*.25,y+h*.75];path([[x+w*.46,y],back,[x,y+h]]);path([back,[x+w,y+h*.75]]);}
  if(o.type==='sphere'){
    ctx.moveTo(x,cy);ctx.ellipse(cx,cy,w/2,h*.09,0,Math.PI,2*Math.PI);
    ctx.moveTo(cx,y);ctx.ellipse(cx,cy,w*.09,h/2,0,-Math.PI/2,Math.PI/2);
  }
  ctx.stroke();ctx.restore();ctx.beginPath();
}
export function resizeWhiteboardObjects(objects,before,after) {
  const sx=(after.x2-after.x1)/(before.x2-before.x1||1),sy=(after.y2-after.y1)/(before.y2-before.y1||1);
  return objects.map(original=>{const o=structuredClone(original),transform=p=>({x:after.x1+(p.x-before.x1)*sx,y:after.y1+(p.y-before.y1)*sy});
    if(o.type==='stroke')o.points=o.points.map(transform);else {const a=transform({x:o.x1,y:o.y1}),b=transform({x:o.x2,y:o.y2});o.x1=a.x;o.y1=a.y;o.x2=b.x;o.y2=b.y;}
    return o;
  });
}
