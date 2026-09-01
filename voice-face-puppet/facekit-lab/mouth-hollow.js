import * as THREE from 'three';

// FaceKit Lab 09: turn the preserved low-poly mouth boundary into a shallow
// morphable cavity. This deliberately patches only the generated low-poly
// geometry: five morph targets, indexed geometry, and a plausible central
// lower-face boundary loop. The full FaceKit skin is left untouched.
const originalComputeBoundingSphere = THREE.BufferGeometry.prototype.computeBoundingSphere;

function edgeKey(a,b){ return a < b ? `${a}|${b}` : `${b}|${a}`; }

function boundaryLoops(g){
  const index = g.index;
  if(!index) return [];
  const arr = Array.from(index.array);
  const edges = new Map();
  for(let i=0;i<arr.length;i+=3){
    const a=arr[i], b=arr[i+1], c=arr[i+2];
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
      const k=edgeKey(u,v);
      const rec=edges.get(k);
      if(rec) rec.count++;
      else edges.set(k,{count:1,u,v});
    }
  }
  const boundary=[...edges.values()].filter(e=>e.count===1);
  if(!boundary.length) return [];

  const adj=new Map();
  const add=(a,b)=>{ if(!adj.has(a))adj.set(a,[]); adj.get(a).push(b); };
  boundary.forEach(e=>{add(e.u,e.v);add(e.v,e.u);});

  const used=new Set();
  const loops=[];
  for(const e of boundary){
    const firstKey=edgeKey(e.u,e.v);
    if(used.has(firstKey)) continue;
    const loop=[e.u];
    let prev=e.u, cur=e.v;
    used.add(firstKey);
    let closed=false;
    for(let guard=0;guard<1000;guard++){
      if(cur===loop[0]){ closed=true; break; }
      loop.push(cur);
      const ns=(adj.get(cur)||[]).filter(n=>n!==prev);
      if(!ns.length) break;
      let next=ns.find(n=>!used.has(edgeKey(cur,n)));
      if(next===undefined){
        next=ns.find(n=>n===loop[0]);
        if(next===undefined) break;
      }
      used.add(edgeKey(cur,next));
      prev=cur; cur=next;
    }
    if(closed && loop.length>=4) loops.push(loop);
  }
  return loops;
}

function point(attr,i){ return new THREE.Vector3(attr.getX(i),attr.getY(i),attr.getZ(i)); }

function loopStats(attr,loop){
  const min=new THREE.Vector3(Infinity,Infinity,Infinity);
  const max=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
  const center=new THREE.Vector3();
  loop.forEach(i=>{
    const p=point(attr,i); center.add(p); min.min(p); max.max(p);
  });
  center.multiplyScalar(1/loop.length);
  return {center,min,max,size:max.clone().sub(min)};
}

function findMouthLoop(g,loops){
  const pos=g.getAttribute('position');
  const box=new THREE.Box3().setFromBufferAttribute(pos);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  let best=null, bestScore=-Infinity;

  for(const loop of loops){
    if(loop.length<4 || loop.length>120) continue;
    const s=loopStats(pos,loop);
    const nx=(s.center.x-box.min.x)/(size.x||1);
    const ny=(s.center.y-box.min.y)/(size.y||1);
    const nz=(s.center.z-box.min.z)/(size.z||1);
    const centered=Math.abs(nx-.5);
    const aspect=s.size.x/Math.max(s.size.y,1e-5);
    const relWidth=s.size.x/(size.x||1);

    // The real mouth is the central, front-facing, lower-middle opening. This
    // excludes the bilateral eyes/nostrils and the large neck boundary.
    if(centered>.18) continue;
    if(ny<.20 || ny>.52) continue;
    if(nz<.67) continue;
    if(relWidth<.10 || relWidth>.58) continue;
    if(aspect<1.15) continue;

    const score=(.18-centered)*14 + (nz-.67)*5 + Math.min(aspect,3) + relWidth*2 - Math.abs(ny-.35)*3;
    if(score>bestScore){ bestScore=score; best={loop,stats:s,box,size,center}; }
  }
  return best;
}

