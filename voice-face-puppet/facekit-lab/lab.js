import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { buildGroupedGeometry, buildClusteredSkin, setMorphArray } from './facekit-geometry.js?v=13';

const FACEKIT='https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const TARGETS=['identity000.obj','identity001.obj','identity002.obj','identity003.obj','jawOpen.obj'];
const canvas=document.querySelector('#stage');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x040406,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
const portraitLayout=()=>window.innerWidth<=700||window.innerHeight>window.innerWidth*1.1;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x050507,.014);
const camera=new THREE.PerspectiveCamera(34,1,.1,500);camera.position.set(0,portraitLayout()?4:-.3,portraitLayout()?48:43);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.065;controls.target.set(0,portraitLayout()?4:.6,3);controls.minDistance=24;controls.maxDistance=80;controls.enablePan=false;
const headRig=new THREE.Group();scene.add(headRig);

const gridMat=new THREE.LineBasicMaterial({color:0x53131b,transparent:true,opacity:.24});
function makePlaneGrid(size=110,divisions=11){
  const g=new THREE.BufferGeometry(),p=[],h=size/2;
  for(let i=0;i<=divisions;i++){const t=-h+size*i/divisions;p.push(-h,0,t,h,0,t,t,0,-h,t,0,h);}
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));return new THREE.LineSegments(g,gridMat.clone());
}
const floor=makePlaneGrid();floor.position.set(0,-14,-10);scene.add(floor);
const back=makePlaneGrid();back.rotation.x=Math.PI/2;back.position.set(0,18,-28);back.material.opacity=.11;scene.add(back);
const side=makePlaneGrid();side.rotation.z=Math.PI/2;side.position.set(-34,0,-8);side.material.opacity=.08;scene.add(side);
const axesGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-60,0,-18),new THREE.Vector3(60,0,-18),new THREE.Vector3(0,-35,-18),new THREE.Vector3(0,35,-18)]);
scene.add(new THREE.LineSegments(axesGeo,new THREE.LineBasicMaterial({color:0x7c1822,transparent:true,opacity:.17})));
scene.add(new THREE.HemisphereLight(0x7b1d27,0x050507,.6));
const key=new THREE.DirectionalLight(0xff4d5d,1.5);key.position.set(-7,10,16);scene.add(key);
const rim=new THREE.DirectionalLight(0x63101b,.9);rim.position.set(12,2,-10);scene.add(rim);

const solidBase=new THREE.MeshStandardMaterial({color:0x440b12,emissive:0x250307,roughness:.72,metalness:.05,transparent:true,opacity:.14,depthWrite:true,depthTest:true,side:THREE.FrontSide});
const wireMat=new THREE.MeshBasicMaterial({color:0xff2638,wireframe:true,transparent:true,opacity:.78,depthTest:true,depthWrite:false,side:THREE.FrontSide});
const depthMat=new THREE.MeshBasicMaterial({color:0x000000,colorWrite:false,depthWrite:true,depthTest:true,side:THREE.FrontSide});
const eyeMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:false,depthTest:true,depthWrite:true,side:THREE.DoubleSide});
const mouthSoftMat=new THREE.MeshStandardMaterial({color:0x070001,emissive:0x020000,roughness:1,metalness:0,transparent:true,opacity:.2,depthTest:true,depthWrite:true,side:THREE.DoubleSide});
const mouthTeethMat=new THREE.MeshStandardMaterial({color:0x241519,emissive:0x030101,roughness:.9,metalness:0,transparent:true,opacity:.18,depthTest:true,depthWrite:true,side:THREE.DoubleSide});

