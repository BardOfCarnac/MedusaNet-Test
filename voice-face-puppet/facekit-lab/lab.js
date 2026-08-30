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
camera.position.set(0, portraitLayout() ? 4 : -0.3, portraitLayout() ? 48 : 43);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.target.set(0, portraitLayout() ? 4 : 0.6, 3);
controls.minDistance = 24;
controls.maxDistance = 80;
controls.enablePan = false;

const headRig = new THREE.Group();
scene.add(headRig);

// Sparse chamber geometry: enough to establish volume without becoming a Tron floor.
const gridMat = new THREE.LineBasicMaterial({ color: 0x53131b, transparent: true, opacity: 0.24 });
function makePlaneGrid(size = 110, divisions = 11) {
  const g = new THREE.BufferGeometry();
  const p = [];
  const half = size / 2;
  for (let i = 0; i <= divisions; i++) {
    const t = -half + (size * i / divisions);
    p.push(-half, 0, t, half, 0, t, t, 0, -half, t, 0, half);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.LineSegments(g, gridMat.clone());
}

const floor = makePlaneGrid();
floor.position.set(0, -14, -10);
scene.add(floor);

const backGrid = makePlaneGrid();
backGrid.rotation.x = Math.PI / 2;
backGrid.position.set(0, 18, -28);
backGrid.material.opacity = 0.11;
scene.add(backGrid);

const sideGrid = makePlaneGrid();
sideGrid.rotation.z = Math.PI / 2;
sideGrid.position.set(-34, 0, -8);
sideGrid.material.opacity = 0.08;
scene.add(sideGrid);

const axisGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-60, 0, -18), new THREE.Vector3(60, 0, -18),
  new THREE.Vector3(0, -35, -18), new THREE.Vector3(0, 35, -18)
]);
scene.add(new THREE.LineSegments(
  axisGeo,
  new THREE.LineBasicMaterial({ color: 0x7c1822, transparent: true, opacity: 0.17 })
));

scene.add(new THREE.HemisphereLight(0x7b1d27, 0x050507, 0.6));
const key = new THREE.DirectionalLight(0xff4d5d, 1.5);
key.position.set(-7, 10, 16);
scene.add(key);
const rim = new THREE.DirectionalLight(0x63101b, 0.9);
rim.position.set(12, 2, -10);
scene.add(rim);

const solidBase = new THREE.MeshStandardMaterial({
  color: 0x440b12,
  emissive: 0x250307,
  roughness: 0.72,
  metalness: 0.05,
  transparent: true,
  opacity: 0.14,
  depthWrite: true,
  depthTest: true,
  side: THREE.FrontSide
});

function makeContourMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xff6a74) },
      uOpacity: { value: 0.34 },
      uFrequency: { value: 0.58 }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      varying vec3 vObj;
      varying vec3 vNormalW;
      varying vec3 vWorld;
      void main() {
        #include <begin_vertex>
        #include <morphtarget_vertex>
        vObj = transformed;
        vec4 w = modelMatrix * vec4(transformed, 1.0);
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
      void main() {
        float phase = vObj.y * uFrequency;
        float d = abs(fract(phase) - 0.5);
        float aa = max(fwidth(phase) * 1.35, 0.012);
        float iso = smoothstep(0.47 - aa, 0.5, d);
        vec3 V = normalize(cameraPosition - vWorld);
        float edge = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.4);
        float a = max(iso, edge * 0.32) * uOpacity;
        if (a < 0.018) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `
  });
}

function makeWireMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xff2638) },
      uOpacity: { value: 0.78 }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      void main() {
        #include <begin_vertex>
        #include <morphtarget_vertex>
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `
  });
}

const layerMeshes = [];
let baseMeshes = [];
let ready = false;

function meshList(root) {
  const arr = [];
  root.traverse(o => { if (o.isMesh) arr.push(o); });
  return arr;
}

function materialsOf(material) {
  return Array.isArray(material) ? material : [material];
}

function materialName(base, materialIndex) {
  const mats = materialsOf(base.material);
  return String(mats[materialIndex || 0]?.name || '').toLowerCase();
}

