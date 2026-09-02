import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const $=id=>document.getElementById(id);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const MODEL_STORAGE='voice-face-direct-speaker-model-v1';
const WL_URL='../voice-face-puppet-wlipsync/wlipsync-calibrated.js';
const WL_PROFILE='https://cdn.jsdelivr.net/gh/mrxz/wLipSync@177f3ac4095dbad81be0a800a8c6f975abe4ae04/example/profile.json';
const WL_STORAGE='voiceFacePuppet.wlipsyncProfile.v1';
const VOWELS=['A','E','I','O','U'];

const FACEKIT='https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const MORPH_FILES={jawOpen:'jawOpen.obj',jawForward:'jawForward.obj',mouthFunnel:'mouthFunnel.obj',mouthPucker:'mouthPucker.obj',mouthStretch_L:'mouthStretch_L.obj',mouthStretch_R:'mouthStretch_R.obj'};
const MORPH_KEYS=Object.keys(MORPH_FILES),MORPHS=MORPH_KEYS.map(k=>MORPH_FILES[k]),MI=Object.fromEntries(MORPH_KEYS.map((k,i)=>[k,i]));
const blankMorphs=()=>Object.fromEntries(MORPH_KEYS.map(k=>[k,0]));
const vowelPose={
  A:{jawOpen:.92,mouthStretch_L:.18,mouthStretch_R:.18},
  E:{jawOpen:.48,mouthStretch_L:.82,mouthStretch_R:.82},
  I:{jawOpen:.25,mouthStretch_L:1,mouthStretch_R:1},
  O:{jawOpen:.62,mouthFunnel:1,mouthPucker:.58,jawForward:.16,mouthStretch_L:.08,mouthStretch_R:.08},
  U:{jawOpen:.18,mouthFunnel:.58,mouthPucker:1,jawForward:.10,mouthStretch_L:.05,mouthStretch_R:.05}
};

const c={gain:$('gain'),mouthEx:$('mouthEx'),gate:$('gate'),ema:$('ema')};
const outs={gain:$('gainOut'),mouthEx:$('mouthExOut'),gate:$('gateOut'),ema:$('emaOut')};
function updateOutputs(){outs.gain.textContent=(+c.gain.value).toFixed(2);outs.mouthEx.textContent=(+c.mouthEx.value).toFixed(2);outs.gate.textContent=`${c.gate.value} dB`;outs.ema.textContent=(+c.ema.value).toFixed(2)}
Object.values(c).forEach(e=>e.addEventListener('input',updateOutputs));updateOutputs();

let personalModel=null;
function readSavedModel(){try{return JSON.parse(localStorage.getItem(MODEL_STORAGE)||'null')}catch{return null}}
function validateModel(m){
  if(!m||m.format!=='single-speaker-direct-vowel-v1')throw new Error('That is not a compatible direct-speaker model.');
  const a=m.audio,f=m.feature,k=m.classifier;
  if(!a||!f||!k||a.targetSampleRate!==16000||a.fftSize!==512||a.nMels!==24)throw new Error('Model audio configuration is incompatible.');
  if(!Array.isArray(m.melFilterbank)||m.melFilterbank.length!==24)throw new Error('Model mel filterbank is missing.');
  if(!Array.isArray(k.classes)||k.classes.length!==5||!Array.isArray(k.mean)||!Array.isArray(k.scale))throw new Error('Model classifier is incomplete.');
  return m;
}
function setModel(m,persist=true){
  personalModel=validateModel(m);
  if(persist)localStorage.setItem(MODEL_STORAGE,JSON.stringify(personalModel));
  $('directBtn').disabled=false;
  $('modelReadout').textContent=`MY VOICE · ${personalModel.classifier.classes.join(' / ')} · ${personalModel.feature.contextFrames*10} ms context`;
}
const saved=readSavedModel();if(saved){try{setModel(saved,false)}catch(e){console.warn(e)}}

