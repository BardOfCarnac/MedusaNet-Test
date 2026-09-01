import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const FACEKIT = 'https://cdn.jsdelivr.net/gh/USC-ICT/ICT-FaceKit@master/FaceXModel/';
const TARGETS = ['identity000.obj','identity001.obj','identity002.obj','identity003.obj','jawOpen.obj'];

const canvas = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x040406, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const portraitLayout = () => window.innerWidth <= 700 || window.innerHeight > window.innerWidth * 1.1;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050507, 0.014);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
camera.position.set(0, portraitLayout() ? 4 : -.3, portraitLayout() ? 48 : 43);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = .065;
controls.target.set(0, portraitLayout() ? 4 : .6, 3);
controls.minDistance = 24;
controls.maxDistance = 80;
controls.enablePan = false;

const headRig = new THREE.Group();
scene.add(headRig);

const gridMat = new THREE.LineBasicMaterial({ color:0x53131b, transparent:true, opacity:.24 });
function makePlaneGrid(size=110, divisions=11){
  const g = new THREE.BufferGeometry();
  const p=[]; const h=size/2;
  for(let i=0;i<=divisions;i++){
    const t=-h+size*i/divisions;
    p.push(-h,0,t,h,0,t,t,0,-h,t,0,h);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p,3));
  return new THREE.LineSegments(g, gridMat.clone());
}
const floor=makePlaneGrid(); floor.position.set(0,-14,-10); scene.add(floor);
const back=makePlaneGrid(); back.rotation.x=Math.PI/2; back.position.set(0,18,-28); back.material.opacity=.11; scene.add(back);
const side=makePlaneGrid(); side.rotation.z=Math.PI/2; side.position.set(-34,0,-8); side.material.opacity=.08; scene.add(side);

const axesGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-60,0,-18),new THREE.Vector3(60,0,-18),
  new THREE.Vector3(0,-35,-18),new THREE.Vector3(0,35,-18)
]);
scene.add(new THREE.LineSegments(axesGeo,new THREE.LineBasicMaterial({color:0x7c1822,transparent:true,opacity:.17})));

scene.add(new THREE.HemisphereLight(0x7b1d27,0x050507,.6));
const key=new THREE.DirectionalLight(0xff4d5d,1.5); key.position.set(-7,10,16); scene.add(key);
const rim=new THREE.DirectionalLight(0x63101b,.9); rim.position.set(12,2,-10); scene.add(rim);

const solidBase = new THREE.MeshStandardMaterial({
  color:0x440b12, emissive:0x250307, roughness:.72, metalness:.05,
  transparent:true, opacity:.14, depthWrite:true, depthTest:true, side:THREE.FrontSide
});

function makeContourMaterial(){
  return new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(0xff6a74)},uOpacity:{value:.34},uFrequency:{value:.58}},
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
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

const wireMat = new THREE.MeshBasicMaterial({
  color:0xff2638, wireframe:true, transparent:true, opacity:.78,
  depthTest:true, depthWrite:false, side:THREE.FrontSide
});
const depthMat = new THREE.MeshBasicMaterial({
  color:0x000000, colorWrite:false, depthWrite:true, depthTest:true, side:THREE.FrontSide
});

const layerMeshes=[];
let baseMeshes=[];
let ready=false;

function meshList(root){ const out=[]; root.traverse(o=>{if(o.isMesh)out.push(o)}); return out; }
function materialsOf(mat){ return Array.isArray(mat)?mat:[mat]; }
function materialName(base, idx){ return String(materialsOf(base.material)[idx||0]?.name||'').toLowerCase(); }
function excludedSurface(name){
  return name.includes('eyeblend') || name.includes('eyeocclusion') || name.includes('lacrimalfluid') ||
         name.includes('sclera') || name.includes('iris') || name.includes('teeth') ||
         name.includes('gumstongue') || name.includes('tongue') || name.includes('eyelashes');
}
function helperMaterial(name){ return name.includes('eyeblend')||name.includes('eyeocclusion')||name.includes('lacrimalfluid'); }

