import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ConsonantGate, CONSONANTS } from './hybrid-gate-v3.js';
import { REPLAY_FRAMES, REPLAY_MORPH_KEYS, REPLAY_DURATION } from './diagnostic-replay-v7.js';
import { ExpressionDeck, EXPRESSION_MORPH_FILES, EXPRESSION_MOUTH_KEYS } from './expression-deck-v1.js?v=3';
import { SpeechArticulationEngine } from '../voice-face-puppet/articulation-engine-v2.js?v=1';
import { RawOnsetFollower } from '../voice-face-puppet/raw-onset-v1.js?v=1';

const VISEMES=['aa','E','I','O','U','PP','SS','TH','DD','FF','kk','nn','RR','CH','sil'];
const PERSONAL_CLASSES=new Set([...CONSONANTS,'RR']);
const FACEKIT='https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const MORPH_FILES={
  jawOpen:'jawOpen.obj', jawForward:'jawForward.obj', mouthFunnel:'mouthFunnel.obj', mouthPucker:'mouthPucker.obj',
  mouthPress_L:'mouthPress_L.obj', mouthPress_R:'mouthPress_R.obj', mouthDimple_L:'mouthDimple_L.obj', mouthDimple_R:'mouthDimple_R.obj',
  mouthRollLower:'mouthRollLower.obj', mouthRollUpper:'mouthRollUpper.obj', mouthUpperUp_L:'mouthUpperUp_L.obj', mouthUpperUp_R:'mouthUpperUp_R.obj',
  mouthShrugUpper:'mouthShrugUpper.obj', mouthLowerDown_L:'mouthLowerDown_L.obj', mouthLowerDown_R:'mouthLowerDown_R.obj',
  mouthStretch_L:'mouthStretch_L.obj', mouthStretch_R:'mouthStretch_R.obj',
  ...EXPRESSION_MORPH_FILES
};
const MORPH_KEYS=Object.keys(MORPH_FILES),MORPHS=MORPH_KEYS.map(k=>MORPH_FILES[k]),MI=Object.fromEntries(MORPH_KEYS.map((k,i)=>[k,i]));
const blankMorphs=()=>Object.fromEntries(MORPH_KEYS.map(k=>[k,0]));

const WL_MODULE='../voice-face-puppet-wlipsync/wlipsync-calibrated.js';
const WL_PROFILE='https://cdn.jsdelivr.net/gh/mrxz/wLipSync@177f3ac4095dbad81be0a800a8c6f975abe4ae04/example/profile.json';
const WL_STORAGE='voiceFacePuppet.wlipsyncProfile.v1';
const HA_COMMIT='d3af5f9ff86ab6b2b1913d411a4e1922ec101953';
const HA_BASE=`https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@${HA_COMMIT}`;
const HA_MODULE=`${HA_BASE}/dist/headaudio.min.mjs`,HA_WORKLET=`${HA_BASE}/dist/headworklet.min.mjs`,HA_MODEL=`${HA_BASE}/dist/model-en-mixed.bin`;
const HA_PERSONAL='voice-face-headaudio-personal-v1';

