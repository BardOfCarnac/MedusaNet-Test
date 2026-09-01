import * as THREE from 'three';

// FaceKit Lab 16 — graphic harsh red lighting.
// Lab 15's shadow maps produced acne/speckles and the translucent emissive skin
// flattened most lighting changes. This pass replaces only the visible skin
// materials with a morph-capable hard-light shader. The light is still movable,
// but the face now responds directly and dramatically to its angle.

const originalRender = THREE.WebGLRenderer.prototype.render;
let activeScene = null;
let configured = false;
let meshPass = 0;
const hardMaterials = [];
const controls = {};

const state = {
  light: new THREE.Vector3(0, 22, 11),
  intensity: 6.5,
  fill: 0.025,
  hardness: 0.72
};

function makeHardRedMaterial(source){
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLightPos: { value: state.light.clone() },
      uIntensity: { value: state.intensity },
      uFill: { value: state.fill },
      uHardness: { value: state.hardness },
      uBase: { value: new THREE.Color(0xff1328) },
      uOpacity: { value: 1 }
    },
    transparent: true,
    depthTest: true,
    depthWrite: true,
    side: THREE.FrontSide,
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      varying vec3 vWorld;
      varying vec3 vNormalW;
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
      uniform vec3 uLightPos;
      uniform vec3 uBase;
      uniform float uIntensity;
      uniform float uFill;
      uniform float uHardness;
      uniform float uOpacity;
      varying vec3 vWorld;
      varying vec3 vNormalW;

      void main(){
        vec3 N = normalize(vNormalW);
        vec3 L = normalize(uLightPos - vWorld);
        vec3 V = normalize(cameraPosition - vWorld);
        float raw = dot(N, L);

        // Deliberately graphic transition: lit planes jump rapidly out of black.
        float edge0 = mix(-0.16, 0.12, uHardness);
        float edge1 = mix( 0.36, 0.24, uHardness);
        float direct = smoothstep(edge0, edge1, raw);
        direct = pow(direct, mix(1.05, 1.75, uHardness));

        // Keep the unlit side genuinely dark while allowing a controllable lift.
        float level = uFill + direct * (0.095 * uIntensity);
        vec3 colour = uBase * level;

        // Small hard red highlight makes nose/brow planes snap without whitening.
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 26.0) * (0.025 * uIntensity);
        colour += vec3(1.0, 0.015, 0.02) * spec;

        gl_FragColor = vec4(colour, uOpacity);
      }
    `
  });

  mat.userData.opacityScale = source?.userData?.opacityScale ?? 1;
  mat.userData.hiddenFromSolid = false;
  mat.opacity = source?.opacity ?? 1;
  mat.onBeforeRender = () => {
    mat.uniforms.uOpacity.value = mat.opacity;
  };
  hardMaterials.push(mat);
  return mat;
}

function syncUniforms(){
  for(const mat of hardMaterials){
    mat.uniforms.uLightPos.value.copy(state.light);
    mat.uniforms.uIntensity.value = state.intensity;
    mat.uniforms.uFill.value = state.fill;
    mat.uniforms.uHardness.value = state.hardness;
  }
}

function addLightingControls(){
  const panel = document.querySelector('.panel');
  if(!panel || document.querySelector('#lightX')) return;

  const section = document.createElement('section');
  section.innerHTML = `
    <div class="sectionTitle"><span>05</span> HARSH RED SHADING</div>
    <p class="small">This is graphic light rather than a visible lamp. Move it around to force the brow, nose and jaw into hard red light or near-black shadow.</p>
    <label class="control"><span>Left / right</span><output id="lightXOut">0.0</output><input id="lightX" type="range" min="-28" max="28" step="0.2" value="0" /></label>
    <label class="control"><span>Height</span><output id="lightYOut">22.0</output><input id="lightY" type="range" min="-4" max="34" step="0.2" value="22" /></label>
    <label class="control"><span>Front / back</span><output id="lightZOut">11.0</output><input id="lightZ" type="range" min="-24" max="34" step="0.2" value="11" /></label>
    <label class="control"><span>Intensity</span><output id="lightIntensityOut">6.5</output><input id="lightIntensity" type="range" min="0" max="12" step="0.1" value="6.5" /></label>
    <label class="control"><span>Shadow lift</span><output id="lightFillOut">3%</output><input id="lightFill" type="range" min="0" max="0.35" step="0.005" value="0.025" /></label>
    <label class="control"><span>Hardness</span><output id="lightHardnessOut">72%</output><input id="lightHardness" type="range" min="0" max="1" step="0.01" value="0.72" /></label>
    <div class="buttonRow"><button id="lightTop">TOP</button><button id="lightThree">¾ HARSH</button></div>
  `;
  panel.appendChild(section);

  for(const id of ['lightX','lightY','lightZ','lightIntensity','lightFill','lightHardness']){
    controls[id] = document.querySelector(`#${id}`);
  }

  const apply = () => {
    state.light.set(Number(controls.lightX.value), Number(controls.lightY.value), Number(controls.lightZ.value));
    state.intensity = Number(controls.lightIntensity.value);
    state.fill = Number(controls.lightFill.value);
    state.hardness = Number(controls.lightHardness.value);

    document.querySelector('#lightXOut').value = state.light.x.toFixed(1);
    document.querySelector('#lightYOut').value = state.light.y.toFixed(1);
    document.querySelector('#lightZOut').value = state.light.z.toFixed(1);
    document.querySelector('#lightIntensityOut').value = state.intensity.toFixed(1);
    document.querySelector('#lightFillOut').value = `${Math.round(state.fill * 100)}%`;
    document.querySelector('#lightHardnessOut').value = `${Math.round(state.hardness * 100)}%`;
    syncUniforms();
  };

  controls.apply = apply;
  for(const id of ['lightX','lightY','lightZ','lightIntensity','lightFill','lightHardness']) controls[id].addEventListener('input', apply);

  document.querySelector('#lightTop').addEventListener('click', () => {
    controls.lightX.value = '0';
    controls.lightY.value = '30';
    controls.lightZ.value = '5';
    controls.lightIntensity.value = '7.2';
    controls.lightFill.value = '0.015';
    controls.lightHardness.value = '0.84';
    apply();
  });

  document.querySelector('#lightThree').addEventListener('click', () => {
    controls.lightX.value = '-14';
    controls.lightY.value = '20';
    controls.lightZ.value = '15';
    controls.lightIntensity.value = '7.0';
    controls.lightFill.value = '0.02';
    controls.lightHardness.value = '0.82';
    apply();
  });

  apply();
}