function fftRadix2(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
  for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr0=Math.cos(ang),wi0=Math.sin(ang);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<(len>>1);j++){const uR=re[i+j],uI=im[i+j],k=i+j+(len>>1),vR=re[k]*wr-im[k]*wi,vI=re[k]*wi+im[k]*wr;re[i+j]=uR+vR;im[i+j]=uI+vI;re[k]=uR-vR;im[k]=uI-vI;const nr=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nr}}}
}
class DirectFeatureStream{
  constructor(model,inputRate,onOutput){this.m=model;this.inputRate=inputRate;this.targetRate=model.audio.targetSampleRate;this.ratio=inputRate/this.targetRate;this.resample=[];this.pos=0;this.samples=[];this.history=[];this.prevProb=null;this.onOutput=onOutput;this.hann=Float64Array.from({length:model.audio.frameLength},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(model.audio.frameLength-1)))}
  push(input){for(let i=0;i<input.length;i++)this.resample.push(input[i]);while(this.pos+1<this.resample.length){const i=Math.floor(this.pos),f=this.pos-i;this.samples.push(this.resample[i]*(1-f)+this.resample[i+1]*f);this.pos+=this.ratio}const drop=Math.floor(this.pos);if(drop>0){this.resample.splice(0,drop);this.pos-=drop}const frame=this.m.audio.frameLength,hop=this.m.audio.hopLength;while(this.samples.length>=frame){this.processFrame(this.samples.slice(0,frame));this.samples.splice(0,hop)}}
  processFrame(frame){
    const N=this.m.audio.fftSize,re=new Float64Array(N),im=new Float64Array(N);let ss=0;for(let i=0;i<frame.length;i++){const v=frame[i];ss+=v*v;re[i]=v*this.hann[i]}fftRadix2(re,im);
    const bins=N/2+1,pow=new Float64Array(bins);for(let k=0;k<bins;k++)pow[k]=re[k]*re[k]+im[k]*im[k];const lm=new Float64Array(this.m.audio.nMels);
    for(let j=0;j<lm.length;j++){const filt=this.m.melFilterbank[j];let s=0;for(let k=0;k<bins;k++)s+=filt[k]*pow[k];lm[j]=10*Math.log10(Math.max(s,1e-12))}
    const rms=Math.sqrt(ss/frame.length+1e-12),db=20*Math.log10(rms+1e-12);this.history.push(Array.from(lm));if(this.history.length>this.m.feature.contextFrames)this.history.shift();
    if(this.history.length<this.m.feature.contextFrames){this.onOutput({weights:{A:0,E:0,I:0,O:0,U:0},db,confidence:0,shape:'REST'});return}
    const h=this.history,feat=[];for(const [a,b] of this.m.feature.bins){for(let j=0;j<lm.length;j++){let s=0;for(let i=a;i<b;i++)s+=h[i][j];feat.push(s/(b-a))}}for(let j=0;j<lm.length;j++)feat.push(h[h.length-1][j]);for(let j=0;j<lm.length;j++)feat.push(h[h.length-1][j]-h[0][j]);
    const k=this.m.classifier,z=new Float64Array(feat.length);for(let i=0;i<feat.length;i++)z[i]=(feat[i]-k.mean[i])/(k.scale[i]||1);const scores=new Float64Array(k.classes.length);let max=-Infinity;for(let ci=0;ci<k.classes.length;ci++){let s=k.intercept[ci];const row=k.coef[ci];for(let i=0;i<z.length;i++)s+=row[i]*z[i];scores[ci]=s;if(s>max)max=s}
    let sum=0;const p=new Float64Array(scores.length);for(let i=0;i<scores.length;i++){p[i]=Math.exp(scores[i]-max);sum+=p[i]}for(let i=0;i<p.length;i++)p[i]/=sum;const alpha=+c.ema.value;if(!this.prevProb)this.prevProb=Float64Array.from(p);else for(let i=0;i<p.length;i++)this.prevProb[i]=(1-alpha)*this.prevProb[i]+alpha*p[i];
    const active=db>=+c.gate.value,w={A:0,E:0,I:0,O:0,U:0};let bi=0;for(let i=1;i<this.prevProb.length;i++)if(this.prevProb[i]>this.prevProb[bi])bi=i;if(active){for(let i=0;i<k.classes.length;i++){const cls=k.classes[i],v=this.prevProb[i];if(cls==='aa')w.A=v;else if(cls in w)w[cls]=v}}
    this.onOutput({weights:w,db,confidence:active?this.prevProb[bi]:0,shape:active?(k.classes[bi]==='aa'?'A':k.classes[bi]):'REST'});
  }
}

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
const meshList=root=>{const a=[];root.traverse(o=>{if(o.isMesh)a.push(o)});return a},materialsOf=m=>Array.isArray(m)?m:[m];let baseMeshes=[],renderMeshes=[],faceReady=false;
function setStatus(text,kind=''){if($('status'))$('status').textContent=text;if($('statusDot'))$('statusDot').className='statusDot'+(kind?` ${kind}`:'')}
function solidMaterial(base){const n=String(materialsOf(base.material)[0]?.name||'').toLowerCase();let color=0x440b12,em=0x250307,rough=.72;if(n.includes('sclera')){color=0x85515a;em=0x150305;rough=.5}else if(n.includes('iris')){color=0x160206;em=0x080001}else if(n.includes('teeth')){color=0x8b6c70;em=0x140708;rough=.55}else if(n.includes('gum')||n.includes('tongue')||n.includes('mouth')){color=0x30040a;em=0x170105}return new THREE.MeshStandardMaterial({color,emissive:em,roughness:rough,metalness:.04,transparent:true,opacity:.28,side:THREE.FrontSide})}
function prepareBase(root){baseMeshes=meshList(root);for(const b of baseMeshes){if(!b.geometry.attributes.normal)b.geometry.computeVertexNormals();b.geometry.morphAttributes=b.geometry.morphAttributes||{};b.geometry.morphAttributes.position=[];b.geometry.morphTargetsRelative=false}}
function findCounterpart(base,targets,index){if(base.name){const h=targets.find(m=>m.name===base.name&&m.geometry.attributes.position.count===base.geometry.attributes.position.count);if(h)return h}const s=targets[index];return s&&s.geometry.attributes.position.count===base.geometry.attributes.position.count?s:null}
function attachTarget(root,index){const targets=meshList(root);let matched=0;baseMeshes.forEach((base,i)=>{const t=findCounterpart(base,targets,i);if(!t)return;base.geometry.morphAttributes.position[index]=t.geometry.attributes.position.clone();matched++});if(!matched)throw new Error(`No compatible geometry for ${MORPHS[index]}`)}
function buildHead(){renderMeshes=[];baseMeshes.forEach(base=>{const holder=new THREE.Group();holder.position.copy(base.position);holder.rotation.copy(base.rotation);holder.scale.copy(base.scale);const solid=new THREE.Mesh(base.geometry,solidMaterial(base)),wire=new THREE.Mesh(base.geometry,new THREE.MeshBasicMaterial({color:0xff2638,wireframe:true,transparent:true,opacity:.32,depthWrite:false}));solid.updateMorphTargets();wire.updateMorphTargets();wire.renderOrder=2;holder.add(solid,wire);headRig.add(holder);renderMeshes.push({solid,wire})});const box=new THREE.Box3().setFromObject(headRig),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=(portrait()?15.5:23)/Math.max(size.x,size.y);headRig.scale.setScalar(scale);headRig.position.set(-center.x*scale,-center.y*scale+(portrait()?4:.8),-center.z*scale+2.8)}
async function bootHead(){try{setStatus('LOADING NEUTRAL / ~2.6 MB');prepareBase(await loadObj('generic_neutral_mesh.obj'));for(let i=0;i<MORPHS.length;i++){setStatus(`LOADING FACEKIT MOUTH MORPH ${i+1}/${MORPHS.length}`);attachTarget(await loadObj(MORPHS[i]),i);await new Promise(r=>requestAnimationFrame(r))}buildHead();faceReady=true;setStatus('DIRECT 3D HEAD READY / WAITING FOR MIC','ready')}catch(e){console.error(e);setStatus(`HEAD LOAD FAILED / ${e?.message||'UNKNOWN'}`,'error')}}

