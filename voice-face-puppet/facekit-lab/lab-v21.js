import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { buildGroupedGeometry, buildClusteredSkin, setMorphArray } from './facekit-geometry.js?v=13';
import { MASK_PRESETS, partsForMask, partPreset } from './mask-presets-v21.js?v=2';

const FACEKIT='https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const TARGETS=['identity000.obj','identity001.obj','identity002.obj','identity003.obj','jawOpen.obj'];
const canvas=document.querySelector('#stage');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0x040406,1);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;

const portraitLayout=()=>window.innerWidth<=700||window.innerHeight>window.innerWidth*1.1;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x050507,.014);
const camera=new THREE.PerspectiveCamera(34,1,.1,500);camera.position.set(0,portraitLayout()?4:-.3,portraitLayout()?48:43);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.065;controls.target.set(0,portraitLayout()?4:.6,3);controls.minDistance=24;controls.maxDistance=80;controls.enablePan=false;
const headRig=new THREE.Group();scene.add(headRig);
const maskRoot=new THREE.Group();maskRoot.name='mask-root';headRig.add(maskRoot);
const maskGroups=new Map(),maskParts=new Map(),animatedHairMaterials=[];let currentMask='base',maskSize=null;

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

const lightTarget=new THREE.Object3D();lightTarget.position.set(0,4,3);scene.add(lightTarget);
const harshKey=new THREE.DirectionalLight(0xff1830,6.0);harshKey.position.set(0,22,14);harshKey.target=lightTarget;harshKey.castShadow=true;
harshKey.shadow.mapSize.set(1024,1024);harshKey.shadow.camera.near=.5;harshKey.shadow.camera.far=120;harshKey.shadow.camera.left=-18;harshKey.shadow.camera.right=18;harshKey.shadow.camera.top=22;harshKey.shadow.camera.bottom=-22;harshKey.shadow.bias=-.00015;harshKey.shadow.normalBias=.035;scene.add(harshKey);
const redFill=new THREE.AmbientLight(0x380006,.035);scene.add(redFill);

const solidBase=new THREE.MeshStandardMaterial({color:0x9d0715,emissive:0x000000,roughness:.96,metalness:0,transparent:true,opacity:.14,depthWrite:true,depthTest:true,side:THREE.FrontSide});
const wireMat=new THREE.MeshBasicMaterial({color:0xff2638,wireframe:true,transparent:true,opacity:.78,depthTest:true,depthWrite:false,side:THREE.FrontSide});
const depthMat=new THREE.MeshBasicMaterial({color:0x000000,colorWrite:false,depthWrite:true,depthTest:true,side:THREE.FrontSide});
const eyeMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:false,depthTest:true,depthWrite:true,side:THREE.DoubleSide});
const mouthSoftMat=new THREE.MeshStandardMaterial({color:0x070001,emissive:0x000000,roughness:1,metalness:0,transparent:true,opacity:.2,depthTest:true,depthWrite:true,side:THREE.DoubleSide});
const mouthTeethMat=new THREE.MeshStandardMaterial({color:0x241519,emissive:0x000000,roughness:.95,metalness:0,transparent:true,opacity:.18,depthTest:true,depthWrite:true,side:THREE.DoubleSide});
const maskMat=new THREE.MeshStandardMaterial({color:0xb10819,emissive:0x150002,roughness:.72,metalness:.02,depthTest:true,depthWrite:true});
const glassMat=new THREE.MeshStandardMaterial({color:0xe1192c,emissive:0x180003,roughness:.36,metalness:.18,depthTest:true,depthWrite:true});

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
  if(name.includes('eyelashes')){m.color.setHex(0x050000);m.userData.opacityScale=.9;}
  return m;
}
function makeSolidMaterials(base){const src=materialsOf(base.material),result=src.map(buildSolidMaterial);return Array.isArray(base.material)?result:result[0];}
function setSolidOpacity(mesh,value){const v=Number(value);materialsOf(mesh.material).forEach(m=>{if(m.userData.hiddenFromSolid){m.visible=false;m.opacity=0;return;}m.visible=v>.002;m.opacity=Math.min(1,v*(m.userData.opacityScale??1));m.depthWrite=v>.015;});}

