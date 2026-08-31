const $=id=>document.getElementById(id);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const SENTENCE=$('diagnosticSentence')?.textContent?.trim()||'Father packed five bright blue puppets in a good box, then Joe chose three sheep by the old gate.';

const WL_MODULE='../voice-face-puppet-wlipsync/wlipsync-calibrated.js';
const WL_PROFILE='https://cdn.jsdelivr.net/gh/mrxz/wLipSync@177f3ac4095dbad81be0a800a8c6f975abe4ae04/example/profile.json';
const WL_STORAGE='voiceFacePuppet.wlipsyncProfile.v1';
const HA_COMMIT='d3af5f9ff86ab6b2b1913d411a4e1922ec101953';
const HA_BASE=`https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@${HA_COMMIT}`;
const HA_MODULE=`${HA_BASE}/dist/headaudio.min.mjs`;
const HA_WORKLET=`${HA_BASE}/dist/headworklet.min.mjs`;
const HA_MODEL=`${HA_BASE}/dist/model-en-mixed.bin`;
const HA_PERSONAL='voice-face-headaudio-personal-v1';
const HA_TEMP='voice-face-headaudio-temporal-v1';
const HA_NAMES=['aa','E','I','O','U','PP','SS','TH','DD','FF','kk','nn','RR','CH','sil'];
const HA_KEYS=HA_NAMES.map(n=>`viseme_${n}`);

const loadJSON=(key,fallback)=>{try{return Object.assign({},fallback,JSON.parse(localStorage.getItem(key)||'{}'))}catch{return structuredClone(fallback)}};
const personal=loadJSON(HA_PERSONAL,{prototypes:{},speakerMean:150});personal.prototypes=personal.prototypes||{};
const temporal=loadJSON(HA_TEMP,{templates:{}});temporal.templates=temporal.templates||{};
let wlSaved=null;try{wlSaved=JSON.parse(localStorage.getItem(WL_STORAGE)||'null')}catch{}

let running=false,stream=null,ctx=null,source=null,wlNode=null,haNode=null,recorder=null;
let chunks=[],frames=[],features=[],events=[],timer=null,updateTimer=null,autoStopTimer=null,t0=0,lastUpdate=0;
let bundleUrl=null,bundleName=null;
const haRaw=Object.fromEntries(HA_KEYS.map(k=>[k,0]));
const haFinal=Object.fromEntries(HA_KEYS.map(k=>[k,0]));
let haRawActive=14,lastVadDb=-100,featureHistory=[],override=null,lastTriggerAt=-Infinity,lastScore=null;

function status(text){$('captureStatus').textContent=text}
function setProgress(p){$('captureMeterFill').style.width=`${clamp(p)*100}%`}
function friendly(e){if(e?.name==='NotAllowedError')return'Microphone permission denied.';if(e?.name==='NotFoundError')return'No microphone found.';return e?.message||'Diagnostic recorder failed.'}
function compactWeights(obj,names){const o={};for(const n of names){const k=`viseme_${n}`;o[n]=+(obj[k]||0).toFixed(4)}return o}