let wlLib=null,stockWl=null,wlProfile=null;
const wlReady=Promise.all([import(WL_URL),fetch(WL_PROFILE).then(r=>{if(!r.ok)throw new Error('wLip profile '+r.status);return r.json()})]).then(([m,p])=>{wlLib=m;stockWl=p;try{wlProfile=JSON.parse(localStorage.getItem(WL_STORAGE)||'null')||p}catch{wlProfile=p}}).catch(e=>console.error(e));
let audioCtx=null,stream=null,source=null,script=null,zeroGain=null,directStream=null,wlNode=null,mic=false,mode=personalModel?'direct':'wl';
let directState={weights:{A:0,E:0,I:0,O:0,U:0},db:-100,confidence:0,shape:'REST'};
function selectMode(m){if(m==='direct'&&!personalModel)return;mode=m;$('directBtn').classList.toggle('selected',m==='direct');$('wlBtn').classList.toggle('selected',m==='wl');$('activeModel').textContent=m==='direct'?'Direct speaker':'wLipSync';$('hudModel').textContent=m==='direct'?'DIRECT':'WLIPSYNC'}
$('directBtn').onclick=()=>selectMode('direct');$('wlBtn').onclick=()=>selectMode('wl');selectMode(mode);
$('modelFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{setModel(JSON.parse(await f.text()),true);selectMode('direct');$('micStatus').textContent='Personal direct model loaded and saved locally.'}catch(err){$('micStatus').textContent=err.message}finally{e.target.value=''}});
$('clearModelBtn').onclick=()=>{localStorage.removeItem(MODEL_STORAGE);personalModel=null;$('directBtn').disabled=true;$('modelReadout').textContent='No personal model loaded yet.';selectMode('wl');$('micStatus').textContent='Local direct model removed.'};
async function askMic(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());$('micStatus').textContent='Microphone permission granted.'}catch(e){$('micStatus').textContent=e?.message||'Microphone permission denied.'}}
async function startMic(){if(mic){stopMic();return}$('micBtn').disabled=true;$('micBtn').textContent='STARTING…';try{await wlReady;stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});audioCtx=new AudioContext();await audioCtx.resume();source=audioCtx.createMediaStreamSource(stream);if(personalModel){directStream=new DirectFeatureStream(personalModel,audioCtx.sampleRate,o=>directState=o);script=audioCtx.createScriptProcessor(2048,1,1);script.onaudioprocess=e=>directStream?.push(e.inputBuffer.getChannelData(0));zeroGain=audioCtx.createGain();zeroGain.gain.value=0;source.connect(script);script.connect(zeroGain);zeroGain.connect(audioCtx.destination)}if(wlLib&&wlProfile){wlNode=await wlLib.createWLipSyncNode(audioCtx,wlProfile);wlNode.smoothness=.055;source.connect(wlNode)}mic=true;$('micBtn').textContent='MIC OFF';$('micBtn').classList.add('selected');$('micStatus').textContent=personalModel?'Both models are listening to the same microphone.':'wLipSync is live. Load your fitted model to enable Direct.';setStatus('DIRECT + WLIPSYNC LIVE','ready')}catch(e){console.error(e);$('micStatus').textContent=e.message||'Could not start microphone.';stopMic(false)}finally{$('micBtn').disabled=false}}
function stopMic(update=true){mic=false;try{source?.disconnect()}catch{};try{script?.disconnect()}catch{};try{zeroGain?.disconnect()}catch{};try{wlNode?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());source=script=zeroGain=wlNode=directStream=stream=null;audioCtx?.close().catch(()=>{});audioCtx=null;directState={weights:{A:0,E:0,I:0,O:0,U:0},db:-100,confidence:0,shape:'REST'};$('micBtn').textContent='MIC ON';$('micBtn').classList.remove('selected');if(update)$('micStatus').textContent='Microphone stopped.';if(faceReady)setStatus('DIRECT 3D HEAD READY / WAITING FOR MIC','ready')}
$('permissionBtn').onclick=askMic;$('micBtn').onclick=startMic;

