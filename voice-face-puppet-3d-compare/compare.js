import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const FACEKIT='https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const MORPHS=['jawOpen.obj','mouthClose.obj','mouthFunnel.obj','mouthPucker.obj','mouthStretch_L.obj','mouthStretch_R.obj'];
const MI={jaw:0,close:1,funnel:2,pucker:3,stretchL:4,stretchR:5};

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

const $=id=>document.getElementById(id);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

const canvas=$('stage');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0x040406,1);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x050507,.014);
const portrait=()=>innerWidth<=700||innerHeight>innerWidth*1.1;
const camera=new THREE.PerspectiveCamera(34,1,.1,500);
camera.position.set(0,portrait()?4:-.3,portrait()?48:43);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=false;
controls.minDistance=24;controls.maxDistance=80;controls.target.set(0,portrait()?4:.6,3);

scene.add(new THREE.HemisphereLight(0x7b1d27,0x050507,.7));
const key=new THREE.DirectionalLight(0xff4d5d,1.55);key.position.set(-7,10,16);scene.add(key);
const rim=new THREE.DirectionalLight(0x63101b,.95);rim.position.set(12,2,-10);scene.add(rim);

const headRig=new THREE.Group();scene.add(headRig);
const gridMat=new THREE.LineBasicMaterial({color:0x53131b,transparent:true,opacity:.18});
function grid(size=110,div=11){
  const p=[],h=size/2,g=new THREE.BufferGeometry();
  for(let i=0;i<=div;i++){const t=-h+size*i/div;p.push(-h,0,t,h,0,t,t,0,-h,t,0,h)}
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  return new THREE.LineSegments(g,gridMat.clone());
}
const floor=grid();floor.position.set(0,-14,-10);scene.add(floor);
const back=grid();back.rotation.x=Math.PI/2;back.position.set(0,18,-28);back.material.opacity=.08;scene.add(back);

const loader=new OBJLoader();
const loadObj=name=>new Promise((resolve,reject)=>loader.load(FACEKIT+name,resolve,undefined,reject));
const meshList=root=>{const a=[];root.traverse(o=>{if(o.isMesh)a.push(o)});return a};
const materialsOf=m=>Array.isArray(m)?m:[m];
let baseMeshes=[],renderMeshes=[],faceReady=false;

function setStatus(text,kind=''){
  $('status').textContent=text;
  $('statusDot').className='statusDot'+(kind?` ${kind}`:'');
}
function matName(base){return String(materialsOf(base.material)[0]?.name||'').toLowerCase()}
function solidMaterial(base){
  const n=matName(base);
  let color=0x440b12,em=0x250307,rough=.72;
  if(n.includes('sclera')){color=0x85515a;em=0x150305;rough=.5}
  else if(n.includes('iris')){color=0x160206;em=0x080001}
  else if(n.includes('teeth')){color=0x8b6c70;em=0x140708;rough=.55}
  else if(n.includes('gum')||n.includes('tongue')||n.includes('mouth')){color=0x30040a;em=0x170105}
  return new THREE.MeshStandardMaterial({color,emissive:em,roughness:rough,metalness:.04,transparent:true,opacity:.28,side:THREE.FrontSide});
}
function prepareBase(root){
  baseMeshes=meshList(root);
  for(const b of baseMeshes){
    if(!b.geometry.attributes.normal)b.geometry.computeVertexNormals();
    b.geometry.morphAttributes=b.geometry.morphAttributes||{};
    b.geometry.morphAttributes.position=[];
    b.geometry.morphTargetsRelative=false;
  }
}
function findCounterpart(base,targets,index){
  if(base.name){
    const hit=targets.find(m=>m.name===base.name&&m.geometry.attributes.position.count===base.geometry.attributes.position.count);
    if(hit)return hit;
  }
  const same=targets[index];
  return same&&same.geometry.attributes.position.count===base.geometry.attributes.position.count?same:null;
}
function attachTarget(root,index){
  const targets=meshList(root);let matches=0;
  baseMeshes.forEach((base,i)=>{
    const target=findCounterpart(base,targets,i);
    if(!target)return;
    base.geometry.morphAttributes.position[index]=target.geometry.attributes.position.clone();
    matches++;
  });
  if(!matches)throw new Error(`No compatible geometry for ${MORPHS[index]}`);
}
function buildHead(){
  renderMeshes=[];
  baseMeshes.forEach(base=>{
    const holder=new THREE.Group();
    holder.position.copy(base.position);holder.rotation.copy(base.rotation);holder.scale.copy(base.scale);
    const solid=new THREE.Mesh(base.geometry,solidMaterial(base));
    const wire=new THREE.Mesh(base.geometry,new THREE.MeshBasicMaterial({color:0xff2638,wireframe:true,transparent:true,opacity:.32,depthWrite:false}));
    solid.updateMorphTargets();wire.updateMorphTargets();wire.renderOrder=2;
    holder.add(solid,wire);headRig.add(holder);renderMeshes.push({solid,wire});
  });
  const box=new THREE.Box3().setFromObject(headRig),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const scale=(portrait()?15.5:23)/Math.max(size.x,size.y);
  headRig.scale.setScalar(scale);
  headRig.position.set(-center.x*scale,-center.y*scale+(portrait()?4:.8),-center.z*scale+2.8);
}
async function bootHead(){
  try{
    setStatus('LOADING NEUTRAL / ~2.6 MB');
    prepareBase(await loadObj('generic_neutral_mesh.obj'));
    for(let i=0;i<MORPHS.length;i++){
      setStatus(`LOADING MOUTH MORPH ${i+1}/${MORPHS.length}`);
      attachTarget(await loadObj(MORPHS[i]),i);
      await new Promise(r=>requestAnimationFrame(r));
    }
    buildHead();faceReady=true;
    setStatus('HEAD READY / WAITING FOR MIC','ready');
  }catch(e){console.error(e);setStatus('HEAD LOAD FAILED','error')}
}

