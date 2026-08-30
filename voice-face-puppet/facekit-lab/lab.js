import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const FACEKIT = 'https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const TARGETS = [
  'identity000.obj',
  'identity001.obj',
  'identity002.obj',
  'identity003.obj',
  'jawOpen.obj'
];

const canvas = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x040406, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

function portraitLayout() {
  return window.innerWidth <= 700 || window.innerHeight > window.innerWidth * 1.1;
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050507, 0.014);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
if (portraitLayout()) camera.position.set(0, 4.0, 48);
else camera.position.set(0, -0.3, 43);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.target.set(0, portraitLayout() ? 4.0 : 0.6, 3.0);
controls.minDistance = 24;
controls.maxDistance = 72;
controls.enablePan = false;

const headRig = new THREE.Group();
scene.add(headRig);

// Sparse wireframe space: enough geometry to establish volume, never enough to become a Tron floor.
const gridMat = new THREE.LineBasicMaterial({ color: 0x53131b, transparent: true, opacity: 0.24 });
function makePlaneGrid(size=110, divisions=11) {
  const g = new THREE.BufferGeometry();
  const p = [];
  const half = size / 2;
  for (let i=0;i<=divisions;i++) {
    const t = -half + (size * i / divisions);
    p.push(-half,0,t, half,0,t, t,0,-half, t,0,half);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p,3));
  return new THREE.LineSegments(g, gridMat.clone());
}
const floor = makePlaneGrid(); floor.position.set(0,-14,-10); scene.add(floor);
const backGrid = makePlaneGrid(); backGrid.rotation.x = Math.PI/2; backGrid.position.set(0,18,-28); backGrid.material.opacity=.11; scene.add(backGrid);
const sideGrid = makePlaneGrid(); sideGrid.rotation.z = Math.PI/2; sideGrid.position.set(-34,0,-8); sideGrid.material.opacity=.08; scene.add(sideGrid);

const axisGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-60,0,-18), new THREE.Vector3(60,0,-18),
  new THREE.Vector3(0,-35,-18), new THREE.Vector3(0,35,-18)
]);
const axes = new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({color:0x7c1822, transparent:true, opacity:.17}));
scene.add(axes);