function meanVec(records,a,b){const out=new Array(12).fill(0);let n=0;for(let i=Math.max(0,a);i<Math.min(records.length,b);i++){for(let j=0;j<12;j++)out[j]+=records[i].v[j];n++}if(!n)return null;for(let j=0;j<12;j++)out[j]/=n;return out}
function meanDb(records,a,b){let s=0,n=0;for(let i=Math.max(0,a);i<Math.min(records.length,b);i++){s+=records[i].db;n++}return n?s/n:-100}
function descriptor(records,i){if(i<4||i+3>=records.length)return null;const pre=meanVec(records,i-3,i),attack=meanVec(records,i,i+2),after=meanVec(records,i+2,i+4);if(!pre||!attack||!after)return null;const pDb=meanDb(records,i-3,i),aDb=meanDb(records,i,i+2),zDb=meanDb(records,i+2,i+4),floor=meanDb(records,Math.max(0,i-10),Math.max(1,i-5));return [...pre,...attack,...after,(aDb-pDb)/20,(zDb-aDb)/20,(zDb-pDb)/20,(Math.max(aDb,zDb)-floor)/40]}
function distDesc(x,m,v){let s=0,n=0;for(let i=0;i<x.length;i++){const z=x[i]-m[i],den=Math.max(v[i],i<36?.012:.02);s+=z*z/den;n++}return s/n}
function evaluateTemporal(){if(featureHistory.length<12||!Object.keys(temporal.templates).length)return;const i=featureHistory.length-4;if(i<5)return;const r=featureHistory,db=r[i].db,base=Math.min(...r.slice(Math.max(0,i-4),i).map(x=>x.db)),rise=db-base;if(db<-57||rise<1.8)return;const now=performance.now();if(now-lastTriggerAt<110)return;const d=descriptor(r,i);if(!d)return;let best=null;for(const q of Object.values(temporal.templates)){if(!q?.mean||!q?.variance||!Number.isFinite(q.threshold))continue;const score=distDesc(d,q.mean,q.variance),ratio=score/q.threshold;if(!best||ratio<best.ratio)best={q,score,ratio}}lastScore=best;if(best&&best.ratio<=1){lastTriggerAt=now;override={visemeIndex:best.q.visemeIndex,label:best.q.label,until:now+90,ratio:best.ratio};events.push({t:+(now-t0).toFixed(1),type:'temporal',label:best.q.label,viseme:HA_NAMES[best.q.visemeIndex]||null,ratio:+best.ratio.toFixed(4)})}}
function onFeature(o){if(!o?.vector||o.vector.length!==12)return;const now=performance.now(),rec={v:Array.from(o.vector),db:10*(o.le||-10),t:now};featureHistory.push(rec);if(featureHistory.length>80)featureHistory.splice(0,featureHistory.length-80);if(running)features.push({t:+(now-t0).toFixed(1),db:+rec.db.toFixed(3),v:rec.v.map(x=>+x.toFixed(5))});evaluateTemporal()}
function composeHeadAudio(now){for(const k of HA_KEYS)haFinal[k]=haRaw[k]||0;let index=haRawActive;if(override&&now<override.until){const n=HA_NAMES[override.visemeIndex];for(const k of HA_KEYS)haFinal[k]*=.22;if(n)haFinal[`viseme_${n}`]=1;index=override.visemeIndex}else if(override)override=null;return {weights:haFinal,index,shape:HA_NAMES[index]||'sil',temporal:override?{label:override.label,ratio:override.ratio}:null}}

const WL_POSES={A:{o:.92,stretch:.18,funnel:0,pucker:0},I:{o:.25,stretch:1,funnel:0,pucker:0},U:{o:.18,stretch:.05,funnel:.28,pucker:1},E:{o:.48,stretch:.82,funnel:0,pucker:0},O:{o:.62,stretch:.08,funnel:1,pucker:.58}};
function wlSnapshot(){const weights={A:0,I:0,U:0,E:0,O:0};if(!wlNode)return {weights,volume:0,mfcc:null,shape:'rest',morphs:{jaw:0,close:0,funnel:0,pucker:0,stretch:0}};let sum=0,best=0,shape='rest';for(const k of Object.keys(weights)){weights[k]=clamp(+wlNode.weights[k]||0);const p=Math.pow(weights[k],1.25);sum+=p;if(p>best){best=p;shape=k}}const v=clamp((wlNode.volume||0)*1.18);let o=0,stretch=0,funnel=0,pucker=0;if(sum>.0001){for(const k of Object.keys(weights)){const p=Math.pow(weights[k],1.25)/sum,s=WL_POSES[k];o+=s.o*p;stretch+=s.stretch*p;funnel+=s.funnel*p;pucker+=s.pucker*p}}return {weights:Object.fromEntries(Object.entries(weights).map(([k,x])=>[k,+x.toFixed(4)])),volume:+v.toFixed(4),mfcc:wlNode.mfcc?Array.from(wlNode.mfcc).slice(0,12).map(x=>+x.toFixed(5)):null,shape:v>.04?shape:'rest',morphs:{jaw:+clamp(o*v*1.05).toFixed(4),close:0,funnel:+clamp(funnel*v).toFixed(4),pucker:+clamp(pucker*v).toFixed(4),stretch:+clamp(stretch*v).toFixed(4)}}}
function haSnapshot(now){const o=composeHeadAudio(now),w=o.weights,g=n=>clamp(w[`viseme_${n}`]||0);return {rawShape:HA_NAMES[haRawActive]||'sil',finalShape:o.shape,rawWeights:compactWeights(haRaw,HA_NAMES),finalWeights:compactWeights(w,HA_NAMES),vadDb:+lastVadDb.toFixed(3),temporal:o.temporal?{label:o.temporal.label,ratio:+o.temporal.ratio.toFixed(4)}:null,morphs:{jaw:+clamp(g('aa')*.95+g('E')*.48+g('I')*.25+g('O')*.68+g('U')*.22+g('DD')*.28+g('kk')*.36+g('nn')*.24+g('RR')*.35+g('CH')*.25+g('TH')*.18+g('SS')*.12).toFixed(4),close:+clamp(g('PP')*.98+g('FF')*.15).toFixed(4),funnel:+clamp(g('O')*.9+g('U')*.3+g('CH')*.18+g('RR')*.12).toFixed(4),pucker:+clamp(g('U')*.96+g('O')*.5+g('RR')*.28+g('CH')*.08).toFixed(4),stretch:+clamp(g('I')*.9+g('E')*.8+g('SS')*.58+g('TH')*.32+g('FF')*.32+g('DD')*.18).toFixed(4)}}}

