import * as THREE from 'three';

// Surgical repair for the two tiny bilateral pinholes produced by the clustered
// FaceKit exterior mesh. This runs only on small morphable geometries and only
// caps very small boundary loops in the upper-cheek region.
const originalComputeBoundingSphere = THREE.BufferGeometry.prototype.computeBoundingSphere;

function sealUpperCheekPinholes(g) {
  if (g.userData.__upperCheekPinholesChecked) return;
  g.userData.__upperCheekPinholesChecked = true;

  const pos = g.getAttribute('position');
  const morphs = g.morphAttributes?.position || [];
  const index = g.index;

  // Matches the generated low-poly skin, not the full FaceKit meshes.
  if (!pos || !index || morphs.length !== 5 || pos.count < 50 || pos.count > 12000) return;

  const indices = Array.from(index.array);
  const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const edges = new Map();

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = edgeKey(u, v);
      const rec = edges.get(k);
      if (rec) rec.count++;
      else edges.set(k, { count: 1, u, v });
    }
  }

  const boundary = [...edges.values()].filter(e => e.count === 1);
  if (!boundary.length) return;

  // Preserve the directed boundary winding from the existing triangles.
  const outgoing = new Map();
  for (const e of boundary) {
    if (!outgoing.has(e.u)) outgoing.set(e.u, []);
    outgoing.get(e.u).push(e.v);
  }

  const used = new Set();
  const directedKey = (a, b) => `${a}>${b}`;
  const loops = [];

  for (const first of boundary) {
    if (used.has(directedKey(first.u, first.v))) continue;
    const loop = [first.u];
    let a = first.u, b = first.v;
    let closed = false;

    for (let guard = 0; guard < 200; guard++) {
      used.add(directedKey(a, b));
      loop.push(b);
      if (b === loop[0]) {
        loop.pop();
        closed = true;
        break;
      }
      const next = (outgoing.get(b) || []).find(v => !used.has(directedKey(b, v)));
      if (next === undefined) break;
      a = b;
      b = next;
    }

    if (closed && loop.length >= 3) loops.push(loop);
  }

  if (!loops.length) return;

  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const size = box.getSize(new THREE.Vector3());
  const maxRadius = size.length() * 0.035;

  const basePoints = [];
  for (let i = 0; i < pos.count; i++) {
    basePoints.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }

  const morphPoints = morphs.map(attr => {
    const pts = [];
    for (let i = 0; i < attr.count; i++) {
      pts.push(new THREE.Vector3(attr.getX(i), attr.getY(i), attr.getZ(i)));
    }
    return pts;
  });

  const outIndex = indices.slice();
  let filled = 0;

  for (const loop of loops) {
    if (loop.length > 10) continue;

    const center = new THREE.Vector3();
    loop.forEach(i => center.add(basePoints[i]));
    center.multiplyScalar(1 / loop.length);

    let radius = 0;
    loop.forEach(i => radius = Math.max(radius, center.distanceTo(basePoints[i])));
    if (radius > maxRadius) continue;

    // Only the bilateral upper-cheek region: do not alter eye, nostril, mouth,
    // ear or neck boundaries.
    const nx = (center.x - box.min.x) / (size.x || 1);
    const ny = (center.y - box.min.y) / (size.y || 1);
    const nz = (center.z - box.min.z) / (size.z || 1);
    const side = Math.abs(nx - 0.5);
    if (ny < 0.48 || ny > 0.72 || side < 0.08 || side > 0.40 || nz < 0.52) continue;

    const centerIndex = basePoints.length;
    basePoints.push(center);

    morphPoints.forEach(pts => {
      const c = new THREE.Vector3();
      loop.forEach(i => c.add(pts[i]));
      pts.push(c.multiplyScalar(1 / loop.length));
    });

    // Reverse the directed boundary edge for consistent cap winding.
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      outIndex.push(b, a, centerIndex);
    }
    filled++;
  }

  if (!filled) return;

  const newPos = new Float32Array(basePoints.length * 3);
  basePoints.forEach((v, i) => {
    newPos[i * 3] = v.x;
    newPos[i * 3 + 1] = v.y;
    newPos[i * 3 + 2] = v.z;
  });
  g.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
  g.setIndex(outIndex);

  g.morphAttributes.position = morphPoints.map(pts => {
    const arr = new Float32Array(pts.length * 3);
    pts.forEach((v, i) => {
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y;
      arr[i * 3 + 2] = v.z;
    });
    return new THREE.BufferAttribute(arr, 3);
  });

  // Wire/depth materials do not need normals, and the old normal attribute is
  // now one vertex shorter than the repaired geometry.
  g.deleteAttribute('normal');
  console.info(`FaceKit Lab 07: sealed ${filled} upper-cheek pinhole${filled === 1 ? '' : 's'}`);
}

THREE.BufferGeometry.prototype.computeBoundingSphere = function (...args) {
  sealUpperCheekPinholes(this);
  return originalComputeBoundingSphere.apply(this, args);
};
