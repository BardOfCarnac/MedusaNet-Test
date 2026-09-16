import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const FACEKIT='https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const $=id=>document.getElementById(id),clamp=(v,a=-1,b=1)=>Math.max(a,Math.min(b,v));
const canvas=$('stage'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x050507,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x050507,.012);
const camera=new THREE.PerspectiveCamera(32,1,.1,500);camera.position.set(18,2.8,42);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.07;controls.enablePan=false;controls.minDistance=24;controls.maxDistance=75;controls.target.set(0,1.4,2.4);
scene.add(new THREE.HemisphereLight(0x74202a,0x030304,.75));
const key=new THREE.DirectionalLight(0xff5364,1.7);key.position.set(-7,11,15);scene.add(key);
const rim=new THREE.DirectionalLight(0x48111a,.85);rim.position.set(11,1,-12);scene.add(rim);
const rig=new THREE.Group();scene.add(rig);
const loader=new OBJLoader();
const loadObj=name=>new Promise((resolve,reject)=>loader.load(FACEKIT+name,resolve,undefined,reject));
const meshList=root=>{const a=[];root.traverse(o=>{if(o.isMesh)a.push(o)});return a};
const mats=m=>Array.isArray(m)?m:[m];
let baseMeshes=[],renderMeshes=[],currentMode=0,currentWeight=.85,sweep=false,sweepStart=0,wireOn=true;
const cache=new Map(),CACHE_MAX=8,visited=new Set();
const STORE='facekit-identity-lab-v1';
let saved={favorites:[],notes:{}};try{saved=Object.assign(saved,JSON.parse(localStorage.getItem(STORE)||'{}'))}catch{}
const favorites=new Set(saved.favorites||[]);
function persist(){localStorage.setItem(STORE,JSON.stringify({favorites:[...favorites],notes:saved.notes||{}}))}
function status(t){$('status').textContent=t}
function materialFor(base){const n=String(mats(base.material)[0]?.name||'').toLowerCase();let color=0x4b0b13,em=0x210205,rough=.68;if(n.includes('sclera')){color=0x83515a;em=0x120304;rough=.48}else if(n.includes('iris')){color=0x140105;em=0x070001}else if(n.includes('teeth')){color=0x8a6e72;em=0x130707;rough=.52}else if(n.includes('gum')||n.includes('tongue')||n.includes('mouth')){color=0x2b0308;em=0x150104}return new THREE.MeshStandardMaterial({color,emissive:em,roughness:rough,metalness:.03,side:THREE.FrontSide})}
function prepare(root){baseMeshes=meshList(root);for(const b of baseMeshes){if(!b.geometry.attributes.normal)b.geometry.computeVertexNormals();const pos=b.geometry.attributes.position;b.geometry.morphAttributes=b.geometry.morphAttributes||{};b.geometry.morphAttributes.position=[pos.clone()];b.geometry.morphTargetsRelative=false}}
function build(){renderMeshes=[];for(const base of baseMeshes){const holder=new THREE.Group();holder.position.copy(base.position);holder.rotation.copy(base.rotation);holder.scale.copy(base.scale);const solid=new THREE.Mesh(base.geometry,materialFor(base));const wire=new THREE.Mesh(base.geometry,new THREE.MeshBasicMaterial({color:0xff3047,wireframe:true,transparent:true,opacity:.24,depthWrite:false}));solid.updateMorphTargets();wire.updateMorphTargets();wire.renderOrder=3;holder.add(solid,wire);rig.add(holder);renderMeshes.push({solid,wire})}const box=new THREE.Box3().setFromObject(rig),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=22/Math.max(size.x,size.y);rig.scale.setScalar(scale);rig.position.set(-center.x*scale,-center.y*scale+1,-center.z*scale+2.5)}
function counterpart(base,targets,index){if(base.name){const hit=targets.find(m=>m.name===base.name&&m.geometry.attributes.position.count===base.geometry.attributes.position.count);if(hit)return hit}const same=targets[index];return same&&same.geometry.attributes.position.count===base.geometry.attributes.position.count?same:null}
function cacheTouch(i,data){cache.delete(i);cache.set(i,data);while(cache.size>CACHE_MAX)cache.delete(cache.keys().next().value)}
function disposeRoot(root){root.traverse(o=>{if(o.isMesh){o.geometry?.dispose?.();for(const m of mats(o.material))m?.dispose?.()}})}
async function fetchMode(i){if(cache.has(i)){const d=cache.get(i);cacheTouch(i,d);return d}const name=`identity${String(i).padStart(3,'0')}.obj`;status(`LOADING ${name.toUpperCase()}…`);const root=await loadObj(name),targets=meshList(root),data=[];baseMeshes.forEach((base,index)=>{const t=counterpart(base,targets,index);data.push(t?new Float32Array(t.geometry.attributes.position.array):new Float32Array(base.geometry.attributes.position.array))});cacheTouch(i,data);disposeRoot(root);return data}
function applyModeData(data){baseMeshes.forEach((base,i)=>{const attr=base.geometry.morphAttributes.position[0];attr.array.set(data[i]);attr.needsUpdate=true});setWeight(currentWeight)}
function setWeight(v){currentWeight=clamp(+v||0);$('weight').value=currentWeight;$('valueOut').textContent=`${currentWeight>=0?'+':''}${currentWeight.toFixed(2)}`;for(const {solid,wire} of renderMeshes){if(solid.morphTargetInfluences)solid.morphTargetInfluences[0]=currentWeight;if(wire.morphTargetInfluences)wire.morphTargetInfluences[0]=currentWeight}}
async function selectMode(i,{keepWeight=false}={}){i=(i+100)%100;currentMode=i;sweep=false;$('sweep').classList.remove('active');$('modeNum').textContent=String(i).padStart(3,'0');if(!keepWeight)setWeight(.85);document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',+b.dataset.mode===i));$('notes').value=saved.notes?.[i]||'';syncFav();try{const data=await fetchMode(i);if(i!==currentMode)return;applyModeData(data);visited.add(i);syncGrid();status(`IDENTITY ${String(i).padStart(3,'0')} READY · ${cache.size} MODE${cache.size===1?'':'S'} CACHED`)}catch(e){console.error(e);status(`MODE ${String(i).padStart(3,'0')} FAILED · ${e.message||e}`)}}
function syncFav(){const on=favorites.has(currentMode);$('fav').textContent=on?'★ STARRED':'☆ STAR MODE';$('fav').classList.toggle('fav',on)}
function syncGrid(){document.querySelectorAll('[data-mode]').forEach(b=>{const i=+b.dataset.mode;b.classList.toggle('visited',visited.has(i));b.classList.toggle('starred',favorites.has(i))})}
function buildGrid(){const f=document.createDocumentFragment();for(let i=0;i<100;i++){const b=document.createElement('button');b.textContent=String(i).padStart(2,'0');b.dataset.mode=i;b.onclick=()=>selectMode(i);f.append(b)}$('grid').append(f);syncGrid()}
function setView(name){const views={front:[0,1.5,44],three:[18,2.8,42],side:[43,1.7,5]};const [x,y,z]=views[name];camera.position.set(x,y,z);controls.target.set(0,1.4,2.4);controls.update();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name))}
$('weight').oninput=e=>{sweep=false;$('sweep').classList.remove('active');setWeight(e.target.value)};
$('prev').onclick=()=>selectMode(currentMode-1);$('next').onclick=()=>selectMode(currentMode+1);$('neutral').onclick=()=>{sweep=false;$('sweep').classList.remove('active');setWeight(0)};
$('sweep').onclick=()=>{sweep=!sweep;sweepStart=performance.now();$('sweep').classList.toggle('active',sweep)};
$('fav').onclick=()=>{favorites.has(currentMode)?favorites.delete(currentMode):favorites.add(currentMode);persist();syncFav();syncGrid()};
$('notes').oninput=e=>{saved.notes=saved.notes||{};saved.notes[currentMode]=e.target.value;persist()};
$('resetView').onclick=()=>setView('three');document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('wire').onclick=()=>{wireOn=!wireOn;$('wire').classList.toggle('active',wireOn);for(const x of renderMeshes)x.wire.visible=wireOn};$('wire').classList.add('active');
window.addEventListener('keydown',e=>{if(e.target?.tagName==='TEXTAREA')return;if(e.key==='ArrowLeft')selectMode(currentMode-1);if(e.key==='ArrowRight')selectMode(currentMode+1);if(e.key===' '){e.preventDefault();$('sweep').click()}});
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=renderer.getPixelRatio();if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}}
function animate(now){requestAnimationFrame(animate);resize();controls.update();if(sweep)setWeight(Math.sin((now-sweepStart)/1000*1.55)*.90);renderer.render(scene,camera)}
async function boot(){try{buildGrid();status('LOADING NEUTRAL HEAD…');prepare(await loadObj('generic_neutral_mesh.obj'));build();setView('three');status('NEUTRAL READY · LOADING IDENTITY 000…');await selectMode(0)}catch(e){console.error(e);status(`LOAD FAILED · ${e.message||e}`)}}
boot();requestAnimationFrame(animate);