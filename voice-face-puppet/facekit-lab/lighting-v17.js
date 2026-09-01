import * as THREE from 'three';

// FaceKit Lab 17 — direct graphic red light direction.
// The previous world-space light position was too ambiguous after the FaceKit rig
// was scaled and repositioned. This version drives the shader with a normalized
// direction vector instead, so the lighting must visibly flip when the controls
// move from left to right. It also disables the depth-only low-poly occluder when
// wireframe is off, preventing black triangular scars on the full-resolution skin.

const originalRender = THREE.WebGLRenderer.prototype.render;
let activeScene = null;
let configured = false;
let meshPass = 0;
const hardMaterials = [];
const controls = {};

const state = {
  horizontal: 0,
  height: 58,
  front: 100,
  intensity: 7.2,
  fill: 0.018,
  hardness: 0.84
};

function lightDirection(){
  const v = new THREE.Vector3(
    state.horizontal / 100,
    state.height / 100,
    state.front / 100
  );
  if(v.lengthSq() < 1e-5) v.set(0, .55, 1);
  return v.normalize();
}

function makeHardRedMaterial(source){
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLightDir: { value: lightDirection() },
      uIntensity: { value: state.intensity },
      uFill: { value: state.fill },
      uHardness: { value: state.hardness },
      uBase: { value: new THREE.Color(0xff1228) },
      uOpacity: { value: 1 }
    },
    transparent: true,
    depthTest: true,
    depthWrite: true,
    side: THREE.FrontSide,
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      varying vec3 vNormalW;
      varying vec3 vWorld;
      void main(){
        #include <begin_vertex>
        #include <morphtarget_vertex>
        vec4 world = modelMatrix * vec4(transformed, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uLightDir;
      uniform vec3 uBase;
      uniform float uIntensity;
      uniform float uFill;
      uniform float uHardness;
      uniform float uOpacity;
      varying vec3 vNormalW;
      varying vec3 vWorld;

      void main(){
        vec3 N = normalize(vNormalW);
        vec3 L = normalize(uLightDir);
        float ndl = dot(N, L);

        // A steep, graphic transition rather than soft studio lighting.
        float width = mix(0.22, 0.055, uHardness);
        float threshold = mix(-0.12, 0.10, uHardness);
        float direct = smoothstep(threshold - width, threshold + width, ndl);
        direct = pow(direct, mix(1.15, 2.15, uHardness));

        // Preserve some modelling inside the lit area while keeping shadows black.
        float lambert = max(ndl, 0.0);
        float sculpt = direct * (0.42 + 0.58 * pow(lambert, 0.72));
        float level = uFill + sculpt * (0.115 * uIntensity);

        // Tiny red-only highlight on planes aimed most directly at the light.
        float hot = pow(max(ndl, 0.0), 18.0) * (0.018 * uIntensity);
        vec3 colour = uBase * level + vec3(1.0, 0.008, 0.012) * hot;
        gl_FragColor = vec4(colour, uOpacity);
      }
    `
  });

  mat.userData.opacityScale = source?.userData?.opacityScale ?? 1;
  mat.userData.hiddenFromSolid = false;
  mat.opacity = source?.opacity ?? 1;
  mat.onBeforeRender = () => { mat.uniforms.uOpacity.value = mat.opacity; };
  hardMaterials.push(mat);
  return mat;
}

function syncUniforms(){
  const dir = lightDirection();
  for(const mat of hardMaterials){
    mat.uniforms.uLightDir.value.copy(dir);
    mat.uniforms.uIntensity.value = state.intensity;
    mat.uniforms.uFill.value = state.fill;
    mat.uniforms.uHardness.value = state.hardness;
  }
}

function addLightingControls(){
  const panel = document.querySelector('.panel');
  if(!panel || document.querySelector('#lightHorizontal')) return;

  const section = document.createElement('section');
  section.innerHTML = `
    <div class="sectionTitle"><span>05</span> HARSH RED SHADING</div>
    <p class="small">These controls now set the light direction directly. Extreme left/right values should visibly swap the illuminated side of the face.</p>
    <label class="control"><span>Left / right</span><output id="lightHorizontalOut">0</output><input id="lightHorizontal" type="range" min="-100" max="100" step="1" value="0" /></label>
    <label class="control"><span>Height</span><output id="lightHeightOut">58</output><input id="lightHeight" type="range" min="-100" max="100" step="1" value="58" /></label>
    <label class="control"><span>Front / back</span><output id="lightFrontOut">100</output><input id="lightFront" type="range" min="-100" max="100" step="1" value="100" /></label>
    <label class="control"><span>Intensity</span><output id="lightIntensityOut">7.2</output><input id="lightIntensity" type="range" min="0" max="12" step="0.1" value="7.2" /></label>
    <label class="control"><span>Shadow lift</span><output id="lightFillOut">2%</output><input id="lightFill" type="range" min="0" max="0.25" step="0.002" value="0.018" /></label>
    <label class="control"><span>Hardness</span><output id="lightHardnessOut">84%</output><input id="lightHardness" type="range" min="0" max="1" step="0.01" value="0.84" /></label>
    <div class="buttonRow"><button id="lightLeft">LEFT</button><button id="lightTop">TOP</button><button id="lightRight">RIGHT</button></div>
  `;
  panel.appendChild(section);

  for(const id of ['lightHorizontal','lightHeight','lightFront','lightIntensity','lightFill','lightHardness']){
    controls[id] = document.querySelector(`#${id}`);
  }

  const apply = () => {
    state.horizontal = Number(controls.lightHorizontal.value);
    state.height = Number(controls.lightHeight.value);
    state.front = Number(controls.lightFront.value);
    state.intensity = Number(controls.lightIntensity.value);
    state.fill = Number(controls.lightFill.value);
    state.hardness = Number(controls.lightHardness.value);

    document.querySelector('#lightHorizontalOut').value = Math.round(state.horizontal);
    document.querySelector('#lightHeightOut').value = Math.round(state.height);
    document.querySelector('#lightFrontOut').value = Math.round(state.front);
    document.querySelector('#lightIntensityOut').value = state.intensity.toFixed(1);
    document.querySelector('#lightFillOut').value = `${Math.round(state.fill * 100)}%`;
    document.querySelector('#lightHardnessOut').value = `${Math.round(state.hardness * 100)}%`;
    syncUniforms();
  };

  controls.apply = apply;
  for(const id of ['lightHorizontal','lightHeight','lightFront','lightIntensity','lightFill','lightHardness']){
    controls[id].addEventListener('input', apply);
  }

  const preset = (x,y,z) => {
    controls.lightHorizontal.value = String(x);
    controls.lightHeight.value = String(y);
    controls.lightFront.value = String(z);
    controls.lightIntensity.value = '7.6';
    controls.lightFill.value = '0.012';
    controls.lightHardness.value = '0.9';
    apply();
  };
  document.querySelector('#lightLeft').addEventListener('click',()=>preset(-100,45,70));
  document.querySelector('#lightTop').addEventListener('click',()=>preset(0,100,38));
  document.querySelector('#lightRight').addEventListener('click',()=>preset(100,45,70));

  apply();
}

