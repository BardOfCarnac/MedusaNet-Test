import { ConsonantGate, GATE_CONFIG, CONSONANTS } from './hybrid-gate-v3.js';
import { SpeechArticulationEngine } from '../voice-face-puppet/articulation-engine-v1.js?v=1';

const $=id=>document.getElementById(id),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const PHRASES={
  connected:"I thought we'd probably go over there in a minute, but we might come back round before five.",
  phoneme:'Father packed five bright blue puppets in a good box, then Joe chose three sheep by the old gate.'
};
let phraseId='connected';
const VISEMES=['aa','E','I','O','U','PP','SS','TH','DD','FF','kk','nn','RR','CH','sil'];
const WL_MODULE='../voice-face-puppet-wlipsync/wlipsync-calibrated.js';
const WL_PROFILE='https://cdn.jsdelivr.net/gh/mrxz/wLipSync@177f3ac4095dbad81be0a800a8c6f975abe4ae04/example/profile.json';
const WL_STORAGE='voiceFacePuppet.wlipsyncProfile.v1';
const HA_COMMIT='d3af5f9ff86ab6b2b1913d411a4e1922ec101953',HA_BASE=`https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@${HA_COMMIT}`;
const HA_MODULE=`${HA_BASE}/dist/headaudio.min.mjs`,HA_WORKLET=`${HA_BASE}/dist/headworklet.min.mjs`,HA_MODEL=`${HA_BASE}/dist/model-en-mixed.bin`;
const HA_PERSONAL='voice-face-headaudio-personal-v1';
function loadJSON(k,f){try{return Object.assign({},f,JSON.parse(localStorage.getItem(k)||'{}'))}catch{return structuredClone(f)}}
const personal=loadJSON(HA_PERSONAL,{prototypes:{},speakerMean:150});personal.prototypes=personal.prototypes||{};
const personalConsonants=Object.fromEntries(Object.entries(personal.prototypes).filter(([k,p])=>k.startsWith('v8c:')&&CONSONANTS.includes(VISEMES[+p.viseme])));
let wlSaved=null;try{wlSaved=JSON.parse(localStorage.getItem(WL_STORAGE)||'null')}catch{}

let running=false,stream=null,ctx=null,source=null,wlNode=null,haNode=null,recorder=null;
let chunks=[],frames=[],features=[],visemeEvents=[],timer=null,updateTimer=null,autoStopTimer=null,t0=0,lastUpdate=0,lastFrameTime=0,bundleUrl=null,bundleName=null;
const haRaw=Object.fromEntries(VISEMES.map(n=>[`viseme_${n}`,0]));
let haRawActive='sil',lastVadDb=-100,latestGate=null;
const gate=new ConsonantGate();
const realismEngine=new SpeechArticulationEngine({consonants:true,articulation:.70});

