import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const FACEKIT = 'https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const TARGETS = ['identity000.obj','identity001.obj','identity002.obj','identity003.obj','jawOpen.obj'];

const canvas = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0x040406,1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const portraitLayout = () => window.innerWidth <= 700 || window.innerHeight > window.innerWidth * 1.1;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050507,0.014);

const camera = new THREE.PerspectiveCamera(34,1,0.1,500);
camera.position.set(0, portraitLayout()?4:-0.3, portraitLayout()?48:43);
const controls = new OrbitControls(camera,canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.target.set(0, portraitLayout()?4:0.6, 3);
controls.minDistance = 24;
controls.maxDistance = 80;
controls.enablePan = false;

const headRig = new THREE.Group();
scene.add(headRig);
const cageGroup = new THREE.Group();
headRig.add(cageGroup);

const gridMat = new THREE.LineBasicMaterial({color:0x53131b,transparent:true,opacity:0.24});
function makePlaneGrid(size=110,divisions=11){
  const g=new THREE.BufferGeometry(), p=[], half=size/2;
  for(let i=0;i<=divisions;i++){
    const t=-half+size*i/divisions;
    p.push(-half,0,t, half,0,t, t,0,-half, t,0,half);
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  return new THREE.LineSegments(g,gridMat.clone());
}
const floor=makePlaneGrid(); floor.position.set(0,-14,-10); scene.add(floor);
const backGrid=makePlaneGrid(); backGrid.rotation.x=Math.PI/2; backGrid.position.set(0,18,-28); backGrid.material.opacity=.11; scene.add(backGrid);
const sideGrid=makePlaneGrid(); sideGrid.rotation.z=Math.PI/2; sideGrid.position.set(-34,0,-8); sideGrid.material.opacity=.08; scene.add(sideGrid);
const axisGeo=new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-60,0,-18),new THREE.Vector3(60,0,-18),
  new THREE.Vector3(0,-35,-18),new THREE.Vector3(0,35,-18)
]);
scene.add(new THREE.LineSegments(axisGeo,new THREE.LineBasicMaterial({color:0x7c1822,transparent:true,opacity:.17})));

scene.add(new THREE.HemisphereLight(0x7b1d27,0x050507,.6));
const key=new THREE.DirectionalLight(0xff4d5d,1.5); key.position.set(-7,10,16); scene.add(key);
const rim=new THREE.DirectionalLight(0x63101b,.9); rim.position.set(12,2,-10); scene.add(rim);

const solidBase=new THREE.MeshStandardMaterial({
  color:0x440b12,emissive:0x250307,roughness:.72,metalness:.05,
  transparent:true,opacity:.14,depthWrite:true,depthTest:true,side:THREE.FrontSide
});

