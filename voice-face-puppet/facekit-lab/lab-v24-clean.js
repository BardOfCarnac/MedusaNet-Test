import * as THREE from 'three';

// Keep the head floating: suppress only the horizontal helper grid beneath it.
// The faint rear and side registration guides remain part of the scene.
const originalSceneAdd = THREE.Scene.prototype.add;
THREE.Scene.prototype.add = function (...objects) {
  const kept = objects.filter(object => {
    if (!object?.isLineSegments) return true;
    const p = object.position;
    return !(Math.abs(p.y + 14) < 0.001 && Math.abs(p.z + 10) < 0.001);
  });
  return originalSceneAdd.apply(this, kept);
};

try {
  await import('./lab-v24.js?v=24b');
} finally {
  THREE.Scene.prototype.add = originalSceneAdd;
}
