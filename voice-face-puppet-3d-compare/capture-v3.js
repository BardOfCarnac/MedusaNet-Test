import { StabilizedHeadClassifier, VISEMES } from './stabilized-head.js';

const $=id=>document.getElementById(id), clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const SENTENCE=$('diagnosticSentence')?.textContent?.trim()||'Father packed five bright blue puppets in a good box, then Joe chose three sheep by the old gate.';
const WL_MODULE='../voice-face-puppet-wlipsync/wlipsync-calibrated.js';
const WL_PROFILE='https://cdn.jsdelivr.net/gh/mrxz/wLipSync@177f3ac4095dbad81be0a800a8c6f975abe4ae04/example/profile.json';
const WL_STORAGE='voiceFacePuppet.wlipsyncProfile.v1';
const HA_COMMIT='d3af5f9ff86ab6b2b1913d411a4e1922ec101953',HA_BASE=`https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@${HA_COMMIT}`;
const HA_MODULE=`${HA_BASE}/dist/headaudio.min.mjs`,HA_WORKLET=`${HA_BASE}/dist/headworklet.min.mjs`,HA_MODEL=`${HA_BASE}/dist/model-en-mixed.bin`;
const HA_PERSONAL='voice-face-headaudio-personal-v1',HA_TEMP='voice-face-headaudio-temporal-v1';
const HA_KEYS=VISEMES.map(n=>`viseme_${n}`);
function loadJSON(k,f){try{return Object.assign({},f,JSON.parse(localStorage.getItem(k)||'{}'))}catch{return structuredClone(f)}}
const personal=loadJSON(HA_PERSONAL,{prototypes:{},speakerMean:150});personal.prototypes=personal.prototypes||{};
const temporal=loadJSON(HA_TEMP,{templates:{}});temporal.templates=temporal.templates||{};
let wlSaved=null;try{wlSaved=JSON.parse(localStorage.getItem(WL_STORAGE)||'null')}catch{}

let running=false,stream=null,ctx=null,source=null,wlNode=null,haNode=null,stabilizer=null,recorder=null;
let chunks=[],frames=[],features=[],candidates=[],legacyWouldFire=[],timer=null,updateTimer=null,autoStopTimer=null,t0=0,lastUpdate=0,bundleUrl=null,bundleName=null;
const haRaw=Object.fromEntries(HA_KEYS.map(k=>[k,0]));
let haRawActive=14,lastVadDb=-100,featureHistory=[],lastCandidateAt=-Infinity,stableResult={viseme:14,name:'sil',prob:1,second:null,secondProb:0,margin:20};

function status(t){if($('captureStatus'))$('captureStatus').textContent=t}
function setProgress(p){if($('captureMeterFill'))$('captureMeterFill').style.width=`${clamp(p)*100}%`}
function friendly(e){if(e?.name==='NotAllowedError')return'Microphone permission denied.';if(e?.name==='NotFoundError')return'No microphone found.';return e?.message||'Diagnostic recorder failed.'}
function compactWeights(obj){const o={};for(const n of VISEMES)o[n]=+(obj[`viseme_${n}`]||0).toFixed(5);return o}

