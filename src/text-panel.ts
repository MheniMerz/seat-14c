import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

/** Canvas pixels per metre of panel; 2000 px/m gives 1 cm text at 20 px. */
const PIXELS_PER_METRE = 2000;

export type TextPanel = {
  mesh: Mesh;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Clear, run `paint`, and upload the canvas. */
  draw(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void;
};

/**
 * A flat panel faced with a canvas, for short dynamic text in the cabin
 * (hints, labels, the summary card). Faces +Z; size is in metres.
 */
export function createTextPanel(
  name: string,
  widthM: number,
  heightM: number,
  pixelsPerMetre = PIXELS_PER_METRE,
): TextPanel {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthM * pixelsPerMetre);
  canvas.height = Math.round(heightM * pixelsPerMetre);
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new Mesh(
    new PlaneGeometry(widthM, heightM),
    new MeshBasicMaterial({ map: texture, transparent: true }),
  );
  mesh.name = name;
  return {
    mesh,
    ctx,
    width: canvas.width,
    height: canvas.height,
    draw(paint) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paint(ctx, canvas.width, canvas.height);
      texture.needsUpdate = true;
    },
  };
}

/** Rounded rectangle path helper for panel backgrounds. */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