const solidMat = new THREE.MeshStandardMaterial({
  color: 0x440b12,
  emissive: 0x250307,
  roughness: .72,
  metalness: .05,
  transparent: true,
  opacity: .14,
  depthWrite: true,
  depthTest: true,
  side: THREE.FrontSide
});
const wireMat = new THREE.MeshBasicMaterial({
  color: 0xff2638,
  wireframe: true,
  transparent: true,
  opacity: .78,
  depthWrite: false
});
const contourMat = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0xff6a74) },
    uOpacity: { value: .34 },
    uFrequency: { value: .58 }
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec3 vObj;
    varying vec3 vNormalW;
    varying vec3 vWorld;
    void main(){
      vObj = position;
      vec4 w = modelMatrix * vec4(position,1.0);
      vWorld = w.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uFrequency;
    varying vec3 vObj;
    varying vec3 vNormalW;
    varying vec3 vWorld;
    void main(){
      float phase = vObj.y * uFrequency;
      float d = abs(fract(phase) - .5);
      float aa = max(fwidth(phase) * 1.35, .012);
      float iso = smoothstep(.47-aa, .5, d);
      vec3 V = normalize(cameraPosition - vWorld);
      float rim = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.4);
      float a = max(iso, rim * .32) * uOpacity;
      if(a < .018) discard;
      gl_FragColor = vec4(uColor, a);
    }
  `
});

scene.add(new THREE.HemisphereLight(0x7b1d27, 0x050507, 0.6));
const key = new THREE.DirectionalLight(0xff4d5d, 1.5); key.position.set(-7,10,16); scene.add(key);
const rim = new THREE.DirectionalLight(0x63101b, .9); rim.position.set(12,2,-10); scene.add(rim);

const layerMeshes = [];
let baseMeshes = [];
let ready = false;

function meshList(root) {
  const arr=[];
  root.traverse(o=>{ if(o.isMesh) arr.push(o); });
  return arr;
}

function materialsOf(material) {
  return Array.isArray(material) ? material : [material];
}

function buildSolidMaterial(sourceMaterial) {
  const name = String(sourceMaterial?.name || '').toLowerCase();
  const m = solidMat.clone();
  m.name = `solid_${sourceMaterial?.name || 'surface'}`;
  m.userData.opacityScale = 1;
  m.userData.hiddenFromSolid = false;

  // These are technical helper surfaces intended for realistic eye shaders.
  // In a monochrome translucent material they read as huge rings/goggles instead.
  if (name.includes('eyeblend') || name.includes('eyeocclusion') || name.includes('lacrimalfluid')) {
    m.visible = false;
    m.userData.hiddenFromSolid = true;
    return m;
  }

  if (name.includes('sclera')) {
    m.color.setHex(0x8a4b54);
    m.emissive.setHex(0x170407);
    m.roughness = .48;
  } else if (name.includes('iris')) {
    m.color.setHex(0x160206);
    m.emissive.setHex(0x080001);
    m.roughness = .52;
  } else if (name.includes('teeth')) {
    m.color.setHex(0x806164);
    m.emissive.setHex(0x120708);
    m.roughness = .58;
  } else if (name.includes('gumstongue')) {
    m.color.setHex(0x31040a);
    m.emissive.setHex(0x170105);
    m.roughness = .62;
  } else if (name.includes('eyelashes')) {
    m.color.setHex(0x090103);
    m.emissive.setHex(0x000000);
    m.userData.opacityScale = .9;
  }
  return m;
}

function makeSolidMaterials(base) {
  const source = materialsOf(base.material);
  const result = source.map(buildSolidMaterial);
  return Array.isArray(base.material) ? result : result[0];
}

function setSolidOpacity(mesh, value) {
  const v = Number(value);
  materialsOf(mesh.material).forEach(m => {
    if (m.userData.hiddenFromSolid) {
      m.visible = false;
      m.opacity = 0;
      return;
    }
    m.visible = v > .002;
    m.opacity = Math.min(1, v * (m.userData.opacityScale ?? 1));
    m.depthWrite = v > .015;
  });
}

function findCounterpart(base, targetMeshes, index) {
  if(base.name) {
    const hit = targetMeshes.find(m => m.name === base.name && m.geometry.attributes.position.count === base.geometry.attributes.position.count);
    if(hit) return hit;
  }
  const same = targetMeshes[index];
  return same && same.geometry.attributes.position.count === base.geometry.attributes.position.count ? same : null;
}

function buildLayers(baseRoot) {
  baseMeshes = meshList(baseRoot);
  baseMeshes.forEach((base, index) => {
    const g = base.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes.position = [];
    g.morphTargetsRelative = false;

    const holder = new THREE.Group();
    holder.name = `part-${index}`;

    const solid = new THREE.Mesh(g, makeSolidMaterials(base));
    const wire = new THREE.Mesh(g, wireMat.clone());
    const contour = new THREE.Mesh(g, contourMat.clone());
    contour.scale.setScalar(1.0015);

    solid.renderOrder=1; wire.renderOrder=2; contour.renderOrder=3;
    [solid,wire,contour].forEach(m=>{
      m.position.copy(base.position); m.rotation.copy(base.rotation); m.scale.copy(base.scale);
      holder.add(m);
    });
    headRig.add(holder);
    layerMeshes.push({ solid, wire, contour, geometry:g, partIndex:index });
  });

  const box = new THREE.Box3().setFromObject(headRig);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const portrait = portraitLayout();
  const targetSize = portrait ? 15.5 : 23;
  const scale = targetSize / Math.max(size.x, size.y);
  headRig.scale.setScalar(scale);
  headRig.position.set(
    -center.x*scale,
    -center.y*scale + (portrait ? 4.0 : .8),
    -center.z*scale + 2.8
  );
}

function attachTarget(targetRoot, morphIndex) {
  const targets = meshList(targetRoot);
  let matched=0;
  layerMeshes.forEach(({geometry, partIndex}) => {
    const base = baseMeshes[partIndex];
    const target = findCounterpart(base, targets, partIndex);
    if (!target) return;
    geometry.morphAttributes.position[morphIndex] = target.geometry.attributes.position.clone();
    matched++;
  });
  if (matched === 0) throw new Error(`No compatible meshes found for morph ${morphIndex}`);
}

function syncMorphs() {
  const identity = [0,1,2,3].map(i=>Number(document.querySelector(`#id${i}`).value));
  const jaw = Number(document.querySelector('#jaw').value);
  layerMeshes.forEach(({solid,wire,contour}) => {
    [solid,wire,contour].forEach(m => {
      if(!m.morphTargetInfluences) m.updateMorphTargets();
      if(!m.morphTargetInfluences) return;
      for(let i=0;i<4;i++) m.morphTargetInfluences[i] = identity[i];
      m.morphTargetInfluences[4] = jaw;
    });
  });
}