function directSample(){const w={...directState.weights},v=clamp(((directState.db-(+c.gate.value))/26)*(+c.gain.value));return{w,v,shape:directState.shape,confidence:directState.confidence}}
function wlSample(){if(!wlNode)return{w:{A:0,E:0,I:0,O:0,U:0},v:0,shape:'REST',confidence:0};const w={A:0,E:0,I:0,O:0,U:0};let best='REST',bv=0;for(const k of VOWELS){w[k]=clamp(+wlNode.weights[k]||0);if(w[k]>bv){bv=w[k];best=k}}const v=clamp((wlNode.volume||0)*(+c.gain.value));return{w,v,shape:v>.04?best:'REST',confidence:bv}}
function morphsFromSample(s){const out=blankMorphs(),sum=VOWELS.reduce((a,k)=>a+(s.w[k]||0),0);if(sum>.0001){for(const k of VOWELS){const n=(s.w[k]||0)/sum,p=vowelPose[k];for(const [m,val] of Object.entries(p))out[m]=(out[m]||0)+n*val}}const strength=clamp(s.v*(+c.mouthEx.value));for(const k of MORPH_KEYS)out[k]=clamp((out[k]||0)*strength);return out}
let morph=blankMorphs();
function setBar(id,v){const e=$(id);if(e)e.style.width=`${clamp(v)*100}%`}
function applySample(s){const target=morphsFromSample(s);for(const k of MORPH_KEYS)morph[k]=lerp(morph[k],target[k]||0,.30);if(faceReady){for(const {solid,wire} of renderMeshes){for(const m of [solid,wire]){if(!m.morphTargetInfluences)continue;for(const k of MORPH_KEYS)m.morphTargetInfluences[MI[k]]=morph[k]}wire.visible=$('wire').checked}}setBar('mJaw',morph.jawOpen);setBar('mFunnel',morph.mouthFunnel);setBar('mPucker',morph.mouthPucker);setBar('mForward',morph.jawForward);setBar('mStretch',Math.max(morph.mouthStretch_L||0,morph.mouthStretch_R||0));$('meterFill').style.width=`${clamp(s.v)*100}%`;$('shapeOut').textContent=s.shape;$('hudShape').textContent=s.shape;$('hudConfidence').textContent=`${Math.round((s.confidence||0)*100)}%`;for(const k of VOWELS){const v=mode==='direct'?(directState.weights[k]||0):0;$('bar'+k).style.width=`${clamp(v)*100}%`;$('val'+k).textContent=v.toFixed(2)}}
function setView(name){const views=portrait()?{front:[0,4,48],three:[20,4,43],side:[45,4,8]}:{front:[0,-.3,43],three:[22,1,36],side:[39,.5,5]};const [x,y,z]=views[name];camera.position.set(x,y,z);controls.target.set(0,portrait()?4:.6,3);controls.update()}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=renderer.getPixelRatio();if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}}
const clock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);resize();controls.update();const s=mode==='direct'?directSample():wlSample();applySample(s);const t=clock.getElapsedTime();headRig.rotation.y=$('drift').checked?Math.sin(t*.19)*.018:0;renderer.render(scene,camera)}
bootHead();requestAnimationFrame(animate);