function buildSolidMaterial(sourceMaterial){
  const name=String(sourceMaterial?.name||'').toLowerCase();
  const m=solidBase.clone();
  m.userData.opacityScale=1; m.userData.hiddenFromSolid=false;
  if(helperMaterial(name)){m.visible=false;m.userData.hiddenFromSolid=true;return m;}
  if(name.includes('sclera')){m.color.setHex(0x8a4b54);m.emissive.setHex(0x170407);m.roughness=.48;}
  else if(name.includes('iris')){m.color.setHex(0x160206);m.emissive.setHex(0x080001);m.roughness=.52;}
  else if(name.includes('teeth')){m.color.setHex(0x806164);m.emissive.setHex(0x120708);m.roughness=.58;}
  else if(name.includes('gumstongue')||name.includes('tongue')){m.color.setHex(0x31040a);m.emissive.setHex(0x170105);m.roughness=.62;m.userData.opacityScale=.75;}
  else if(name.includes('eyelashes')){m.color.setHex(0x090103);m.emissive.setHex(0x000000);m.userData.opacityScale=.9;}
  return m;
}
function makeSolidMaterials(base){
  const src=materialsOf(base.material); const result=src.map(buildSolidMaterial);
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
    g.morphAttributes=g.morphAttributes||{};
    g.morphAttributes.position=[];
    g.morphTargetsRelative=false;
  });
}
function attachTarget(root,morphIndex){
  const targets=meshList(root); let matched=0;
  baseMeshes.forEach((base,index)=>{
    const target=findCounterpart(base,targets,index); if(!target)return;
    base.geometry.morphAttributes.position[morphIndex]=target.geometry.attributes.position.clone(); matched++;
  });
  if(!matched)throw new Error(`No compatible meshes for morph ${morphIndex}`);
}