function enableMorphControls() {
  document.querySelectorAll('.identity input, #jaw').forEach(el=>el.disabled=false);
  ready=true;
  setStatus('READY / 4 ID MODES + JAW', 'ready');
  syncMorphs();
}

function setStatus(text, kind='') {
  document.querySelector('#status').textContent=text;
  const dot=document.querySelector('#statusDot');
  dot.className='statusDot'+(kind?` ${kind}`:'');
}

const loader = new OBJLoader();
function loadObj(name) {
  return new Promise((resolve,reject)=>loader.load(FACEKIT+name, resolve, undefined, reject));
}

async function boot() {
  try {
    setStatus('LOADING NEUTRAL / ~2.6 MB');
    const base = await loadObj('generic_neutral_mesh.obj');
    buildLayers(base);
    setStatus('NEUTRAL READY / LOADING MORPHS');

    for(let i=0;i<TARGETS.length;i++) {
      setStatus(`LOADING MORPH ${i+1}/${TARGETS.length}`);
      const target = await loadObj(TARGETS[i]);
      attachTarget(target, i);
    }
    enableMorphControls();
  } catch(err) {
    console.error(err);
    setStatus('LOAD FAILED — SEE CONSOLE', 'error');
  }
}

const ui = {
  wire: document.querySelector('#wire'),
  solid: document.querySelector('#solid'),
  contour: document.querySelector('#contour'),
  drift: document.querySelector('#drift'),
  jaw: document.querySelector('#jaw')
};

function pct(v){ return `${Math.round(Number(v)*100)}%`; }
function updateLayerUI() {
  document.querySelector('#wireOut').value=pct(ui.wire.value);
  document.querySelector('#solidOut').value=pct(ui.solid.value);
  document.querySelector('#contourOut').value=pct(ui.contour.value);
  layerMeshes.forEach(({solid,wire,contour})=>{
    setSolidOpacity(solid, ui.solid.value);
    wire.material.opacity=Number(ui.wire.value);
    contour.material.uniforms.uOpacity.value=Number(ui.contour.value);
  });
}
['wire','solid','contour'].forEach(k=>ui[k].addEventListener('input',updateLayerUI));

for(let i=0;i<4;i++) {
  const el=document.querySelector(`#id${i}`);
  el.addEventListener('input',()=>{
    document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2);
    syncMorphs();
  });
}
ui.jaw.addEventListener('input',()=>{
  document.querySelector('#jawOut').value=pct(ui.jaw.value);
  syncMorphs();
});

document.querySelector('#zeroIdentity').addEventListener('click',()=>{
  for(let i=0;i<4;i++) {
    const el=document.querySelector(`#id${i}`); el.value=0; document.querySelector(`#id${i}Out`).value='0.00';
  }
  syncMorphs();
});
document.querySelector('#randomIdentity').addEventListener('click',()=>{
  for(let i=0;i<4;i++) {
    const v=(Math.random()*1.1-.55);
    const el=document.querySelector(`#id${i}`); el.value=v.toFixed(2); document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2);
  }
  syncMorphs();
});

function setView(name) {
  const portrait = portraitLayout();
  const views = portrait
    ? { front:[0,4,48], three:[20,4,43], side:[45,4,8] }
    : { front:[0,-.3,43], three:[22,1,36], side:[39,.5,5] };
  const [x,y,z]=views[name];
  camera.position.set(x,y,z);
  controls.target.set(0, portrait ? 4 : .6, 3);
  controls.update();
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

function resize() {
  const w=canvas.clientWidth, h=canvas.clientHeight;
  if(canvas.width!==Math.floor(w*renderer.getPixelRatio()) || canvas.height!==Math.floor(h*renderer.getPixelRatio())) {
    renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
  }
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  resize();
  controls.update();
  const t=clock.getElapsedTime();

  if(ui.drift.checked && ready) {
    const w=.67 + Math.sin(t*.23)*.11 + Math.sin(t*.071)*.05;
    const c=.24 + Math.sin(t*.17+1.4)*.13;
    const s=.10 + Math.sin(t*.11+3.1)*.055;
    layerMeshes.forEach(({solid,wire,contour})=>{
      wire.material.opacity=Math.max(.05,Math.min(1,w*Number(ui.wire.value)/.78));
      contour.material.uniforms.uOpacity.value=Math.max(0,Math.min(1,c*Number(ui.contour.value)/.34));
      setSolidOpacity(solid, Math.max(0,Math.min(.5,s*Number(ui.solid.value)/.14)));
    });
  } else updateLayerUI();

  headRig.rotation.y = Math.sin(t*.19)*.018;
  renderer.render(scene,camera);
}

updateLayerUI();
boot();
animate();
