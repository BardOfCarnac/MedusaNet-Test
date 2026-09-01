import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { StabilizedHeadClassifier, VISEMES } from './stabilized-head.js';

const FACEKIT='https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const MORPH_FILES={
  jawOpen:'jawOpen.obj', jawForward:'jawForward.obj', mouthFunnel:'mouthFunnel.obj', mouthPucker:'mouthPucker.obj',
  mouthPress_L:'mouthPress_L.obj', mouthPress_R:'mouthPress_R.obj', mouthDimple_L:'mouthDimple_L.obj', mouthDimple_R:'mouthDimple_R.obj',
  mouthRollLower:'mouthRollLower.obj', mouthRollUpper:'mouthRollUpper.obj', mouthUpperUp_L:'mouthUpperUp_L.obj', mouthUpperUp_R:'mouthUpperUp_R.obj',
  mouthShrugUpper:'mouthShrugUpper.obj', mouthLowerDown_L:'mouthLowerDown_L.obj', mouthLowerDown_R:'mouthLowerDown_R.obj',
  mouthStretch_L:'mouthStretch_L.obj', mouthStretch_R:'mouthStretch_R.obj'
};
const MORPH_KEYS=Object.keys(MORPH_FILES), MORPHS=MORPH_KEYS.map(k=>MORPH_FILES[k]), MI=Object.fromEntries(MORPH_KEYS.map((k,i)=>[k,i]));
const blankMorphs=()=>Object.fromEntries(MORPH_KEYS.map(k=>[k,0]));
const VISEME_RECIPES={
  aa:{jawOpen:.6}, E:{mouthPress_L:.8,mouthPress_R:.8,mouthDimple_L:1,mouthDimple_R:1,jawOpen:.3},
  I:{mouthPress_L:.6,mouthPress_R:.6,mouthDimple_L:.6,mouthDimple_R:.6,jawOpen:.2}, O:{mouthPucker:1,jawForward:.6,jawOpen:.2}, U:{mouthFunnel:1},
  PP:{mouthRollLower:.8,mouthRollUpper:.8,mouthUpperUp_L:.3,mouthUpperUp_R:.3},
  FF:{mouthPucker:1,mouthShrugUpper:1,mouthLowerDown_L:.2,mouthLowerDown_R:.2,mouthDimple_L:1,mouthDimple_R:1,mouthRollLower:1},
  DD:{mouthPress_L:.8,mouthPress_R:.8,mouthFunnel:.5,jawOpen:.2}, SS:{mouthPress_L:.8,mouthPress_R:.8,mouthLowerDown_L:.5,mouthLowerDown_R:.5,jawOpen:.1},
  TH:{mouthRollUpper:.6,jawOpen:.2}, CH:{mouthPucker:.5,jawOpen:.2}, RR:{mouthPucker:.5,jawOpen:.2},
  kk:{mouthLowerDown_L:.4,mouthLowerDown_R:.4,mouthDimple_L:.3,mouthDimple_R:.3,mouthFunnel:.3,mouthPucker:.3,jawOpen:.15},
  nn:{mouthLowerDown_L:.4,mouthLowerDown_R:.4,mouthDimple_L:.3,mouthDimple_R:.3,mouthFunnel:.3,mouthPucker:.3,jawOpen:.15}, sil:{}
};

const WL_MODULE='../voice-face-puppet-wlipsync/wlipsync-calibrated.js';
const WL_PROFILE='https://cdn.jsdelivr.net/gh/mrxz/wLipSync@177f3ac4095dbad81be0a800a8c6f975abe4ae04/example/profile.json';
const WL_STORAGE='voiceFacePuppet.wlipsyncProfile.v1';
const HA_COMMIT='d3af5f9ff86ab6b2b1913d411a4e1922ec101953';
const HA_BASE=`https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@${HA_COMMIT}`;
const HA_MODULE=`${HA_BASE}/dist/headaudio.min.mjs`, HA_WORKLET=`${HA_BASE}/dist/headworklet.min.mjs`, HA_MODEL=`${HA_BASE}/dist/model-en-mixed.bin`;
const HA_PERSONAL='voice-face-headaudio-personal-v1';