const $=id=>document.getElementById(id),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const emotionDeck=new ExpressionDeck();let expressionMouthGain=1;
function syncEmotionUI(){
  const state=emotionDeck.snapshot();document.querySelectorAll('[data-family]').forEach(b=>b.classList.toggle('selected',b.dataset.family===state.family));document.querySelectorAll('[data-emotion-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.emotionMode===state.mode));
  document.querySelectorAll('[data-intensity]').forEach(b=>b.classList.toggle('selected',b.dataset.intensity===state.intensity));
  if($('emotionDeal'))$('emotionDeal').textContent=state.labels.join(' · ');if($('emotionStrength'))$('emotionStrength').value=state.strength;if($('emotionStrengthOut'))$('emotionStrengthOut').textContent=`${Math.round(state.strength*100)}%`;
}
function dealEmotion(family=emotionDeck.family){emotionDeck.deal(family);syncEmotionUI();if(faceReady)setStatus(`DEALT / ${emotionDeck.family.toUpperCase()}`,'ready')}
function mergeEmotion(target,now){
  const expressive=emotionDeck.sample(now/1000),speechClaim=clamp((target.level||0)*2.2+(target.speechEnvelope||0)*.45+(target.overlay?.strength||0)*.9),wantedMouth=1-speechClaim;
  expressionMouthGain=lerp(expressionMouthGain,wantedMouth,wantedMouth<expressionMouthGain ? .38 : .055);
  const morphs={...target.morphs};for(const [key,value] of Object.entries(expressive)){const gain=EXPRESSION_MOUTH_KEYS.has(key)?expressionMouthGain:1;morphs[key]=clamp((morphs[key]||0)+value*gain);}
  return {...target,morphs,emotion:emotionDeck.snapshot(),expressionMouthGain};
}
function loadJSON(k,f){try{return Object.assign({},f,JSON.parse(localStorage.getItem(k)||'{}'))}catch{return structuredClone(f)}}
const personal=loadJSON(HA_PERSONAL,{prototypes:{},speakerMean:150});personal.prototypes=personal.prototypes||{};
let wlSaved=null;try{wlSaved=JSON.parse(localStorage.getItem(WL_STORAGE)||'null')}catch{}
const personalConsonants=Object.fromEntries(Object.entries(personal.prototypes).filter(([k,p])=>k.startsWith('v8c:')&&PERSONAL_CLASSES.has(VISEMES[+p.viseme])));

const canvas=$('stage'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x040406,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x050507,.014);
const portrait=()=>innerWidth<=700||innerHeight>innerWidth*1.1;
const camera=new THREE.PerspectiveCamera(34,1,.1,500);camera.position.set(0,portrait()?4:-.3,portrait()?48:43);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=false;controls.minDistance=24;controls.maxDistance=80;controls.target.set(0,portrait()?4:.6,3);
scene.add(new THREE.HemisphereLight(0x7b1d27,0x050507,.7));const keyLight=new THREE.DirectionalLight(0xff4d5d,1.55);keyLight.position.set(-7,10,16);scene.add(keyLight);const rim=new THREE.DirectionalLight(0x63101b,.95);rim.position.set(12,2,-10);scene.add(rim);
const headRig=new THREE.Group();scene.add(headRig);
function grid(size=110,div=11){const p=[],h=size/2,g=new THREE.BufferGeometry();for(let i=0;i<=div;i++){const t=-h+size*i/div;p.push(-h,0,t,h,0,t,t,0,-h,t,0,h)}g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));return new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x53131b,transparent:true,opacity:.18}))}
const floor=grid();floor.position.set(0,-14,-10);scene.add(floor);const back=grid();back.rotation.x=Math.PI/2;back.position.set(0,18,-28);back.material.opacity=.08;scene.add(back);
const loader=new OBJLoader(),loadObj=name=>new Promise((resolve,reject)=>loader.load(FACEKIT+name,resolve,undefined,reject));
const meshList=root=>{const a=[];root.traverse(o=>{if(o.isMesh)a.push(o)});return a},materialsOf=m=>Array.isArray(m)?m:[m];
let baseMeshes=[],renderMeshes=[],faceReady=false;
function setStatus(text,kind=''){if($('status'))$('status').textContent=text;if($('statusDot'))$('statusDot').className='statusDot'+(kind?` ${kind}`:'')}
function solidMaterial(base){const n=String(materialsOf(base.material)[0]?.name||'').toLowerCase();let color=0x440b12,em=0x250307,rough=.72;if(n.includes('sclera')){color=0x85515a;em=0x150305;rough=.5}else if(n.includes('iris')){color=0x160206;em=0x080001}else if(n.includes('teeth')){color=0x8b6c70;em=0x140708;rough=.55}else if(n.includes('gum')||n.includes('tongue')||n.includes('mouth')){color=0x30040a;em=0x170105}return new THREE.MeshStandardMaterial({color,emissive:em,roughness:rough,metalness:.04,transparent:true,opacity:.28,side:THREE.FrontSide})}
function prepareBase(root){baseMeshes=meshList(root);for(const b of baseMeshes){if(!b.geometry.attributes.normal)b.geometry.computeVertexNormals();b.geometry.morphAttributes=b.geometry.morphAttributes||{};b.geometry.morphAttributes.position=[];b.geometry.morphTargetsRelative=false}}
function findCounterpart(base,targets,index){if(base.name){const h=targets.find(m=>m.name===base.name&&m.geometry.attributes.position.count===base.geometry.attributes.position.count);if(h)return h}const s=targets[index];return s&&s.geometry.attributes.position.count===base.geometry.attributes.position.count?s:null}
function attachTarget(root,index){const targets=meshList(root);let matched=0;baseMeshes.forEach((base,i)=>{const t=findCounterpart(base,targets,i);if(!t)return;base.geometry.morphAttributes.position[index]=t.geometry.attributes.position.clone();matched++});if(!matched)throw new Error(`No compatible geometry for ${MORPHS[index]}`)}
function buildHead(){renderMeshes=[];baseMeshes.forEach(base=>{const holder=new THREE.Group();holder.position.copy(base.position);holder.rotation.copy(base.rotation);holder.scale.copy(base.scale);const solid=new THREE.Mesh(base.geometry,solidMaterial(base)),wire=new THREE.Mesh(base.geometry,new THREE.MeshBasicMaterial({color:0xff2638,wireframe:true,transparent:true,opacity:.32,depthWrite:false}));solid.updateMorphTargets();wire.updateMorphTargets();wire.renderOrder=2;holder.add(solid,wire);headRig.add(holder);renderMeshes.push({solid,wire})});const box=new THREE.Box3().setFromObject(headRig),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=(portrait()?15.5:23)/Math.max(size.x,size.y);headRig.scale.setScalar(scale);headRig.position.set(-center.x*scale,-center.y*scale+(portrait()?4:.8),-center.z*scale+2.8)}
async function bootHead(){try{setStatus('LOADING NEUTRAL / ~2.6 MB');prepareBase(await loadObj('generic_neutral_mesh.obj'));for(let start=0;start<MORPHS.length;start+=4){const end=Math.min(start+4,MORPHS.length);setStatus(`LOADING FACE MORPHS ${start+1}–${end}/${MORPHS.length}`);const roots=await Promise.all(MORPHS.slice(start,end).map(loadObj));roots.forEach((root,offset)=>attachTarget(root,start+offset));await new Promise(r=>requestAnimationFrame(r))}buildHead();faceReady=true;setStatus('REALISM SPEECH V11 + EXPRESSION DECK READY','ready')}catch(e){console.error(e);setStatus(`HEAD LOAD FAILED / ${e?.message||'UNKNOWN'}`,'error')}}

