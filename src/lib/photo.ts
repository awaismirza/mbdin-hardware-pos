/**
 * Product photos from the device camera.
 *
 * Capture uses `<input type="file" accept="image/*" capture="environment">`
 * rather than a getUserMedia viewfinder. That hands the job to the phone's own
 * camera app, which means autofocus, flash, tap-to-focus and the shutter the
 * user already knows — and it is the one path that works on iOS Safari whether
 * the app runs in a tab or from the home screen. The live viewfinder is kept
 * for barcode scanning, where continuous frames are the point.
 *
 * Every photo is downscaled and re-encoded here, before it goes anywhere near
 * the database. A modern phone camera produces 3–8 MB per shot; at 640px on the
 * long edge and JPEG quality 0.72 the same picture is 40–60 KB, which is the
 * difference between a 25 MB ledger and a 3 GB one for a shop with 400 lines.
 */

export const PHOTO_MAX_EDGE = 640;
export const PHOTO_QUALITY = 0.72;
export const PHOTO_MIME = 'image/jpeg';

export interface PreparedPhoto {
  mime: string;
  width: number;
  height: number;
  bytes: Uint8Array;
}

export class PhotoError extends Error {}

/**
 * Reads a picked file, corrects orientation, downscales and re-encodes it.
 * `createImageBitmap` applies the EXIF rotation for us, which a plain <img>
 * would not — a photo taken in portrait would otherwise be stored on its side.
 */
export async function preparePhoto(file: File | Blob): Promise<PreparedPhoto> {
  if (file.size === 0) throw new PhotoError('empty file');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    throw new PhotoError(`could not decode image: ${String(error)}`);
  }

  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const blob = await drawToBlob(bitmap, width, height);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { mime: PHOTO_MIME, width, height, bytes };
  } finally {
    bitmap.close();
  }
}

async function drawToBlob(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
  // OffscreenCanvas where it exists (Chrome, and Safari 16.4+), otherwise a
  // detached <canvas>. Both keep the work off the layout tree.
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new PhotoError('no 2d context');
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: PHOTO_MIME, quality: PHOTO_QUALITY });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new PhotoError('no 2d context');
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PhotoError('encode failed'))),
      PHOTO_MIME,
      PHOTO_QUALITY,
    );
  });
}

/** Wraps stored bytes in an object URL. Callers must revoke it when done. */
export function photoObjectUrl(photo: { mime: string; bytes: Uint8Array }): string {
  // Copy into a plain ArrayBuffer: the view may sit over a larger buffer.
  const copy = photo.bytes.slice();
  return URL.createObjectURL(new Blob([copy], { type: photo.mime }));
}