function helperMaterial(name) {
  return name.includes('eyeblend') || name.includes('eyeocclusion') || name.includes('lacrimalfluid');
}

function buildSolidMaterial(sourceMaterial) {
  const name = String(sourceMaterial?.name || '').toLowerCase();
  const m = solidBase.clone();
  m.name = `solid_${sourceMaterial?.name || 'surface'}`;
  m.userData.opacityScale = 1;
  m.userData.hiddenFromSolid = false;

  if (helperMaterial(name)) {
    m.visible = false;
    m.userData.hiddenFromSolid = true;
    return m;
  }

  if (name.includes('sclera')) {
    m.color.setHex(0x8a4b54);
    m.emissive.setHex(0x170407);
    m.roughness = 0.48;
  } else if (name.includes('iris')) {
    m.color.setHex(0x160206);
    m.emissive.setHex(0x080001);
    m.roughness = 0.52;
  } else if (name.includes('teeth')) {
    m.color.setHex(0x806164);
    m.emissive.setHex(0x120708);
    m.roughness = 0.58;
  } else if (name.includes('gumstongue')) {
    m.color.setHex(0x31040a);
    m.emissive.setHex(0x170105);
    m.roughness = 0.62;
  } else if (name.includes('eyelashes')) {
    m.color.setHex(0x090103);
    m.emissive.setHex(0x000000);
    m.userData.opacityScale = 0.9;
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
    m.visible = v > 0.002;
    m.opacity = Math.min(1, v * (m.userData.opacityScale ?? 1));
    m.depthWrite = v > 0.015;
  });
}

function findCounterpart(base, targetMeshes, index) {
  if (base.name) {
    const hit = targetMeshes.find(m =>
      m.name === base.name &&
      m.geometry.attributes.position.count === base.geometry.attributes.position.count
    );
    if (hit) return hit;
  }
  const same = targetMeshes[index];
  return same && same.geometry.attributes.position.count === base.geometry.attributes.position.count ? same : null;
}

function prepareBase(baseRoot) {
  baseMeshes = meshList(baseRoot);
  baseMeshes.forEach(base => {
    const g = base.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = g.morphAttributes || {};
    g.morphAttributes.position = [];
    g.morphTargetsRelative = false;
  });
}

function attachTarget(targetRoot, morphIndex) {
  const targets = meshList(targetRoot);
  let matched = 0;
  baseMeshes.forEach((base, index) => {
    const target = findCounterpart(base, targets, index);
    if (!target) return;
    base.geometry.morphAttributes.position[morphIndex] = target.geometry.attributes.position.clone();
    matched++;
  });
  if (matched === 0) throw new Error(`No compatible meshes found for morph ${morphIndex}`);
}

// Build a very cheap, morph-compatible cage by selecting a small, evenly distributed
// subset of the original FaceKit triangles. No decimation is performed on-device.
function makeSparseWireGeometry(base, targetTriangles = 900) {
  const source = base.geometry;
  const pos = source.attributes.position;
  const index = source.index;
  const morphs = source.morphAttributes.position || [];
  const triRecords = [];

  const groups = source.groups && source.groups.length
    ? source.groups
    : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];

  for (const group of groups) {
    const name = materialName(base, group.materialIndex);
    if (helperMaterial(name)) continue;
    if (name.includes('eyelashes')) continue;

    const end = group.start + group.count;
    for (let o = group.start; o + 2 < end; o += 3) {
      const a = index ? index.getX(o) : o;
      const b = index ? index.getX(o + 1) : o + 1;
      const c = index ? index.getX(o + 2) : o + 2;
      triRecords.push([a, b, c]);
    }
  }

  if (!triRecords.length) return null;

  const stride = Math.max(1, Math.ceil(triRecords.length / targetTriangles));
  const selected = [];
  for (let i = 0; i < triRecords.length; i += stride) selected.push(triRecords[i]);

  const map = [];
  for (const [a, b, c] of selected) {
    map.push(a, b, b, c, c, a);
  }

  const out = new THREE.BufferGeometry();
  const p = new Float32Array(map.length * 3);
  for (let i = 0; i < map.length; i++) {
    const s = map[i];
    p[i * 3] = pos.getX(s);
    p[i * 3 + 1] = pos.getY(s);
    p[i * 3 + 2] = pos.getZ(s);
  }
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  out.morphAttributes = { position: [] };
  out.morphTargetsRelative = source.morphTargetsRelative;

  morphs.forEach((morph, mi) => {
    const mp = new Float32Array(map.length * 3);
    for (let i = 0; i < map.length; i++) {
      const s = map[i];
      mp[i * 3] = morph.getX(s);
      mp[i * 3 + 1] = morph.getY(s);
      mp[i * 3 + 2] = morph.getZ(s);
    }
    out.morphAttributes.position[mi] = new THREE.BufferAttribute(mp, 3);
  });

  out.computeBoundingSphere();
  return out;
}