const $=id=>document.getElementById(id), clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t;
function loadJSON(k,f){try{return Object.assign({},f,JSON.parse(localStorage.getItem(k)||'{}'))}catch{return structuredClone(f)}}
const personal=loadJSON(HA_PERSONAL,{prototypes:{},speakerMean:150});personal.prototypes=personal.prototypes||{};
let wlSaved=null;try{wlSaved=JSON.parse(localStorage.getItem(WL_STORAGE)||'null')}catch{}

const canvas=$('stage'), renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x040406,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x050507,.014);
const portrait=()=>innerWidth<=700||innerHeight>innerWidth*1.1;
const camera=new THREE.PerspectiveCamera(34,1,.1,500);camera.position.set(0,portrait()?4:-.3,portrait()?48:43);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=false;controls.minDistance=24;controls.maxDistance=80;controls.target.set(0,portrait()?4:.6,3);
scene.add(new THREE.HemisphereLight(0x7b1d27,0x050507,.7));const keyLight=new THREE.DirectionalLight(0xff4d5d,1.55);keyLight.position.set(-7,10,16);scene.add(keyLight);const rim=new THREE.DirectionalLight(0x63101b,.95);rim.position.set(12,2,-10);scene.add(rim);
const headRig=new THREE.Group();scene.add(headRig);
function grid(size=110,div=11){const p=[],h=size/2,g=new THREE.BufferGeometry();for(let i=0;i<=div;i++){const t=-h+size*i/div;p.push(-h,0,t,h,0,t,t,0,-h,t,0,h)}g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));return new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x53131b,transparent:true,opacity:.18}))}
const floor=grid();floor.position.set(0,-14,-10);scene.add(floor);const back=grid();back.rotation.x=Math.PI/2;back.position.set(0,18,-28);back.material.opacity=.08;scene.add(back);
const loader=new OBJLoader(), loadObj=name=>new Promise((resolve,reject)=>loader.load(FACEKIT+name,resolve,undefined,reject));
const meshList=root=>{const a=[];root.traverse(o=>{if(o.isMesh)a.push(o)});return a};
const materialsOf=m=>Array.isArray(m)?m:[m];let baseMeshes=[],renderMeshes=[],faceReady=false;
function setStatus(text,kind=''){if($('status'))$('status').textContent=text;if($('statusDot'))$('statusDot').className='statusDot'+(kind?` ${kind}`:'')}
function solidMaterial(base){const n=String(materialsOf(base.material)[0]?.name||'').toLowerCase();let color=0x440b12,em=0x250307,rough=.72;if(n.includes('sclera')){color=0x85515a;em=0x150305;rough=.5}else if(n.includes('iris')){color=0x160206;em=0x080001}else if(n.includes('teeth')){color=0x8b6c70;em=0x140708;rough=.55}else if(n.includes('gum')||n.includes('tongue')||n.includes('mouth')){color=0x30040a;em=0x170105}return new THREE.MeshStandardMaterial({color,emissive:em,roughness:rough,metalness:.04,transparent:true,opacity:.28,side:THREE.FrontSide})}
function prepareBase(root){baseMeshes=meshList(root);for(const b of baseMeshes){if(!b.geometry.attributes.normal)b.geometry.computeVertexNormals();b.geometry.morphAttributes=b.geometry.morphAttributes||{};b.geometry.morphAttributes.position=[];b.geometry.morphTargetsRelative=false}}
function findCounterpart(base,targets,index){if(base.name){const h=targets.find(m=>m.name===base.name&&m.geometry.attributes.position.count===base.geometry.attributes.position.count);if(h)return h}const s=targets[index];return s&&s.geometry.attributes.position.count===base.geometry.attributes.position.count?s:null}
function attachTarget(root,index){const targets=meshList(root);let matched=0;baseMeshes.forEach((base,i)=>{const t=findCounterpart(base,targets,i);if(!t)return;base.geometry.morphAttributes.position[index]=t.geometry.attributes.position.clone();matched++});if(!matched)throw new Error(`No compatible geometry for ${MORPHS[index]}`)}
function buildHead(){renderMeshes=[];baseMeshes.forEach(base=>{const holder=new THREE.Group();holder.position.copy(base.position);holder.rotation.copy(base.rotation);holder.scale.copy(base.scale);const solid=new THREE.Mesh(base.geometry,solidMaterial(base)),wire=new THREE.Mesh(base.geometry,new THREE.MeshBasicMaterial({color:0xff2638,wireframe:true,transparent:true,opacity:.32,depthWrite:false}));solid.updateMorphTargets();wire.updateMorphTargets();wire.renderOrder=2;holder.add(solid,wire);headRig.add(holder);renderMeshes.push({solid,wire})});const box=new THREE.Box3().setFromObject(headRig),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=(portrait()?15.5:23)/Math.max(size.x,size.y);headRig.scale.setScalar(scale);headRig.position.set(-center.x*scale,-center.y*scale+(portrait()?4:.8),-center.z*scale+2.8)}
async function bootHead(){try{setStatus('LOADING NEUTRAL / ~2.6 MB');prepareBase(await loadObj('generic_neutral_mesh.obj'));for(let i=0;i<MORPHS.length;i++){setStatus(`LOADING ARKIT MOUTH MORPH ${i+1}/${MORPHS.length}`);attachTarget(await loadObj(MORPHS[i]),i);await new Promise(r=>requestAnimationFrame(r))}buildHead();faceReady=true;setStatus('STABILIZED HEAD READY / WAITING FOR MIC','ready')}catch(e){console.error(e);setStatus(`HEAD LOAD FAILED / ${e?.message||'UNKNOWN'}`,'error')}}

