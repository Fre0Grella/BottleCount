import QRCode from 'qrcode';
import { signTicket } from './crypto';
import type { Party, TicketQRPayload } from './types';

// ── Ticket identity ──────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash — stable per-guest ticket id fallback. */
function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** Human-readable ticket code shown on the ticket, e.g. `BC-3-04217`. */
export function ticketCode(party: Party, name: string): string {
  const h = fnv1a(name + '·' + String(party.id));
  return `BC-${party.id}-${(h % 100000).toString().padStart(5, '0')}`;
}

/** Build the signed-QR payload for a guest's ticket. */
export function ticketPayload(party: Party, name: string): TicketQRPayload {
  const invite = party.invites.find((i) => i.name === name);
  const ticketId = invite?.id ?? fnv1a(name + '·' + String(party.id)) % 100000;
  // Expiry: party date +1 day at 06:00.
  const exp = new Date(party.date + 'T06:00:00');
  exp.setDate(exp.getDate() + 1);
  return {
    ticketId,
    partyId: party.id!,
    guestName: name,
    expiresAt: exp.toISOString(),
  };
}

/** Short "valid until" label derived from the payload. */
export function ticketExpiryLabel(party: Party): string {
  const exp = new Date(party.date + 'T12:00');
  exp.setDate(exp.getDate() + 1);
  return (
    exp.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' 06:00'
  );
}

// ── Canvas helpers ───────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
    if (img.complete && img.naturalWidth > 0) resolve(img);
  });
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

/**
 * Draw the BottleCount logo on a white rounded plate in the centre of a QR
 * canvas. Uses the dark-on-light logo so it reads on the white QR background.
 */
function overlayLogo(canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve();
    const logo = new Image();
    logo.onload = () => {
      const size = canvas.width * 0.2;
      const x = (canvas.width - size) / 2;
      const y = (canvas.height - size) / 2;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x - 7, y - 7, size + 14, size + 14, 8);
      ctx.fill();
      ctx.drawImage(logo, x, y, size, size);
      resolve();
    };
    logo.onerror = () => resolve();
    logo.src = `${import.meta.env.BASE_URL}logoLight.svg`;
  });
}

/** Render a signed ticket QR with the BottleCount logo in the centre. */
export async function ticketQrDataUrl(
  payload: TicketQRPayload,
): Promise<string> {
  const signed = await signTicket(payload);
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, signed, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'H', // headroom so the logo overlay stays scannable
    color: { dark: '#0b1220', light: '#ffffff' },
  });
  await overlayLogo(canvas);
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
export async function buildTicketCardBlob(
  opts: TicketCardOptions,
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
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.fill();

  // Header band — cover gradient
  const cols = opts.grad.match(/#[0-9a-fA-F]{3,8}/g) ?? ['#ff7a3d', '#ff3d77'];
  const grad = ctx.createLinearGradient(0, 0, W, 140);
  grad.addColorStop(0, cols[0]!);
  grad.addColorStop(1, cols[cols.length - 1]!);
  ctx.save();
  roundRect(ctx, 0, 0, W, 140, 22);
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
  roundRect(ctx, px, py, panel, panel, 16);
  ctx.fill();

  // QR image (already branded)
  try {
    const qr = await loadImage(opts.qrDataUrl);
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
export async function buildTicketFile(opts: TicketCardOptions): Promise<File> {
  const blob = await buildTicketCardBlob(opts);
  const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
  return new File(
    [blob],
    `ticket_${safe(opts.guestName)}_${safe(opts.partyName)}.png`,
    { type: 'image/png' },
  );
}

/** Trigger a browser download of a generated File. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
