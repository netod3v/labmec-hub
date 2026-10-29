export function downloadWhiteboard(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function canvasPDF(canvas) {
  const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));if(!jpeg)throw new Error('Não foi possível exportar o quadro.');
  const image=new Uint8Array(await jpeg.arrayBuffer()),encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;
  const append=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);length+=bytes.length;};
  const object=(id,value)=>{offsets[id]=length;append(id+' 0 obj\n'+value+'\nendobj\n');};
  const pw=canvas.width>=canvas.height?842:595,ph=canvas.width>=canvas.height?595:842,scale=Math.min((pw-40)/canvas.width,(ph-40)/canvas.height),w=canvas.width*scale,h=canvas.height*scale;
  append('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4]=length;append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`);append(image);append('\nendstream\nendobj\n');
  const stream=`q ${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${((pw-w)/2).toFixed(3)} ${((ph-h)/2).toFixed(3)} cm /Im0 Do Q\n`;
  object(5,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
  const xref=length;append('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)append(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return new Blob(chunks,{type:'application/pdf'});
}
export async function loadWhiteboardPDF(file,pageNumber=1) {
  if(file.size>10*1024*1024)throw new Error('Escolha um PDF de até 10 MB.');
  const pdfjs=await import('./vendor/pdfjs/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,useWasm:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href});
  try{const pdf=await task.promise;
    const number=typeof pageNumber==='function'?await pageNumber(pdf.numPages):pageNumber;if(!number)return null;
    if(!Number.isInteger(number)||number<1||number>pdf.numPages)throw new Error('Escolha uma página válida.');
    const page=await pdf.getPage(number),base=page.getViewport({scale:1}),scale=Math.min(2,1600/Math.max(base.width,base.height));
    const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;return canvas;
  }catch(error){if(error.name==='PasswordException')throw new Error('Este PDF tem senha. Use uma cópia desbloqueada para importar.');throw error;}
  finally{await task.destroy();}
}
export async function loadWhiteboardImage(file) {
  if(file.size>10*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Escolha uma imagem PNG, JPG ou WebP de até 10 MB.');
  const image=await createImageBitmap(file);
  try{const scale=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas;}finally{image.close();}
}