function configureScene(scene){
  activeScene = scene;
  // The hard-light skin shader is self-contained. Kill the old face rig so it
  // cannot flatten the look; mouth geometry may remain dark, which is desirable.
  scene.traverse(object => {
    if(object.isHemisphereLight || object.isDirectionalLight) object.intensity = 0;
  });
  configured = true;
}

function configureFaceMeshes(scene){
  scene.traverse(object => {
    if(!object.isMesh || object.userData.__hardRedV16) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    const hasSolidSkin = source.some(mat => mat?.userData?.opacityScale !== undefined && !mat.userData.hiddenFromSolid);
    if(!hasSolidSkin) return;

    const replacement = source.map(mat => {
      if(mat?.userData?.opacityScale === undefined || mat.userData.hiddenFromSolid) return mat;
      return makeHardRedMaterial(mat);
    });
    object.material = Array.isArray(object.material) ? replacement : replacement[0];
    object.userData.__hardRedV16 = true;
    object.castShadow = false;
    object.receiveShadow = false;
    if(!object.morphTargetInfluences) object.updateMorphTargets();
  });
  syncUniforms();
}

addLightingControls();

THREE.WebGLRenderer.prototype.render = function(scene, camera){
  if(!configured) configureScene(scene);
  if(scene === activeScene && (++meshPass < 180 || meshPass % 120 === 0)) configureFaceMeshes(scene);
  return originalRender.call(this, scene, camera);
};