function makeContourMaterial(){return new THREE.ShaderMaterial({
  uniforms:{uColor:{value:new THREE.Color(0xff6a74)},uOpacity:{value:.34},uFrequency:{value:.82},uTime:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  vertexShader:`#include <common>\n#include <morphtarget_pars_vertex>\nvarying vec3 vObj;varying vec3 vNormalW;varying vec3 vWorld;void main(){\n#include <begin_vertex>\n#include <morphtarget_vertex>\nvObj=transformed;vec4 w=modelMatrix*vec4(transformed,1.0);vWorld=w.xyz;vNormalW=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform vec3 uColor;uniform float uOpacity;uniform float uFrequency;uniform float uTime;varying vec3 vObj;varying vec3 vNormalW;varying vec3 vWorld;void main(){float flow=vObj.x*uFrequency+sin(vObj.y*.84+uTime*.58)*.16+sin(vObj.z*1.28-uTime*.34)*.11;float sweep=flow+uTime*.11;float d=abs(fract(sweep)-.5);float aa=max(fwidth(sweep)*1.4,.012);float band=smoothstep(.47-aa,.5,d);vec3 V=normalize(cameraPosition-vWorld);float edge=pow(1.0-abs(dot(normalize(vNormalW),V)),2.25);float pulse=.9+.1*sin(uTime*1.35+vObj.y*.42);float a=max(band,edge*.30)*uOpacity*pulse;if(a<.018)discard;gl_FragColor=vec4(uColor,a);}`
});}

const layerMeshes=[];let baseMeshes=[],ready=false;
const materialsOf=mat=>Array.isArray(mat)?mat:[mat];
const meshList=root=>{const out=[];root.traverse(o=>{if(o.isMesh)out.push(o)});return out;};
const helperMaterial=name=>name.includes('eyeblend')||name.includes('eyeocclusion')||name.includes('lacrimalfluid');
const eyeMaterial=name=>name.includes('sclera')||name.includes('iris');
const mouthSoftMaterial=name=>name.includes('gumstongue')||name.includes('tongue')||name.includes('mouth');
const mouthTeethMaterial=name=>name.includes('teeth');
const mouthInteriorMaterial=name=>mouthSoftMaterial(name)||mouthTeethMaterial(name);
const excludedSurface=name=>helperMaterial(name)||eyeMaterial(name)||mouthInteriorMaterial(name)||name.includes('eyelashes');
const excludedContour=name=>helperMaterial(name)||eyeMaterial(name)||mouthInteriorMaterial(name);

function buildSolidMaterial(sourceMaterial){
  const name=String(sourceMaterial?.name||'').toLowerCase(),m=solidBase.clone();m.userData.opacityScale=1;m.userData.hiddenFromSolid=false;
  if(helperMaterial(name)||eyeMaterial(name)||mouthInteriorMaterial(name)){m.visible=false;m.userData.hiddenFromSolid=true;return m;}
  if(name.includes('eyelashes')){m.color.setHex(0x090103);m.emissive.setHex(0);m.userData.opacityScale=.9;}
  return m;
}
function makeSolidMaterials(base){const src=materialsOf(base.material),result=src.map(buildSolidMaterial);return Array.isArray(base.material)?result:result[0];}
function setSolidOpacity(mesh,value){const v=Number(value);materialsOf(mesh.material).forEach(m=>{if(m.userData.hiddenFromSolid){m.visible=false;m.opacity=0;return;}m.visible=v>.002;m.opacity=Math.min(1,v*(m.userData.opacityScale??1));m.depthWrite=v>.015;});}

function findCounterpart(base,targetMeshes,index){
  if(base.name){const hit=targetMeshes.find(m=>m.name===base.name&&m.geometry.attributes.position.count===base.geometry.attributes.position.count);if(hit)return hit;}
  const same=targetMeshes[index];return same&&same.geometry.attributes.position.count===base.geometry.attributes.position.count?same:null;
}
function prepareBase(root){baseMeshes=meshList(root);baseMeshes.forEach(base=>{const g=base.geometry;if(!g.attributes.normal)g.computeVertexNormals();g.morphAttributes=g.morphAttributes||{};g.morphAttributes.position=[];g.morphTargetsRelative=false;});}
function attachTarget(root,morphIndex){const targets=meshList(root);let matched=0;baseMeshes.forEach((base,index)=>{const target=findCounterpart(base,targets,index);if(!target)return;base.geometry.morphAttributes.position[morphIndex]=target.geometry.attributes.position.clone();matched++;});if(!matched)throw new Error(`No compatible meshes for morph ${morphIndex}`);}
function setFullMorphs(mesh){if(mesh&&!mesh.morphTargetInfluences)mesh.updateMorphTargets();}

function buildLayers(){
  baseMeshes.forEach((base,index)=>{
    const g=base.geometry,holder=new THREE.Group();holder.name=`part-${index}`;
    const solid=new THREE.Mesh(g,makeSolidMaterials(base));
    const contourGeo=buildGroupedGeometry(base,name=>!excludedContour(name));
    const contour=contourGeo?new THREE.Mesh(contourGeo,makeContourMaterial()):null;if(contour)contour.scale.setScalar(1.0015);
    const low=buildClusteredSkin(base,{portrait:portraitLayout(),excludedSurface,logLabel:'FaceKit Lab 14'});
    let wire=null,depth=null;
    if(low){depth=new THREE.Mesh(low,depthMat.clone());wire=new THREE.Mesh(low,wireMat.clone());wire.scale.setScalar(1.002);setMorphArray(depth,low.morphAttributes.position.length);setMorphArray(wire,low.morphAttributes.position.length);depth.renderOrder=0;wire.renderOrder=2;}

    const eyeGeo=buildGroupedGeometry(base,eyeMaterial);
    const eyes=eyeGeo?new THREE.Mesh(eyeGeo,eyeMat.clone()):null;
    if(eyes){eyes.renderOrder=1.3;setFullMorphs(eyes);}

    const softGeo=buildGroupedGeometry(base,mouthSoftMaterial),teethGeo=buildGroupedGeometry(base,mouthTeethMaterial);
    const mouthSoft=softGeo?new THREE.Mesh(softGeo,mouthSoftMat.clone()):null,mouthTeeth=teethGeo?new THREE.Mesh(teethGeo,mouthTeethMat.clone()):null;
    if(mouthSoft){mouthSoft.renderOrder=1.35;setFullMorphs(mouthSoft);}if(mouthTeeth){mouthTeeth.renderOrder=1.4;setFullMorphs(mouthTeeth);}
    solid.renderOrder=1;if(contour)contour.renderOrder=3;setFullMorphs(solid);setFullMorphs(contour);
    [depth,solid,eyes,mouthSoft,mouthTeeth,wire,contour].filter(Boolean).forEach(m=>{m.position.copy(base.position);m.rotation.copy(base.rotation);m.scale.copy(base.scale);holder.add(m);});
    headRig.add(holder);layerMeshes.push({solid,wire,contour,depth,eyes,mouthSoft,mouthTeeth});
  });
  const box=new THREE.Box3().setFromObject(headRig),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),target=portraitLayout()?15.5:23,scale=target/Math.max(size.x,size.y);
  headRig.scale.setScalar(scale);headRig.position.set(-center.x*scale,-center.y*scale+(portraitLayout()?4:.8),-center.z*scale+2.8);
}

