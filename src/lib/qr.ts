import QRCode from 'qrcode';

/**
 * QR codes, and nothing else.
 *
 * Error correction defaults to level H (about 30% of the code can be lost and
 * still read), because every QR the app draws gets a mark over its centre —
 * see `brandedQrDataUrl` in `drawing.ts`, which is where that mark lives.
 */

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

/** A QR code for `text`, drawn on a fresh canvas `width` pixels square. */
export async function qrCanvas(
  text: string,
  width = 320,
  errorCorrectionLevel: QrErrorCorrection = 'H',
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, text, {
    width,
    margin: 2,
    errorCorrectionLevel,
    color: { dark: '#0b1220', light: '#ffffff' },
  });
  return canvas;
}