function addMesh(group,geometry,material,position,scale=null,rotation=null){
  const mesh=new THREE.Mesh(geometry,material.clone());mesh.position.copy(position);if(scale)mesh.scale.copy(scale);if(rotation)mesh.rotation.set(rotation.x,rotation.y,rotation.z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function addTube(group,points,material,radius,segments=10){
  const curve=new THREE.CatmullRomCurve3(points,false,'catmullrom',.55);
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,6,false),material.clone());mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function addAnimatedHairStrand(group,points,material,radius,{phase=0,tangent,zSign=0,sizeRef,motion,segments=12}={}){
  const curve=new THREE.CatmullRomCurve3(points,false,'catmullrom',.55);
  const hairMat=material.clone(),root=points[0].clone(),tip=points[points.length-1],length=Math.max(.001,root.distanceTo(tip));
  const side=new THREE.Vector3(tangent?.x||1,tangent?.y||0,0).normalize();
  const depthSign=zSign===0?(Math.sin(phase*3.1)>=0?.42:-.42):zSign;
  hairMat.onBeforeCompile=shader=>{
    shader.uniforms.uHairTime={value:0};
    shader.uniforms.uHairPhase={value:phase};
    shader.uniforms.uHairRoot={value:root};
    shader.uniforms.uHairSide={value:side};
    shader.uniforms.uHairLength={value:length};
    shader.uniforms.uHairSpeed={value:motion?.speed??.82};
    shader.uniforms.uHairSideAmp={value:(sizeRef?.x||1)*(motion?.sideAmp??.012)};
    shader.uniforms.uHairLiftAmp={value:(sizeRef?.y||1)*(motion?.liftAmp??.028)};
    shader.uniforms.uHairDepthAmp={value:(sizeRef?.z||1)*(motion?.depthAmp??.018)};
    shader.uniforms.uHairDepthSign={value:depthSign};
    shader.uniforms.uHairTipBias={value:motion?.tipBias??1.45};
    shader.uniforms.uHairMidBias={value:motion?.midBias??.82};
    shader.uniforms.uHairRootStiffness={value:motion?.rootStiffness??.16};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nuniform float uHairTime;\nuniform float uHairPhase;\nuniform vec3 uHairRoot;\nuniform vec3 uHairSide;\nuniform float uHairLength;\nuniform float uHairSpeed;\nuniform float uHairSideAmp;\nuniform float uHairLiftAmp;\nuniform float uHairDepthAmp;\nuniform float uHairDepthSign;\nuniform float uHairTipBias;\nuniform float uHairMidBias;\nuniform float uHairRootStiffness;`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nfloat hairProgress=clamp(length(position-uHairRoot)/max(uHairLength,0.001),0.0,1.0);\nfloat hairRootWeight=smoothstep(uHairRootStiffness,1.0,hairProgress);\nfloat hairMid=pow(hairProgress,1.25)*uHairMidBias;\nfloat hairTip=pow(hairProgress,2.15)*uHairTipBias;\nfloat hairWeight=hairRootWeight*(hairMid*0.32+hairTip*0.68);\nfloat hairA=sin(uHairTime*uHairSpeed+uHairPhase);\nfloat hairB=cos(uHairTime*uHairSpeed*0.77+uHairPhase*1.37);\nfloat hairC=sin(uHairTime*uHairSpeed*1.19+uHairPhase*0.83);\ntransformed+=uHairSide*(uHairSideAmp*hairA*hairWeight);\ntransformed.y+=uHairLiftAmp*hairB*hairWeight;\ntransformed.z+=uHairDepthAmp*hairC*hairWeight*uHairDepthSign;`);
    hairMat.userData.hairShader=shader;
  };
  hairMat.customProgramCacheKey=()=> 'facekit-anemone-hair-v1';
  animatedHairMaterials.push(hairMat);
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,6,false),hairMat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function updateAnimatedHair(time){animatedHairMaterials.forEach(material=>{const shader=material.userData.hairShader;if(shader)shader.uniforms.uHairTime.value=time;});}

