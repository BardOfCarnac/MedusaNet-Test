import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const FACEKIT='https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const TARGETS=[
  'jawOpen','jawForward','mouthFunnel','mouthPucker','mouthRollLower','mouthRollUpper',
  'mouthUpperUp_L','mouthUpperUp_R','mouthShrugUpper','mouthLowerDown_L','mouthLowerDown_R',
  'mouthDimple_L','mouthDimple_R','mouthPress_L','mouthPress_R'
];
const INDEX=Object.fromEntries(TARGETS.map((n,i)=>[n,i]));
const JAW=new Set(['jawOpen','jawForward']);
const LIPS=TARGETS.filter(n=>!JAW.has(n));

const VISEMES={
  sil:{},
  aa:{jawOpen:.60},
  E:{mouthPress_L:.80,mouthPress_R:.80,mouthDimple_L:1,mouthDimple_R:1,jawOpen:.30},
  I:{mouthPress_L:.60,mouthPress_R:.60,mouthDimple_L:.60,mouthDimple_R:.60,jawOpen:.20},
  O:{mouthPucker:1,jawForward:.60,jawOpen:.20},
  U:{mouthFunnel:1},
  PP:{mouthRollLower:.80,mouthRollUpper:.80,mouthUpperUp_L:.30,mouthUpperUp_R:.30},
  FF:{mouthPucker:1,mouthShrugUpper:1,mouthLowerDown_L:.20,mouthLowerDown_R:.20,mouthDimple_L:1,mouthDimple_R:1,mouthRollLower:1},
  DD:{mouthPress_L:.80,mouthPress_R:.80,mouthFunnel:.50,jawOpen:.20},
  SS:{mouthPress_L:.80,mouthPress_R:.80,mouthLowerDown_L:.50,mouthLowerDown_R:.50,jawOpen:.10},
  TH:{mouthRollUpper:.60,jawOpen:.20},
  CH:{mouthPucker:.50,jawOpen:.20},
  RR:{mouthPucker:.50,jawOpen:.20},
  kk:{mouthLowerDown_L:.40,mouthLowerDown_R:.40,mouthDimple_L:.30,mouthDimple_R:.30,mouthFunnel:.30,mouthPucker:.30,jawOpen:.15},
  nn:{mouthLowerDown_L:.40,mouthLowerDown_R:.40,mouthDimple_L:.30,mouthDimple_R:.30,mouthFunnel:.30,mouthPucker:.30,jawOpen:.15}
};
const VISEME_ORDER=['sil','PP','FF','TH','DD','kk','CH','SS','nn','RR','aa','E','I','O','U'];
const ARTICULATION_TRIM={sil:1,PP:1.08,FF:.78,TH:.95,DD:.96,kk:.98,CH:.90,SS:.95,nn:.98,RR:.90,aa:.94,E:.82,I:.90,O:.82,U:.88};
const BASE_VECTORS=Object.fromEntries(Object.entries(VISEMES).map(([name,recipe])=>{const v=new Float32Array(TARGETS.length);for(const [shape,value] of Object.entries(recipe)){const i=INDEX[shape];if(i!==undefined)v[i]=value;}return [name,v];}));

