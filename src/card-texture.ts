import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';
import type { Task } from './storage.js';

/** Card face size in metres; the canvas keeps the same aspect ratio. */
export const CARD_SIZE = { width: 0.12, height: 0.075, thickness: 0.004 };

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = Math.round(
  (CANVAS_WIDTH * CARD_SIZE.height) / CARD_SIZE.width,
);

/** One accent per card so the three are told apart at a glance. */
export const CARD_ACCENTS = ['#ffb547', '#5ec8e5', '#b892ff'];

/**
 * Draws a task card face. The title is about 1 cm tall at real size, which
 * reads comfortably at the tray's 40–50 cm distance.
 */
export function createCardTexture(task: Task, order: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f6f1e7';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = CARD_ACCENTS[order % CARD_ACCENTS.length];
  ctx.fillRect(0, 0, CANVAS_WIDTH, 52);

  ctx.fillStyle = '#1a1406';
  ctx.font = '600 26px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`TASK ${order + 1}`, 24, 27);

  ctx.font = '700 44px system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, task.title, CANVAS_WIDTH - 48, 3);
  lines.forEach((line, i) => ctx.fillText(line, 24, 110 + i * 52));

  if (task.subtasks.length > 0) {
    const done = task.subtasks.filter((s) => s.done).length;
    ctx.fillStyle = '#5b5446';
    ctx.font = '500 28px system-ui, sans-serif';
    ctx.fillText(
      `${done}/${task.subtasks.length} steps`,
      24,
      CANVAS_HEIGHT - 22,
    );
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth || line === '') {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') {
    lines.push(line);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/u, '')}…`;
  }
  return lines;
}