const EDIT_KEY='facekit-mask-editor-v21',LEGACY_EDIT_KEY='facekit-mask-editor-v20';
const defaultEdit=()=>({x:0,y:0,z:0,scale:1});
let editState={};
try{
  const saved=localStorage.getItem(EDIT_KEY)||localStorage.getItem(LEGACY_EDIT_KEY)||'{}';
  editState=JSON.parse(saved)||{};
}catch(_){editState={};}

function registerPart(id,part,basePosition){
  part.name=id;part.userData.basePosition=basePosition.clone();part.position.copy(basePosition);maskParts.set(id,part);applyPartEdit(id);
}
function partEdit(id){return {...defaultEdit(),...(editState[id]||{})};}
function applyPartEdit(id){
  const part=maskParts.get(id);if(!part||!maskSize)return;
  const e=partEdit(id),b=part.userData.basePosition;
  part.position.set(b.x+e.x*maskSize.x,b.y+e.y*maskSize.y,b.z+e.z*maskSize.z);
  part.scale.setScalar(e.scale);
}
function saveEdits(){try{localStorage.setItem(EDIT_KEY,JSON.stringify(editState));}catch(_){}}
function anchorVector(anchor,size,center,box,extra={}){
  const x=center.x+(anchor.x||0)*size.x,y=center.y+(anchor.y||0)*size.y;
  let z=center.z+(typeof anchor.z==='number'?anchor.z:0)*size.z;
  if(anchor.z==='face')z=box.max.z+(extra.faceOffset||0);
  return new THREE.Vector3(x,y,z);
}

function buildClownMask(box,size,center){
  const preset=MASK_PRESETS.clown,group=new THREE.Group();group.name='mask-clown';
  const nosePreset=preset.parts.find(p=>p.id==='clown-nose'),radius=size.x*nosePreset.shape.radius;
  const noseBase=anchorVector(nosePreset.anchor,size,center,box,{faceOffset:-radius*nosePreset.shape.embed});
  const nose=new THREE.Group();registerPart(nosePreset.id,nose,noseBase);
  addMesh(nose,new THREE.SphereGeometry(radius,28,20),maskMat,new THREE.Vector3());group.add(nose);

  const cloud=(part,sideSign)=>{
    const tuft=new THREE.Group();registerPart(part.id,tuft,anchorVector(part.anchor,size,center,box));
    preset.cloudPuffs.forEach(([dx,dy,rx,ry,rz])=>addMesh(
      tuft,new THREE.SphereGeometry(1,22,16),maskMat,
      new THREE.Vector3(sideSign*size.x*dx,size.y*dy,0),
      new THREE.Vector3(size.x*rx,size.y*ry,size.z*rz)
    ));
    group.add(tuft);
  };
  cloud(preset.parts.find(p=>p.id==='clown-left'),-1);
  cloud(preset.parts.find(p=>p.id==='clown-right'),1);
  return group;
}

