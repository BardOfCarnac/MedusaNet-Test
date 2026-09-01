import * as THREE from 'three';

function materialsOf(mat){ return Array.isArray(mat)?mat:[mat]; }
function materialName(base, idx){ return String(materialsOf(base.material)[idx||0]?.name||'').toLowerCase(); }

export function buildGroupedGeometry(base, predicate){
  const src=base.geometry;
  const pos=src.attributes.position;
  const idx=src.index;
  const groups=src.groups?.length?src.groups:[{start:0,count:idx?idx.count:pos.count,materialIndex:0}];
  const outIndex=[];
  for(const group of groups){
    const name=materialName(base,group.materialIndex);
    if(!predicate(name))continue;
    const end=group.start+group.count;
    for(let o=group.start;o<end;o++)outIndex.push(idx?idx.getX(o):o);
  }
  if(!outIndex.length)return null;
  const g=new THREE.BufferGeometry();
  for(const [name,attr] of Object.entries(src.attributes))g.setAttribute(name,attr.clone());
  g.setIndex(outIndex);
  g.morphAttributes={position:(src.morphAttributes.position||[]).map(a=>a.clone())};
  g.morphTargetsRelative=src.morphTargetsRelative;
  if(!g.attributes.normal)g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function buildClusteredSkin(base,{quality=1,portrait=false,excludedSurface=()=>false,logLabel='FaceKit'}={}){
  const src=base.geometry;
  const pos=src.attributes.position;
  const idx=src.index;
  const morphs=src.morphAttributes.position||[];
  const groups=src.groups?.length?src.groups:[{start:0,count:idx?idx.count:pos.count,materialIndex:0}];
  const triangles=[];const used=new Set();
  for(const group of groups){
    const name=materialName(base,group.materialIndex);
    if(excludedSurface(name))continue;
    const end=group.start+group.count;
    for(let o=group.start;o+2<end;o+=3){
      const a=idx?idx.getX(o):o,b=idx?idx.getX(o+1):o+1,c=idx?idx.getX(o+2):o+2;
      triangles.push([a,b,c]);used.add(a);used.add(b);used.add(c);
    }
  }
  if(!triangles.length)return null;

  const edgeKey=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
  const sourceEdges=new Map();
  for(const [a,b,c] of triangles){
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
      const k=edgeKey(u,v),rec=sourceEdges.get(k);
      if(rec)rec.count++;else sourceEdges.set(k,{count:1,u,v});
    }
  }
  const sourceBoundary=new Set();
  for(const e of sourceEdges.values())if(e.count===1){sourceBoundary.add(e.u);sourceBoundary.add(e.v);}

  const box=new THREE.Box3();
  for(const vi of used)box.expandByPoint(new THREE.Vector3(pos.getX(vi),pos.getY(vi),pos.getZ(vi)));
  const size=box.getSize(new THREE.Vector3());
  const gx=Math.round((portrait?20:24)*quality),gy=Math.round((portrait?25:30)*quality),gz=Math.round((portrait?18:22)*quality);
  const eps=1e-9;
  const cellOf=vi=>{
    const nx=(pos.getX(vi)-box.min.x)/(size.x+eps),ny=(pos.getY(vi)-box.min.y)/(size.y+eps),nz=(pos.getZ(vi)-box.min.z)/(size.z+eps);
    const boundary=sourceBoundary.has(vi);
    const feature=nz>.55&&nx>.12&&nx<.88&&ny>.20&&ny<.76;
    const density=boundary?2.35:(feature?1.5:1);
    const dx=Math.max(2,Math.round(gx*density)),dy=Math.max(2,Math.round(gy*density)),dz=Math.max(2,Math.round(gz*density));
    const ix=Math.min(dx-1,Math.max(0,Math.floor(nx*dx))),iy=Math.min(dy-1,Math.max(0,Math.floor(ny*dy))),iz=Math.min(dz-1,Math.max(0,Math.floor(nz*dz)));
    return `${boundary?'b':feature?'f':'g'}|${ix}|${iy}|${iz}`;
  };

  const clusterMap=new Map();
  for(const vi of used){
    const k=cellOf(vi);let cl=clusterMap.get(k);
    if(!cl){cl={members:[],index:clusterMap.size,sourceBoundary:false};clusterMap.set(k,cl);}
    cl.members.push(vi);if(sourceBoundary.has(vi))cl.sourceBoundary=true;
  }
  const clusters=[...clusterMap.values()];
  const sourceToCluster=new Map();clusters.forEach(cl=>cl.members.forEach(vi=>sourceToCluster.set(vi,cl.index)));
  const basePoints=clusters.map(()=>new THREE.Vector3());
  const morphPoints=morphs.map(()=>clusters.map(()=>new THREE.Vector3()));
  clusters.forEach((cl,ci)=>{
    for(const vi of cl.members){
      basePoints[ci].x+=pos.getX(vi);basePoints[ci].y+=pos.getY(vi);basePoints[ci].z+=pos.getZ(vi);
      morphs.forEach((m,mi)=>{morphPoints[mi][ci].x+=m.getX(vi);morphPoints[mi][ci].y+=m.getY(vi);morphPoints[mi][ci].z+=m.getZ(vi);});
    }
    const n=cl.members.length;basePoints[ci].multiplyScalar(1/n);morphPoints.forEach(points=>points[ci].multiplyScalar(1/n));
  });

  const triSet=new Set(),outIndex=[];
  for(const [a,b,c] of triangles){
    const ca=sourceToCluster.get(a),cb=sourceToCluster.get(b),cc=sourceToCluster.get(c);
    if(ca===cb||cb===cc||cc===ca)continue;
    const sorted=[ca,cb,cc].sort((u,v)=>u-v).join(',');if(triSet.has(sorted))continue;
    triSet.add(sorted);outIndex.push(ca,cb,cc);
  }

  const outEdges=new Map();
  for(let i=0;i<outIndex.length;i+=3){
    const a=outIndex[i],b=outIndex[i+1],c=outIndex[i+2];
    for(const [u,v] of [[a,b],[b,c],[c,a]]){const k=edgeKey(u,v),rec=outEdges.get(k);if(rec)rec.count++;else outEdges.set(k,{count:1,u,v});}
  }
  const boundaryEdges=[...outEdges.values()].filter(e=>e.count===1),outgoing=new Map();
  for(const e of boundaryEdges){if(!outgoing.has(e.u))outgoing.set(e.u,[]);outgoing.get(e.u).push(e.v);}
  const usedDirected=new Set(),dkey=(a,b)=>`${a}>${b}`,loops=[];
  for(const first of boundaryEdges){
    if(usedDirected.has(dkey(first.u,first.v)))continue;
    const loop=[first.u];let a=first.u,b=first.v,closed=false;
    for(let guard=0;guard<500;guard++){
      usedDirected.add(dkey(a,b));loop.push(b);
      if(b===loop[0]){loop.pop();closed=true;break;}
      const next=(outgoing.get(b)||[]).find(v=>!usedDirected.has(dkey(b,v)));if(next===undefined)break;a=b;b=next;
    }
    if(closed&&loop.length>=3)loops.push(loop);
  }

  const lowBox=new THREE.Box3();basePoints.forEach(p=>lowBox.expandByPoint(p));
  const lowSize=lowBox.getSize(new THREE.Vector3()),maxRepairRadius=lowSize.length()*.105;
  let repaired=0,preserved=0;
  for(const loop of loops){
    const support=loop.filter(i=>clusters[i]?.sourceBoundary).length/loop.length;
    if(support>=.55){preserved++;continue;}if(loop.length>36)continue;
    const center=new THREE.Vector3();loop.forEach(i=>center.add(basePoints[i]));center.multiplyScalar(1/loop.length);
    let radius=0;loop.forEach(i=>radius=Math.max(radius,center.distanceTo(basePoints[i])));if(radius>maxRepairRadius)continue;
    const centerIndex=basePoints.length;basePoints.push(center);
    morphPoints.forEach(points=>{const c=new THREE.Vector3();loop.forEach(i=>c.add(points[i]));points.push(c.multiplyScalar(1/loop.length));});
    for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];outIndex.push(b,a,centerIndex);}repaired++;
  }

  const outPos=new Float32Array(basePoints.length*3);basePoints.forEach((p,i)=>{outPos[i*3]=p.x;outPos[i*3+1]=p.y;outPos[i*3+2]=p.z;});
  const outMorphs=morphPoints.map(points=>{const arr=new Float32Array(points.length*3);points.forEach((p,i)=>{arr[i*3]=p.x;arr[i*3+1]=p.y;arr[i*3+2]=p.z;});return arr;});
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(outPos,3));g.setIndex(outIndex);
  g.morphAttributes={position:outMorphs.map(a=>new THREE.BufferAttribute(a,3))};g.morphTargetsRelative=src.morphTargetsRelative;
  g.computeVertexNormals();g.computeBoundingSphere();
  console.info(`${logLabel}: preserved ${preserved} source opening${preserved===1?'':'s'}, repaired ${repaired} reduction hole${repaired===1?'':'s'}`);
  return g;
}

export function setMorphArray(object,count){
  object.morphTargetInfluences=new Array(count).fill(0);object.morphTargetDictionary={};
  for(let i=0;i<count;i++)object.morphTargetDictionary[`morph${i}`]=i;
}