function loadJSON(key,fallback){try{return Object.assign({},fallback,JSON.parse(localStorage.getItem(key)||'{}'))}catch{return structuredClone(fallback)}}
const personal=loadJSON(HA_PERSONAL,{prototypes:{},speakerMean:150});personal.prototypes=personal.prototypes||{};
const temporal=loadJSON(HA_TEMP,{templates:{}});temporal.templates=temporal.templates||{};
let wlSaved=null;try{wlSaved=JSON.parse(localStorage.getItem(WL_STORAGE)||'null')}catch{}
function updateProfileInfo(){
  $('profileInfo').textContent=`wLipSync: ${wlSaved?'PERSONAL':'stock'} · HeadAudio: ${Object.keys(personal.prototypes).length} Gaussian + ${Object.keys(temporal.templates).length} temporal saved`;
}
updateProfileInfo();

let wlLib=null,HeadAudio=null,stockWlProfile=null;
let wlLoadError=null,haLoadError=null;
const wlReady=Promise.all([
  import(WL_MODULE),
  fetch(WL_PROFILE).then(r=>{if(!r.ok)throw new Error(`profile ${r.status}`);return r.json()})
]).then(([m,p])=>{wlLib=m;stockWlProfile=p}).catch(e=>{wlLoadError=e;console.error(e)});
const haReady=import(HA_MODULE).then(m=>HeadAudio=m.HeadAudio).catch(e=>{haLoadError=e;console.error(e)});

let stream=null,audioCtx=null,source=null,wlNode=null,haNode=null,mic=false;
const haNames=['aa','E','I','O','U','PP','SS','TH','DD','FF','kk','nn','RR','CH','sil'];
const haRaw=Object.fromEntries(haNames.map(n=>[`viseme_${n}`,0]));
const haFinal=Object.fromEntries(haNames.map(n=>[`viseme_${n}`,0]));
let haRawActive=14,lastVadDb=-100,featureHistory=[],override=null,lastTriggerAt=-Infinity,lastScore=null;
function applyPrototype(p){
  if(!haNode||!p)return;
  haNode.port.postMessage({event:'model',model:[{
    phoneme:p.code||p.name?.slice(0,2)||'x',group:p.group,viseme:p.viseme,
    mu:new Float32Array(p.mu),sigmaInvLower:new Float32Array(p.sigmaInvLower)
  }]});
}
function applyPersonal(){for(const p of Object.values(personal.prototypes))applyPrototype(p)}

