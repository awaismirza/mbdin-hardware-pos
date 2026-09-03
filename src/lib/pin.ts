/**
 * The optional 4-digit PIN on Settings and Reports.
 *
 * This exists to stop a customer leaning over the counter and reading the day's
 * takings. It is NOT security, and the UI says so in as many words:
 *
 *   - anyone with the device can read the database directly through devtools
 *   - a four-digit space is 10,000 guesses, which is nothing
 *   - there is no rate limiting, because there is no server to enforce one
 *
 * It is hashed rather than stored in the clear only so that a backup file
 * opened in a text editor does not show the shopkeeper's PIN — which, being
 * four digits, is very likely also the PIN on something that does matter.
 */

const SALT = 'dukaan-pin-v1';

export async function hashPin(pin: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${SALT}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function pinMatches(pin: string, stored: string): Promise<boolean> {
  if (!stored) return true;
  return (await hashPin(pin)) === stored;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