function morphValues(){return{identity:[0,1,2,3].map(i=>Number(document.querySelector(`#id${i}`).value)),jaw:Number(document.querySelector('#jaw').value)};}
function applyMorphs(mesh,identity,jaw){if(!mesh)return;if(!mesh.morphTargetInfluences)mesh.updateMorphTargets();if(!mesh.morphTargetInfluences)return;for(let i=0;i<4;i++)mesh.morphTargetInfluences[i]=identity[i];mesh.morphTargetInfluences[4]=jaw;}
function updateMouthInterior(){
  const jaw=Number(document.querySelector('#jaw')?.value||0),softOpacity=THREE.MathUtils.lerp(.12,.96,Math.pow(jaw,.62)),teethOpacity=THREE.MathUtils.lerp(.08,.72,Math.pow(jaw,.75));
  layerMeshes.forEach(({mouthSoft,mouthTeeth})=>{if(mouthSoft){mouthSoft.visible=true;mouthSoft.material.opacity=softOpacity;}if(mouthTeeth){mouthTeeth.visible=true;mouthTeeth.material.opacity=teethOpacity;}});
}
function updateEyes(){layerMeshes.forEach(({eyes})=>{if(eyes)eyes.visible=true;});}
function syncMorphs(){const{identity,jaw}=morphValues();layerMeshes.forEach(({solid,wire,contour,depth,eyes,mouthSoft,mouthTeeth})=>[solid,wire,contour,depth,eyes,mouthSoft,mouthTeeth].forEach(m=>applyMorphs(m,identity,jaw)));updateEyes();updateMouthInterior();}