function applyPrototype(p){if(!haNode||!p)return;haNode.port.postMessage({event:'model',model:[{phoneme:p.code||p.name?.slice(0,2)||'x',group:p.group,viseme:p.viseme,mu:new Float32Array(p.mu),sigmaInvLower:new Float32Array(p.sigmaInvLower)}]})}
function applyPersonal(){for(const p of Object.values(personal.prototypes))applyPrototype(p)}

function chooseMime(){const types=['audio/webm;codecs=opus','audio/webm','audio/mp4'];for(const t of types)if(window.MediaRecorder?.isTypeSupported?.(t))return t;return''}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
function makeDownload(bundle){if(bundleUrl)URL.revokeObjectURL(bundleUrl);const blob=new Blob([JSON.stringify(bundle)],{type:'application/json'});bundleUrl=URL.createObjectURL(blob);bundleName=`lip-sync-diagnostic-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;$('downloadCaptureBtn').disabled=false;$('downloadCaptureBtn').onclick=()=>{const a=document.createElement('a');a.href=bundleUrl;a.download=bundleName;document.body.append(a);a.click();a.remove()};window.lastLipSyncDiagnostic=bundle}

async function startCapture(){
  if(running){await stopCapture(true);return}
  $('recordBtn').disabled=true;$('downloadCaptureBtn').disabled=true;status('Preparing both diagnostic trackers…');setProgress(0);
  try{
    const [wlResult,haResult,stockProfile]=await Promise.all([
      import(WL_MODULE),import(HA_MODULE),fetch(WL_PROFILE).then(r=>{if(!r.ok)throw new Error(`wLipSync profile HTTP ${r.status}`);return r.json()})
    ]);
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    ctx=new AudioContext();await ctx.resume();source=ctx.createMediaStreamSource(stream);
    wlNode=await wlResult.createWLipSyncNode(ctx,wlSaved||stockProfile);wlNode.smoothness=.055;source.connect(wlNode);
    await ctx.audioWorklet.addModule(HA_WORKLET);const HeadAudio=haResult.HeadAudio;
    haNode=new HeadAudio(ctx,{processorOptions:{vadEventsEnabled:true,featureEventsEnabled:true,visemeEventsEnabled:true},parameterData:{vadMode:1,vadGateActiveDb:-40,vadGateInactiveDb:-50,silMode:1,silSensitivity:1.2,speakerMeanHz:personal.speakerMean||150}});await haNode.loadModel(HA_MODEL);
    haNode.onvalue=(k,v)=>{if(k in haRaw)haRaw[k]=clamp(v)};haNode.onvad=o=>{if(Number.isFinite(o.db))lastVadDb=o.db};haNode.onviseme=o=>{if(Number.isInteger(o.viseme))haRawActive=o.viseme};haNode.onfeature=onFeature;source.connect(haNode);applyPersonal();
    frames=[];features=[];events=[];chunks=[];featureHistory=[];override=null;lastTriggerAt=-Infinity;lastScore=null;lastVadDb=-100;haRawActive=14;for(const k of HA_KEYS)haRaw[k]=haFinal[k]=0;
    const mime=chooseMime();recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
    t0=performance.now();lastUpdate=t0;running=true;recorder.start(200);$('recordBtn').disabled=false;$('recordBtn').textContent='STOP NOW';$('recordBtn').classList.add('recording');status('RECORDING — read the sentence now, naturally.');
    updateTimer=setInterval(()=>{const now=performance.now(),dt=Math.min(50,now-lastUpdate);lastUpdate=now;haNode?.update(dt)},16);
    timer=setInterval(()=>{const now=performance.now(),elapsed=now-t0;frames.push({t:+elapsed.toFixed(1),wl:wlSnapshot(),headAudio:haSnapshot(now)});setProgress(elapsed/12000);status(`RECORDING — ${(elapsed/1000).toFixed(1)} / 12.0 s · read the sentence naturally.`)},33);
    autoStopTimer=setTimeout(()=>stopCapture(true),12000);
  }catch(e){console.error(e);status(friendly(e));cleanup();$('recordBtn').disabled=false}
}
async function stopCapture(commit){
  if(!running)return;running=false;clearInterval(timer);clearInterval(updateTimer);clearTimeout(autoStopTimer);timer=updateTimer=autoStopTimer=null;$('recordBtn').disabled=true;$('recordBtn').textContent='PROCESSING…';$('recordBtn').classList.remove('recording');
  try{
    const stopped=new Promise(resolve=>{if(!recorder||recorder.state==='inactive')resolve();else{recorder.addEventListener('stop',resolve,{once:true});recorder.stop()}});await stopped;
    if(commit){const audioBlob=new Blob(chunks,{type:recorder?.mimeType||chunks[0]?.type||'audio/webm'}),audioDataUrl=await blobToDataURL(audioBlob);const duration=performance.now()-t0;const protoMeta=Object.fromEntries(Object.entries(personal.prototypes).map(([k,p])=>[k,{group:p.group,viseme:p.viseme,code:p.code||null,samples:p.samples||null}]));const tempMeta=Object.fromEntries(Object.entries(temporal.templates).map(([k,q])=>[k,{label:q.label,visemeIndex:q.visemeIndex,threshold:q.threshold,events:q.events||null}]));const bundle={format:'voice-face-lipsync-diagnostic-v1',createdAt:new Date().toISOString(),sentence:SENTENCE,expectedWords:SENTENCE.replace(/[.,]/g,'').split(/\s+/),durationMs:+duration.toFixed(1),audio:{mimeType:audioBlob.type,size:audioBlob.size,dataUrl:audioDataUrl},models:{wLipSync:{personalProfile:!!wlSaved,smoothness:.055},headAudio:{commit:HA_COMMIT,speakerMean:personal.speakerMean||150,personalPrototypeCount:Object.keys(personal.prototypes).length,temporalTemplateCount:Object.keys(temporal.templates).length,prototypeMeta:protoMeta,temporalMeta:tempMeta}},sampling:{frameIntervalTargetMs:33,featureVectors:'HeadAudio 12D feature events'},frames,features,events};makeDownload(bundle);const kb=Math.round(new Blob([JSON.stringify(bundle)]).size/1024);status(`Captured ${(duration/1000).toFixed(1)} s · ${frames.length} model frames · ${features.length} HeadAudio feature vectors · bundle ${kb} KB. Download it and upload the JSON to ChatGPT.`);setProgress(1)}
  }catch(e){console.error(e);status(`Could not package recording: ${e.message}`)}finally{cleanup();$('recordBtn').disabled=false;$('recordBtn').textContent='RECORD 12s'}
}
function cleanup(){running=false;clearInterval(timer);clearInterval(updateTimer);clearTimeout(autoStopTimer);timer=updateTimer=autoStopTimer=null;try{source?.disconnect()}catch{};try{wlNode?.disconnect()}catch{};try{haNode?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());stream=source=wlNode=haNode=null;ctx?.close().catch(()=>{});ctx=null;recorder=null}

$('recordBtn').onclick=startCapture;
window.addEventListener('beforeunload',cleanup);