function makeContourMaterial(){
  return new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(0xff6a74)},uOpacity:{value:.34},uFrequency:{value:.58}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:`
      #include <common>
      #include <morphtarget_pars_vertex>
      varying vec3 vObj; varying vec3 vNormalW; varying vec3 vWorld;
      void main(){
        #include <begin_vertex>
        #include <morphtarget_vertex>
        vObj=transformed;
        vec4 w=modelMatrix*vec4(transformed,1.0);
        vWorld=w.xyz; vNormalW=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader:`
      uniform vec3 uColor; uniform float uOpacity; uniform float uFrequency;
      varying vec3 vObj; varying vec3 vNormalW; varying vec3 vWorld;
      void main(){
        float phase=vObj.y*uFrequency;
        float d=abs(fract(phase)-.5);
        float aa=max(fwidth(phase)*1.35,.012);
        float iso=smoothstep(.47-aa,.5,d);
        vec3 V=normalize(cameraPosition-vWorld);
        float edge=pow(1.0-abs(dot(normalize(vNormalW),V)),2.4);
        float a=max(iso,edge*.32)*uOpacity;
        if(a<.018) discard;
        gl_FragColor=vec4(uColor,a);
      }`
  });
}

function makeWireMaterial(opacityScale=1){
  const m=new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(0xff2638)},uOpacity:{value:.78*opacityScale}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`
      #include <common>
      #include <morphtarget_pars_vertex>
      void main(){
        #include <begin_vertex>
        #include <morphtarget_vertex>
        gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.0);
      }`,
    fragmentShader:`uniform vec3 uColor; uniform float uOpacity; void main(){gl_FragColor=vec4(uColor,uOpacity);}`
  });
  m.userData.opacityScale=opacityScale;
  return m;
}

const layerMeshes=[];
const probeMeshes=[];
const cageMeshes=[];
let baseMeshes=[];
let ready=false;
const raycaster=new THREE.Raycaster();

const meshList=root=>{const a=[]; root.traverse(o=>{if(o.isMesh)a.push(o)}); return a;};
const materialsOf=m=>Array.isArray(m)?m:[m];
const matName=(base,i=0)=>String(materialsOf(base.material)[i]?.name||'').toLowerCase();
const helperMaterial=name=>name.includes('eyeblend')||name.includes('eyeocclusion')||name.includes('lacrimalfluid');
const interiorMaterial=name=>helperMaterial(name)||name.includes('sclera')||name.includes('iris')||name.includes('teeth')||name.includes('gumstongue')||name.includes('tongue')||name.includes('mouth')||name.includes('eyelashes');
const exteriorMaterial=name=>!interiorMaterial(name);

function buildSolidMaterial(sourceMaterial){
  const name=String(sourceMaterial?.name||'').toLowerCase();
  const m=solidBase.clone();
  m.userData.opacityScale=1; m.userData.hiddenFromSolid=false;
  if(helperMaterial(name)){m.visible=false;m.userData.hiddenFromSolid=true;return m;}
  if(name.includes('sclera')){m.color.setHex(0x8a4b54);m.emissive.setHex(0x170407);m.roughness=.48;}
  else if(name.includes('iris')){m.color.setHex(0x160206);m.emissive.setHex(0x080001);m.roughness=.52;}
  else if(name.includes('teeth')){m.color.setHex(0x806164);m.emissive.setHex(0x120708);m.roughness=.58;}
  else if(name.includes('gumstongue')||name.includes('tongue')||name.includes('mouth')){m.color.setHex(0x31040a);m.emissive.setHex(0x170105);m.roughness=.62;m.userData.opacityScale=.75;}
  else if(name.includes('eyelashes')){m.color.setHex(0x090103);m.emissive.setHex(0x000000);m.userData.opacityScale=.9;}
  return m;
}
function makeSolidMaterials(base){
  const src=materialsOf(base.material), result=src.map(buildSolidMaterial);
  return Array.isArray(base.material)?result:result[0];
}
function setSolidOpacity(mesh,value){
  const v=Number(value);
  materialsOf(mesh.material).forEach(m=>{
    if(m.userData.hiddenFromSolid){m.visible=false;m.opacity=0;return;}
    m.visible=v>.002; m.opacity=Math.min(1,v*(m.userData.opacityScale??1)); m.depthWrite=v>.015;
  });
}

function findCounterpart(base,targetMeshes,index){
  if(base.name){
    const hit=targetMeshes.find(m=>m.name===base.name&&m.geometry.attributes.position.count===base.geometry.attributes.position.count);
    if(hit)return hit;
  }
  const same=targetMeshes[index];
  return same&&same.geometry.attributes.position.count===base.geometry.attributes.position.count?same:null;
}
function prepareBase(root){
  baseMeshes=meshList(root);
  baseMeshes.forEach(base=>{
    const g=base.geometry;
    if(!g.attributes.normal)g.computeVertexNormals();
    g.morphAttributes=g.morphAttributes||{}; g.morphAttributes.position=[]; g.morphTargetsRelative=false;
  });
}
function attachTarget(root,morphIndex){
  const targets=meshList(root); let matched=0;
  baseMeshes.forEach((base,index)=>{
    const target=findCounterpart(base,targets,index); if(!target)return;
    base.geometry.morphAttributes.position[morphIndex]=target.geometry.attributes.position.clone(); matched++;
  });
  if(!matched)throw new Error(`No compatible meshes found for morph ${morphIndex}`);
}

function setMorphArray(object,count){
  object.morphTargetInfluences=new Array(count).fill(0);
  object.morphTargetDictionary={};
  for(let i=0;i<count;i++)object.morphTargetDictionary[`morph${i}`]=i;
}

function buildLayers(){
  layerMeshes.length=0; probeMeshes.length=0;
  baseMeshes.forEach((base,index)=>{
    const g=base.geometry, holder=new THREE.Group(); holder.name=`part-${index}`;
    const solid=new THREE.Mesh(g,makeSolidMaterials(base));
    const contour=new THREE.Mesh(g,makeContourMaterial()); contour.scale.setScalar(1.0015);
    [solid,contour].forEach(m=>{m.position.copy(base.position);m.rotation.copy(base.rotation);m.scale.copy(base.scale);holder.add(m);});
    solid.renderOrder=1; contour.renderOrder=3;

    const probeMats=materialsOf(base.material).map(()=>{
      const m=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false});
      m.colorWrite=false; return m;
    });
    const probe=new THREE.Mesh(g,Array.isArray(base.material)?probeMats:probeMats[0]);
    probe.position.copy(base.position);probe.rotation.copy(base.rotation);probe.scale.copy(base.scale);
    probe.userData.baseIndex=index;
    probe.userData.exteriorIndices=new Set(materialsOf(base.material).map((_,i)=>exteriorMaterial(matName(base,i))?i:null).filter(i=>i!==null));
    holder.add(probe); probeMeshes.push(probe);

    headRig.add(holder); layerMeshes.push({solid,contour,probe,partIndex:index});
  });
  scene.updateMatrixWorld(true);
}

function hitIsExterior(hit){
  const mi=hit.face?.materialIndex??0;
  return hit.object.userData.exteriorIndices?.has(mi);
}
function surfaceHit(origin,dir){
  raycaster.set(origin,dir.clone().normalize());
  const hits=raycaster.intersectObjects(probeMeshes,false);
  const hit=hits.find(hitIsExterior);
  if(!hit||!hit.face)return null;
  const probe=hit.object, baseIndex=probe.userData.baseIndex;
  const local=probe.worldToLocal(hit.point.clone());
  const pos=baseMeshes[baseIndex].geometry.attributes.position;
  const a=hit.face.a,b=hit.face.b,c=hit.face.c;
  const va=new THREE.Vector3().fromBufferAttribute(pos,a), vb=new THREE.Vector3().fromBufferAttribute(pos,b), vc=new THREE.Vector3().fromBufferAttribute(pos,c);
  const bary=new THREE.Vector3(); THREE.Triangle.getBarycoord(local,va,vb,vc,bary);
  probe.updateMatrix();
  return {baseIndex,a,b,c,bary,matrix:probe.matrix.clone()};
}
function samplePosition(ref,morphIndex=null){
  const g=baseMeshes[ref.baseIndex].geometry;
  const attr=morphIndex===null?g.attributes.position:g.morphAttributes.position[morphIndex];
  if(!attr)return null;
  const A=new THREE.Vector3().fromBufferAttribute(attr,ref.a);
  const B=new THREE.Vector3().fromBufferAttribute(attr,ref.b);
  const C=new THREE.Vector3().fromBufferAttribute(attr,ref.c);
  return new THREE.Vector3()
    .addScaledVector(A,ref.bary.x).addScaledVector(B,ref.bary.y).addScaledVector(C,ref.bary.z)
    .applyMatrix4(ref.matrix);
}

function addSegment(list,a,b){if(a&&b)list.push([a,b]);}
function uniqueNearestConnections(rowA,rowB,limit=2){
  const edges=[];
  rowA.forEach(a=>{
    const candidates=rowB.filter(Boolean).map(b=>({b,d:Math.abs(a.nx-b.nx)})).sort((x,y)=>x.d-y.d).slice(0,limit);
    candidates.forEach(c=>edges.push([a.ref,c.b.ref]));
  });
  return edges;
}

function makeCageGeometry(segments){
  const refs=[];
  segments.forEach(([a,b])=>{refs.push(a,b)});
  const out=new THREE.BufferGeometry();
  const neutral=new Float32Array(refs.length*3);
  refs.forEach((ref,i)=>{
    const p=samplePosition(ref); if(!p)return;
    neutral[i*3]=p.x;neutral[i*3+1]=p.y;neutral[i*3+2]=p.z;
  });
  out.setAttribute('position',new THREE.BufferAttribute(neutral,3));
  out.morphAttributes={position:[]}; out.morphTargetsRelative=false;
  TARGETS.forEach((_,mi)=>{
    const arr=new Float32Array(refs.length*3);
    refs.forEach((ref,i)=>{
      const p=samplePosition(ref,mi)||samplePosition(ref);
      arr[i*3]=p.x;arr[i*3+1]=p.y;arr[i*3+2]=p.z;
    });
    out.morphAttributes.position[mi]=new THREE.BufferAttribute(arr,3);
  });
  out.computeBoundingSphere(); return out;
}
function addCageMesh(segments,opacityScale){
  if(!segments.length)return;
  const mesh=new THREE.LineSegments(makeCageGeometry(segments),makeWireMaterial(opacityScale));
  setMorphArray(mesh,TARGETS.length); mesh.renderOrder=2; cageGroup.add(mesh); cageMeshes.push(mesh);
}

function buildDesignedCage(){
  cageGroup.clear(); cageMeshes.length=0; scene.updateMatrixWorld(true);
  const box=new THREE.Box3(); probeMeshes.forEach(m=>box.expandByObject(m));
  const center=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3());
  const frontZ=box.max.z+size.z*.9;
  const xHalf=size.x*.47, yMin=box.min.y+size.y*.10, ySpan=size.y*.86;

  const frontRowsSpec=[
    {y:.91,x:[-.40,-.13,.13,.40]},
    {y:.80,x:[-.57,-.28,0,.28,.57]},
    {y:.69,x:[-.67,-.36,-.10,.10,.36,.67]},
    {y:.57,x:[-.70,-.38,0,.38,.70]},
    {y:.45,x:[-.66,-.33,0,.33,.66]},
    {y:.33,x:[-.57,-.26,.26,.57]},
    {y:.22,x:[-.40,0,.40]}
  ];
  const frontRows=frontRowsSpec.map(row=>row.x.map(nx=>{
    const x=center.x+nx*xHalf, y=yMin+row.y*ySpan;
    const ref=surfaceHit(new THREE.Vector3(x,y,frontZ),new THREE.Vector3(0,0,-1));
    return ref?{nx,ref}:null;
  }).filter(Boolean));

  const frontSegments=[];
  frontRows.forEach(row=>{for(let i=0;i<row.length-1;i++)addSegment(frontSegments,row[i].ref,row[i+1].ref)});
  for(let r=0;r<frontRows.length-1;r++)uniqueNearestConnections(frontRows[r],frontRows[r+1],2).forEach(e=>frontSegments.push(e));
  const nearest=(row,nx)=>row.slice().sort((a,b)=>Math.abs(a.nx-nx)-Math.abs(b.nx-nx))[0]?.ref;
  for(let r=1;r<frontRows.length-1;r++)addSegment(frontSegments,nearest(frontRows[r],0),nearest(frontRows[r+1],0));
  addSegment(frontSegments,nearest(frontRows[2],-.36),nearest(frontRows[4],-.33));
  addSegment(frontSegments,nearest(frontRows[2], .36),nearest(frontRows[4], .33));
  addSegment(frontSegments,nearest(frontRows[4],-.66),nearest(frontRows[6],-.40));
  addSegment(frontSegments,nearest(frontRows[4], .66),nearest(frontRows[6], .40));

  const ys=[.90,.72,.54,.36,.22];
  const angles=[-.78,-1.20,-1.72,-2.25,-2.72,Math.PI,2.72,2.25,1.72,1.20,.78];
  const radialRadius=Math.max(size.x,size.z)*1.5;
  const backRows=ys.map(yNorm=>angles.map(theta=>{
    const y=yMin+yNorm*ySpan;
    const origin=new THREE.Vector3(center.x+Math.sin(theta)*radialRadius,y,center.z+Math.cos(theta)*radialRadius);
    const dir=new THREE.Vector3(center.x-origin.x,0,center.z-origin.z);
    const ref=surfaceHit(origin,dir);
    return ref?{theta,ref}:null;
  }));
  const rearSegments=[];
  backRows.forEach(row=>{for(let i=0;i<row.length-1;i++)if(row[i]&&row[i+1])addSegment(rearSegments,row[i].ref,row[i+1].ref)});
  for(let r=0;r<backRows.length-1;r++){
    for(let i=0;i<angles.length;i++){
      if(backRows[r][i]&&backRows[r+1][i])addSegment(rearSegments,backRows[r][i].ref,backRows[r+1][i].ref);
      const j=i+(r%2?1:-1);
      if(j>=0&&j<angles.length&&backRows[r][i]&&backRows[r+1][j])addSegment(rearSegments,backRows[r][i].ref,backRows[r+1][j].ref);
    }
  }

  const bridgeSegments=[];
  [1,3,5].forEach(frontRowIndex=>{
    const fr=frontRows[frontRowIndex]; if(!fr?.length)return;
    const yNorm=frontRowsSpec[frontRowIndex].y;
    [-1,1].forEach(side=>{
      const theta=side*.78, y=yMin+yNorm*ySpan;
      const origin=new THREE.Vector3(center.x+Math.sin(theta)*radialRadius,y,center.z+Math.cos(theta)*radialRadius);
      const sideRef=surfaceHit(origin,new THREE.Vector3(center.x-origin.x,0,center.z-origin.z));
      const faceRef=side<0?fr[0].ref:fr[fr.length-1].ref;
      addSegment(bridgeSegments,faceRef,sideRef);
    });
  });

  addCageMesh(frontSegments,1.0);
  addCageMesh(bridgeSegments,.82);
  addCageMesh(rearSegments,.48);
}

function fitHead(){
  const box=new THREE.Box3().setFromObject(headRig), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  const portrait=portraitLayout(), targetSize=portrait?15.5:23, scale=targetSize/Math.max(size.x,size.y);
  headRig.scale.setScalar(scale);
  headRig.position.set(-center.x*scale,-center.y*scale+(portrait?4:.8),-center.z*scale+2.8);
}

function syncMorphs(){
  const identity=[0,1,2,3].map(i=>Number(document.querySelector(`#id${i}`).value)), jaw=Number(document.querySelector('#jaw').value);
  layerMeshes.forEach(({solid,contour,probe})=>{
    [solid,contour,probe].filter(Boolean).forEach(m=>{
      if(!m.morphTargetInfluences)m.updateMorphTargets();
      if(!m.morphTargetInfluences)return;
      for(let i=0;i<4;i++)m.morphTargetInfluences[i]=identity[i]; m.morphTargetInfluences[4]=jaw;
    });
  });
  cageMeshes.forEach(wire=>{
    if(!wire.morphTargetInfluences)return;
    for(let i=0;i<4;i++)wire.morphTargetInfluences[i]=identity[i]; wire.morphTargetInfluences[4]=jaw;
  });
}