function setStatus(text,kind=''){document.querySelector('#status').textContent=text;document.querySelector('#statusDot').className='statusDot'+(kind?` ${kind}`:'');}
function enableMorphControls(){document.querySelectorAll('.identity input,#jaw').forEach(el=>el.disabled=false);ready=true;setStatus('READY / ANIMATED VERTICAL CONTOUR','ready');syncMorphs();}
const loader=new OBJLoader(),loadObj=name=>new Promise((res,rej)=>loader.load(FACEKIT+name,res,undefined,rej));
async function boot(){try{setStatus('LOADING NEUTRAL / ~2.6 MB');const base=await loadObj('generic_neutral_mesh.obj');prepareBase(base);for(let i=0;i<TARGETS.length;i++){setStatus(`LOADING MORPH ${i+1}/${TARGETS.length}`);attachTarget(await loadObj(TARGETS[i]),i);await new Promise(r=>requestAnimationFrame(r));}setStatus('BUILDING ANIMATED VERTICAL CONTOUR');await new Promise(r=>requestAnimationFrame(r));buildLayers();enableMorphControls();}catch(err){console.error(err);setStatus('LOAD FAILED — SEE CONSOLE','error');}}

const ui={wire:document.querySelector('#wire'),solid:document.querySelector('#solid'),contour:document.querySelector('#contour'),drift:document.querySelector('#drift'),jaw:document.querySelector('#jaw')},pct=v=>`${Math.round(Number(v)*100)}%`;
function updateLayerUI(){document.querySelector('#wireOut').value=pct(ui.wire.value);document.querySelector('#solidOut').value=pct(ui.solid.value);document.querySelector('#contourOut').value=pct(ui.contour.value);layerMeshes.forEach(({solid,wire,contour,eyes})=>{setSolidOpacity(solid,ui.solid.value);if(wire)wire.material.opacity=Number(ui.wire.value);if(contour)contour.material.uniforms.uOpacity.value=Number(ui.contour.value);if(eyes)eyes.visible=true;});updateMouthInterior();}
['wire','solid','contour'].forEach(k=>ui[k].addEventListener('input',updateLayerUI));
for(let i=0;i<4;i++){const el=document.querySelector(`#id${i}`);el.addEventListener('input',()=>{document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2);syncMorphs();});}
ui.jaw.addEventListener('input',()=>{document.querySelector('#jawOut').value=pct(ui.jaw.value);syncMorphs();});
document.querySelector('#zeroIdentity').addEventListener('click',()=>{for(let i=0;i<4;i++){const el=document.querySelector(`#id${i}`);el.value=0;document.querySelector(`#id${i}Out`).value='0.00';}syncMorphs();});
document.querySelector('#randomIdentity').addEventListener('click',()=>{for(let i=0;i<4;i++){const v=Math.random()*1.1-.55,el=document.querySelector(`#id${i}`);el.value=v.toFixed(2);document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2);}syncMorphs();});
function setView(name){const views=portraitLayout()?{front:[0,4,48],three:[20,4,43],side:[45,4,8]}:{front:[0,-.3,43],three:[22,1,36],side:[39,.5,5]};const[x,y,z]=views[name];camera.position.set(x,y,z);controls.target.set(0,portraitLayout()?4:.6,3);controls.update();}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
const clock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);resize();controls.update();const t=clock.getElapsedTime();layerMeshes.forEach(({contour})=>{if(contour)contour.material.uniforms.uTime.value=t;});if(ui.drift.checked&&ready){const w=.67+Math.sin(t*.23)*.11+Math.sin(t*.071)*.05,c=.24+Math.sin(t*.17+1.4)*.13,s=.10+Math.sin(t*.11+3.1)*.055;layerMeshes.forEach(({solid,wire,contour,eyes})=>{if(wire)wire.material.opacity=Math.max(.04,Math.min(1,w*Number(ui.wire.value)/.78));if(contour)contour.material.uniforms.uOpacity.value=Math.max(0,Math.min(1,c*Number(ui.contour.value)/.34));setSolidOpacity(solid,Math.max(0,Math.min(.5,s*Number(ui.solid.value)/.14)));if(eyes)eyes.visible=true;});updateMouthInterior();}else updateLayerUI();headRig.rotation.y=Math.sin(t*.19)*.018;renderer.render(scene,camera);}
updateLayerUI();boot();animate();