function meanVec(records,a,b){
  const out=new Array(12).fill(0);let n=0;
  for(let i=Math.max(0,a);i<Math.min(records.length,b);i++){for(let j=0;j<12;j++)out[j]+=records[i].v[j];n++}
  if(!n)return null;for(let j=0;j<12;j++)out[j]/=n;return out;
}
function meanDb(records,a,b){let s=0,n=0;for(let i=Math.max(0,a);i<Math.min(records.length,b);i++){s+=records[i].db;n++}return n?s/n:-100}
function descriptor(records,i){
  if(i<4||i+3>=records.length)return null;
  const pre=meanVec(records,i-3,i),attack=meanVec(records,i,i+2),after=meanVec(records,i+2,i+4);
  if(!pre||!attack||!after)return null;
  const pDb=meanDb(records,i-3,i),aDb=meanDb(records,i,i+2),zDb=meanDb(records,i+2,i+4),floor=meanDb(records,Math.max(0,i-10),Math.max(1,i-5));
  return [...pre,...attack,...after,(aDb-pDb)/20,(zDb-aDb)/20,(zDb-pDb)/20,(Math.max(aDb,zDb)-floor)/40];
}
function distDesc(x,m,v){
  let s=0,n=0;
  for(let i=0;i<x.length;i++){const z=x[i]-m[i],den=Math.max(v[i],i<36?.012:.02);s+=z*z/den;n++}
  return s/n;
}
function evaluateTemporal(){
  if(featureHistory.length<12||!Object.keys(temporal.templates).length)return;
  const i=featureHistory.length-4;if(i<5)return;
  const r=featureHistory,db=r[i].db,base=Math.min(...r.slice(Math.max(0,i-4),i).map(x=>x.db)),rise=db-base;
  if(db<-57||rise<1.8)return;
  const now=performance.now();if(now-lastTriggerAt<110)return;
  const d=descriptor(r,i);if(!d)return;
  let best=null;
  for(const q of Object.values(temporal.templates)){
    if(!q?.mean||!q?.variance||!Number.isFinite(q.threshold))continue;
    const score=distDesc(d,q.mean,q.variance),ratio=score/q.threshold;
    if(!best||ratio<best.ratio)best={q,score,ratio};
  }
  lastScore=best;
  if(best&&best.ratio<=1){
    lastTriggerAt=now;
    override={visemeIndex:best.q.visemeIndex,label:best.q.label,until:now+90,ratio:best.ratio};
  }
}
function onFeature(o){
  if(!o?.vector||o.vector.length!==12)return;
  const rec={v:Array.from(o.vector),db:10*(o.le||-10),t:performance.now()};
  featureHistory.push(rec);if(featureHistory.length>80)featureHistory.splice(0,featureHistory.length-80);
  evaluateTemporal();
}
function composeHeadAudio(now){
  for(const k of Object.keys(haFinal))haFinal[k]=haRaw[k]||0;
  let index=haRawActive;
  if(override&&now<override.until){
    const n=haNames[override.visemeIndex];
    for(const k of Object.keys(haFinal))haFinal[k]*=.22;
    if(n)haFinal[`viseme_${n}`]=1;
    index=override.visemeIndex;
  }else if(override)override=null;
  return {weights:haFinal,index,shape:haNames[index]||'sil',temporal:override?.label||null};
}