const ANCHOR='anchor',SECONDARY='secondary',HOLD='hold';
const C=.095,V=.18;
const WORDS=[
 ['Father',[
   ['f','FF',C,ANCHOR],['ɑː','aa',V,ANCHOR],
   ['ð','TH',C,SECONDARY,.34,{mouthRollLower:.24,mouthDimple_L:.10,mouthDimple_R:.10}],
   ['ə','E',.13,SECONDARY,.28,{mouthRollLower:.10,mouthDimple_L:.05,mouthDimple_R:.05}],
   ['r','RR',C,SECONDARY,.36,{mouthPucker:.10,mouthRollLower:.08}]
 ]],
 ['packed',[['p','PP',C,ANCHOR],['æ','aa',V,ANCHOR],['k','kk',C,SECONDARY,.22],['t','DD',C,SECONDARY,.18]]],
 ['five',[['f','FF',C,ANCHOR],['aɪ · open','aa',.12,ANCHOR],['aɪ · close','I',.12,ANCHOR],['v','FF',C,ANCHOR]]],
 ['bright',[['b','PP',C,ANCHOR],['r','RR',C,SECONDARY,.30],['aɪ · open','aa',.12,ANCHOR],['aɪ · close','I',.12,ANCHOR],['t','DD',C,SECONDARY,.18]]],
 ['blue',[['b','PP',C,ANCHOR],['l','DD',C,SECONDARY,.18],['uː','U',V,ANCHOR]]],
 ['puppets',[['p','PP',C,ANCHOR],['ʌ','aa',.15,ANCHOR],['p','PP',C,ANCHOR],['ɪ','I',.13,ANCHOR],['t','DD',C,SECONDARY,.16],['s','SS',C,SECONDARY,.14]]],
 ['in',[['ɪ','I',.14,HOLD],['n','nn',C,HOLD]]],
 ['a',[['ə','E',.13,HOLD]]],
 ['good',[['g','kk',C,SECONDARY,.20],['ʊ','U',.15,ANCHOR],['d','DD',C,SECONDARY,.18]]],
 ['box',[['b','PP',C,ANCHOR],['ɒ','O',.16,ANCHOR],['k','kk',C,SECONDARY,.20],['s','SS',C,SECONDARY,.15]]],
 ['then',[['ð','TH',C,SECONDARY,.27],['ɛ','E',.15,SECONDARY,.38],['n','nn',C,SECONDARY,.16]]],
 ['Joe',[['dʒ','CH',.11,SECONDARY,.38],['oʊ · round','O',.13,ANCHOR],['oʊ · close','U',.13,ANCHOR]]],
 ['chose',[['tʃ','CH',.11,SECONDARY,.38],['oʊ · round','O',.13,ANCHOR],['oʊ · close','U',.13,ANCHOR],['z','SS',C,SECONDARY,.15]]],
 ['three',[['θ','TH',C,SECONDARY,.27],['r','RR',C,SECONDARY,.31],['iː','I',V,ANCHOR]]],
 ['sheep',[['ʃ','CH',.11,SECONDARY,.34],['iː','I',V,ANCHOR],['p','PP',C,ANCHOR]]],
 ['by',[['b','PP',C,ANCHOR],['aɪ · open','aa',.12,ANCHOR],['aɪ · close','I',.12,ANCHOR]]],
 ['the',[['ð','TH',C,SECONDARY,.20],['ə','E',.13,HOLD]]],
 ['old',[['oʊ · round','O',.13,ANCHOR],['oʊ · close','U',.13,ANCHOR],['l','DD',C,SECONDARY,.18],['d','DD',C,SECONDARY,.17]]],
 ['gate',[['g','kk',C,SECONDARY,.20],['eɪ · open','E',.13,SECONDARY,.38],['eɪ · close','I',.13,ANCHOR],['t','DD',C,SECONDARY,.18]]]
];

// Measured from the saved 8.34 s recording. These windows deliberately keep the
// real silence after "box" and the smaller pause before "by the old gate" instead
// of stretching a synthetic phoneme clock over the whole sentence.
const WORD_TIMES={
  Father:[.70,1.06], packed:[1.10,1.44], five:[1.50,1.85], bright:[1.95,2.27],
  blue:[2.31,2.61], puppets:[2.64,2.99], in:[3.00,3.18], a:[3.18,3.34],
  good:[3.34,3.55], box:[3.60,3.83], then:[4.63,4.92], Joe:[4.93,5.22],
  chose:[5.24,5.65], three:[5.65,5.97], sheep:[5.98,6.24], by:[6.43,6.60],
  the:[6.60,6.70], old:[6.70,6.89], gate:[6.98,7.19]
};
const CLIP_END=8.34;
const WORD_WINDOWS=Object.values(WORD_TIMES);

function gestureProfile(viseme,visual,word,phoneme){
  let anticipation=.028,radius=.16,lip=1,jaw=.90,priority=1;
  if(viseme==='PP'){anticipation=.070;radius=.105;priority=1.55;jaw=.55;}
  else if(viseme==='FF'){anticipation=.050;radius=.120;priority=1.25;jaw=.65;}
  else if(viseme==='O'||viseme==='U'){anticipation=.060;radius=.205;priority=1.12;}
  else if(viseme==='CH'){anticipation=.045;radius=.135;}
  else if(viseme==='RR'){anticipation=.035;radius=.145;}
  else if(['aa','E','I'].includes(viseme)){anticipation=.035;radius=.185;}
  if(visual===SECONDARY){lip=.26;jaw=.34;priority=.75;radius=Math.min(radius,.14);}
  if(visual===HOLD){lip=.055;jaw=.24;priority=.55;radius=.14;}
  if(word==='in'||word==='a'){lip=.018;jaw=phoneme==='n'?.10:.32;priority=.45;}
  return {anticipation,radius,lip,jaw,priority};
}

