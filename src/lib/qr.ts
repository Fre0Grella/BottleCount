import QRCode from 'qrcode';

/**
 * QR codes that carry the BottleCount mark in the middle.
 *
 * One helper for every QR the app draws — tickets, and invite links — so they
 * look like one product. The logo covers the centre of the code, which only
 * scans reliably with error correction at level H (about 30% of the code can
 * be lost and still read); anything that calls this gets that for free.
 */

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

/**
 * Draw the BottleCount logo on a white rounded plate in the centre of a QR
 * canvas. Uses the light-theme logo so it reads on the white QR background.
 * A logo that fails to load leaves a plain, still-scannable code.
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
      const pad = canvas.width * 0.022;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x - pad, y - pad, size + pad * 2, size + pad * 2, pad);
      ctx.fill();
      ctx.drawImage(logo, x, y, size, size);
      resolve();
    };
    logo.onerror = () => resolve();
    logo.src = `${import.meta.env.BASE_URL}logoLight.svg`;
  });
}

/** A QR code for `text` with the BottleCount logo in the centre, as a PNG data URL. */
export async function brandedQrDataUrl(
  text: string,
  width = 320,
): Promise<string> {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, text, {
    width,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#0b1220', light: '#ffffff' },
  });
  await overlayLogo(canvas);
  return canvas.toDataURL('image/png');
}