let wlLib=null,HeadAudio=null,stockWlProfile=null,wlLoadError=null,haLoadError=null;
const wlReady=Promise.all([import(WL_MODULE),fetch(WL_PROFILE).then(r=>{if(!r.ok)throw new Error(`profile ${r.status}`);return r.json()})]).then(([m,p])=>{wlLib=m;stockWlProfile=p}).catch(e=>{wlLoadError=e;console.error(e)});
const haReady=import(HA_MODULE).then(m=>HeadAudio=m.HeadAudio).catch(e=>{haLoadError=e;console.error(e)});
let stream=null,audioCtx=null,source=null,wlNode=null,haNode=null,rawOnset=null,mic=false,lastVadDb=-100,haRawActive='sil';
let rawOnsetState={level:0,db:-120,floorDb:-55};
const haRaw=Object.fromEntries(VISEMES.map(n=>[`viseme_${n}`,0]));
const consonantGate=new ConsonantGate();
const vowelEngine=new SpeechArticulationEngine({consonants:false,articulation:.70});
const hybridEngine=new SpeechArticulationEngine({consonants:true,articulation:.70});
function updateProfileInfo(){if($('profileInfo'))$('profileInfo').textContent=`wLipSync: ${wlSaved?'PERSONAL':'stock'} · V11 realism: raw onset + 5 vowel fields + 9 consonant fields · ${Object.keys(personalConsonants).length} personal PP/FF/TH/SS/CH/RR Gaussians`}
updateProfileInfo();
function applyPrototype(p){if(!haNode||!p)return;haNode.port.postMessage({event:'model',model:[{phoneme:p.code||p.name?.slice(0,2)||'x',group:p.group,viseme:+p.viseme,mu:new Float32Array(p.mu),sigmaInvLower:new Float32Array(p.sigmaInvLower)}]})}
function applyPersonalConsonants(){for(const p of Object.values(personalConsonants))applyPrototype(p)}
async function askMic(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());$('micStatus').textContent='Microphone permission granted.'}catch(e){$('micStatus').textContent=e?.message||'Microphone permission denied.'}}
async function startMic(){
  if(mic){stopMic();return}$('micBtn').disabled=true;$('micBtn').textContent='STARTING…';
  try{
    await Promise.all([wlReady,haReady]);if(!wlLib)throw wlLoadError||new Error('wLipSync failed');if(!HeadAudio)throw haLoadError||new Error('HeadAudio failed');
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});audioCtx=new AudioContext();await audioCtx.resume();source=audioCtx.createMediaStreamSource(stream);rawOnset=new RawOnsetFollower(audioCtx,source);
    wlNode=await wlLib.createWLipSyncNode(audioCtx,wlSaved||stockWlProfile);wlNode.smoothness=.020;source.connect(wlNode);
    await audioCtx.audioWorklet.addModule(HA_WORKLET);haNode=new HeadAudio(audioCtx,{processorOptions:{vadEventsEnabled:true,featureEventsEnabled:false,visemeEventsEnabled:true},parameterData:{vadMode:1,vadGateActiveDb:-40,vadGateInactiveDb:-50,silMode:1,silCalibrationWindowSec:3,silSensitivity:1.2,speakerMeanHz:personal.speakerMean||150}});
    await haNode.loadModel(HA_MODEL);applyPersonalConsonants();
    haNode.onvalue=(k,v)=>{if(k in haRaw)haRaw[k]=clamp(v)};
    haNode.onvad=o=>{if(Number.isFinite(o.db))lastVadDb=o.db};
    haNode.onviseme=o=>{if(Number.isInteger(o.viseme))haRawActive=VISEMES[o.viseme]||'sil'};
    haNode.onended=()=>{haRawActive='sil';consonantGate.reset();hybridEngine.resetConsonants();for(const k of Object.keys(haRaw))haRaw[k]=0};
    haNode.oncalibrated=o=>{$('silenceBtn').disabled=false;$('silenceBtn').textContent='CALIBRATE HEADAUDIO SILENCE';$('micStatus').textContent=o?.error?`Silence calibration failed: ${o.error}`:'HeadAudio silence calibrated for this room.'};
    source.connect(haNode);mic=true;$('micBtn').textContent='MIC OFF';$('micBtn').classList.add('selected');$('micStatus').textContent='V11 live: the raw waveform wakes the speech envelope immediately; wLipSync and HeadAudio then determine the actual overlapping mouth shape.';setStatus('REALISM V11 LIP SYNC LIVE','ready');
  }catch(e){console.error(e);$('micStatus').textContent=e?.message||'Could not start microphone.';stopMic(false)}finally{$('micBtn').disabled=false}
}
function stopMic(update=true){mic=false;try{rawOnset?.disconnect()}catch{};rawOnset=null;rawOnsetState={level:0,db:-120,floorDb:-55};try{source?.disconnect()}catch{};try{wlNode?.disconnect()}catch{};try{haNode?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());stream=source=wlNode=haNode=null;audioCtx?.close().catch(()=>{});audioCtx=null;lastVadDb=-100;haRawActive='sil';consonantGate.reset();vowelEngine.reset();hybridEngine.reset();for(const k of Object.keys(haRaw))haRaw[k]=0;if($('micBtn')){$('micBtn').textContent='MIC ON';$('micBtn').classList.remove('selected')}if(update&&$('micStatus'))$('micStatus').textContent='Microphone stopped.';if(faceReady)setStatus('REALISM V11 HEAD READY / WAITING FOR MIC','ready')}
function calibrateSilence(){if(!haNode){$('micStatus').textContent='Turn the microphone on first.';return}$('silenceBtn').disabled=true;$('silenceBtn').textContent='STAY QUIET…';$('micStatus').textContent='HeadAudio is listening to three seconds of room silence.';haNode.calibrate()}
window.VFPComparison={stopMic,startMic:()=>startMic(),isMicOn:()=>mic};

