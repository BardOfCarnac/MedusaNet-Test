import * as THREE from 'three';

// FaceKit Lab 10
// Keep Lab 08's real low-poly mouth opening. Instead of fabricating a wireframe
// tunnel/cap, reveal FaceKit's own gums/tongue/teeth geometry behind that hole
// as a dark recessed layer. This gives the mouth genuine depth while leaving
// the low-poly exterior topology untouched.

const originalAdd = THREE.Group.prototype.add;
const GUMS_COLOUR = 0x31040a;
const TEETH_COLOUR = 0x806164;

function materialsOf(material) {
  return Array.isArray(material) ? material : [material];
}

function colourOf(material) {
  return material?.color?.isColor ? material.color.getHex() : null;
}

function isLabSolidMesh(object) {
  if (!object?.isMesh || object.userData?.__facekitMouthInterior) return false;
  const mats = materialsOf(object.material);
  if (mats.length < 2) return false;
  let hasGums = false;
  let hasTeeth = false;
  for (const mat of mats) {
    const c = colourOf(mat);
    if (c === GUMS_COLOUR) hasGums = true;
    if (c === TEETH_COLOUR) hasTeeth = true;
  }
  return hasGums && hasTeeth;
}

function hiddenMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000 });
  m.visible = false;
  m.colorWrite = false;
  m.depthWrite = false;
  return m;
}

function makeInteriorMaterial(source) {
  const c = colourOf(source);

  if (c === GUMS_COLOUR) {
    const m = new THREE.MeshStandardMaterial({
      color: 0x170207,
      emissive: 0x070001,
      roughness: 0.96,
      metalness: 0,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    m.userData.interiorKind = 'gums';
    return m;
  }

  if (c === TEETH_COLOUR) {
    const m = new THREE.MeshStandardMaterial({
      color: 0x4b3034,
      emissive: 0x070203,
      roughness: 0.88,
      metalness: 0,
      transparent: true,
      opacity: 0.22,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    m.userData.interiorKind = 'teeth';
    return m;
  }

  return hiddenMaterial();
}

function addMouthInterior(holder, solid) {
  const sourceMaterials = materialsOf(solid.material);
  const interiorMaterials = sourceMaterials.map(makeInteriorMaterial);
  const mouth = new THREE.Mesh(
    solid.geometry,
    Array.isArray(solid.material) ? interiorMaterials : interiorMaterials[0]
  );

  mouth.name = '__facekit_real_mouth_interior';
  mouth.userData.__facekitMouthInterior = true;
  mouth.position.copy(solid.position);
  mouth.rotation.copy(solid.rotation);
  mouth.scale.copy(solid.scale);
  mouth.renderOrder = 1.5;

  // Share the same FaceKit morph values as the full-resolution skin. Mesh
  // constructors create their own influence arrays, so copy the live values
  // immediately before each render rather than asking Lab 08 to know about us.
  mouth.onBeforeRender = () => {
    const src = solid.morphTargetInfluences;
    const dst = mouth.morphTargetInfluences;
    if (src && dst) {
      const n = Math.min(src.length, dst.length);
      for (let i = 0; i < n; i++) dst[i] = src[i];
    }

    const wire = Number(document.querySelector('#wire')?.value || 0);
    const contour = Number(document.querySelector('#contour')?.value || 0);
    const active = Math.max(wire, contour * 0.55);
    mouth.visible = active > 0.015;

    for (const mat of materialsOf(mouth.material)) {
      if (mat.userData?.interiorKind === 'gums') mat.opacity = 0.9 * active;
      if (mat.userData?.interiorKind === 'teeth') mat.opacity = 0.22 * active;
    }
  };

  originalAdd.call(holder, mouth);
}

THREE.Group.prototype.add = function (...objects) {
  for (const object of objects) {
    originalAdd.call(this, object);
    if (isLabSolidMesh(object)) addMouthInterior(this, object);
  }
  return this;
};
