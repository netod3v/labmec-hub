const vendor=new URL('./vendor/noise-suppressor/',import.meta.url);
let bundle;
const modules=new WeakMap(),processors=new WeakMap();

export function isSystemAudioInput(label=''){
  return /stereo\s*mix|mixagem\s*est[eé]reo|what\s*u\s*hear|loopback|monitor\s+of|cable\s+output|voicemeeter\s+(output|aux)/i.test(label);
}

export function preferredPhysicalMicrophone(devices,currentId){
  const inputs=devices.filter(device=>device.kind==='audioinput');
  const current=inputs.find(device=>device.deviceId===currentId)||inputs.find(device=>device.deviceId==='default');
  if(!current||!isSystemAudioInput(current.label))return null;
  return inputs.find(device=>!['default','communications'].includes(device.deviceId)&&!isSystemAudioInput(device.label)&&/microphone|microfone|headset|hands.free|headphone/i.test(device.label))||null;
}

async function loadBundle(){
  if(!globalThis.AudioWorkletNode||!globalThis.AudioContext)throw new Error('Filtro de voz indisponível neste navegador.');
  if(!bundle)bundle=(async()=>{
    const library=await import('./vendor/noise-suppressor/index.js');
    const wasm=await library.loadRnnoise({url:new URL('rnnoise.wasm',vendor),simdUrl:new URL('rnnoise_simd.wasm',vendor)},{signal:AbortSignal.timeout(15000)});
    if(!WebAssembly.validate(wasm))throw new Error('Não foi possível carregar o filtro de voz.');
    return {library,wasm};
  })().catch(error=>{bundle=null;throw error;});
  return bundle;
}

export class VoiceNoiseProcessor{
  name='hub-voice-rnnoise';
  generation=0;
  async init({track,audioContext}){
    const generation=++this.generation;
    const {library,wasm}=await loadBundle();
    if(generation!==this.generation)throw new DOMException('Filtro encerrado.','AbortError');
    // RNNoise requires 48 kHz; keep the SDK context whenever its rate matches.
    this.ownsContext=!audioContext||audioContext.sampleRate!==48000;
    this.context=this.ownsContext?new AudioContext({sampleRate:48000,latencyHint:'interactive'}):audioContext;
    try{
      let loading=modules.get(this.context);
      if(!loading){loading=this.context.audioWorklet.addModule(new URL('rnnoise/workletProcessor.js',vendor).href);modules.set(this.context,loading);}
      await loading;
      if(generation!==this.generation)throw new DOMException('Filtro encerrado.','AbortError');
      this.source=this.context.createMediaStreamSource(new MediaStream([track]));
      this.denoiser=new library.RnnoiseWorkletNode(this.context,{wasmBinary:wasm,maxChannels:1});
      this.destination=this.context.createMediaStreamDestination();
      this.denoiser.channelCount=1;this.denoiser.channelCountMode='explicit';this.destination.channelCount=1;
      this.source.connect(this.denoiser);this.denoiser.connect(this.destination);
      this.processedTrack=this.destination.stream.getAudioTracks()[0];
      // Never connect the microphone to speakers (avoids self-monitoring/echo).
      this.context.resume().catch(()=>{});
    }catch(error){await this.destroy();throw error;}
  }
  async restart(options){await this.destroy();await this.init(options);}
  async destroy(){
    ++this.generation;
    this.source?.disconnect();this.denoiser?.disconnect();this.denoiser?.destroy();this.destination?.disconnect();this.processedTrack?.stop();
    const context=this.context,owned=this.ownsContext;
    this.source=this.denoiser=this.destination=this.processedTrack=this.context=undefined;this.ownsContext=false;
    if(owned&&context?.state!=='closed')await context.close();
  }
}

export async function setVoiceNoiseFilter(track,enabled){
  if(!track)return false;
  if(!enabled){if(processors.has(track)){await track.stopProcessor();processors.delete(track);}return false;}
  if(processors.has(track))return true;
  const processor=new VoiceNoiseProcessor();
  try{await track.setProcessor(processor);processors.set(track,processor);return true;}
  catch(error){await processor.destroy();throw error;}
}

export function releaseVoiceNoiseFilter(track){
  const processor=track&&processors.get(track);if(!processor)return;
  processors.delete(track);processor.destroy().catch(()=>{});
}