function buildClusteredSkin(base, quality=1){
  const src=base.geometry;
  const pos=src.attributes.position;
  const idx=src.index;
  const morphs=src.morphAttributes.position||[];
  const groups=src.groups?.length?src.groups:[{start:0,count:idx?idx.count:pos.count,materialIndex:0}];

  const triangles=[]; const used=new Set();
  for(const group of groups){
    const name=materialName(base,group.materialIndex);
    if(excludedSurface(name))continue;
    const end=group.start+group.count;
    for(let o=group.start;o+2<end;o+=3){
      const a=idx?idx.getX(o):o, b=idx?idx.getX(o+1):o+1, c=idx?idx.getX(o+2):o+2;
      triangles.push([a,b,c]); used.add(a);used.add(b);used.add(c);
    }
  }
  if(!triangles.length)return null;

  const edgeKey=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
  const sourceEdges=new Map();
  for(const [a,b,c] of triangles){
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
      const k=edgeKey(u,v), rec=sourceEdges.get(k);
      if(rec)rec.count++;
      else sourceEdges.set(k,{count:1,u,v});
    }
  }
  const sourceBoundary=new Set();
  for(const e of sourceEdges.values()){
    if(e.count===1){sourceBoundary.add(e.u);sourceBoundary.add(e.v);}
  }

  const box=new THREE.Box3();
  for(const vi of used)box.expandByPoint(new THREE.Vector3(pos.getX(vi),pos.getY(vi),pos.getZ(vi)));
  const size=box.getSize(new THREE.Vector3());

  const gx=Math.round((portraitLayout()?20:24)*quality);
  const gy=Math.round((portraitLayout()?25:30)*quality);
  const gz=Math.round((portraitLayout()?18:22)*quality);
  const eps=1e-9;
  const cellOf=(vi)=>{
    const nx=(pos.getX(vi)-box.min.x)/(size.x+eps);
    const ny=(pos.getY(vi)-box.min.y)/(size.y+eps);
    const nz=(pos.getZ(vi)-box.min.z)/(size.z+eps);
    const boundary=sourceBoundary.has(vi);
    const feature=nz>.55 && nx>.12 && nx<.88 && ny>.20 && ny<.76;
    const density=boundary?2.35:(feature?1.50:1.0);
    const dx=Math.max(2,Math.round(gx*density));
    const dy=Math.max(2,Math.round(gy*density));
    const dz=Math.max(2,Math.round(gz*density));
    const ix=Math.min(dx-1,Math.max(0,Math.floor(nx*dx)));
    const iy=Math.min(dy-1,Math.max(0,Math.floor(ny*dy)));
    const iz=Math.min(dz-1,Math.max(0,Math.floor(nz*dz)));
    return `${boundary?'b':feature?'f':'g'}|${ix}|${iy}|${iz}`;
  };

  const clusterMap=new Map();
  for(const vi of used){
    const k=cellOf(vi);
    let cl=clusterMap.get(k);
    if(!cl){cl={members:[],index:clusterMap.size,sourceBoundary:false};clusterMap.set(k,cl);}
    cl.members.push(vi);
    if(sourceBoundary.has(vi))cl.sourceBoundary=true;
  }
  const clusters=[...clusterMap.values()];
  const sourceToCluster=new Map();
  clusters.forEach(cl=>cl.members.forEach(vi=>sourceToCluster.set(vi,cl.index)));

  const basePoints=clusters.map(()=>new THREE.Vector3());
  const morphPoints=morphs.map(()=>clusters.map(()=>new THREE.Vector3()));
  clusters.forEach((cl,ci)=>{
    for(const vi of cl.members){
      basePoints[ci].x+=pos.getX(vi);basePoints[ci].y+=pos.getY(vi);basePoints[ci].z+=pos.getZ(vi);
      morphs.forEach((m,mi)=>{
        morphPoints[mi][ci].x+=m.getX(vi);morphPoints[mi][ci].y+=m.getY(vi);morphPoints[mi][ci].z+=m.getZ(vi);
      });
    }
    const n=cl.members.length;
    basePoints[ci].multiplyScalar(1/n);
    morphPoints.forEach(points=>points[ci].multiplyScalar(1/n));
  });

  const triSet=new Set(); const outIndex=[];
  for(const [a,b,c] of triangles){
    const ca=sourceToCluster.get(a),cb=sourceToCluster.get(b),cc=sourceToCluster.get(c);
    if(ca===cb||cb===cc||cc===ca)continue;
    const sorted=[ca,cb,cc].sort((u,v)=>u-v).join(',');
    if(triSet.has(sorted))continue;
    triSet.add(sorted); outIndex.push(ca,cb,cc);
  }

  const outEdges=new Map();
  for(let i=0;i<outIndex.length;i+=3){
    const a=outIndex[i],b=outIndex[i+1],c=outIndex[i+2];
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
      const k=edgeKey(u,v), rec=outEdges.get(k);
      if(rec)rec.count++;
      else outEdges.set(k,{count:1,u,v});
    }
  }
  const boundaryEdges=[...outEdges.values()].filter(e=>e.count===1);
  const outgoing=new Map();
  for(const e of boundaryEdges){
    if(!outgoing.has(e.u))outgoing.set(e.u,[]);
    outgoing.get(e.u).push(e.v);
  }
  const usedDirected=new Set();
  const dkey=(a,b)=>`${a}>${b}`;
  const loops=[];
  for(const first of boundaryEdges){
    if(usedDirected.has(dkey(first.u,first.v)))continue;
    const loop=[first.u];
    let a=first.u,b=first.v,closed=false;
    for(let guard=0;guard<500;guard++){
      usedDirected.add(dkey(a,b));
      loop.push(b);
      if(b===loop[0]){loop.pop();closed=true;break;}
      const next=(outgoing.get(b)||[]).find(v=>!usedDirected.has(dkey(b,v)));
      if(next===undefined)break;
      a=b;b=next;
    }
    if(closed&&loop.length>=3)loops.push(loop);
  }

  const lowBox=new THREE.Box3();basePoints.forEach(p=>lowBox.expandByPoint(p));
  const lowSize=lowBox.getSize(new THREE.Vector3());
  const maxRepairRadius=lowSize.length()*.105;
  let repaired=0,preserved=0;

  for(const loop of loops){
    const support=loop.filter(i=>clusters[i]?.sourceBoundary).length/loop.length;
    if(support>=.55){preserved++;continue;}
    if(loop.length>36)continue;

    const center=new THREE.Vector3();loop.forEach(i=>center.add(basePoints[i]));center.multiplyScalar(1/loop.length);
    let radius=0;loop.forEach(i=>radius=Math.max(radius,center.distanceTo(basePoints[i])));
    if(radius>maxRepairRadius)continue;

    const centerIndex=basePoints.length;
    basePoints.push(center);
    morphPoints.forEach(points=>{
      const c=new THREE.Vector3();loop.forEach(i=>c.add(points[i]));points.push(c.multiplyScalar(1/loop.length));
    });
    for(let i=0;i<loop.length;i++){
      const a=loop[i],b=loop[(i+1)%loop.length];
      outIndex.push(b,a,centerIndex);
    }
    repaired++;
  }

  const outPos=new Float32Array(basePoints.length*3);
  basePoints.forEach((p,i)=>{outPos[i*3]=p.x;outPos[i*3+1]=p.y;outPos[i*3+2]=p.z;});
  const outMorphs=morphPoints.map(points=>{
    const arr=new Float32Array(points.length*3);
    points.forEach((p,i)=>{arr[i*3]=p.x;arr[i*3+1]=p.y;arr[i*3+2]=p.z;});
    return arr;
  });

  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(outPos,3));
  g.setIndex(outIndex);
  g.morphAttributes={position:outMorphs.map(a=>new THREE.BufferAttribute(a,3))};
  g.morphTargetsRelative=src.morphTargetsRelative;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  console.info(`FaceKit Lab 08: preserved ${preserved} source opening${preserved===1?'':'s'}, repaired ${repaired} reduction hole${repaired===1?'':'s'}`);
  return g;
}

