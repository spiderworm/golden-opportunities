import { CanvasTexture, SRGBColorSpace } from "three";

// Textures drawn at runtime on a canvas, so the station needs no image files
// (and no font downloads) until the art pipeline supplies real ones.

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** The berth's sign, lit violet. */
export function signTexture(): CanvasTexture {
  return canvasTexture(1024, 160, (ctx) => {
    ctx.fillStyle = "#0b0f1f";
    ctx.fillRect(0, 0, 1024, 160);
    ctx.strokeStyle = "#8f84ff";
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 1004, 140);
    ctx.font = `600 92px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#6b5cff";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#f2f4ff";
    ctx.fillText("ORBITAL BOOKS", 512, 84);
  });
}

/** The featured book's cover: the title in gold on deep blue. */
export function coverTexture(title: string): CanvasTexture {
  return canvasTexture(512, 720, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, "#22306e");
    g.addColorStop(1, "#120f33");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 720);
    ctx.strokeStyle = "#e3c47a";
    ctx.lineWidth = 5;
    ctx.strokeRect(28, 28, 456, 664);
    ctx.fillStyle = "#e3c47a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText("BOOK OF THE MONTH", 256, 92);
    ctx.beginPath();
    ctx.arc(256, 560, 54, 0, Math.PI * 2);
    ctx.stroke();
    const lines = wrap(ctx, title, 400, 58);
    const size = lines.length > 3 ? 44 : 58;
    ctx.font = `700 ${size}px Georgia, "Times New Roman", serif`;
    const fitted = wrap(ctx, title, 400, size);
    const top = 300 - ((fitted.length - 1) * size * 1.15) / 2;
    fitted.forEach((line, i) => ctx.fillText(line, 256, top + i * size * 1.15));
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number): string[] {
  ctx.font = `700 ${size}px Georgia, "Times New Roman", serif`;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A soft round glow, for the berth's beacon. */
export function glowTexture(): CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.15, "rgba(190,180,255,0.9)");
    g.addColorStop(0.5, "rgba(107,92,255,0.25)");
    g.addColorStop(1, "rgba(107,92,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}