function activeSentence(){return PHRASES[phraseId]||PHRASES.connected}
function status(t){if($('captureStatus'))$('captureStatus').textContent=t}
function setProgress(p){if($('captureMeterFill'))$('captureMeterFill').style.width=`${clamp(p)*100}%`}
function friendly(e){if(e?.name==='NotAllowedError')return'Microphone permission denied.';if(e?.name==='NotFoundError')return'No microphone found.';return e?.message||'Realism diagnostic recorder failed.'}
function compactWeights(obj){return Object.fromEntries(VISEMES.map(n=>[n,+(obj[`viseme_${n}`]||0).toFixed(5)]))}
function compactMorphs(m){return Object.fromEntries(Object.entries(m||{}).map(([k,v])=>[k,+(+v||0).toFixed(5)]))}
function wlSnapshot(){
  const weights={A:0,I:0,U:0,E:0,O:0};
  if(!wlNode)return {weights,rawVolume:0,level:0,shape:'rest',mfcc:null};
  let best=0,shape='rest';for(const k of Object.keys(weights)){weights[k]=clamp(+wlNode.weights[k]||0);if(weights[k]>best){best=weights[k];shape=k}}
  const rawVolume=clamp(+wlNode.volume||0),level=clamp(rawVolume*1.18);
  return {weights:Object.fromEntries(Object.entries(weights).map(([k,v])=>[k,+v.toFixed(5)])),rawVolume:+rawVolume.toFixed(5),level:+level.toFixed(5),shape:level>.04?shape:'rest',mfcc:wlNode.mfcc?Array.from(wlNode.mfcc).slice(0,12).map(x=>+x.toFixed(5)):null};
}
function rawSnapshot(){return {shape:haRawActive,weights:compactWeights(haRaw),vadDb:+lastVadDb.toFixed(3)}}
function gateSnapshot(){const g=latestGate||gate.last||{};return {candidate:g.candidate||null,active:g.active||null,strength:+(g.strength||0).toFixed(5),top:+(g.top||0).toFixed(5),second:+(g.second||0).toFixed(5),margin:+(g.margin||0).toFixed(5),qualified:!!g.qualified,reason:g.reason||null,candidateFrames:g.candidateFrames||0,rawActive:g.rawActive||haRawActive}}
function applyPrototype(p){if(!haNode||!p)return;haNode.port.postMessage({event:'model',model:[{phoneme:p.code||p.name?.slice(0,2)||'x',group:p.group,viseme:+p.viseme,mu:new Float32Array(p.mu),sigmaInvLower:new Float32Array(p.sigmaInvLower)}]})}
function applyPersonalConsonants(){for(const p of Object.values(personalConsonants))applyPrototype(p)}
function chooseMime(){for(const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4'])if(window.MediaRecorder?.isTypeSupported?.(t))return t;return''}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
function makeDownload(bundle){if(bundleUrl)URL.revokeObjectURL(bundleUrl);const blob=new Blob([JSON.stringify(bundle)],{type:'application/json'});bundleUrl=URL.createObjectURL(blob);bundleName=`lip-sync-diagnostic-v7-realism-${phraseId}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;$('downloadCaptureBtn').disabled=false;$('downloadCaptureBtn').onclick=()=>{const a=document.createElement('a');a.href=bundleUrl;a.download=bundleName;document.body.append(a);a.click();a.remove()};window.lastLipSyncDiagnostic=bundle}
function setPhrase(id){
  if(running||!PHRASES[id])return;phraseId=id;
  if($('diagnosticSentence'))$('diagnosticSentence').textContent=PHRASES[id];
  document.querySelectorAll('[data-diagnostic-phrase]').forEach(b=>b.classList.toggle('selected',b.dataset.diagnosticPhrase===id));
  status(id==='connected'?'Ready for connected-speech recording.':'Ready for original phoneme-stress recording.');
}

document.querySelectorAll('[data-diagnostic-phrase]').forEach(b=>b.onclick=()=>setPhrase(b.dataset.diagnosticPhrase));
setPhrase('connected');

async function startCapture(){
  if(running){await stopCapture(true);return}
  window.VFPComparison?.stopMic?.();
  $('recordBtn').disabled=true;$('downloadCaptureBtn').disabled=true;document.querySelectorAll('[data-diagnostic-phrase]').forEach(b=>b.disabled=true);status('Preparing V10 realism capture…');setProgress(0);
  try{
    const [wlResult,haResult,stockProfile]=await Promise.all([import(WL_MODULE),import(HA_MODULE),fetch(WL_PROFILE).then(r=>{if(!r.ok)throw new Error(`wLipSync profile HTTP ${r.status}`);return r.json()})]);
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});ctx=new AudioContext();await ctx.resume();source=ctx.createMediaStreamSource(stream);
    wlNode=await wlResult.createWLipSyncNode(ctx,wlSaved||stockProfile);wlNode.smoothness=.020;source.connect(wlNode);
    await ctx.audioWorklet.addModule(HA_WORKLET);const HeadAudio=haResult.HeadAudio;haNode=new HeadAudio(ctx,{processorOptions:{vadEventsEnabled:true,featureEventsEnabled:true,visemeEventsEnabled:true},parameterData:{vadMode:1,vadGateActiveDb:-40,vadGateInactiveDb:-50,silMode:1,silSensitivity:1.2,speakerMeanHz:personal.speakerMean||150}});
    await haNode.loadModel(HA_MODEL);applyPersonalConsonants();
    haNode.onvalue=(k,v)=>{if(k in haRaw)haRaw[k]=clamp(v)};
    haNode.onvad=o=>{if(Number.isFinite(o.db))lastVadDb=o.db};
    haNode.onviseme=o=>{if(Number.isInteger(o.viseme)){haRawActive=VISEMES[o.viseme]||'sil';if(running)visemeEvents.push({t:+(performance.now()-t0).toFixed(1),shape:haRawActive})}};
    haNode.onfeature=o=>{if(running&&o?.vector?.length===12)features.push({t:+(performance.now()-t0).toFixed(1),db:+(Number.isFinite(o.le)?10*o.le:lastVadDb).toFixed(3),v:Array.from(o.vector).map(x=>+x.toFixed(5))})};
    haNode.onended=()=>{haRawActive='sil';gate.reset();latestGate=gate.last;realismEngine.resetConsonants();for(const k of Object.keys(haRaw))haRaw[k]=0};
    source.connect(haNode);
    chunks=[];frames=[];features=[];visemeEvents=[];lastVadDb=-100;haRawActive='sil';gate.reset();latestGate=gate.last;realismEngine.reset();for(const k of Object.keys(haRaw))haRaw[k]=0;
    const mime=chooseMime();recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
    t0=performance.now();lastUpdate=t0;lastFrameTime=t0;running=true;recorder.start(200);$('recordBtn').disabled=false;$('recordBtn').textContent='STOP NOW';$('recordBtn').classList.add('recording');status('RECORDING V7 REALISM — read the displayed phrase naturally.');
    updateTimer=setInterval(()=>{const now=performance.now(),dt=Math.min(50,now-lastUpdate);lastUpdate=now;haNode?.update(dt);latestGate=gate.update(haRaw,lastVadDb,haRawActive,now)},16);
    timer=setInterval(()=>{
      const now=performance.now(),elapsed=now-t0,dt=Math.min(80,now-lastFrameTime);lastFrameTime=now;
      const wl=wlSnapshot(),raw=rawSnapshot(),g=gateSnapshot();
      const realism=realismEngine.update({vowelWeights:wl.weights,volume:wl.rawVolume,haWeights:haRaw,rawActive:haRawActive,gate:latestGate,vadDb:lastVadDb,dtMs:dt});
      const r={shape:realism.shape,detail:realism.detail,level:+realism.level.toFixed(5),speechEnvelope:+realism.speechEnvelope.toFixed(5),morphs:compactMorphs(realism.morphs),overlay:realism.overlay?{active:realism.overlay.active,strength:+realism.overlay.strength.toFixed(5),all:Object.fromEntries(Object.entries(realism.overlay.all||{}).map(([k,v])=>[k,+v.toFixed(5)]))}:null};
      frames.push({t:+elapsed.toFixed(1),wl,headAudioRaw:raw,strongGate:g,realism:r});setProgress(elapsed/12000);status(`RECORDING V7 — ${(elapsed/1000).toFixed(1)} / 12.0 s · ${r.detail}`)
    },33);
    autoStopTimer=setTimeout(()=>stopCapture(true),12000);
  }catch(e){console.error(e);status(friendly(e));cleanup();$('recordBtn').disabled=false;document.querySelectorAll('[data-diagnostic-phrase]').forEach(b=>b.disabled=false)}
}
async function stopCapture(commit){
  if(!running)return;running=false;clearInterval(timer);clearInterval(updateTimer);clearTimeout(autoStopTimer);timer=updateTimer=autoStopTimer=null;$('recordBtn').disabled=true;$('recordBtn').textContent='PROCESSING…';$('recordBtn').classList.remove('recording');
  try{
    const stopped=new Promise(resolve=>{if(!recorder||recorder.state==='inactive')resolve();else{recorder.addEventListener('stop',resolve,{once:true});recorder.stop()}});await stopped;
    if(commit){
      const sentence=activeSentence(),audioBlob=new Blob(chunks,{type:recorder?.mimeType||chunks[0]?.type||'audio/webm'}),audioDataUrl=await blobToDataURL(audioBlob),duration=performance.now()-t0;
      const protoMeta=Object.fromEntries(Object.entries(personalConsonants).map(([k,p])=>[k,{group:p.group,viseme:+p.viseme,code:p.code||null,samples:p.samples||null}]));
      const bundle={format:'voice-face-lipsync-diagnostic-v7-realism',createdAt:new Date().toISOString(),phraseId,sentence,expectedWords:sentence.replace(/[.,’']/g,'').split(/\s+/),durationMs:+duration.toFixed(1),audio:{mimeType:audioBlob.type,size:audioBlob.size,dataUrl:audioDataUrl},models:{wLipSync:{personalProfile:!!wlSaved,smoothness:.020},headAudio:{commit:HA_COMMIT,personalVisiblePrototypeCount:Object.keys(personalConsonants).length,personalVowelsLoaded:false},strongAnchorGate:{speechGateDb:gate.speechGateDb,classes:CONSONANTS,config:GATE_CONFIG},realismEngine:{module:'articulation-engine-v1.js',articulation:.70,continuousAllConsonants:true,separateJawLips:true,predictiveLead:true}},sampling:{frameIntervalTargetMs:33,gateUpdateTargetMs:16,featureVectors:'HeadAudio 12D MFCC events'},frames,features,visemeEvents};
      makeDownload(bundle);const overlays=frames.filter(f=>f.realism.overlay).length;status(`V7 captured ${(duration/1000).toFixed(1)} s · ${frames.length} realism frames · ${features.length} features · ${overlays} articulated frames. Download and upload this JSON.`);setProgress(1)
    }
  }catch(e){console.error(e);status(`Could not package V7 recording: ${e.message}`)}finally{cleanup();$('recordBtn').disabled=false;$('recordBtn').textContent='RECORD 12s';document.querySelectorAll('[data-diagnostic-phrase]').forEach(b=>b.disabled=false)}
}
function cleanup(){running=false;clearInterval(timer);clearInterval(updateTimer);clearTimeout(autoStopTimer);timer=updateTimer=autoStopTimer=null;try{source?.disconnect()}catch{};try{wlNode?.disconnect()}catch{};try{haNode?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());stream=source=wlNode=haNode=null;ctx?.close().catch(()=>{});ctx=null;recorder=null;gate.reset();latestGate=gate.last;realismEngine.reset()}

$('recordBtn').onclick=startCapture;window.addEventListener('beforeunload',cleanup);