function buildProfessorMask(box,size,center){
  const preset=MASK_PRESETS.professor,g=preset.glasses,h=preset.hair,group=new THREE.Group();group.name='mask-professor';
  const glassesPreset=preset.parts.find(p=>p.id==='prof-glasses');
  const frontOffset=g.frontInset*size.z,r=size.x*g.lensRadius,tube=size.x*g.tubeRadius,eyeX=size.x*g.eyeX;
  const glassesBase=anchorVector(glassesPreset.anchor,size,center,box,{faceOffset:frontOffset});
  const glasses=new THREE.Group();registerPart(glassesPreset.id,glasses,glassesBase);
  [-1,1].forEach(s=>addMesh(glasses,new THREE.TorusGeometry(r,tube,10,52),glassMat,new THREE.Vector3(s*eyeX,0,0)));
  addTube(glasses,[
    new THREE.Vector3(-eyeX+r*.92,size.y*.010,0),
    new THREE.Vector3(-size.x*g.bridgeInnerX,size.y*g.bridgeY,size.z*.003),
    new THREE.Vector3(size.x*g.bridgeInnerX,size.y*g.bridgeY,size.z*.003),
    new THREE.Vector3(eyeX-r*.92,size.y*.010,0)
  ],glassMat,tube*.92,14);
  [-1,1].forEach(s=>addTube(glasses,[
    new THREE.Vector3(s*(eyeX+r*.98),size.y*.004,0),
    new THREE.Vector3(s*size.x*g.templeMidX,size.y*g.templeMidY,size.z*g.templeMidZ),
    new THREE.Vector3(s*size.x*g.templeEndX,size.y*g.templeEndY,size.z*g.templeEndZ)
  ],glassMat,tube*.80,10));
  group.add(glasses);

  const hairPreset=preset.parts.find(p=>p.id==='prof-hair');
  const hair=new THREE.Group();registerPart(hairPreset.id,hair,anchorVector(hairPreset.anchor,size,center,box));
  const hairMat=maskMat.clone();hairMat.roughness=.96;hairMat.metalness=0;
  h.layers.forEach(layer=>{
    for(let i=0;i<layer.count;i++){
      const u=i/(layer.count-1),a=Math.PI*(h.arc.start+h.arc.span*u);
      const radial=new THREE.Vector2(Math.cos(a),Math.sin(a)),tangent=new THREE.Vector2(-radial.y,radial.x);
      const rootX=radial.x*size.x*h.rootX,rootY=radial.y*size.y*h.rootY;
      const nx=rootX/(size.x*h.shellX),ny=rootY/(size.y*h.shellY);
      const shell=Math.sqrt(Math.max(.02,1-nx*nx-ny*ny)),rootZ=layer.zSign*shell*size.z*h.shellZ;
      const start=new THREE.Vector3(rootX*h.rootInset,rootY*h.rootInset,rootZ*.97);
      const wobble=Math.sin(i*1.63+layer.phase),curl=Math.cos(i*1.11+layer.phase);
      const reachX=size.x*(layer.reach+.014*(i%4));
      const reachY=size.y*(layer.reach*h.arc.reachY+.012*((i+2)%5));
      const bend=size.x*(h.arc.bendWobble*wobble+h.arc.bendCurl*curl);
      const zOut=layer.zSign*size.z*(.050+.012*(i%3));
      const p1=start.clone().add(new THREE.Vector3(radial.x*reachX*h.arc.p1[0]+tangent.x*bend*h.arc.p1[2],radial.y*reachY*h.arc.p1[1]+tangent.y*bend*h.arc.p1[3],zOut*h.arc.p1[4]));
      const p2=start.clone().add(new THREE.Vector3(radial.x*reachX*h.arc.p2[0]+tangent.x*bend*h.arc.p2[2],radial.y*reachY*h.arc.p2[1]+tangent.y*bend*h.arc.p2[3],zOut*h.arc.p2[4]+size.z*.016*curl));
      const p3=start.clone().add(new THREE.Vector3(radial.x*reachX*h.arc.p3[0]+tangent.x*bend*h.arc.p3[2],radial.y*reachY*h.arc.p3[1]+tangent.y*bend*h.arc.p3[3],zOut*h.arc.p3[4]+size.z*.020*wobble));
      addAnimatedHairStrand(hair,[start,p1,p2,p3],hairMat,size.x*layer.rad,{phase:layer.phase+i*.23,tangent,zSign:layer.zSign,sizeRef:size,motion:h.motion,segments:12});
    }
  });
  group.add(hair);return group;
}