function meanVec(records,a,b){const out=new Array(12).fill(0);let n=0;for(let i=Math.max(0,a);i<Math.min(records.length,b);i++){for(let j=0;j<12;j++)out[j]+=records[i].v[j];n++}if(!n)return null;for(let j=0;j<12;j++)out[j]/=n;return out}
function meanDb(records,a,b){let s=0,n=0;for(let i=Math.max(0,a);i<Math.min(records.length,b);i++){s+=records[i].db;n++}return n?s/n:-100}
function descriptor(records,i){if(i<4||i+3>=records.length)return null;const pre=meanVec(records,i-3,i),attack=meanVec(records,i,i+2),after=meanVec(records,i+2,i+4);if(!pre||!attack||!after)return null;const pDb=meanDb(records,i-3,i),aDb=meanDb(records,i,i+2),zDb=meanDb(records,i+2,i+4),floor=meanDb(records,Math.max(0,i-10),Math.max(1,i-5));return [...pre,...attack,...after,(aDb-pDb)/20,(zDb-aDb)/20,(zDb-pDb)/20,(Math.max(aDb,zDb)-floor)/40]}
function distDesc(x,m,v){let s=0;for(let i=0;i<x.length;i++){const z=x[i]-m[i],den=Math.max(v[i],i<36?.012:.02);s+=z*z/den}return s/x.length}
function scoreTemporal(d){const scores=[];for(const [key,q] of Object.entries(temporal.templates)){if(!q?.mean||!q?.variance||!Number.isFinite(q.threshold))continue;const score=distDesc(d,q.mean,q.variance),ratio=score/q.threshold;scores.push({key,label:q.label,visemeIndex:q.visemeIndex,score,ratio})}return scores.sort((a,b)=>a.ratio-b.ratio)}
function evaluateLegacyTemporal(now){if(featureHistory.length<12||!Object.keys(temporal.templates).length)return;const i=featureHistory.length-4;if(i<5)return;const r=featureHistory,db=r[i].db,base=Math.min(...r.slice(Math.max(0,i-4),i).map(x=>x.db)),rise=db-base;if(db<-57||rise<1.8||now-lastCandidateAt<110)return;lastCandidateAt=now;const d=descriptor(r,i);if(!d)return;const scores=scoreTemporal(d);if(!scores.length)return;const best=scores[0],second=scores[1]||null,margin=second&&best.ratio>0?second.ratio/best.ratio:null;const row={t:+(now-t0).toFixed(1),db:+db.toFixed(3),rise:+rise.toFixed(3),best:{key:best.key,label:best.label,viseme:VISEMES[best.visemeIndex]||null,ratio:+best.ratio.toFixed(4),score:+best.score.toFixed(4)},second:second?{key:second.key,label:second.label,viseme:VISEMES[second.visemeIndex]||null,ratio:+second.ratio.toFixed(4),score:+second.score.toFixed(4)}:null,margin:margin?+margin.toFixed(4):null,scores:scores.map(s=>({key:s.key,label:s.label,ratio:+s.ratio.toFixed(4),score:+s.score.toFixed(4)}))};candidates.push(row);if(best.ratio<=1)legacyWouldFire.push({t:row.t,label:best.label,viseme:row.best.viseme,ratio:row.best.ratio,margin:row.margin})}
function onFeature(o){if(!o?.vector||o.vector.length!==12)return;const now=performance.now(),db=Number.isFinite(o.le)?10*o.le:lastVadDb,rec={v:Array.from(o.vector),db,t:now};featureHistory.push(rec);if(featureHistory.length>80)featureHistory.splice(0,featureHistory.length-80);if(stabilizer)stableResult=stabilizer.predict(o.vector,{vadDb:db});evaluateLegacyTemporal(now);if(running)features.push({t:+(now-t0).toFixed(1),db:+db.toFixed(3),v:rec.v.map(x=>+x.toFixed(5)),stable:{shape:stableResult.name,prob:+(stableResult.prob||0).toFixed(5),second:stableResult.second,secondProb:+(stableResult.secondProb||0).toFixed(5),margin:+(stableResult.margin||0).toFixed(5)}})}

