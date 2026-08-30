# Voice Face Puppet — FaceKit Lab 01

A deliberately small Three.js test of USC ICT FaceKit as the canonical head geometry for the Voice Face Puppet project.

## What this proves

- The actual `generic_neutral_mesh.obj` is loaded from ICT FaceKit.
- The first four FaceKit PCA identity targets are attached as true Three.js morph targets.
- `jawOpen.obj` is attached on the same geometry as an expression test.
- The same animated geometry is rendered simultaneously as three independently visible representations: translucent solid, red wireframe and topographic contour shader.
- The surrounding space is intentionally sparse wireframe registration geometry rather than a dense Tron grid.

## Assets

Face model assets are fetched at runtime from `USC-ICT/ICT-FaceKit` via jsDelivr. ICT FaceKit is MIT licensed. Three.js is also loaded from jsDelivr.

This lab intentionally does not replace the existing SVG voice puppet yet. It exists to decide whether FaceKit is the right canonical 3D head before connecting the 15-viseme audio tracker.
