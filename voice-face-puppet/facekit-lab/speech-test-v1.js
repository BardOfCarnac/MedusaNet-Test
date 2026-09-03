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

// TalkingHead's ARKit -> Oculus recipes, translated to ICT FaceKit's _L/_R names.
// FaceKit has no tongueOut target, so TH and NN deliberately omit that component.
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

const C=.095,V=.18,D=.07;
const WORDS=[
 ['Father',[['f','FF',C],['ɑː','aa',V],['ð','TH',C],['ə','E',.13],['r','RR',C]]],
 ['packed',[['p','PP',C],['æ','aa',V],['k','kk',C],['t','DD',C]]],
 ['five',[['f','FF',C],['aɪ · open','aa',.12],['aɪ · close','I',.12],['v','FF',C]]],
 ['bright',[['b','PP',C],['r','RR',C],['aɪ · open','aa',.12],['aɪ · close','I',.12],['t','DD',C]]],
 ['blue',[['b','PP',C],['l','DD',C],['uː','U',V]]],
 ['puppets',[['p','PP',C],['ʌ','aa',.15],['p','PP',C],['ɪ','I',.13],['t','DD',C],['s','SS',C]]],
 ['in',[['ɪ','I',.14],['n','nn',C]]],
 ['a',[['ə','E',.13]]],
 ['good',[['g','kk',C],['ʊ','U',.15],['d','DD',C]]],
 ['box',[['b','PP',C],['ɒ','O',.16],['k','kk',C],['s','SS',C]]],
 ['then',[['ð','TH',C],['ɛ','E',.15],['n','nn',C]]],
 ['Joe',[['dʒ','CH',.11],['oʊ · round','O',.13],['oʊ · close','U',.13]]],
 ['chose',[['tʃ','CH',.11],['oʊ · round','O',.13],['oʊ · close','U',.13],['z','SS',C]]],
 ['three',[['θ','TH',C],['r','RR',C],['iː','I',V]]],
 ['sheep',[['ʃ','CH',.11],['iː','I',V],['p','PP',C]]],
 ['by',[['b','PP',C],['aɪ · open','aa',.12],['aɪ · close','I',.12]]],
 ['the',[['ð','TH',C],['ə','E',.13]]],
 ['old',[['oʊ · round','O',.13],['oʊ · close','U',.13],['l','DD',C],['d','DD',C]]],
 ['gate',[['g','kk',C],['eɪ · open','E',.13],['eɪ · close','I',.13],['t','DD',C]]]
];
const EVENTS=[{word:'—',phoneme:'silence',viseme:'sil',duration:.24}];
for(const [word,seq] of WORDS){for(const [phoneme,viseme,duration] of seq)EVENTS.push({word,phoneme,viseme,duration});EVENTS.push({word:'',phoneme:'gap',viseme:'sil',duration:D});}
EVENTS.push({word:'—',phoneme:'silence',viseme:'sil',duration:.3});

const canvas=document.querySelector('#stage'),status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x050507);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
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

function setViseme(name,manual=false){target.fill(0);for(const [shape,value] of Object.entries(VISEMES[name]||{})){const i=INDEX[shape];if(i!==undefined)target[i]=value;}document.querySelectorAll('[data-viseme]').forEach(b=>b.classList.toggle('active',b.dataset.viseme===name));if(manual){playing=false;document.querySelector('#word').textContent='MANUAL';document.querySelector('#phoneme').textContent='—';document.querySelector('#viseme').textContent=name;}}
let eventIndex=0,playing=false,eventUntil=0;
function showEvent(i){eventIndex=Math.max(0,Math.min(EVENTS.length-1,i));const e=EVENTS[eventIndex];setViseme(e.viseme);document.querySelector('#word').textContent=e.word||'·';document.querySelector('#phoneme').textContent=e.phoneme;document.querySelector('#viseme').textContent=e.viseme;}
function schedule(now){const speed=Number(document.querySelector('#speed').value)||.55;eventUntil=now+EVENTS[eventIndex].duration*1000/speed;}
function play(){if(!ready)return;if(eventIndex>=EVENTS.length-1)showEvent(0);playing=true;schedule(performance.now());document.querySelector('#play').classList.add('active');}
function pause(){playing=false;document.querySelector('#play').classList.remove('active');}
function step(d){pause();showEvent(eventIndex+d);}

for(const name of VISEME_ORDER){const b=document.createElement('button');b.textContent=name.toUpperCase();b.dataset.viseme=name;b.disabled=true;b.addEventListener('click',()=>setViseme(name,true));document.querySelector('#visemeButtons').appendChild(b);}
document.querySelector('#play').addEventListener('click',play);document.querySelector('#pause').addEventListener('click',pause);document.querySelector('#prev').addEventListener('click',()=>step(-1));document.querySelector('#next').addEventListener('click',()=>step(1));document.querySelector('#speed').addEventListener('input',e=>{document.querySelector('#speedOut').value=Math.round(Number(e.target.value)*100)+'%';if(playing)schedule(performance.now());});

async function boot(){try{status.textContent='LOADING NEUTRAL HEAD…';baseRoot=await loadObj('generic_neutral_mesh.obj');prepare(baseRoot);for(let i=0;i<TARGETS.length;i++){status.textContent=`LOADING SPEECH SHAPE ${i+1}/${TARGETS.length} · ${TARGETS[i]}`;attach(await loadObj(TARGETS[i]+'.obj'),i);await new Promise(r=>requestAnimationFrame(r));}baseMeshes.forEach(m=>m.updateMorphTargets());scene.add(baseRoot);frameModel();ready=true;document.querySelectorAll('button').forEach(b=>b.disabled=false);status.textContent='READY · PERFECT INPUT / NO MICROPHONE';showEvent(0);}catch(err){console.error(err);status.textContent='LOAD FAILED · '+err.message;}}

function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
function animate(now){requestAnimationFrame(animate);resize();controls.update();if(playing&&now>=eventUntil){if(eventIndex<EVENTS.length-1){showEvent(eventIndex+1);schedule(now);}else pause();}let moving=false;for(let i=0;i<current.length;i++){const n=THREE.MathUtils.lerp(current[i],target[i],.22);if(Math.abs(n-current[i])>.0001)moving=true;current[i]=n;}if(moving)applyMorphs();renderer.render(scene,camera);}
boot();requestAnimationFrame(animate);