let wlLib=null,HeadAudio=null,stockWlProfile=null,wlLoadError=null,haLoadError=null;
const wlReady=Promise.all([import(WL_MODULE),fetch(WL_PROFILE).then(r=>{if(!r.ok)throw new Error(`profile ${r.status}`);return r.json()})]).then(([m,p])=>{wlLib=m;stockWlProfile=p}).catch(e=>{wlLoadError=e;console.error(e)});
const haReady=import(HA_MODULE).then(m=>HeadAudio=m.HeadAudio).catch(e=>{haLoadError=e;console.error(e)});
let stream=null,audioCtx=null,source=null,wlNode=null,haNode=null,stabilizer=null,mic=false,lastVadDb=-100,stableResult={viseme:14,name:'sil',prob:1,second:null,secondProb:0,margin:20};
const haRaw=Object.fromEntries(VISEMES.map(n=>[`viseme_${n}`,0]));
function updateProfileInfo(){if($('profileInfo'))$('profileInfo').textContent=`wLipSync: ${wlSaved?'PERSONAL':'stock'} · HeadAudio: ${Object.keys(personal.prototypes).length} personal Gaussians · covariance-normalized mixture · legacy transients OFF`}
updateProfileInfo();
function applyPrototype(p){if(!haNode||!p)return;haNode.port.postMessage({event:'model',model:[{phoneme:p.code||p.name?.slice(0,2)||'x',group:p.group,viseme:p.viseme,mu:new Float32Array(p.mu),sigmaInvLower:new Float32Array(p.sigmaInvLower)}]})}
function applyPersonalUpstream(){for(const p of Object.values(personal.prototypes))applyPrototype(p)}
async function askMic(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());$('micStatus').textContent='Microphone permission granted.'}catch(e){$('micStatus').textContent=e?.message||'Microphone permission denied.'}}
async function startMic(){if(mic){stopMic();return}$('micBtn').disabled=true;$('micBtn').textContent='STARTING…';try{await Promise.all([wlReady,haReady]);if(!wlLib)throw wlLoadError||new Error('wLipSync failed');if(!HeadAudio)throw haLoadError||new Error('HeadAudio failed');stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});audioCtx=new AudioContext();await audioCtx.resume();source=audioCtx.createMediaStreamSource(stream);wlNode=await wlLib.createWLipSyncNode(audioCtx,wlSaved||stockWlProfile);wlNode.smoothness=.055;source.connect(wlNode);await audioCtx.audioWorklet.addModule(HA_WORKLET);haNode=new HeadAudio(audioCtx,{processorOptions:{vadEventsEnabled:true,featureEventsEnabled:true,visemeEventsEnabled:true},parameterData:{vadMode:1,vadGateActiveDb:-40,vadGateInactiveDb:-50,silMode:1,silCalibrationWindowSec:3,silSensitivity:1.2,speakerMeanHz:personal.speakerMean||150}});const parsed=await haNode.training.loadModel(HA_MODEL);stabilizer=new StabilizedHeadClassifier(parsed.model,personal.prototypes,{personalWeight:.68,personalShrink:.28,temperature:6,emaAlpha:.58});await haNode.loadModel(HA_MODEL);applyPersonalUpstream();haNode.onvalue=(k,v)=>{if(k in haRaw)haRaw[k]=clamp(v)};haNode.onvad=o=>{if(Number.isFinite(o.db))lastVadDb=o.db};haNode.onfeature=o=>{if(!o?.vector||!stabilizer)return;const db=Number.isFinite(o.le)?10*o.le:lastVadDb;stableResult=stabilizer.predict(o.vector,{vadDb:db})};haNode.onended=()=>{stableResult=stabilizer?.silence()||stableResult};haNode.oncalibrated=o=>{$('silenceBtn').disabled=false;$('silenceBtn').textContent='CALIBRATE HEADAUDIO SILENCE';$('micStatus').textContent=o?.error?`Silence calibration failed: ${o.error}`:'HeadAudio silence calibrated for this room.'};source.connect(haNode);mic=true;$('micBtn').textContent='MIC OFF';$('micBtn').classList.add('selected');$('micStatus').textContent=`Both trackers live. Stabilized HeadAudio: ${stabilizer.info().stock} stock + ${stabilizer.info().personal} personal prototypes; temporal overrides disabled.`;setStatus('HEAD + BOTH TRACKERS LIVE','ready')}catch(e){console.error(e);$('micStatus').textContent=e?.message||'Could not start microphone.';stopMic(false)}finally{$('micBtn').disabled=false}}
function stopMic(update=true){mic=false;try{source?.disconnect()}catch{};try{wlNode?.disconnect()}catch{};try{haNode?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());stream=source=wlNode=haNode=null;stabilizer=null;stableResult={viseme:14,name:'sil',prob:1,second:null,secondProb:0,margin:20};audioCtx?.close().catch(()=>{});audioCtx=null;lastVadDb=-100;for(const k of Object.keys(haRaw))haRaw[k]=0;if($('micBtn')){$('micBtn').textContent='MIC ON';$('micBtn').classList.remove('selected')}if(update&&$('micStatus'))$('micStatus').textContent='Microphone stopped.';if(faceReady)setStatus('STABILIZED HEAD READY / WAITING FOR MIC','ready')}
function calibrateSilence(){if(!haNode){$('micStatus').textContent='Turn the microphone on first.';return}$('silenceBtn').disabled=true;$('silenceBtn').textContent='STAY QUIET…';$('micStatus').textContent='HeadAudio is listening to three seconds of room silence.';haNode.calibrate()}
window.VFPComparison={stopMic,startMic:()=>startMic(),isMicOn:()=>mic};