function setMorphArray(object, count) {
  object.morphTargetInfluences = new Array(count).fill(0);
  object.morphTargetDictionary = {};
  for (let i = 0; i < count; i++) object.morphTargetDictionary[`morph${i}`] = i;
}

function buildLayers() {
  baseMeshes.forEach((base, index) => {
    const g = base.geometry;
    const holder = new THREE.Group();
    holder.name = `part-${index}`;

    const solid = new THREE.Mesh(g, makeSolidMaterials(base));
    const contour = new THREE.Mesh(g, makeContourMaterial());
    contour.scale.setScalar(1.0015);

    const wireGeo = makeSparseWireGeometry(base, portraitLayout() ? 720 : 1100);
    const wire = wireGeo ? new THREE.LineSegments(wireGeo, makeWireMaterial()) : null;

    solid.renderOrder = 1;
    if (wire) wire.renderOrder = 2;
    contour.renderOrder = 3;

    [solid, contour, wire].filter(Boolean).forEach(m => {
      m.position.copy(base.position);
      m.rotation.copy(base.rotation);
      m.scale.copy(base.scale);
      holder.add(m);
    });

    if (wire) setMorphArray(wire, g.morphAttributes.position.length);

    headRig.add(holder);
    layerMeshes.push({ solid, wire, contour, partIndex: index });
  });

  const box = new THREE.Box3().setFromObject(headRig);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const portrait = portraitLayout();
  const targetSize = portrait ? 15.5 : 23;
  const scale = targetSize / Math.max(size.x, size.y);
  headRig.scale.setScalar(scale);
  headRig.position.set(
    -center.x * scale,
    -center.y * scale + (portrait ? 4 : 0.8),
    -center.z * scale + 2.8
  );
}

function syncMorphs() {
  const identity = [0, 1, 2, 3].map(i => Number(document.querySelector(`#id${i}`).value));
  const jaw = Number(document.querySelector('#jaw').value);

  layerMeshes.forEach(({ solid, wire, contour }) => {
    [solid, contour].forEach(m => {
      if (!m.morphTargetInfluences) m.updateMorphTargets();
      if (!m.morphTargetInfluences) return;
      for (let i = 0; i < 4; i++) m.morphTargetInfluences[i] = identity[i];
      m.morphTargetInfluences[4] = jaw;
    });

    if (wire?.morphTargetInfluences) {
      for (let i = 0; i < 4; i++) wire.morphTargetInfluences[i] = identity[i];
      wire.morphTargetInfluences[4] = jaw;
    }
  });
}

function enableMorphControls() {
  document.querySelectorAll('.identity input, #jaw').forEach(el => el.disabled = false);
  ready = true;
  setStatus('READY / SPARSE CAGE + LIVE CONTOUR', 'ready');
  syncMorphs();
}

function setStatus(text, kind = '') {
  document.querySelector('#status').textContent = text;
  const dot = document.querySelector('#statusDot');
  dot.className = 'statusDot' + (kind ? ` ${kind}` : '');
}

const loader = new OBJLoader();
function loadObj(name) {
  return new Promise((resolve, reject) => loader.load(FACEKIT + name, resolve, undefined, reject));
}