const SEGMENTS=[];
for(const [word,seq] of WORDS){
  const [ws,we]=WORD_TIMES[word];
  const weights=seq.map(e=>e[2]),sum=weights.reduce((a,b)=>a+b,0);
  let t=ws;
  for(let i=0;i<seq.length;i++){
    const [phoneme,viseme,w,visual,weight,overlay]=seq[i];
    const end=i===seq.length-1?we:t+(we-ws)*w/sum;
    const profile=gestureProfile(viseme,visual,word,phoneme);
    SEGMENTS.push({word,phoneme,viseme,visual,weight,overlay,start:t,end,center:(t+end)/2-profile.anticipation,...profile});
    t=end;
  }
}

const canvas=document.querySelector('#stage'),status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x050507);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x050507,.012);
const camera=new THREE.PerspectiveCamera(34,1,.1,500);camera.position.set(0,1.5,43);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.target.set(0,1.4,2.4);controls.enablePan=false;controls.minDistance=24;controls.maxDistance=75;
const key=new THREE.DirectionalLight(0xff1d31,6.5);key.position.set(-7,22,15);scene.add(key);scene.add(new THREE.AmbientLight(0x380006,.055));

const faceMat=new THREE.MeshStandardMaterial({color:0xb40a19,roughness:.92,metalness:0});
const darkMat=new THREE.MeshBasicMaterial({color:0x030001});
const mouthMat=new THREE.MeshStandardMaterial({color:0x250307,roughness:1});
const teethMat=new THREE.MeshStandardMaterial({color:0x7d343b,roughness:.9});
const loader=new OBJLoader();let baseRoot=null,baseMeshes=[],ready=false;
const current=new Float32Array(TARGETS.length),target=new Float32Array(TARGETS.length);

function meshes(root){const a=[];root.traverse(o=>{if(o.isMesh)a.push(o);});return a;}
function materialFor(m){const n=String(m?.name||'').toLowerCase();if(n.includes('sclera')||n.includes('iris')||n.includes('eyeocclusion')||n.includes('eyeblend')||n.includes('lacrimal')||n.includes('eyelash'))return darkMat.clone();if(n.includes('teeth'))return teethMat.clone();if(n.includes('gum')||n.includes('tongue')||n.includes('mouth'))return mouthMat.clone();return faceMat.clone();}
function applyMaterials(mesh){const src=Array.isArray(mesh.material)?mesh.material:[mesh.material],out=src.map(materialFor);mesh.material=Array.isArray(mesh.material)?out:out[0];mesh.castShadow=true;mesh.receiveShadow=true;}
function loadObj(name){return new Promise((res,rej)=>loader.load(FACEKIT+name,res,undefined,rej));}
function prepare(root){baseMeshes=meshes(root);baseMeshes.forEach(m=>{if(!m.geometry.attributes.normal)m.geometry.computeVertexNormals();m.geometry.morphAttributes=m.geometry.morphAttributes||{};m.geometry.morphAttributes.position=[];m.geometry.morphTargetsRelative=false;applyMaterials(m);});}
function counterpart(base,targets,index){if(base.name){const hit=targets.find(m=>m.name===base.name&&m.geometry.attributes.position.count===base.geometry.attributes.position.count);if(hit)return hit;}const same=targets[index];return same&&same.geometry.attributes.position.count===base.geometry.attributes.position.count?same:null;}
function attach(root,morphIndex){const ts=meshes(root);let matched=0;baseMeshes.forEach((b,i)=>{const t=counterpart(b,ts,i);if(!t)return;b.geometry.morphAttributes.position[morphIndex]=t.geometry.attributes.position.clone();matched++;});if(!matched)throw new Error('No compatible geometry for '+TARGETS[morphIndex]);}
function frameModel(){const box=new THREE.Box3().setFromObject(baseRoot),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=22/Math.max(size.x,size.y);baseRoot.scale.setScalar(scale);baseRoot.position.set(-center.x*scale,-center.y*scale+1.4,-center.z*scale+2.5);}
function applyMorphs(){baseMeshes.forEach(m=>{if(!m.morphTargetInfluences)m.updateMorphTargets();if(!m.morphTargetInfluences)return;for(let i=0;i<TARGETS.length;i++)m.morphTargetInfluences[i]=current[i];});}