const wlShapes={A:{o:.92,stretch:.18,funnel:0,pucker:0},I:{o:.25,stretch:1,funnel:0,pucker:0},U:{o:.18,stretch:.05,funnel:.28,pucker:1},E:{o:.48,stretch:.82,funnel:0,pucker:0},O:{o:.62,stretch:.08,funnel:1,pucker:.58}};
function wLipState(){const morphs=blankMorphs();if(!wlNode)return {morphs,shape:'rest',level:0,detail:'—'};const raw={A:0,I:0,U:0,E:0,O:0};let sum=0,best=0,shape='rest';for(const k of Object.keys(raw)){raw[k]=Math.pow(clamp(+wlNode.weights[k]||0),1.25);sum+=raw[k];if(raw[k]>best){best=raw[k];shape=k}}const v=clamp((wlNode.volume||0)*1.18);let o=0,stretch=0,funnel=0,pucker=0;if(sum>.0001)for(const k of Object.keys(raw)){const n=raw[k]/sum,s=wlShapes[k];o+=s.o*n;stretch+=s.stretch*n;funnel+=s.funnel*n;pucker+=s.pucker*n}morphs.jawOpen=clamp(o*v*1.05);morphs.mouthFunnel=clamp(funnel*v);morphs.mouthPucker=clamp(pucker*v);morphs.mouthStretch_L=morphs.mouthStretch_R=clamp(stretch*v);return {morphs,shape:v>.04?shape:'rest',level:v,detail:'5-vowel MFCC'}}
function recipeMorphs(weights){const out=blankMorphs();for(const [viseme,recipe] of Object.entries(VISEME_RECIPES)){const vw=clamp(weights[`viseme_${viseme}`]||0);if(!vw)continue;for(const [m,val] of Object.entries(recipe))if(m in out)out[m]+=vw*val}for(const k of MORPH_KEYS)out[k]=clamp(out[k]);return out}
function headAudioState(){if(!stabilizer)return {morphs:blankMorphs(),shape:'sil',level:0,detail:'—'};const weights=stabilizer.weights(),speech=clamp(1-(weights.viseme_sil||0)),morphs=recipeMorphs(weights);const level=clamp((lastVadDb+62)/36)*speech;return {morphs,shape:stableResult.name||'sil',level,detail:`${Math.round((stableResult.prob||0)*100)}% · Δ${(stableResult.margin||0).toFixed(2)} · 2nd ${stableResult.second||'—'}`}}

