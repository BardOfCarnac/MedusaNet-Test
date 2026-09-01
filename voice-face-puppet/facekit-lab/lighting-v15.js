import * as THREE from 'three';

// FaceKit Lab 15 — harsh red lighting study.
// No visible lamp or cone. This installs one movable directional red key light,
// suppresses the existing fill, enables real shadow maps, and exposes only the
// controls that materially change the sculpting of the face.

const originalRender = THREE.WebGLRenderer.prototype.render;
let activeScene = null;
let redKey = null;
let redTarget = null;
let hemiLights = [];
let legacyDirectionals = [];
let configured = false;
let meshPass = 0;

const controls = {};

function addLightingControls(){
  const panel = document.querySelector('.panel');
  if(!panel || document.querySelector('#lightX')) return;

  const section = document.createElement('section');
  section.innerHTML = `
    <div class="sectionTitle"><span>05</span> HARSH RED LIGHT</div>
    <p class="small">Move the virtual key light to carve hard shadows beneath the brow, nose and mouth. No visible lamp is rendered.</p>
    <label class="control"><span>Left / right</span><output id="lightXOut">0.0</output><input id="lightX" type="range" min="-24" max="24" step="0.2" value="0" /></label>
    <label class="control"><span>Height</span><output id="lightYOut">20.0</output><input id="lightY" type="range" min="5" max="32" step="0.2" value="20" /></label>
    <label class="control"><span>Front / back</span><output id="lightZOut">16.0</output><input id="lightZ" type="range" min="-12" max="32" step="0.2" value="16" /></label>
    <label class="control"><span>Intensity</span><output id="lightIntensityOut">5.5</output><input id="lightIntensity" type="range" min="0" max="12" step="0.1" value="5.5" /></label>
    <label class="control"><span>Shadow lift</span><output id="lightFillOut">4%</output><input id="lightFill" type="range" min="0" max="0.5" step="0.01" value="0.04" /></label>
    <div class="buttonRow"><button id="lightTop">TOP</button><button id="lightThree">¾ HARSH</button></div>
  `;
  panel.appendChild(section);

  for(const id of ['lightX','lightY','lightZ','lightIntensity','lightFill']) controls[id] = document.querySelector(`#${id}`);

  const updateOutputs = () => {
    document.querySelector('#lightXOut').value = Number(controls.lightX.value).toFixed(1);
    document.querySelector('#lightYOut').value = Number(controls.lightY.value).toFixed(1);
    document.querySelector('#lightZOut').value = Number(controls.lightZ.value).toFixed(1);
    document.querySelector('#lightIntensityOut').value = Number(controls.lightIntensity.value).toFixed(1);
    document.querySelector('#lightFillOut').value = `${Math.round(Number(controls.lightFill.value) * 100)}%`;
  };

  const apply = () => {
    updateOutputs();
    if(!redKey) return;
    redKey.position.set(
      Number(controls.lightX.value),
      Number(controls.lightY.value),
      Number(controls.lightZ.value)
    );
    redKey.intensity = Number(controls.lightIntensity.value);
    const fill = Number(controls.lightFill.value);
    hemiLights.forEach(light => light.intensity = fill);
    // Keep only the faintest rear separation from the old rig.
    legacyDirectionals.forEach((light, index) => light.intensity = index === legacyDirectionals.length - 1 ? fill * 0.45 : 0);
  };

  controls.apply = apply;
  for(const id of ['lightX','lightY','lightZ','lightIntensity','lightFill']) controls[id].addEventListener('input', apply);

  document.querySelector('#lightTop').addEventListener('click', () => {
    controls.lightX.value = '0';
    controls.lightY.value = '26';
    controls.lightZ.value = '8';
    controls.lightIntensity.value = '6.4';
    controls.lightFill.value = '0.02';
    apply();
  });

  document.querySelector('#lightThree').addEventListener('click', () => {
    controls.lightX.value = '-11';
    controls.lightY.value = '20';
    controls.lightZ.value = '17';
    controls.lightIntensity.value = '6.0';
    controls.lightFill.value = '0.035';
    apply();
  });

  updateOutputs();
}

function configureScene(scene, renderer){
  activeScene = scene;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  hemiLights = [];
  legacyDirectionals = [];
  scene.traverse(object => {
    if(object.isHemisphereLight) hemiLights.push(object);
    if(object.isDirectionalLight) legacyDirectionals.push(object);
  });

  redTarget = new THREE.Object3D();
  redTarget.position.set(0, 4, 3);
  scene.add(redTarget);

  redKey = new THREE.DirectionalLight(0xff1428, 5.5);
  redKey.position.set(0, 20, 16);
  redKey.target = redTarget;
  redKey.castShadow = true;
  redKey.shadow.mapSize.set(1024, 1024);
  redKey.shadow.camera.near = 0.5;
  redKey.shadow.camera.far = 100;
  redKey.shadow.camera.left = -18;
  redKey.shadow.camera.right = 18;
  redKey.shadow.camera.top = 22;
  redKey.shadow.camera.bottom = -22;
  redKey.shadow.bias = -0.0008;
  redKey.shadow.normalBias = 0.025;
  scene.add(redKey);

  configured = true;
  controls.apply?.();
}

function configureFaceMeshes(scene){
  scene.traverse(object => {
    if(!object.isMesh) return;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    const solidSkin = mats.some(mat => mat?.userData?.opacityScale !== undefined && !mat.userData.hiddenFromSolid);
    if(!solidSkin) return;

    object.castShadow = true;
    object.receiveShadow = true;

    mats.forEach(mat => {
      if(mat?.userData?.opacityScale === undefined || mat.userData.hiddenFromSolid) return;
      if(mat.emissive?.isColor) mat.emissive.setHex(0x010000);
      if('roughness' in mat) mat.roughness = 0.88;
    });
  });
}

addLightingControls();

THREE.WebGLRenderer.prototype.render = function(scene, camera){
  if(!configured) configureScene(scene, this);
  if(scene === activeScene && (++meshPass < 180 || meshPass % 120 === 0)) configureFaceMeshes(scene);
  return originalRender.call(this, scene, camera);
};