function setMorphArray(object,count){
  object.morphTargetInfluences=new Array(count).fill(0);
  object.morphTargetDictionary={};
  for(let i=0;i<count;i++)object.morphTargetDictionary[`morph${i}`]=i;
}

function buildLayers(){
  baseMeshes.forEach((base,index)=>{
    const g=base.geometry;
    const holder=new THREE.Group(); holder.name=`part-${index}`;
    const solid=new THREE.Mesh(g,makeSolidMaterials(base));
    const contour=new THREE.Mesh(g,makeContourMaterial()); contour.scale.setScalar(1.0015);

    const low=buildClusteredSkin(base,1);
    let wire=null, depth=null;
    if(low){
      depth=new THREE.Mesh(low,depthMat.clone());
      wire=new THREE.Mesh(low,wireMat.clone());
      wire.scale.setScalar(1.002);
      setMorphArray(depth,low.morphAttributes.position.length);
      setMorphArray(wire,low.morphAttributes.position.length);
      depth.renderOrder=0; wire.renderOrder=2;
    }
    solid.renderOrder=1; contour.renderOrder=3;
    [depth,solid,wire,contour].filter(Boolean).forEach(m=>{
      m.position.copy(base.position);m.rotation.copy(base.rotation);m.scale.copy(base.scale);holder.add(m);
    });
    headRig.add(holder);
    layerMeshes.push({solid,wire,contour,depth});
  });

  const box=new THREE.Box3().setFromObject(headRig);
  const size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  const target=portraitLayout()?15.5:23;
  const scale=target/Math.max(size.x,size.y);
  headRig.scale.setScalar(scale);
  headRig.position.set(-center.x*scale,-center.y*scale+(portraitLayout()?4:.8),-center.z*scale+2.8);
}

function syncMorphs(){
  const identity=[0,1,2,3].map(i=>Number(document.querySelector(`#id${i}`).value));
  const jaw=Number(document.querySelector('#jaw').value);
  layerMeshes.forEach(({solid,wire,contour,depth})=>{
    [solid,contour].forEach(m=>{
      if(!m.morphTargetInfluences)m.updateMorphTargets();
      if(!m.morphTargetInfluences)return;
      for(let i=0;i<4;i++)m.morphTargetInfluences[i]=identity[i];
      m.morphTargetInfluences[4]=jaw;
    });
    [wire,depth].filter(Boolean).forEach(m=>{
      for(let i=0;i<4;i++)m.morphTargetInfluences[i]=identity[i];
      m.morphTargetInfluences[4]=jaw;
    });
  });
}

function setStatus(text,kind=''){
  document.querySelector('#status').textContent=text;
  document.querySelector('#statusDot').className='statusDot'+(kind?` ${kind}`:'');
}
function enableMorphControls(){
  document.querySelectorAll('.identity input,#jaw').forEach(el=>el.disabled=false);
  ready=true; setStatus('READY / FEATURE-PRESERVED LOW-POLY + LIVE CONTOUR','ready'); syncMorphs();
}