function lipInput(){
  const weights={A:0,I:0,U:0,E:0,O:0};
  if(wlNode)for(const k of Object.keys(weights))weights[k]=clamp(+wlNode.weights[k]||0);
  return {weights,volume:wlNode?clamp(+wlNode.volume||0):0};
}
function wLipState(now,dtMs){
  const src=lipInput();
  return vowelEngine.update({vowelWeights:src.weights,volume:src.volume,rawOnset:rawOnsetState.level,dtMs,vadDb:lastVadDb,haWeights:{},rawActive:'sil',gate:null});
}
function hybridState(now,dtMs){
  const src=lipInput(),gate=consonantGate.update(haRaw,lastVadDb,haRawActive,now);
  const out=hybridEngine.update({vowelWeights:src.weights,volume:src.volume,haWeights:haRaw,rawActive:haRawActive,gate,vadDb:lastVadDb,rawOnset:rawOnsetState.level,dtMs});
  return {...out,overlay:out.overlay?{...out.overlay,gate}:null};
}

let active='hybrid',morph=blankMorphs();
let diagnosticReplay={active:false,start:0,index:0,speed:.55};
function stopDiagnosticReplay(){diagnosticReplay.active=false;diagnosticReplay.index=0;const b=$('replayBtn');if(b){b.textContent='REPLAY DIAGNOSTIC · 0.55×';b.classList.remove('selected')}if(faceReady)setStatus(mic?'REALISM V11 LIP SYNC LIVE':'REALISM V11 HEAD READY / WAITING FOR MIC','ready')}
function startDiagnosticReplay(){stopMic(false);diagnosticReplay={active:true,start:performance.now(),index:0,speed:.55};const b=$('replayBtn');if(b){b.textContent='STOP REPLAY';b.classList.add('selected')}setStatus('REPLAYING RECORDED DIAGNOSTIC · 0.55×','ready')}
function diagnosticReplayTarget(now){
  const elapsed=(now-diagnosticReplay.start)*diagnosticReplay.speed;
  if(elapsed>=REPLAY_DURATION){stopDiagnosticReplay();return {morphs:blankMorphs(),shape:'rest',level:0,overlay:null}}
  while(diagnosticReplay.index<REPLAY_FRAMES.length-1&&REPLAY_FRAMES[diagnosticReplay.index+1].t<=elapsed)diagnosticReplay.index++;
  const f=REPLAY_FRAMES[diagnosticReplay.index],morphs=blankMorphs();
  for(let i=0;i<REPLAY_MORPH_KEYS.length;i++)morphs[REPLAY_MORPH_KEYS[i]]=f.m[i]||0;
  return {morphs,shape:f.shape||'rest',detail:f.shape||'rest',level:f.level||0,overlay:f.c?{active:f.c,strength:f.s||0}:null,articulation:null};
}
window.VFPReplay={start:startDiagnosticReplay,stop:stopDiagnosticReplay,isActive:()=>diagnosticReplay.active};