const MASK_BUILDERS={clown:buildClownMask,professor:buildProfessorMask};
function buildMaskAccessories(box,size,center){
  maskRoot.clear();maskGroups.clear();maskParts.clear();animatedHairMaterials.length=0;maskSize=size.clone();
  Object.keys(MASK_PRESETS).forEach(name=>{
    const group=name==='base'?new THREE.Group():MASK_BUILDERS[name]?.(box,size,center);
    if(!group)return;group.name=`mask-${name}`;maskRoot.add(group);maskGroups.set(name,group);
  });
  setMask(currentMask,false);
}
function setMask(name,announce=true){
  if(maskGroups.size&&!maskGroups.has(name))name='base';currentMask=name;
  maskGroups.forEach((group,key)=>{group.visible=key===name;});
  document.querySelectorAll('[data-mask]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.mask===name);btn.setAttribute('aria-pressed',btn.dataset.mask===name?'true':'false');});
  refreshPartPicker();if(announce&&ready)setStatus(`READY / ${name.toUpperCase()} MASK`,'ready');
}

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
    const solid=new THREE.Mesh(g,makeSolidMaterials(base));solid.castShadow=true;solid.receiveShadow=true;
    const contourGeo=buildGroupedGeometry(base,name=>!excludedContour(name));
    const contour=contourGeo?new THREE.Mesh(contourGeo,makeContourMaterial()):null;if(contour)contour.scale.setScalar(1.0015);
    const low=buildClusteredSkin(base,{portrait:portraitLayout(),excludedSurface,logLabel:'FaceKit Lab 21'});
    let wire=null,depth=null;
    if(low){depth=new THREE.Mesh(low,depthMat.clone());wire=new THREE.Mesh(low,wireMat.clone());wire.scale.setScalar(1.002);setMorphArray(depth,low.morphAttributes.position.length);setMorphArray(wire,low.morphAttributes.position.length);depth.renderOrder=0;wire.renderOrder=2;}
    const eyeGeo=buildGroupedGeometry(base,eyeMaterial),eyes=eyeGeo?new THREE.Mesh(eyeGeo,eyeMat.clone()):null;if(eyes){eyes.renderOrder=1.3;setFullMorphs(eyes);eyes.castShadow=true;}
    const softGeo=buildGroupedGeometry(base,mouthSoftMaterial),teethGeo=buildGroupedGeometry(base,mouthTeethMaterial);
    const mouthSoft=softGeo?new THREE.Mesh(softGeo,mouthSoftMat.clone()):null,mouthTeeth=teethGeo?new THREE.Mesh(teethGeo,mouthTeethMat.clone()):null;
    if(mouthSoft){mouthSoft.renderOrder=1.35;setFullMorphs(mouthSoft);}if(mouthTeeth){mouthTeeth.renderOrder=1.4;setFullMorphs(mouthTeeth);}
    solid.renderOrder=1;if(contour)contour.renderOrder=3;setFullMorphs(solid);setFullMorphs(contour);
    [depth,solid,eyes,mouthSoft,mouthTeeth,wire,contour].filter(Boolean).forEach(m=>{m.position.copy(base.position);m.rotation.copy(base.rotation);m.scale.copy(base.scale);holder.add(m);});
    headRig.add(holder);layerMeshes.push({solid,wire,contour,depth,eyes,mouthSoft,mouthTeeth});
  });
  const box=new THREE.Box3().setFromObject(headRig),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),target=portraitLayout()?15.5:23,scale=target/Math.max(size.x,size.y);
  buildMaskAccessories(box,size,center);headRig.scale.setScalar(scale);headRig.position.set(-center.x*scale,-center.y*scale+(portraitLayout()?4:.8),-center.z*scale+2.8);
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
function enableMorphControls(){document.querySelectorAll('.identity input,#jaw').forEach(el=>el.disabled=false);ready=true;setStatus(`READY / ${currentMask.toUpperCase()} MASK`,'ready');syncMorphs();}
const loader=new OBJLoader(),loadObj=name=>new Promise((res,rej)=>loader.load(FACEKIT+name,res,undefined,rej));
async function boot(){try{setStatus('LOADING NEUTRAL / ~2.6 MB');const base=await loadObj('generic_neutral_mesh.obj');prepareBase(base);for(let i=0;i<TARGETS.length;i++){setStatus(`LOADING MORPH ${i+1}/${TARGETS.length}`);attachTarget(await loadObj(TARGETS[i]),i);await new Promise(r=>requestAnimationFrame(r));}setStatus('BUILDING PRESET MASK RIG');await new Promise(r=>requestAnimationFrame(r));buildLayers();enableMorphControls();}catch(err){console.error(err);setStatus('LOAD FAILED — SEE CONSOLE','error');}}