const loader=new OBJLoader();
const loadObj=name=>new Promise((res,rej)=>loader.load(FACEKIT+name,res,undefined,rej));
async function boot(){
  try{
    setStatus('LOADING NEUTRAL / ~2.6 MB');
    const base=await loadObj('generic_neutral_mesh.obj'); prepareBase(base);
    for(let i=0;i<TARGETS.length;i++){
      setStatus(`LOADING MORPH ${i+1}/${TARGETS.length}`);
      attachTarget(await loadObj(TARGETS[i]),i);
      await new Promise(r=>requestAnimationFrame(r));
    }
    setStatus('BUILDING FEATURE-PRESERVED LOW-POLY SKIN');
    await new Promise(r=>requestAnimationFrame(r));
    buildLayers(); enableMorphControls();
  }catch(err){console.error(err);setStatus('LOAD FAILED — SEE CONSOLE','error');}
}

const ui={wire:document.querySelector('#wire'),solid:document.querySelector('#solid'),contour:document.querySelector('#contour'),drift:document.querySelector('#drift'),jaw:document.querySelector('#jaw')};
const pct=v=>`${Math.round(Number(v)*100)}%`;
function updateLayerUI(){
  document.querySelector('#wireOut').value=pct(ui.wire.value);
  document.querySelector('#solidOut').value=pct(ui.solid.value);
  document.querySelector('#contourOut').value=pct(ui.contour.value);
  layerMeshes.forEach(({solid,wire,contour})=>{
    setSolidOpacity(solid,ui.solid.value);
    if(wire)wire.material.opacity=Number(ui.wire.value);
    contour.material.uniforms.uOpacity.value=Number(ui.contour.value);
  });
}
['wire','solid','contour'].forEach(k=>ui[k].addEventListener('input',updateLayerUI));
for(let i=0;i<4;i++){
  const el=document.querySelector(`#id${i}`);
  el.addEventListener('input',()=>{document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2);syncMorphs();});
}
ui.jaw.addEventListener('input',()=>{document.querySelector('#jawOut').value=pct(ui.jaw.value);syncMorphs();});
document.querySelector('#zeroIdentity').addEventListener('click',()=>{for(let i=0;i<4;i++){const el=document.querySelector(`#id${i}`);el.value=0;document.querySelector(`#id${i}Out`).value='0.00';}syncMorphs();});
document.querySelector('#randomIdentity').addEventListener('click',()=>{for(let i=0;i<4;i++){const v=Math.random()*1.1-.55,el=document.querySelector(`#id${i}`);el.value=v.toFixed(2);document.querySelector(`#id${i}Out`).value=Number(el.value).toFixed(2);}syncMorphs();});

function setView(name){
  const views=portraitLayout()?{front:[0,4,48],three:[20,4,43],side:[45,4,8]}:{front:[0,-.3,43],three:[22,1,36],side:[39,.5,5]};
  const [x,y,z]=views[name];camera.position.set(x,y,z);controls.target.set(0,portraitLayout()?4:.6,3);controls.update();
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));

function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==Math.floor(w*renderer.getPixelRatio())||canvas.height!==Math.floor(h*renderer.getPixelRatio())){
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
}
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);resize();controls.update();const t=clock.getElapsedTime();
  if(ui.drift.checked&&ready){
    const w=.67+Math.sin(t*.23)*.11+Math.sin(t*.071)*.05;
    const c=.24+Math.sin(t*.17+1.4)*.13;
    const s=.10+Math.sin(t*.11+3.1)*.055;
    layerMeshes.forEach(({solid,wire,contour})=>{
      if(wire)wire.material.opacity=Math.max(.04,Math.min(1,w*Number(ui.wire.value)/.78));
      contour.material.uniforms.uOpacity.value=Math.max(0,Math.min(1,c*Number(ui.contour.value)/.34));
      setSolidOpacity(solid,Math.max(0,Math.min(.5,s*Number(ui.solid.value)/.14)));
    });
  }else updateLayerUI();
  headRig.rotation.y=Math.sin(t*.19)*.018;
  renderer.render(scene,camera);
}
updateLayerUI();boot();animate();