async function startMic(){
  if(mic){stopMic();return}
  $('micBtn').disabled=true;$('micBtn').textContent='STARTING…';
  try{
    await Promise.all([wlReady,haReady]);
    if(!wlLib)throw wlLoadError||new Error('wLipSync failed to load');
    if(!HeadAudio)throw haLoadError||new Error('HeadAudio failed to load');
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    audioCtx=new AudioContext();await audioCtx.resume();source=audioCtx.createMediaStreamSource(stream);

    const wlProfile=wlSaved||stockWlProfile;
    wlNode=await wlLib.createWLipSyncNode(audioCtx,wlProfile);wlNode.smoothness=.055;source.connect(wlNode);

    await audioCtx.audioWorklet.addModule(HA_WORKLET);
    haNode=new HeadAudio(audioCtx,{processorOptions:{vadEventsEnabled:true,featureEventsEnabled:true,visemeEventsEnabled:true},parameterData:{vadMode:1,vadGateActiveDb:-40,vadGateInactiveDb:-50,silMode:1,silCalibrationWindowSec:3,silSensitivity:1.2,speakerMeanHz:personal.speakerMean||150}});
    await haNode.loadModel(HA_MODEL);
    haNode.onvalue=(k,v)=>{if(k in haRaw)haRaw[k]=clamp(v)};
    haNode.onvad=o=>{if(Number.isFinite(o.db))lastVadDb=o.db};
    haNode.onviseme=o=>{if(Number.isInteger(o.viseme))haRawActive=o.viseme};
    haNode.onfeature=onFeature;
    haNode.oncalibrated=o=>{
      $('silenceBtn').disabled=false;$('silenceBtn').textContent='CALIBRATE HEADAUDIO SILENCE';
      $('micStatus').textContent=o?.error?`Silence calibration failed: ${o.error}`:'HeadAudio silence calibrated for this room.';
    };
    source.connect(haNode);applyPersonal();

    mic=true;$('micBtn').textContent='MIC OFF';$('micBtn').classList.add('selected');
    $('micStatus').textContent='Both trackers are live on the same microphone stream.';
    setStatus('HEAD + BOTH TRACKERS LIVE','ready');
  }catch(e){
    console.error(e);$('micStatus').textContent=e?.message||'Could not start microphone.';stopMic(false);
  }finally{$('micBtn').disabled=false}
}
function stopMic(update=true){
  mic=false;
  try{source?.disconnect()}catch{};try{wlNode?.disconnect()}catch{};try{haNode?.disconnect()}catch{}
  stream?.getTracks().forEach(t=>t.stop());stream=source=wlNode=haNode=null;
  audioCtx?.close().catch(()=>{});audioCtx=null;featureHistory=[];override=null;lastVadDb=-100;haRawActive=14;
  for(const k of Object.keys(haRaw))haRaw[k]=haFinal[k]=0;
  $('micBtn').textContent='MIC ON';$('micBtn').classList.remove('selected');if(update)$('micStatus').textContent='Microphone stopped.';
  if(faceReady)setStatus('HEAD READY / WAITING FOR MIC','ready');
}
async function askMic(){
  try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());$('micStatus').textContent='Microphone permission granted.'}
  catch(e){$('micStatus').textContent=e?.message||'Microphone permission denied.'}
}
function calibrateSilence(){
  if(!haNode){$('micStatus').textContent='Turn the microphone on first.';return}
  $('silenceBtn').disabled=true;$('silenceBtn').textContent='STAY QUIET…';$('micStatus').textContent='HeadAudio is listening to three seconds of room silence.';haNode.calibrate();
}

const wlShapes={A:{o:.92,stretch:.18,funnel:0,pucker:0},I:{o:.25,stretch:1,funnel:0,pucker:0},U:{o:.18,stretch:.05,funnel:.28,pucker:1},E:{o:.48,stretch:.82,funnel:0,pucker:0},O:{o:.62,stretch:.08,funnel:1,pucker:.58}};
function wLipState(){
  if(!wlNode)return {jaw:0,close:0,funnel:0,pucker:0,stretch:0,shape:'rest',level:0,temporal:null};
  const raw={A:0,I:0,U:0,E:0,O:0};let sum=0,best=0,shape='rest';
  for(const k of Object.keys(raw)){raw[k]=Math.pow(clamp(+wlNode.weights[k]||0),1.25);sum+=raw[k];if(raw[k]>best){best=raw[k];shape=k}}
  const v=clamp((wlNode.volume||0)*1.18);let o=0,stretch=0,funnel=0,pucker=0;
  if(sum>.0001)for(const k of Object.keys(raw)){const n=raw[k]/sum,s=wlShapes[k];o+=s.o*n;stretch+=s.stretch*n;funnel+=s.funnel*n;pucker+=s.pucker*n}
  return {jaw:clamp(o*v*1.05),close:0,funnel:clamp(funnel*v),pucker:clamp(pucker*v),stretch:clamp(stretch*v),shape:v>.04?shape:'rest',level:v,temporal:null};
}
function headAudioState(now){
  if(!haNode)return {jaw:0,close:0,funnel:0,pucker:0,stretch:0,shape:'sil',level:0,temporal:null};
  const o=composeHeadAudio(now),w=o.weights,g=n=>clamp(w[`viseme_${n}`]||0);
  const jaw=clamp(g('aa')*.95+g('E')*.48+g('I')*.25+g('O')*.68+g('U')*.22+g('DD')*.28+g('kk')*.36+g('nn')*.24+g('RR')*.35+g('CH')*.25+g('TH')*.18+g('SS')*.12);
  const close=clamp(g('PP')*.98+g('FF')*.15);
  const funnel=clamp(g('O')*.9+g('U')*.3+g('CH')*.18+g('RR')*.12);
  const pucker=clamp(g('U')*.96+g('O')*.5+g('RR')*.28+g('CH')*.08);
  const stretch=clamp(g('I')*.9+g('E')*.8+g('SS')*.58+g('TH')*.32+g('FF')*.32+g('DD')*.18);
  const level=clamp((lastVadDb+65)/38);
  return {jaw,close,funnel,pucker,stretch,shape:o.shape,level,temporal:o.temporal};
}