function masterArticulation(){return Number(document.querySelector('#articulation')?.value||.70);}
function recipeScale(name){return THREE.MathUtils.clamp(masterArticulation()*(ARTICULATION_TRIM[name]??1),0,1.12);}
function recipeVector(name){const base=BASE_VECTORS[name]||BASE_VECTORS.sil,out=new Float32Array(TARGETS.length),scale=recipeScale(name);for(let i=0;i<out.length;i++)out[i]=base[i]*scale;return out;}
function smoothKernel(t,center,radius){const d=Math.abs(t-center)/radius;if(d>=1)return 0;const x=1-d;return x*x*(3-2*x);}
function isInsideWord(t){return WORD_WINDOWS.some(([a,b])=>t>=a&&t<=b);}
function isConnectedSpeech(t){return WORD_WINDOWS.some(([a,b])=>t>=a-.055&&t<=b+.055);}
function rawPoseAt(t){
  const out=new Float32Array(TARGETS.length),lipNum=new Float32Array(TARGETS.length),jawNum=new Float32Array(TARGETS.length);
  const connected=isConnectedSpeech(t);let lipDen=connected ? .055 : 1.10,jawDen=connected ? .05 : 1.25;
  for(const e of SEGMENTS){
    const k=smoothKernel(t,e.center,e.radius);if(k<=0)continue;
    const recipe=BASE_VECTORS[e.viseme]||BASE_VECTORS.sil,scale=recipeScale(e.viseme),base=k*e.priority;
    const lw=base*e.lip*(e.visual===SECONDARY?(e.weight??.28)/.28:1);
    const jw=base*e.jaw*(e.visual===SECONDARY?Math.max(.7,(e.weight??.28)/.28):1);
    lipDen+=lw;jawDen+=jw;
    for(const name of LIPS){const i=INDEX[name];lipNum[i]+=recipe[i]*scale*lw;}
    for(const name of JAW){const i=INDEX[name];jawNum[i]+=recipe[i]*scale*jw;}
    if(e.overlay){
      const ow=k*masterArticulation();
      for(const [name,value] of Object.entries(e.overlay)){const i=INDEX[name];if(i===undefined)continue;if(JAW.has(name))jawNum[i]+=value*ow*jw;else lipNum[i]+=value*ow*lw;}
    }
  }
  for(const name of LIPS){const i=INDEX[name];out[i]=THREE.MathUtils.clamp(lipNum[i]/lipDen,0,1.15);}
  for(const name of JAW){const i=INDEX[name];out[i]=THREE.MathUtils.clamp(jawNum[i]/jawDen,0,1.15);}
  return out;
}

const LIP_HOLD={start:2.985,end:3.335,blend:.055};
const heldLipPose=()=>rawPoseAt(LIP_HOLD.start-.012);
function poseAt(t){
  const out=rawPoseAt(t);
  if(t>=LIP_HOLD.start-LIP_HOLD.blend&&t<=LIP_HOLD.end+LIP_HOLD.blend){
    const hold=heldLipPose();let amount=1;
    if(t<LIP_HOLD.start)amount=THREE.MathUtils.smoothstep(t,LIP_HOLD.start-LIP_HOLD.blend,LIP_HOLD.start);
    else if(t>LIP_HOLD.end)amount=1-THREE.MathUtils.smoothstep(t,LIP_HOLD.end,LIP_HOLD.end+LIP_HOLD.blend);
    for(const name of LIPS){const i=INDEX[name];out[i]=THREE.MathUtils.lerp(out[i],hold[i],amount);}
  }
  return out;
}
function segmentAt(t){
  let best=null;
  for(const e of SEGMENTS){if(t>=e.start&&t<e.end)return e;if(!best||Math.abs(t-e.center)<Math.abs(t-best.center))best=e;}
  return best;
}
function updateReadout(t,forced=null){
  if(forced){document.querySelector('#word').textContent='MANUAL';document.querySelector('#phoneme').textContent='—';document.querySelector('#viseme').textContent=forced;document.querySelector('#visual').textContent='FORCED REFERENCE';return;}
  const e=segmentAt(t);
  if(e)selectedIndex=Math.max(0,SEGMENTS.indexOf(e));
  if(!e||!isInsideWord(t)){document.querySelector('#word').textContent='—';document.querySelector('#phoneme').textContent='silence';document.querySelector('#viseme').textContent='SIL';document.querySelector('#visual').textContent='REST';return;}
  document.querySelector('#word').textContent=e.word;document.querySelector('#phoneme').textContent=e.phoneme;document.querySelector('#viseme').textContent=e.viseme;document.querySelectorAll('[data-viseme]').forEach(b=>b.classList.toggle('active',b.dataset.viseme===e.viseme));
  const prep=Math.round(e.anticipation*1000),kind=e.visual===ANCHOR?'ANCHOR':e.visual===SECONDARY?'OVERLAP':'INTERNAL';
  document.querySelector('#visual').textContent=`${kind} · PREP ${prep}ms`;
}
function setTimelineTime(t){timelineTime=THREE.MathUtils.clamp(Number(t)||0,0,CLIP_END);const p=poseAt(timelineTime);for(let i=0;i<target.length;i++)target[i]=p[i];updateReadout(timelineTime);}