const ui={wire:document.querySelector('#wire'),solid:document.querySelector('#solid'),contour:document.querySelector('#contour'),drift:document.querySelector('#drift'),jaw:document.querySelector('#jaw'),lightX:document.querySelector('#lightX'),lightY:document.querySelector('#lightY'),lightZ:document.querySelector('#lightZ'),lightIntensity:document.querySelector('#lightIntensity'),lightFill:document.querySelector('#lightFill')},pct=v=>`${Math.round(Number(v)*100)}%`;
function updateLightUI(){
  const x=Number(ui.lightX.value),y=Number(ui.lightY.value),z=Number(ui.lightZ.value),intensity=Number(ui.lightIntensity.value),fill=Number(ui.lightFill.value);
  harshKey.position.set(x,y,z);harshKey.intensity=intensity;redFill.intensity=fill;
  document.querySelector('#lightXOut').value=x.toFixed(1);document.querySelector('#lightYOut').value=y.toFixed(1);document.querySelector('#lightZOut').value=z.toFixed(1);document.querySelector('#lightIntensityOut').value=intensity.toFixed(1);document.querySelector('#lightFillOut').value=`${Math.round(fill*100)}%`;
}
function updateLayerUI(){
  document.querySelector('#wireOut').value=pct(ui.wire.value);document.querySelector('#solidOut').value=pct(ui.solid.value);document.querySelector('#contourOut').value=pct(ui.contour.value);
  const wireAmount=Number(ui.wire.value);
  layerMeshes.forEach(({solid,wire,contour,depth,eyes})=>{setSolidOpacity(solid,ui.solid.value);if(wire)wire.material.opacity=wireAmount;if(depth)depth.visible=wireAmount>.015;if(contour)contour.material.uniforms.uOpacity.value=Number(ui.contour.value);if(eyes)eyes.visible=true;});updateMouthInterior();
}

const editorEls={section:document.querySelector('#maskEditorSection'),part:document.querySelector('#maskPart'),x:document.querySelector('#partX'),y:document.querySelector('#partY'),z:document.querySelector('#partZ'),scale:document.querySelector('#partScale'),xOut:document.querySelector('#partXOut'),yOut:document.querySelector('#partYOut'),zOut:document.querySelector('#partZOut'),scaleOut:document.querySelector('#partScaleOut'),resetPart:document.querySelector('#resetPart'),resetMask:document.querySelector('#resetMask')};
function setEditorDisabled(disabled){[editorEls.part,editorEls.x,editorEls.y,editorEls.z,editorEls.scale,editorEls.resetPart,editorEls.resetMask].forEach(el=>{if(el)el.disabled=disabled;});}
function applyEditorRanges(id){
  const preset=partPreset(id),position=preset?.editor?.position??.25,scale=preset?.editor?.scale??[.5,1.6];
  [editorEls.x,editorEls.y,editorEls.z].forEach(el=>{if(el){el.min=-position;el.max=position;}});
  if(editorEls.scale){editorEls.scale.min=scale[0];editorEls.scale.max=scale[1];}
}
function refreshPartPicker(){
  if(!editorEls.part)return;const parts=partsForMask(currentMask),previous=editorEls.part.value;editorEls.part.innerHTML='';
  if(!parts.length){const o=document.createElement('option');o.value='';o.textContent='No accessory';editorEls.part.appendChild(o);setEditorDisabled(true);syncEditorUI();return;}
  parts.forEach(part=>{const o=document.createElement('option');o.value=part.id;o.textContent=part.label;editorEls.part.appendChild(o);});
  setEditorDisabled(false);editorEls.part.value=parts.some(p=>p.id===previous)?previous:parts[0].id;applyEditorRanges(editorEls.part.value);syncEditorUI();
}
function syncEditorUI(){
  const id=editorEls.part?.value,e=id?partEdit(id):defaultEdit(),disabled=!id;if(id)applyEditorRanges(id);
  if(editorEls.x){editorEls.x.value=e.x;editorEls.y.value=e.y;editorEls.z.value=e.z;editorEls.scale.value=e.scale;}
  if(editorEls.xOut){editorEls.xOut.value=disabled?'—':`${(e.x*100).toFixed(1)}%`;editorEls.yOut.value=disabled?'—':`${(e.y*100).toFixed(1)}%`;editorEls.zOut.value=disabled?'—':`${(e.z*100).toFixed(1)}%`;editorEls.scaleOut.value=disabled?'—':`${Math.round(e.scale*100)}%`;}
}
function commitEditor(){
  const id=editorEls.part.value;if(!id)return;editState[id]={x:Number(editorEls.x.value),y:Number(editorEls.y.value),z:Number(editorEls.z.value),scale:Number(editorEls.scale.value)};applyPartEdit(id);saveEdits();syncEditorUI();
}
editorEls.part?.addEventListener('change',()=>{applyEditorRanges(editorEls.part.value);syncEditorUI();});
['x','y','z','scale'].forEach(k=>editorEls[k]?.addEventListener('input',commitEditor));
editorEls.resetPart?.addEventListener('click',()=>{const id=editorEls.part.value;if(!id)return;delete editState[id];applyPartEdit(id);saveEdits();syncEditorUI();});
editorEls.resetMask?.addEventListener('click',()=>{partsForMask(currentMask).forEach(part=>{delete editState[part.id];applyPartEdit(part.id);});saveEdits();syncEditorUI();});
window.faceMaskPresets=MASK_PRESETS;
window.faceMaskEditor={getState:()=>JSON.parse(JSON.stringify(editState)),getPreset:name=>JSON.parse(JSON.stringify(MASK_PRESETS[name]||null)),resetAll:()=>{editState={};maskParts.forEach((_,id)=>applyPartEdit(id));saveEdits();syncEditorUI();}};

