import * as THREE from 'three';

// Lab 23 scene cleanup: suppress only the horizontal helper grid that sits
// beneath the head. Keep the faint rear/side spatial guides intact.
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
  await import('./lab-v23.js?v=23b');
} finally {
  THREE.Scene.prototype.add = originalSceneAdd;
}