let timelineTime=0,playing=false,lastNow=performance.now(),selectedIndex=0,external=false;
function play(){if(!ready||external)return;if(timelineTime>=CLIP_END-.03)timelineTime=0;playing=true;document.querySelector('#play').classList.add('active');}
function pause(){playing=false;document.querySelector('#play').classList.remove('active');}
function step(d){pause();selectedIndex=Math.max(0,Math.min(SEGMENTS.length-1,selectedIndex+d));setTimelineTime(SEGMENTS[selectedIndex].center);}
function setViseme(name){pause();external=false;const r=recipeVector(name);for(let i=0;i<target.length;i++)target[i]=r[i];updateReadout(0,name);document.querySelectorAll('[data-viseme]').forEach(b=>b.classList.toggle('active',b.dataset.viseme===name));}

for(const name of VISEME_ORDER){const b=document.createElement('button');b.textContent=name.toUpperCase();b.dataset.viseme=name;b.disabled=true;b.addEventListener('click',()=>setViseme(name));document.querySelector('#visemeButtons').appendChild(b);}
document.querySelector('#play').addEventListener('click',play);
document.querySelector('#pause').addEventListener('click',pause);
document.querySelector('#prev').addEventListener('click',()=>step(-1));
document.querySelector('#next').addEventListener('click',()=>step(1));
document.querySelector('#speed').addEventListener('input',e=>{document.querySelector('#speedOut').value=Math.round(Number(e.target.value)*100)+'%';});
document.querySelector('#articulation').addEventListener('input',e=>{document.querySelector('#articulationOut').value=Math.round(Number(e.target.value)*100)+'%';setTimelineTime(timelineTime);});

window.goldSpeech={
  get ready(){return ready;},get time(){return timelineTime;},get clipEnd(){return CLIP_END;},
  setExternalTime(t){external=true;playing=false;setTimelineTime(t);},
  releaseExternal(){external=false;},
  pause(){pause();},
  reset(){external=false;pause();selectedIndex=0;setTimelineTime(0);}
};

async function boot(){
  try{
    status.textContent='LOADING NEUTRAL HEAD…';baseRoot=await loadObj('generic_neutral_mesh.obj');prepare(baseRoot);scene.add(baseRoot);frameModel();
    status.textContent='HEAD READY · LOADING SPEECH SHAPES…';
    for(let i=0;i<TARGETS.length;i++){status.textContent=`HEAD READY · SPEECH SHAPE ${i+1}/${TARGETS.length} · ${TARGETS[i]}`;attach(await loadObj(TARGETS[i]+'.obj'),i);await new Promise(r=>requestAnimationFrame(r));}
    baseMeshes.forEach(m=>m.updateMorphTargets());ready=true;document.querySelectorAll('button').forEach(b=>b.disabled=false);status.textContent='READY · RECORDED TIMING / BIDIRECTIONAL CO-ARTICULATION';setTimelineTime(0);window.dispatchEvent(new Event('goldspeechready'));
  }catch(err){console.error(err);status.textContent='LOAD FAILED · '+err.message;}
}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
function animate(now){
  requestAnimationFrame(animate);resize();controls.update();
  const dt=Math.min(.05,(now-lastNow)/1000);lastNow=now;
  if(playing&&!external){const speed=Number(document.querySelector('#speed').value)||.55;timelineTime+=dt*speed;if(timelineTime>=CLIP_END){timelineTime=CLIP_END;pause();}setTimelineTime(timelineTime);}
  const speed=Number(document.querySelector('#speed').value)||.55;
  const tau=.045,alpha=1-Math.exp(-Math.max(.001,dt*speed)/tau);let moving=false;
  for(let i=0;i<current.length;i++){const n=THREE.MathUtils.lerp(current[i],target[i],alpha);if(Math.abs(n-current[i])>.0001)moving=true;current[i]=n;}
  if(moving)applyMorphs();renderer.render(scene,camera);
}
boot();requestAnimationFrame(animate);