const MORPH_TAU_MS={
  jawOpen:38,jawForward:48,mouthFunnel:52,mouthPucker:48,
  mouthRollLower:42,mouthRollUpper:42,mouthPress_L:44,mouthPress_R:44,
  mouthDimple_L:55,mouthDimple_R:55,mouthUpperUp_L:48,mouthUpperUp_R:48,
  mouthLowerDown_L:52,mouthLowerDown_R:52,mouthShrugUpper:50,
  mouthStretch_L:58,mouthStretch_R:58
};
function selectModel(which){if(diagnosticReplay.active)stopDiagnosticReplay();active=which;$('wlBtn').classList.toggle('selected',which==='wl');$('haBtn').classList.toggle('selected',which==='hybrid');$('activeModel').textContent=which==='wl'?'wLipSync · realism vowels':'Realism V11 · continuous 15-class';$('hudModel').textContent=which==='wl'?'REALISM VOWELS':'REALISM V11'}
function aggregate(m,...keys){return Math.max(...keys.map(k=>m[k]||0),0)}
function setBar(id,v){const e=$(id);if(e)e.style.width=`${clamp(v)*100}%`}
function applyMorphState(target,dtMs=16){
  for(const k of MORPH_KEYS){const tau=MORPH_TAU_MS[k]??70,a=1-Math.exp(-Math.max(1,dtMs)/tau);morph[k]=lerp(morph[k],target.morphs[k]||0,a)}
  if(faceReady){for(const {solid,wire} of renderMeshes){for(const m of [solid,wire]){if(!m.morphTargetInfluences)continue;for(const k of MORPH_KEYS)m.morphTargetInfluences[MI[k]]=morph[k]}wire.visible=$('wire').checked}}
  setBar('mJaw',morph.jawOpen);setBar('mFunnel',morph.mouthFunnel);setBar('mPucker',morph.mouthPucker);setBar('mPress',aggregate(morph,'mouthPress_L','mouthPress_R'));setBar('mDimple',aggregate(morph,'mouthDimple_L','mouthDimple_R'));setBar('mRoll',aggregate(morph,'mouthRollLower','mouthRollUpper'));setBar('mLower',aggregate(morph,'mouthLowerDown_L','mouthLowerDown_R'));setBar('mUpper',aggregate(morph,'mouthUpperUp_L','mouthUpperUp_R'));setBar('mForward',morph.jawForward);setBar('mStretch',aggregate(morph,'mouthStretch_L','mouthStretch_R'));
  $('meterFill').style.width=`${clamp(Math.max(target.level||0,(target.rawOnset||0)*.55))*100}%`;$('shapeOut').textContent=target.detail||target.shape;$('hudShape').textContent=String(target.shape||'—').toUpperCase();$('hudTemporal').textContent=active==='hybrid'?(target.overlay?.active?`${target.overlay.active} ${Math.round(target.overlay.strength*100)}% · overlap`:`ONSET ${Math.round((target.rawOnset||0)*100)}% · HA ${haRawActive.toUpperCase()}`):`ONSET ${Math.round((target.rawOnset||0)*100)}% · 5 VOWELS`;
  window.LipSync3DOutput={model:active,baseVowel:target.shape,morphs:{...morph},level:target.level,rawOnset:target.rawOnset??rawOnsetState.level,rawOnsetDb:rawOnsetState.db,rawFloorDb:rawOnsetState.floorDb,consonantOverlay:active==='hybrid'?(target.overlay?.active||null):null,overlayStrength:active==='hybrid'?(target.overlay?.strength||0):0,headAudioRaw:haRawActive,headAudioGate:active==='hybrid'?(target.overlay?.gate||target.overlay):null,emotion:target.emotion||emotionDeck.snapshot(),expressionMouthGain:target.expressionMouthGain??expressionMouthGain,articulation:target.articulation||null,detail:target.detail||target.shape,speechEnvelope:target.speechEnvelope??0};
}