let active='wl';
let morph={jaw:0,close:0,funnel:0,pucker:0,stretch:0};
function selectModel(which){
  active=which;$('wlBtn').classList.toggle('selected',which==='wl');$('haBtn').classList.toggle('selected',which==='ha');
  $('activeModel').textContent=which==='wl'?'wLipSync':'HeadAudio Temporal';$('hudModel').textContent=which==='wl'?'WLIPSYNC':'HEADAUDIO TEMPORAL';
}
function applyMorphState(target){
  const speed=.30;for(const k of Object.keys(morph))morph[k]=lerp(morph[k],target[k]||0,speed);
  if(faceReady){
    for(const {solid,wire} of renderMeshes){
      for(const m of [solid,wire]){
        if(!m.morphTargetInfluences)continue;
        m.morphTargetInfluences[MI.jaw]=morph.jaw;m.morphTargetInfluences[MI.close]=morph.close;m.morphTargetInfluences[MI.funnel]=morph.funnel;m.morphTargetInfluences[MI.pucker]=morph.pucker;m.morphTargetInfluences[MI.stretchL]=morph.stretch;m.morphTargetInfluences[MI.stretchR]=morph.stretch;
      }
      wire.visible=$('wire').checked;
    }
  }
  $('mJaw').style.width=`${morph.jaw*100}%`;$('mClose').style.width=`${morph.close*100}%`;$('mFunnel').style.width=`${morph.funnel*100}%`;$('mPucker').style.width=`${morph.pucker*100}%`;$('mStretch').style.width=`${morph.stretch*100}%`;
  $('meterFill').style.width=`${target.level*100}%`;$('shapeOut').textContent=String(target.shape||'—').toUpperCase();$('hudShape').textContent=String(target.shape||'—').toUpperCase();$('hudTemporal').textContent=target.temporal?`TEMP ${target.temporal}`:'TEMP —';
  window.LipSync3DOutput={model:active,shape:target.shape,morphs:{...morph},level:target.level,temporal:target.temporal||null};
}

$('wlBtn').onclick=()=>selectModel('wl');$('haBtn').onclick=()=>selectModel('ha');$('permissionBtn').onclick=askMic;$('micBtn').onclick=startMic;$('silenceBtn').onclick=calibrateSilence;
function setView(name){
  const views=portrait()?{front:[0,4,48],three:[20,4,43],side:[45,4,8]}:{front:[0,-.3,43],three:[22,1,36],side:[39,.5,5]};
  const [x,y,z]=views[name];camera.position.set(x,y,z);controls.target.set(0,portrait()?4:.6,3);controls.update();
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));

function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=renderer.getPixelRatio();
  if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
}
const clock=new THREE.Clock();let last=performance.now();
function animate(now){
  requestAnimationFrame(animate);const dt=Math.min(50,now-last);last=now;resize();controls.update();if(haNode)haNode.update(dt);
  const state=active==='wl'?wLipState():headAudioState(now);applyMorphState(state);const t=clock.getElapsedTime();headRig.rotation.y=$('drift').checked?Math.sin(t*.19)*.018:0;renderer.render(scene,camera);
}
selectModel('wl');bootHead();requestAnimationFrame(animate);
