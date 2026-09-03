/**
 * Getting a backup off the device.
 *
 * Share first, because on an Android tablet that is the sheet with WhatsApp,
 * Drive and Gmail in it, and sending the file to yourself on WhatsApp is what
 * the shopkeeper will actually do. Download second, for a desktop browser or
 * when Share is unavailable.
 */

import { setSetting } from '../db/repos/settingsRepo';
import { nowIso } from '../lib/dates';
import type { ExportedFile } from './exporters';

export type SendResult = 'shared' | 'downloaded' | 'cancelled';

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false;
  try {
    const probe = new File(['probe'], 'probe.txt', { type: 'text/plain' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Opens the system share sheet. Returns 'cancelled' when the user backs out,
 * which is not an error and must not be reported as one.
 */
export async function shareFile(file: ExportedFile): Promise<SendResult> {
  if (!canShareFiles()) return download(file);

  const payload = new File([file.blob], file.name, { type: file.type });
  try {
    await navigator.share({ files: [payload], title: file.name });
    await markBackedUp();
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    // Some Android builds reject a share of an unusual MIME type; falling back
    // to a download is better than telling the shopkeeper it failed.
    return download(file);
  }
}

export async function download(file: ExportedFile): Promise<SendResult> {
  const url = URL.createObjectURL(file.blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoked on the next frame: revoking immediately cancels the download in
    // some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  await markBackedUp();
  return 'downloaded';
}

/**
 * Only a real off-device backup counts. The archive folder deliberately does
 * not call this, so copying to the archive never silences the overdue bar.
 */
export async function markBackedUp(): Promise<void> {
  await setSetting('last_backup_at', nowIso());
}
