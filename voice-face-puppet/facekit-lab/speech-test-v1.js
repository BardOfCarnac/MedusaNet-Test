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

// Connected speech is not binary. ANCHOR owns the mouth; SECONDARY visibly pulls
// the current posture toward a sound without replacing it; HOLD genuinely leaves
// the lips alone. This is much closer to co-articulation than the old freeze model.
const ANCHOR='anchor',SECONDARY='secondary',HOLD='hold',GAP='gap';

const C=.095,V=.18,D=.07;
const WORDS=[
 ['Father',[
   ['f','FF',C,ANCHOR],
   ['ɑː','aa',V,ANCHOR],
   // User-observed articulation: the tail of "father" visibly retracts/rolls
   // the lower lip rather than freezing after /ɑː/.
   ['ð','TH',C,SECONDARY,.34,{mouthRollLower:.24,mouthDimple_L:.10,mouthDimple_R:.10}],
   ['ə','E',.13,SECONDARY,.28,{mouthRollLower:.10,mouthDimple_L:.05,mouthDimple_R:.05}],
   ['r','RR',C,SECONDARY,.36,{mouthPucker:.10,mouthRollLower:.08}]
 ]],
 ['packed',[['p','PP',C,ANCHOR],['æ','aa',V,ANCHOR],['k','kk',C,SECONDARY,.22],['t','DD',C,SECONDARY,.18]]],
 ['five',[['f','FF',C,ANCHOR],['aɪ · open','aa',.12,ANCHOR],['aɪ · close','I',.12,ANCHOR],['v','FF',C,ANCHOR]]],
 ['bright',[['b','PP',C,ANCHOR],['r','RR',C,SECONDARY,.30],['aɪ · open','aa',.12,ANCHOR],['aɪ · close','I',.12,ANCHOR],['t','DD',C,SECONDARY,.18]]],
 ['blue',[['b','PP',C,ANCHOR],['l','DD',C,SECONDARY,.18],['uː','U',V,ANCHOR]]],
 ['puppets',[['p','PP',C,ANCHOR],['ʌ','aa',.15,ANCHOR],['p','PP',C,ANCHOR],['ɪ','I',.13,ANCHOR],['t','DD',C,SECONDARY,.16],['s','SS',C,SECONDARY,.14]]],
 // This is deliberately quiet because the user's lips barely alter across "in a".
 // It stays quiet because these events inherit the current posture, not because
 // every tongue-heavy consonant elsewhere has been suppressed.
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

const EVENTS=[{word:'—',phoneme:'silence',viseme:'sil',duration:.24,visual:'rest'}];
for(const [word,seq] of WORDS){
  for(const [phoneme,viseme,duration,visual,weight,overlay] of seq)EVENTS.push({word,phoneme,viseme,duration,visual,weight,overlay});
  EVENTS.push({word:'',phoneme:'connected gap',viseme:'sil',duration:D,visual:GAP});
}
EVENTS.push({word:'—',phoneme:'silence',viseme:'sil',duration:.3,visual:'rest'});

// Saved sample recovered from the user's previous diagnostic. The original clip
// contains about 0.84 s lead-in and finishes speaking around 7.40 s. We scale our
// deterministic articulation timeline across that spoken window, so changing
// playbackRate never breaks audio/face sync.
const VOICE_START=.84,VOICE_END=7.40;
const voiceSample=new Audio('./voice-sample.webm?v=1');
voiceSample.preload='auto';
const speechTimeline=[];let speechIdealDuration=0;
for(let i=1;i<EVENTS.length-1;i++){
  const start=speechIdealDuration,end=start+EVENTS[i].duration;
  speechTimeline.push({index:i,start,end});speechIdealDuration=end;
}
function eventIndexForVoiceTime(t){
  if(t<VOICE_START)return 0;
  if(t>=VOICE_END)return EVENTS.length-1;
  const local=(t-VOICE_START)/(VOICE_END-VOICE_START)*speechIdealDuration;
  let lo=0,hi=speechTimeline.length-1;
  while(lo<=hi){const m=(lo+hi)>>1,s=speechTimeline[m];if(local<s.start)hi=m-1;else if(local>=s.end)lo=m+1;else return s.index;}
  return speechTimeline[Math.max(0,Math.min(speechTimeline.length-1,lo))]?.index??0;
}

const canvas=document.querySelector('#stage'),status=document.querySelector('#status'),audioState=document.querySelector('#audioState');
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
const current=new Float32Array(TARGETS.length),target=new Float32Array(TARGETS.length),heldTarget=new Float32Array(TARGETS.length);

function meshes(root){const a=[];root.traverse(o=>{if(o.isMesh)a.push(o);});return a;}
function materialFor(m){const n=String(m?.name||'').toLowerCase();if(n.includes('sclera')||n.includes('iris')||n.includes('eyeocclusion')||n.includes('eyeblend')||n.includes('lacrimal')||n.includes('eyelash'))return darkMat.clone();if(n.includes('teeth'))return teethMat.clone();if(n.includes('gum')||n.includes('tongue')||n.includes('mouth'))return mouthMat.clone();return faceMat.clone();}
function applyMaterials(mesh){const src=Array.isArray(mesh.material)?mesh.material:[mesh.material],out=src.map(materialFor);mesh.material=Array.isArray(mesh.material)?out:out[0];mesh.castShadow=true;mesh.receiveShadow=true;}
function loadObj(name){return new Promise((res,rej)=>loader.load(FACEKIT+name,res,undefined,rej));}
function prepare(root){baseMeshes=meshes(root);baseMeshes.forEach(m=>{if(!m.geometry.attributes.normal)m.geometry.computeVertexNormals();m.geometry.morphAttributes=m.geometry.morphAttributes||{};m.geometry.morphAttributes.position=[];m.geometry.morphTargetsRelative=false;applyMaterials(m);});}
function counterpart(base,targets,index){if(base.name){const hit=targets.find(m=>m.name===base.name&&m.geometry.attributes.position.count===base.geometry.attributes.position.count);if(hit)return hit;}const same=targets[index];return same&&same.geometry.attributes.position.count===base.geometry.attributes.position.count?same:null;}
function attach(root,morphIndex){const ts=meshes(root);let matched=0;baseMeshes.forEach((b,i)=>{const t=counterpart(b,ts,i);if(!t)return;b.geometry.morphAttributes.position[morphIndex]=t.geometry.attributes.position.clone();matched++;});if(!matched)throw new Error('No compatible geometry for '+TARGETS[morphIndex]);}
function frameModel(){const box=new THREE.Box3().setFromObject(baseRoot),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=22/Math.max(size.x,size.y);baseRoot.scale.setScalar(scale);baseRoot.position.set(-center.x*scale,-center.y*scale+1.4,-center.z*scale+2.5);}
function applyMorphs(){baseMeshes.forEach(m=>{if(!m.morphTargetInfluences)m.updateMorphTargets();if(!m.morphTargetInfluences)return;for(let i=0;i<TARGETS.length;i++)m.morphTargetInfluences[i]=current[i];});}

let activeViseme='sil';
function masterArticulation(){return Number(document.querySelector('#articulation')?.value||.70);}
function articulationFor(name){return THREE.MathUtils.clamp(masterArticulation()*(ARTICULATION_TRIM[name]??1),0,1.12);}
function recipeVector(name){const out=new Float32Array(TARGETS.length),strength=articulationFor(name);for(const [shape,value] of Object.entries(VISEMES[name]||{})){const i=INDEX[shape];if(i!==undefined)out[i]=value*strength;}return out;}
function copyVector(dst,src){for(let i=0;i<dst.length;i++)dst[i]=src[i];}
function blendVector(dst,a,b,t){for(let i=0;i<dst.length;i++)dst[i]=THREE.MathUtils.lerp(a[i],b[i],t);}
function secondaryVector(e){
  const recipe=recipeVector(e.viseme),out=new Float32Array(TARGETS.length);
  blendVector(out,heldTarget,recipe,e.weight??.28);
  const master=masterArticulation();
  for(const [shape,value] of Object.entries(e.overlay||{})){
    const i=INDEX[shape];
    if(i!==undefined)out[i]=THREE.MathUtils.clamp(out[i]+value*master,0,1.15);
  }
  return out;
}
function visualLabel(e){
  if(e.visual===ANCHOR)return `ANCHOR · ${e.viseme}`;
  if(e.visual===SECONDARY)return `SECONDARY ${Math.round((e.weight??.28)*100)}% · ${e.viseme}`;
  if(e.visual===HOLD)return 'HOLD';
  if(e.visual===GAP)return 'CONNECTED';
  return 'REST';
}
function applyEventVisual(e){
  activeViseme=e.viseme;
  if(e.visual===ANCHOR){
    const r=recipeVector(e.viseme);copyVector(target,r);copyVector(heldTarget,r);
  }else if(e.visual===SECONDARY){
    const r=secondaryVector(e);copyVector(target,r);copyVector(heldTarget,r);
  }else if(e.visual===HOLD){
    copyVector(target,heldTarget);
  }else if(e.visual===GAP){
    for(let i=0;i<heldTarget.length;i++)heldTarget[i]*=.985;
    copyVector(target,heldTarget);
  }else{
    target.fill(0);heldTarget.fill(0);
  }
  document.querySelectorAll('[data-viseme]').forEach(b=>b.classList.toggle('active',b.dataset.viseme===e.viseme));
}
function setViseme(name,manual=false){
  activeViseme=name;const r=recipeVector(name);copyVector(target,r);copyVector(heldTarget,r);
  document.querySelectorAll('[data-viseme]').forEach(b=>b.classList.toggle('active',b.dataset.viseme===name));
  if(manual){playing=false;voiceSample.pause();document.querySelector('#play').classList.remove('active');document.querySelector('#word').textContent='MANUAL';document.querySelector('#phoneme').textContent='—';document.querySelector('#viseme').textContent=name;document.querySelector('#visual').textContent='FORCED ANCHOR';if(audioState)audioState.textContent='PAUSED';}
}

let eventIndex=0,playing=false,eventUntil=0,audioFallback=false;
function showEvent(i){eventIndex=Math.max(0,Math.min(EVENTS.length-1,i));const e=EVENTS[eventIndex];applyEventVisual(e);document.querySelector('#word').textContent=e.word||'·';document.querySelector('#phoneme').textContent=e.phoneme;document.querySelector('#viseme').textContent=e.viseme;document.querySelector('#visual').textContent=visualLabel(e);}
function schedule(now){const speed=Number(document.querySelector('#speed').value)||.55;eventUntil=now+EVENTS[eventIndex].duration*1000/speed;}
function play(){
  if(!ready)return;
  const speed=Number(document.querySelector('#speed').value)||.55;
  if(eventIndex>=EVENTS.length-1||voiceSample.ended||voiceSample.currentTime>=(voiceSample.duration||8.35)-.05){voiceSample.currentTime=0;showEvent(0);}
  voiceSample.playbackRate=speed;
  playing=true;audioFallback=false;document.querySelector('#play').classList.add('active');if(audioState)audioState.textContent='PLAYING SAVED SAMPLE';
  voiceSample.play().catch(err=>{console.warn('Voice sample playback failed; using silent timing.',err);audioFallback=true;schedule(performance.now());if(audioState)audioState.textContent='AUDIO BLOCKED · SILENT FALLBACK';});
}
function pause(){playing=false;voiceSample.pause();document.querySelector('#play').classList.remove('active');if(audioState)audioState.textContent='PAUSED';}
function step(d){pause();showEvent(eventIndex+d);}

voiceSample.addEventListener('canplay',()=>{if(audioState&&!playing)audioState.textContent='SAVED SAMPLE READY';});
voiceSample.addEventListener('ended',()=>{playing=false;showEvent(EVENTS.length-1);document.querySelector('#play').classList.remove('active');if(audioState)audioState.textContent='SAVED SAMPLE READY';});
voiceSample.addEventListener('error',()=>{if(audioState)audioState.textContent='VOICE SAMPLE FAILED';});

for(const name of VISEME_ORDER){const b=document.createElement('button');b.textContent=name.toUpperCase();b.dataset.viseme=name;b.disabled=true;b.addEventListener('click',()=>setViseme(name,true));document.querySelector('#visemeButtons').appendChild(b);}
document.querySelector('#play').addEventListener('click',play);
document.querySelector('#pause').addEventListener('click',pause);
document.querySelector('#prev').addEventListener('click',()=>step(-1));
document.querySelector('#next').addEventListener('click',()=>step(1));
document.querySelector('#speed').addEventListener('input',e=>{const speed=Number(e.target.value);document.querySelector('#speedOut').value=Math.round(speed*100)+'%';voiceSample.playbackRate=speed;if(audioFallback&&playing)schedule(performance.now());});
document.querySelector('#articulation').addEventListener('input',e=>{document.querySelector('#articulationOut').value=Math.round(Number(e.target.value)*100)+'%';if(eventIndex>=0)applyEventVisual(EVENTS[eventIndex]);});

async function boot(){try{status.textContent='LOADING NEUTRAL HEAD…';baseRoot=await loadObj('generic_neutral_mesh.obj');prepare(baseRoot);for(let i=0;i<TARGETS.length;i++){status.textContent=`LOADING SPEECH SHAPE ${i+1}/${TARGETS.length} · ${TARGETS[i]}`;attach(await loadObj(TARGETS[i]+'.obj'),i);await new Promise(r=>requestAnimationFrame(r));}baseMeshes.forEach(m=>m.updateMorphTargets());scene.add(baseRoot);frameModel();ready=true;document.querySelectorAll('button').forEach(b=>b.disabled=false);status.textContent='READY · CONNECTED SPEECH / SAVED VOICE SYNC';showEvent(0);}catch(err){console.error(err);status.textContent='LOAD FAILED · '+err.message;}}
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
function animate(now){
  requestAnimationFrame(animate);resize();controls.update();
  if(playing){
    if(!audioFallback&&!voiceSample.paused){const synced=eventIndexForVoiceTime(voiceSample.currentTime);if(synced!==eventIndex)showEvent(synced);}
    else if(audioFallback&&now>=eventUntil){if(eventIndex<EVENTS.length-1){showEvent(eventIndex+1);schedule(now);}else pause();}
  }
  let moving=false;for(let i=0;i<current.length;i++){const n=THREE.MathUtils.lerp(current[i],target[i],.24);if(Math.abs(n-current[i])>.0001)moving=true;current[i]=n;}if(moving)applyMorphs();renderer.render(scene,camera);
}
boot();requestAnimationFrame(animate);