function setStatus(text,kind=''){
  document.querySelector('#status').textContent=text;
  document.querySelector('#statusDot').className='statusDot'+(kind?` ${kind}`:'');
}
function enableMorphControls(){
  document.querySelectorAll('.identity input,#jaw').forEach(el=>el.disabled=false);
  ready=true; setStatus('READY / FACETED EXTERIOR CAGE','ready'); syncMorphs();
}

const loader=new OBJLoader();
const loadObj=name=>new Promise((resolve,reject)=>loader.load(FACEKIT+name,resolve,undefined,reject));
async function boot(){
  try{
    setStatus('LOADING NEUTRAL / ~2.6 MB');
    prepareBase(await loadObj('generic_neutral_mesh.obj'));
    for(let i=0;i<TARGETS.length;i++){
      setStatus(`LOADING MORPH ${i+1}/${TARGETS.length}`);
      attachTarget(await loadObj(TARGETS[i]),i);
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    setStatus('BUILDING EXTERIOR FACETS');
    buildLayers();
    await new Promise(resolve=>requestAnimationFrame(resolve));
    buildDesignedCage();
    fitHead();
    enableMorphControls();
  }catch(err){console.error(err);setStatus('LOAD FAILED — SEE CONSOLE','error');}
}

const ui={wire:document.querySelector('#wire'),solid:document.querySelector('#solid'),contour:document.querySelector('#contour'),drift:document.querySelector('#drift'),jaw:document.querySelector('#jaw')};
const pct=v=>`${Math.round(Number(v)*100)}%`;
function updateLayerUI(){
  document.querySelector('#wireOut').value=pct(ui.wire.value);
  document.querySelector('#solidOut').value=pct(ui.solid.value);
  document.querySelector('#contourOut').value=pct(ui.contour.value);
  layerMeshes.forEach(({solid,contour})=>{setSolidOpacity(solid,ui.solid.value);contour.material.uniforms.uOpacity.value=Number(ui.contour.value)});
  cageMeshes.forEach(w=>w.material.uniforms.uOpacity.value=Number(ui.wire.value)*(w.material.userData.opacityScale??1));
}
['wire','solid','contour'].forEach(k=>ui[k].addEventListener('input',updateLayerUI));
for(let i=0;i<4;i++){
  const el=document.querySelector(`#id${i}`);
  el.addEventListener('input',()=>{document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2);syncMorphs()});
}
ui.jaw.addEventListener('input',()=>{document.querySelector('#jawOut').value=pct(ui.jaw.value);syncMorphs()});
document.querySelector('#zeroIdentity').addEventListener('click',()=>{for(let i=0;i<4;i++){const el=document.querySelector(`#id${i}`);el.value=0;document.querySelector(`#id${i}Out`).value='0.00'}syncMorphs()});
document.querySelector('#randomIdentity').addEventListener('click',()=>{for(let i=0;i<4;i++){const v=Math.random()*1.1-.55,el=document.querySelector(`#id${i}`);el.value=v.toFixed(2);document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2)}syncMorphs()});