$('wlBtn').onclick=()=>selectModel('wl');$('haBtn').onclick=()=>selectModel('hybrid');if($('replayBtn'))$('replayBtn').onclick=()=>diagnosticReplay.active?stopDiagnosticReplay():startDiagnosticReplay();$('permissionBtn').onclick=askMic;$('micBtn').onclick=startMic;$('silenceBtn').onclick=calibrateSilence;
document.querySelectorAll('[data-family]').forEach(b=>b.onclick=()=>dealEmotion(b.dataset.family));$('dealEmotion').onclick=()=>dealEmotion();document.querySelectorAll('[data-intensity]').forEach(b=>b.onclick=()=>{emotionDeck.setIntensity(b.dataset.intensity);syncEmotionUI()});document.querySelectorAll('[data-emotion-mode]').forEach(b=>b.onclick=()=>{emotionDeck.setMode(b.dataset.emotionMode);syncEmotionUI()});$('emotionStrength').oninput=e=>{emotionDeck.setStrength(+e.target.value);$('emotionStrengthOut').textContent=`${Math.round(emotionDeck.strength*100)}%`};
function setView(name){const views=portrait()?{front:[0,4,48],three:[20,4,43],side:[45,4,8]}:{front:[0,-.3,43],three:[22,1,36],side:[39,.5,5]};const [x,y,z]=views[name];camera.position.set(x,y,z);controls.target.set(0,portrait()?4:.6,3);controls.update()}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=renderer.getPixelRatio();if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}}
const clock=new THREE.Clock();let last=performance.now();
function animate(now){requestAnimationFrame(animate);const dt=Math.min(50,now-last);last=now;resize();controls.update();haNode?.update(dt);rawOnsetState=rawOnset?.sample(dt,{speechHint:lastVadDb>-55})||{level:0,db:-120,floorDb:-55};const speech=diagnosticReplay.active?diagnosticReplayTarget(now):(active==='wl'?wLipState(now,dt):hybridState(now,dt));applyMorphState(diagnosticReplay.active?speech:mergeEmotion(speech,now),dt);const t=clock.getElapsedTime();headRig.rotation.y=$('drift').checked?Math.sin(t*.19)*.018:0;renderer.render(scene,camera)}
selectModel('hybrid');syncEmotionUI();bootHead();requestAnimationFrame(animate);