let active='wl',morph=blankMorphs();
function selectModel(which){active=which;$('wlBtn').classList.toggle('selected',which==='wl');$('haBtn').classList.toggle('selected',which==='ha');$('activeModel').textContent=which==='wl'?'wLipSync':'HeadAudio Stabilized';$('hudModel').textContent=which==='wl'?'WLIPSYNC':'HEADAUDIO STABLE'}
function aggregate(m,...keys){return Math.max(...keys.map(k=>m[k]||0),0)}
function setBar(id,v){const e=$(id);if(e)e.style.width=`${clamp(v)*100}%`}
function applyMorphState(target){for(const k of MORPH_KEYS)morph[k]=lerp(morph[k],target.morphs[k]||0,.30);if(faceReady){for(const {solid,wire} of renderMeshes){for(const m of [solid,wire]){if(!m.morphTargetInfluences)continue;for(const k of MORPH_KEYS)m.morphTargetInfluences[MI[k]]=morph[k]}wire.visible=$('wire').checked}}setBar('mJaw',morph.jawOpen);setBar('mFunnel',morph.mouthFunnel);setBar('mPucker',morph.mouthPucker);setBar('mPress',aggregate(morph,'mouthPress_L','mouthPress_R'));setBar('mDimple',aggregate(morph,'mouthDimple_L','mouthDimple_R'));setBar('mRoll',aggregate(morph,'mouthRollLower','mouthRollUpper'));setBar('mLower',aggregate(morph,'mouthLowerDown_L','mouthLowerDown_R'));setBar('mUpper',aggregate(morph,'mouthUpperUp_L','mouthUpperUp_R'));setBar('mForward',morph.jawForward);setBar('mStretch',aggregate(morph,'mouthStretch_L','mouthStretch_R'));$('meterFill').style.width=`${clamp(target.level)*100}%`;$('shapeOut').textContent=String(target.shape||'—').toUpperCase();$('hudShape').textContent=String(target.shape||'—').toUpperCase();$('hudTemporal').textContent=active==='ha'?target.detail:'5-VOWEL';window.LipSync3DOutput={model:active,shape:target.shape,morphs:{...morph},level:target.level,detail:target.detail,stable:active==='ha'?{...stableResult}:null}}

$('wlBtn').onclick=()=>selectModel('wl');$('haBtn').onclick=()=>selectModel('ha');$('permissionBtn').onclick=askMic;$('micBtn').onclick=startMic;$('silenceBtn').onclick=calibrateSilence;
function setView(name){const views=portrait()?{front:[0,4,48],three:[20,4,43],side:[45,4,8]}:{front:[0,-.3,43],three:[22,1,36],side:[39,.5,5]};const [x,y,z]=views[name];camera.position.set(x,y,z);controls.target.set(0,portrait()?4:.6,3);controls.update()}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=renderer.getPixelRatio();if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}}
const clock=new THREE.Clock();let last=performance.now();
function animate(now){requestAnimationFrame(animate);const dt=Math.min(50,now-last);last=now;resize();controls.update();haNode?.update(dt);applyMorphState(active==='wl'?wLipState():headAudioState());const t=clock.getElapsedTime();headRig.rotation.y=$('drift').checked?Math.sin(t*.19)*.018:0;renderer.render(scene,camera)}
selectModel('wl');bootHead();requestAnimationFrame(animate);
