import { type LaidNode, layoutSankey, type SankeyData } from "./sankeyLayout";

const W = 1200;
const H = 750;
const SCALE = 2;
const FONT = '"Archivo Variable", system-ui, sans-serif';

export interface ExportCopy {
  title: string;
  subtitle: string;
  headline: string;
}

/** Renders the share image (label-stock ground, the Sankey, headline numbers, a quiet credit). */
export async function exportSankeyPng(data: SankeyData, copy: ExportCopy): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`700 44px ${FONT}`),
    document.fonts.load(`600 18px ${FONT}`),
    document.fonts.load(`400 18px ${FONT}`),
  ]);
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const ground = token("--ground", "#f6f7f4");
  const ink = token("--ink", "#16181a");
  const ink2 = token("--ink-2", "#4b5156");
  const ink3 = token("--ink-3", "#676d72");
  const livery = token("--livery", "#0e3b2e");

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = livery;
  ctx.fillRect(0, 0, W, 10);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(copy.title, 56, 92);
  ctx.fillStyle = ink2;
  ctx.font = `400 21px ${FONT}`;
  ctx.fillText(copy.subtitle, 56, 128);
  ctx.fillStyle = ink;
  ctx.font = `600 21px ${FONT}`;
  ctx.fillText(copy.headline, 56, 162);

  // The chart, laid out at export size.
  const top = 200;
  const chartH = H - top - 70;
  const { nodes, links } = layoutSankey(data, {
    width: W - 112,
    height: chartH,
    labelSpace: 190,
    nodeWidth: 14,
  });
  ctx.save();
  ctx.translate(56, top);
  for (const link of links) {
    ctx.strokeStyle = link.color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = Math.max(1.5, link.width ?? 1);
    ctx.stroke(new Path2D(link.path));
  }
  ctx.globalAlpha = 1;
  for (const node of nodes) {
    ctx.fillStyle = node.color;
    roundRect(
      ctx,
      node.x0 ?? 0,
      node.y0 ?? 0,
      (node.x1 ?? 0) - (node.x0 ?? 0),
      Math.max(2, (node.y1 ?? 0) - (node.y0 ?? 0)),
      2,
    );
  }
  for (const node of nodes) drawLabel(ctx, node, ink, ink3, ground);
  ctx.restore();

  // Credit, bottom right: the mark and the name, nothing louder.
  ctx.fillStyle = ink3;
  ctx.font = `600 17px ${FONT}`;
  const credit = "Made with Applied";
  const cw = ctx.measureText(credit).width;
  ctx.fillText(credit, W - 56 - cw, H - 34);
  drawMark(ctx, W - 56 - cw - 38, H - 46, ink3);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create the image"))),
      "image/png",
    ),
  );
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  node: LaidNode,
  ink: string,
  muted: string,
  halo: string,
) {
  const y = ((node.y0 ?? 0) + (node.y1 ?? 0)) / 2;
  const x = (node.x1 ?? 0) + 10;
  ctx.font = `600 18px ${FONT}`;
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = halo;
  ctx.textBaseline = "middle";
  ctx.strokeText(node.name, x, y - 9);
  ctx.fillStyle = ink;
  ctx.fillText(node.name, x, y - 9);
  ctx.font = `400 16px ${FONT}`;
  const count = String(node.value ?? 0);
  ctx.strokeText(count, x, y + 11);
  ctx.fillStyle = muted;
  ctx.fillText(count, x, y + 11);
  ctx.textBaseline = "alphabetic";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** The wordmark's mark: applied ring, a step, silence. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.2, 1.2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(4, 7, 2.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6.6, 7);
  ctx.lineTo(12.4, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(15, 7, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(19, 7);
  ctx.lineTo(20.6, 7);
  ctx.moveTo(23, 7);
  ctx.lineTo(24.6, 7);
  ctx.stroke();
  ctx.restore();
}