function configureScene(scene){
  activeScene = scene;
  scene.traverse(object => {
    if(object.isHemisphereLight || object.isDirectionalLight) object.intensity = 0;
  });
  configured = true;
}

function configureFaceMeshes(scene){
  const wireAmount = Number(document.querySelector('#wire')?.value || 0);

  scene.traverse(object => {
    if(!object.isMesh) return;

    // The low-poly depth-only shell is useful only for hiding rear wireframe.
    // With wireframe off it was occluding the full skin and causing black scars.
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    const depthOnly = mats.length === 1 && mats[0]?.colorWrite === false && mats[0]?.depthWrite === true;
    if(depthOnly){
      object.visible = wireAmount > 0.01;
      return;
    }

    if(object.userData.__hardRedV17) return;
    const hasSolidSkin = mats.some(mat => mat?.userData?.opacityScale !== undefined && !mat.userData.hiddenFromSolid);
    if(!hasSolidSkin) return;

    const replacement = mats.map(mat => {
      if(mat?.userData?.opacityScale === undefined || mat.userData.hiddenFromSolid) return mat;
      return makeHardRedMaterial(mat);
    });
    object.material = Array.isArray(object.material) ? replacement : replacement[0];
    object.userData.__hardRedV17 = true;
    object.castShadow = false;
    object.receiveShadow = false;
    if(!object.morphTargetInfluences) object.updateMorphTargets();
  });
  syncUniforms();
}

addLightingControls();

THREE.WebGLRenderer.prototype.render = function(scene, camera){
  if(!configured) configureScene(scene);
  if(scene === activeScene) configureFaceMeshes(scene);
  return originalRender.call(this, scene, camera);
};