function hollowMouth(g){
  if(g.userData.__mouthHollowChecked) return;
  g.userData.__mouthHollowChecked=true;

  const pos=g.getAttribute('position');
  const morphs=g.morphAttributes?.position||[];
  if(!pos || !g.index || morphs.length!==5 || pos.count<50 || pos.count>12000) return;

  const loops=boundaryLoops(g);
  const candidate=findMouthLoop(g,loops);
  if(!candidate) return;

  const outer=candidate.loop.slice();
  const size=candidate.size;
  const base=[];
  for(let i=0;i<pos.count;i++) base.push(point(pos,i));
  const morphPts=morphs.map(attr=>{
    const pts=[]; for(let i=0;i<attr.count;i++) pts.push(point(attr,i)); return pts;
  });
  const indices=Array.from(g.index.array);

  const inset=.17;
  const depth=Math.max(size.z*.10, size.x*.045);

  function makeInner(points){
    const c=new THREE.Vector3(); outer.forEach(i=>c.add(points[i])); c.multiplyScalar(1/outer.length);
    return outer.map(i=>{
      const p=points[i].clone();
      p.x=THREE.MathUtils.lerp(p.x,c.x,inset);
      p.y=THREE.MathUtils.lerp(p.y,c.y,inset*.55);
      p.z-=depth;
      return p;
    });
  }

  const innerBase=makeInner(base);
  const innerMorphs=morphPts.map(makeInner);
  const innerIdx=[];
  for(let i=0;i<outer.length;i++){
    innerIdx.push(base.length);
    base.push(innerBase[i]);
    morphPts.forEach((pts,mi)=>pts.push(innerMorphs[mi][i]));
  }

  // Stitch the lip boundary to the recessed ring.
  for(let i=0;i<outer.length;i++){
    const a=outer[i], b=outer[(i+1)%outer.length];
    const ia=innerIdx[i], ib=innerIdx[(i+1)%innerIdx.length];
    indices.push(a,b,ib, a,ib,ia);
  }

  // Dark rear wall: a shallow cap far enough back that the mouth reads as a
  // cavity, but not so deep that a mobile wireframe becomes visually noisy.
  const backCenter=new THREE.Vector3(); innerBase.forEach(p=>backCenter.add(p)); backCenter.multiplyScalar(1/innerBase.length);
  backCenter.z-=depth*.55;
  const backIndex=base.length; base.push(backCenter);
  morphPts.forEach((pts,mi)=>{
    const c=new THREE.Vector3(); innerMorphs[mi].forEach(p=>c.add(p)); c.multiplyScalar(1/innerMorphs[mi].length); c.z-=depth*.55; pts.push(c);
  });
  for(let i=0;i<innerIdx.length;i++){
    const a=innerIdx[i], b=innerIdx[(i+1)%innerIdx.length];
    indices.push(a,b,backIndex);
  }

  const outPos=new Float32Array(base.length*3);
  base.forEach((p,i)=>{outPos[i*3]=p.x;outPos[i*3+1]=p.y;outPos[i*3+2]=p.z;});
  g.setAttribute('position',new THREE.BufferAttribute(outPos,3));
  g.setIndex(indices);
  g.morphAttributes.position=morphPts.map(pts=>{
    const arr=new Float32Array(pts.length*3);
    pts.forEach((p,i)=>{arr[i*3]=p.x;arr[i*3+1]=p.y;arr[i*3+2]=p.z;});
    return new THREE.BufferAttribute(arr,3);
  });
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  console.info(`FaceKit Lab 09: hollowed mouth from ${outer.length}-vertex preserved boundary`);
}

THREE.BufferGeometry.prototype.computeBoundingSphere=function(...args){
  hollowMouth(this);
  return originalComputeBoundingSphere.apply(this,args);
};