async function boot() {
  try {
    setStatus('LOADING NEUTRAL / ~2.6 MB');
    const base = await loadObj('generic_neutral_mesh.obj');
    prepareBase(base);

    for (let i = 0; i < TARGETS.length; i++) {
      setStatus(`LOADING MORPH ${i + 1}/${TARGETS.length}`);
      const target = await loadObj(TARGETS[i]);
      attachTarget(target, i);
      // Yield once between files so mobile browsers stay responsive.
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    setStatus('BUILDING SPARSE WIRE CAGE');
    await new Promise(resolve => requestAnimationFrame(resolve));
    buildLayers();
    enableMorphControls();
  } catch (err) {
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

function pct(v) { return `${Math.round(Number(v) * 100)}%`; }

function updateLayerUI() {
  document.querySelector('#wireOut').value = pct(ui.wire.value);
  document.querySelector('#solidOut').value = pct(ui.solid.value);
  document.querySelector('#contourOut').value = pct(ui.contour.value);

  layerMeshes.forEach(({ solid, wire, contour }) => {
    setSolidOpacity(solid, ui.solid.value);
    if (wire) wire.material.uniforms.uOpacity.value = Number(ui.wire.value);
    contour.material.uniforms.uOpacity.value = Number(ui.contour.value);
  });
}

['wire', 'solid', 'contour'].forEach(k => ui[k].addEventListener('input', updateLayerUI));

for (let i = 0; i < 4; i++) {
  const el = document.querySelector(`#id${i}`);
  el.addEventListener('input', () => {
    document.querySelector(`#id${i}Out`).value = Number(el.value).toFixed(2);
    syncMorphs();
  });
}

ui.jaw.addEventListener('input', () => {
  document.querySelector('#jawOut').value = pct(ui.jaw.value);
  syncMorphs();
});

document.querySelector('#zeroIdentity').addEventListener('click', () => {
  for (let i = 0; i < 4; i++) {
    const el = document.querySelector(`#id${i}`);
    el.value = 0;
    document.querySelector(`#id${i}Out`).value = '0.00';
  }
  syncMorphs();
});

document.querySelector('#randomIdentity').addEventListener('click', () => {
  for (let i = 0; i < 4; i++) {
    const v = Math.random() * 1.1 - 0.55;
    const el = document.querySelector(`#id${i}`);
    el.value = v.toFixed(2);
    document.querySelector(`#id${i}Out`).value = Number(el.value).toFixed(2);
  }
  syncMorphs();
});

function setView(name) {
  const portrait = portraitLayout();
  const views = portrait
    ? { front: [0, 4, 48], three: [20, 4, 43], side: [45, 4, 8] }
    : { front: [0, -0.3, 43], three: [22, 1, 36], side: [39, 0.5, 5] };
  const [x, y, z] = views[name];
  camera.position.set(x, y, z);
  controls.target.set(0, portrait ? 4 : 0.6, 3);
  controls.update();
}

document.querySelectorAll('[data-view]').forEach(b =>
  b.addEventListener('click', () => setView(b.dataset.view))
);

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (
    canvas.width !== Math.floor(w * renderer.getPixelRatio()) ||
    canvas.height !== Math.floor(h * renderer.getPixelRatio())
  ) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  resize();
  controls.update();
  const t = clock.getElapsedTime();

  if (ui.drift.checked && ready) {
    const w = 0.67 + Math.sin(t * 0.23) * 0.11 + Math.sin(t * 0.071) * 0.05;
    const c = 0.24 + Math.sin(t * 0.17 + 1.4) * 0.13;
    const s = 0.10 + Math.sin(t * 0.11 + 3.1) * 0.055;

    layerMeshes.forEach(({ solid, wire, contour }) => {
      if (wire) wire.material.uniforms.uOpacity.value = Math.max(0.04, Math.min(1, w * Number(ui.wire.value) / 0.78));
      contour.material.uniforms.uOpacity.value = Math.max(0, Math.min(1, c * Number(ui.contour.value) / 0.34));
      setSolidOpacity(solid, Math.max(0, Math.min(0.5, s * Number(ui.solid.value) / 0.14)));
    });
  } else {
    updateLayerUI();
  }

  headRig.rotation.y = Math.sin(t * 0.19) * 0.018;
  renderer.render(scene, camera);
}

updateLayerUI();
boot();
animate();