['wire','solid','contour'].forEach(k=>ui[k].addEventListener('input',updateLayerUI));
['lightX','lightY','lightZ','lightIntensity','lightFill'].forEach(k=>ui[k].addEventListener('input',updateLightUI));
for(let i=0;i<4;i++){const el=document.querySelector(`#id${i}`);el.addEventListener('input',()=>{document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2);syncMorphs();});}
ui.jaw.addEventListener('input',()=>{document.querySelector('#jawOut').value=pct(ui.jaw.value);syncMorphs();});
document.querySelector('#zeroIdentity').addEventListener('click',()=>{for(let i=0;i<4;i++){const el=document.querySelector(`#id${i}`);el.value=0;document.querySelector(`#id${i}Out`).value='0.00';}syncMorphs();});
document.querySelector('#randomIdentity').addEventListener('click',()=>{for(let i=0;i<4;i++){const v=Math.random()*1.1-.55,el=document.querySelector(`#id${i}`);el.value=v.toFixed(2);document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2);}syncMorphs();});
document.querySelector('#lightTop').addEventListener('click',()=>{ui.lightX.value=0;ui.lightY.value=30;ui.lightZ.value=5;ui.lightIntensity.value=7.5;ui.lightFill.value=.02;updateLightUI();});
document.querySelector('#lightThree').addEventListener('click',()=>{ui.lightX.value=-14;ui.lightY.value=20;ui.lightZ.value=16;ui.lightIntensity.value=7;ui.lightFill.value=.025;updateLightUI();});
document.querySelectorAll('[data-mask]').forEach(b=>b.addEventListener('click',()=>setMask(b.dataset.mask)));
function setView(name){const views=portraitLayout()?{front:[0,4,48],three:[20,4,43],side:[45,4,8]}:{front:[0,-.3,43],three:[22,1,36],side:[39,.5,5]};const[x,y,z]=views[name];camera.position.set(x,y,z);controls.target.set(0,portraitLayout()?4:.6,3);controls.update();}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
const clock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);resize();controls.update();const t=clock.getElapsedTime();layerMeshes.forEach(({contour})=>{if(contour)contour.material.uniforms.uTime.value=t;});if(ui.drift.checked&&ready){const w=.67+Math.sin(t*.23)*.11+Math.sin(t*.071)*.05,c=.24+Math.sin(t*.17+1.4)*.13,s=.10+Math.sin(t*.11+3.1)*.055;layerMeshes.forEach(({solid,wire,contour,depth,eyes})=>{if(wire)wire.material.opacity=Math.max(.04,Math.min(1,w*Number(ui.wire.value)/.78));if(depth)depth.visible=Number(ui.wire.value)>.015;if(contour)contour.material.uniforms.uOpacity.value=Math.max(0,Math.min(1,c*Number(ui.contour.value)/.34));setSolidOpacity(solid,Math.max(0,Math.min(.5,s*Number(ui.solid.value)/.14)));if(eyes)eyes.visible=true;});updateMouthInterior();}else updateLayerUI();headRig.rotation.y=Math.sin(t*.19)*.018;updateAnimatedHair(t);renderer.render(scene,camera);}
updateLightUI();updateLayerUI();refreshPartPicker();setMask('base',false);boot();animate();