function wlSnapshot(){const weights={A:0,I:0,U:0,E:0,O:0};if(!wlNode)return {weights,volume:0,shape:'rest',mfcc:null};let best=0,shape='rest';for(const k of Object.keys(weights)){weights[k]=clamp(+wlNode.weights[k]||0);if(weights[k]>best){best=weights[k];shape=k}}const volume=clamp((wlNode.volume||0)*1.18);return {weights:Object.fromEntries(Object.entries(weights).map(([k,v])=>[k,+v.toFixed(5)])),volume:+volume.toFixed(5),shape:volume>.04?shape:'rest',mfcc:wlNode.mfcc?Array.from(wlNode.mfcc).slice(0,12).map(x=>+x.toFixed(5)):null}}
function rawSnapshot(){return {shape:VISEMES[haRawActive]||'sil',weights:compactWeights(haRaw),vadDb:+lastVadDb.toFixed(3)}}
function stableSnapshot(){if(!stabilizer)return {shape:'sil',prob:1,second:null,secondProb:0,margin:20,weights:Object.fromEntries(VISEMES.map(n=>[n,n==='sil'?1:0]))};const w=stabilizer.weights();return {shape:stableResult.name||'sil',prob:+(stableResult.prob||0).toFixed(5),second:stableResult.second,secondProb:+(stableResult.secondProb||0).toFixed(5),margin:+(stableResult.margin||0).toFixed(5),weights:compactWeights(w)}}
function applyPrototype(p){if(!haNode||!p)return;haNode.port.postMessage({event:'model',model:[{phoneme:p.code||p.name?.slice(0,2)||'x',group:p.group,viseme:p.viseme,mu:new Float32Array(p.mu),sigmaInvLower:new Float32Array(p.sigmaInvLower)}]})}
function applyPersonalUpstream(){for(const p of Object.values(personal.prototypes))applyPrototype(p)}
function chooseMime(){for(const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4'])if(window.MediaRecorder?.isTypeSupported?.(t))return t;return''}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
function makeDownload(bundle){if(bundleUrl)URL.revokeObjectURL(bundleUrl);const blob=new Blob([JSON.stringify(bundle)],{type:'application/json'});bundleUrl=URL.createObjectURL(blob);bundleName=`lip-sync-diagnostic-v3-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;$('downloadCaptureBtn').disabled=false;$('downloadCaptureBtn').onclick=()=>{const a=document.createElement('a');a.href=bundleUrl;a.download=bundleName;document.body.append(a);a.click();a.remove()};window.lastLipSyncDiagnostic=bundle}

async function startCapture(){
  if(running){await stopCapture(true);return}
  window.VFPComparison?.stopMic?.();
  $('recordBtn').disabled=true;$('downloadCaptureBtn').disabled=true;status('Preparing wLipSync, raw HeadAudio, and stabilized HeadAudio…');setProgress(0);
  try{
    const [wlResult,haResult,stockProfile]=await Promise.all([import(WL_MODULE),import(HA_MODULE),fetch(WL_PROFILE).then(r=>{if(!r.ok)throw new Error(`wLipSync profile HTTP ${r.status}`);return r.json()})]);
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});ctx=new AudioContext();await ctx.resume();source=ctx.createMediaStreamSource(stream);
    wlNode=await wlResult.createWLipSyncNode(ctx,wlSaved||stockProfile);wlNode.smoothness=.055;source.connect(wlNode);
    await ctx.audioWorklet.addModule(HA_WORKLET);const HeadAudio=haResult.HeadAudio;haNode=new HeadAudio(ctx,{processorOptions:{vadEventsEnabled:true,featureEventsEnabled:true,visemeEventsEnabled:true},parameterData:{vadMode:1,vadGateActiveDb:-40,vadGateInactiveDb:-50,silMode:1,silSensitivity:1.2,speakerMeanHz:personal.speakerMean||150}});
    const parsed=await haNode.training.loadModel(HA_MODEL);stabilizer=new StabilizedHeadClassifier(parsed.model,personal.prototypes,{personalWeight:.68,personalShrink:.28,temperature:6,emaAlpha:.58});await haNode.loadModel(HA_MODEL);applyPersonalUpstream();
    haNode.onvalue=(k,v)=>{if(k in haRaw)haRaw[k]=clamp(v)};haNode.onvad=o=>{if(Number.isFinite(o.db))lastVadDb=o.db};haNode.onviseme=o=>{if(Number.isInteger(o.viseme))haRawActive=o.viseme};haNode.onfeature=onFeature;haNode.onended=()=>{haRawActive=14;stableResult=stabilizer?.silence()||stableResult};source.connect(haNode);
    chunks=[];frames=[];features=[];candidates=[];legacyWouldFire=[];featureHistory=[];lastCandidateAt=-Infinity;lastVadDb=-100;haRawActive=14;stableResult=stabilizer.silence();for(const k of HA_KEYS)haRaw[k]=0;
    const mime=chooseMime();recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
    t0=performance.now();lastUpdate=t0;running=true;recorder.start(200);$('recordBtn').disabled=false;$('recordBtn').textContent='STOP NOW';$('recordBtn').classList.add('recording');status('RECORDING V3 — read the sentence naturally. Legacy transient templates are diagnostic-only.');
    updateTimer=setInterval(()=>{const now=performance.now(),dt=Math.min(50,now-lastUpdate);lastUpdate=now;haNode?.update(dt)},16);
    timer=setInterval(()=>{const now=performance.now(),elapsed=now-t0;frames.push({t:+elapsed.toFixed(1),wl:wlSnapshot(),headAudioRaw:rawSnapshot(),headAudioStable:stableSnapshot()});setProgress(elapsed/12000);status(`RECORDING V3 — ${(elapsed/1000).toFixed(1)} / 12.0 s · stable ${stableResult.name||'sil'} ${Math.round((stableResult.prob||0)*100)}% · legacy candidates ${candidates.length}`)},33);
    autoStopTimer=setTimeout(()=>stopCapture(true),12000);
  }catch(e){console.error(e);status(friendly(e));cleanup();$('recordBtn').disabled=false}
}
async function stopCapture(commit){
  if(!running)return;running=false;clearInterval(timer);clearInterval(updateTimer);clearTimeout(autoStopTimer);timer=updateTimer=autoStopTimer=null;$('recordBtn').disabled=true;$('recordBtn').textContent='PROCESSING…';$('recordBtn').classList.remove('recording');
  try{
    const stopped=new Promise(resolve=>{if(!recorder||recorder.state==='inactive')resolve();else{recorder.addEventListener('stop',resolve,{once:true});recorder.stop()}});await stopped;
    if(commit){const audioBlob=new Blob(chunks,{type:recorder?.mimeType||chunks[0]?.type||'audio/webm'}),audioDataUrl=await blobToDataURL(audioBlob),duration=performance.now()-t0;const protoMeta=Object.fromEntries(Object.entries(personal.prototypes).map(([k,p])=>[k,{group:p.group,viseme:p.viseme,code:p.code||null,samples:p.samples||null}]));const tempMeta=Object.fromEntries(Object.entries(temporal.templates).map(([k,q])=>[k,{label:q.label,visemeIndex:q.visemeIndex,threshold:q.threshold,events:q.events||null}]));const bundle={format:'voice-face-lipsync-diagnostic-v3',createdAt:new Date().toISOString(),sentence:SENTENCE,expectedWords:SENTENCE.replace(/[.,]/g,'').split(/\s+/),durationMs:+duration.toFixed(1),audio:{mimeType:audioBlob.type,size:audioBlob.size,dataUrl:audioDataUrl},models:{wLipSync:{personalProfile:!!wlSaved,smoothness:.055},headAudioRaw:{commit:HA_COMMIT,personalPrototypeCount:Object.keys(personal.prototypes).length},headAudioStable:{...stabilizer.info()},legacyTemporal:{enabledForOutput:false,templateCount:Object.keys(temporal.templates).length,templates:tempMeta},personalPrototypes:protoMeta},sampling:{frameIntervalTargetMs:33,featureVectors:'HeadAudio 12D MFCC feature events'},frames,features,legacyTemporalCandidates:candidates,legacyTemporalWouldFire};makeDownload(bundle);const kb=Math.round(new Blob([JSON.stringify(bundle)]).size/1024);status(`V3 captured ${(duration/1000).toFixed(1)} s · ${frames.length} frames · ${features.length} feature vectors · ${legacyWouldFire.length} legacy false-trigger candidates. Download and upload this JSON.`);setProgress(1)}
  }catch(e){console.error(e);status(`Could not package V3 recording: ${e.message}`)}finally{cleanup();$('recordBtn').disabled=false;$('recordBtn').textContent='RECORD 12s'}
}
function cleanup(){running=false;clearInterval(timer);clearInterval(updateTimer);clearTimeout(autoStopTimer);timer=updateTimer=autoStopTimer=null;try{source?.disconnect()}catch{};try{wlNode?.disconnect()}catch{};try{haNode?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());stream=source=wlNode=haNode=null;stabilizer=null;ctx?.close().catch(()=>{});ctx=null;recorder=null}

$('recordBtn').onclick=startCapture;window.addEventListener('beforeunload',cleanup);