function setView(name){
  const portrait=portraitLayout();
  const views=portrait?{front:[0,4,48],three:[20,4,43],side:[45,4,8]}:{front:[0,-.3,43],three:[22,1,36],side:[39,.5,5]};
  const [x,y,z]=views[name]; camera.position.set(x,y,z); controls.target.set(0,portrait?4:.6,3); controls.update();
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
}
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate); resize(); controls.update(); const t=clock.getElapsedTime();
  if(ui.drift.checked&&ready){
    const w=.67+Math.sin(t*.23)*.11+Math.sin(t*.071)*.05,c=.24+Math.sin(t*.17+1.4)*.13,s=.10+Math.sin(t*.11+3.1)*.055;
    cageMeshes.forEach(mesh=>mesh.material.uniforms.uOpacity.value=Math.max(.025,Math.min(1,w*Number(ui.wire.value)/.78*(mesh.material.userData.opacityScale??1))));
    layerMeshes.forEach(({solid,contour})=>{contour.material.uniforms.uOpacity.value=Math.max(0,Math.min(1,c*Number(ui.contour.value)/.34));setSolidOpacity(solid,Math.max(0,Math.min(.5,s*Number(ui.solid.value)/.14)))});
  }else updateLayerUI();
  headRig.rotation.y=Math.sin(t*.19)*.018;
  renderer.render(scene,camera);
}
updateLayerUI(); boot(); animate();
