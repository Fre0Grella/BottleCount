import { qrCanvas } from './qr';

/**
 * Canvas drawing: QR codes with the BottleCount mark, and the shareable ticket
 * card.
 *
 * One branded QR for every QR the app draws — tickets, and invite links — so
 * they look like one product. Images come in through a loader, so nothing here
 * decides where a picture comes from.
 */

/**
 * The mark on the QR's centre plate. The light-theme logo, so it reads on the
 * white QR background. Change this line to take the mark from elsewhere.
 */
const QR_LOGO_SRC = `${import.meta.env.BASE_URL}logoLight.svg`;

/** Turns an image URL into something a canvas can draw. */
export type ImageLoader = (src: string) => Promise<CanvasImageSource>;

const loadImage: ImageLoader = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
    if (img.complete && img.naturalWidth > 0) resolve(img);
  });

/** A rounded rectangle as a new path — `roundRect` alone adds to the current one. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas toBlob failed'))),
      'image/png',
    ),
  );
}

// ── Branded QR ───────────────────────────────────────────────────────────────

/** Draws a logo on a white rounded plate in the centre of a QR canvas. */
function overlayLogo(canvas: HTMLCanvasElement, logo: CanvasImageSource): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width * 0.2;
  const x = (canvas.width - size) / 2;
  const y = (canvas.height - size) / 2;
  const pad = canvas.width * 0.022;
  ctx.fillStyle = '#ffffff';
  roundRectPath(ctx, x - pad, y - pad, size + pad * 2, size + pad * 2, pad);
  ctx.fill();
  ctx.drawImage(logo, x, y, size, size);
}

/**
 * A QR code for `text` with the BottleCount logo in the centre, as a PNG data
 * URL. A logo that fails to load leaves a plain, still-scannable code.
 */
export async function brandedQrDataUrl(
  text: string,
  width = 320,
  logoSrc: string = QR_LOGO_SRC,
  load: ImageLoader = loadImage,
): Promise<string> {
  const canvas = await qrCanvas(text, width, 'H');
  try {
    overlayLogo(canvas, await load(logoSrc));
  } catch {
    /* no logo — the code still scans */
  }
  return canvas.toDataURL('image/png');
}

// ── Shareable ticket card ────────────────────────────────────────────────────

export interface TicketCardOptions {
  partyName: string;
  dateLabel: string;
  guestName: string;
  code: string;
  qrDataUrl: string;
  /** CSS gradient string from COVERS, e.g. linear-gradient(135deg,#FF7A3D,#FF3D77) */
  grad: string;
  emoji: string;
}

/** Compose a self-contained, shareable ticket PNG (cover, QR, guest, code). */
async function buildTicketCardBlob(
  opts: TicketCardOptions,
  load: ImageLoader = loadImage,
): Promise<Blob> {
  const W = 420;
  const H = 600;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  // Card background
  ctx.fillStyle = '#0b1220';
  roundRectPath(ctx, 0, 0, W, H, 22);
  ctx.fill();

  // Header band — cover gradient
  const cols = opts.grad.match(/#[0-9a-fA-F]{3,8}/g) ?? ['#ff7a3d', '#ff3d77'];
  const grad = ctx.createLinearGradient(0, 0, W, 140);
  grad.addColorStop(0, cols[0]!);
  grad.addColorStop(1, cols[cols.length - 1]!);
  ctx.save();
  roundRectPath(ctx, 0, 0, W, 140, 22);
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 140);
  ctx.restore();

  // Emoji + party name + date
  ctx.textAlign = 'left';
  ctx.font = '32px serif';
  ctx.fillText(opts.emoji, 26, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 25px system-ui, sans-serif';
  ctx.fillText(opts.partyName, 26, 100);
  ctx.font = '14px system-ui, sans-serif';
  ctx.globalAlpha = 0.92;
  ctx.fillText(opts.dateLabel + ' · admits one', 26, 124);
  ctx.globalAlpha = 1;

  // White QR plate
  const panel = 250;
  const px = (W - panel) / 2;
  const py = 168;
  ctx.fillStyle = '#ffffff';
  roundRectPath(ctx, px, py, panel, panel, 16);
  ctx.fill();

  // QR image (already branded)
  try {
    const qr = await load(opts.qrDataUrl);
    const qrSize = panel - 28;
    ctx.drawImage(qr, px + 14, py + 14, qrSize, qrSize);
  } catch {
    /* QR failed to load — leave the white plate */
  }

  // Guest name
  ctx.fillStyle = '#e9effa';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(opts.guestName, W / 2, py + panel + 46);

  // Ticket code
  ctx.fillStyle = '#9aa9c6';
  ctx.font = '13px monospace';
  ctx.fillText(opts.code, W / 2, py + panel + 72);

  // Brand footer
  ctx.fillStyle = '#ff7a3d';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('🎫 BottleCount', W / 2, H - 28);

  return canvasToBlob(canvas);
}

/** Wrap a ticket card blob as a File with a tidy filename. */
export async function buildTicketFile(
  opts: TicketCardOptions,
  load: ImageLoader = loadImage,
): Promise<File> {
  const blob = await buildTicketCardBlob(opts, load);
  const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
  return new File(
    [blob],
    `ticket_${safe(opts.guestName)}_${safe(opts.partyName)}.png`,
    { type: 'image/png' },
  );
}
