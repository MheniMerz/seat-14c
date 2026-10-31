import {
  BufferAttribute,
  ExtrudeGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Shape,
} from '@iwsdk/core';

/** Cabin palette shared by the procedural models (hex RGB). */
export const PALETTE = {
  trayTop: 0xa9acb4,
  trayRim: 0x6f7480,
  trim: 0x3d4656,
  seatBack: 0x262d3e,
  fabric: 0x1f2533,
  fabricBand: 0x3a4255,
  amber: 0xffb547,
  amberDeep: 0xc98a2b,
  cream: 0xf6f1e7,
  cardEdge: 0xd9d2c3,
  done: 0x4d7a5e,
  doneGlow: 0x7dffa8,
  buttonEdge: 0xa6aed0,
} as const;

/** Material index of a slab's top/bottom faces; sides are index 1. */
export const SLAB_FACE = 0;

/**
 * A rounded-rectangle slab lying flat: `width` along X, `depth` along Z,
 * `thickness` along Y, centred on the origin. The top face's UVs span 0–1
 * with the texture's top edge at -Z (away from the user), matching how the
 * cards and buttons were drawn on boxes before.
 */
export function roundedSlabGeometry(
  width: number,
  depth: number,
  thickness: number,
  radius: number,
  segments = 6,
): ExtrudeGeometry {
  const r = Math.min(radius, width / 2, depth / 2);
  const x = width / 2;
  const y = depth / 2;
  const shape = new Shape();
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y);
  shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r);
  shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y);
  shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r);
  shape.quadraticCurveTo(-x, -y, -x + r, -y);

  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: segments,
  });
  // Extruded along +Z; lay it flat so the extrusion runs along +Y.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness / 2, 0);

  // Caps get UVs normalised to the slab; shape +Y became -Z.
  const position = geometry.getAttribute('position') as BufferAttribute;
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  const caps = geometry.groups.find((g) => g.materialIndex === 0);
  if (caps != null) {
    for (let i = caps.start; i < caps.start + caps.count; i++) {
      uv.setXY(i, (position.getX(i) + x) / width, (-position.getZ(i) + y) / depth);
    }
    uv.needsUpdate = true;
  }
  return geometry;
}

/** A slab mesh with `[face, sides]` materials. */
export function slabMesh(
  name: string,
  size: { width: number; depth: number; thickness: number; radius: number },
  face: Material,
  side: Material,
): Mesh {
  const mesh = new Mesh(
    roundedSlabGeometry(size.width, size.depth, size.thickness, size.radius),
    [face, side],
  );
  mesh.name = name;
  return mesh;
}

/** The face material of a mesh built with {@link slabMesh}. */
export function slabFace(mesh: Mesh): MeshStandardMaterial {
  return (mesh.material as MeshStandardMaterial[])[SLAB_FACE];
}
