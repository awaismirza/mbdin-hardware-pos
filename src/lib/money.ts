/**
 * Money. Every monetary value in this app is an integer number of paisa.
 * Rs 250.50 is 25050. There are no floats in the schema and none in the
 * arithmetic — formatting to rupees happens only at the render boundary.
 *
 * Nothing here uses Intl.NumberFormat: grouping must be byte-identical between
 * the screen, the printed receipt, the WhatsApp text and the CSV export, and
 * locale data on a cheap Android tablet is not something to bet a ledger on.
 * Grouping is Western (100,000) rather than South Asian (1,00,000), which is
 * what Pakistani retail software and printed invoices use.
 */

export const CURRENCY = 'PKR';
export const CURRENCY_SYMBOL = 'Rs';

/** Largest value we will accept anywhere — Rs 10 crore, in paisa. */
const MAX_PAISA = 100_000_000_00;

export function isPaisa(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Throws on anything that is not a whole number of paisa. Use at boundaries. */
export function assertPaisa(value: number, what = 'amount'): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${what} must be an integer number of paisa, got ${String(value)}`);
  }
  return value;
}

/**
 * Rupees (as typed by a human) to paisa. Accepts "250", "250.5", "250.50",
 * " 1,250.75 ", "-40", and Arabic-Indic digits pasted from a keyboard.
 * Returns null when the input is not a number the shopkeeper meant.
 */
export function parsePaisa(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return roundToPaisa(input * 100);
  }

  // Strips spaces, commas, the Arabic thousands separator (U+066C) and the
  // non-breaking space that arrives when a figure is pasted from a spreadsheet.
  const normalised = normaliseDigits(input).replace(/[\s,\u066C\u00A0]/g, '');
  if (normalised === '' || normalised === '-' || normalised === '.') return null;
  if (!/^-?\d*(?:\.\d*)?$/.test(normalised)) return null;

  const rupees = Number(normalised);
  if (!Number.isFinite(rupees)) return null;

  const paisa = roundToPaisa(rupees * 100);
  if (Math.abs(paisa) > MAX_PAISA) return null;
  return paisa;
}

/** Paisa to a plain rupee string with no symbol and no grouping: "250.50". */
export function paisaToRupeeString(paisa: number): string {
  assertPaisa(paisa);
  const negative = paisa < 0;
  const abs = Math.abs(paisa);
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;
  const body = fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

export interface FormatOptions {
  /** Include the "Rs" symbol. Default true. */
  symbol?: boolean;
  /** Always show two decimals, even when the value is whole. Default false. */
  forceDecimals?: boolean;
  /** Render a leading + on positive values. Used in the ledger. Default false. */
  signed?: boolean;
}

/**
 * The single formatting entry point. Two decimals are stored, zero decimals
 * are displayed when the value is whole — money is counted in rupees here and
 * "Rs 1,060.00" reads like a spreadsheet, not a shop.
 */
export function formatPKR(paisa: number, options: FormatOptions = {}): string {
  const { symbol = true, forceDecimals = false, signed = false } = options;
  assertPaisa(paisa);

  const negative = paisa < 0;
  const abs = Math.abs(paisa);
  const whole = Math.trunc(abs / 100);
  const fraction = abs % 100;

  let body = group(whole);
  if (forceDecimals || fraction !== 0) {
    body += `.${String(fraction).padStart(2, '0')}`;
  }

  const sign = negative ? '-' : signed && paisa > 0 ? '+' : '';
  return symbol ? `${sign}${CURRENCY_SYMBOL} ${body}` : `${sign}${body}`;
}

/** Multiply a unit price by a quantity that may carry decimals (weighed goods). */
export function lineTotal(pricePaisa: number, qty: number): number {
  assertPaisa(pricePaisa, 'price');
  if (!Number.isFinite(qty)) throw new TypeError(`qty must be finite, got ${String(qty)}`);
  return roundToPaisa(pricePaisa * qty);
}

export function sumPaisa(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += assertPaisa(value);
  return total;
}

/**
 * A percentage off a subtotal, rounded half-away-from-zero to the paisa.
 * 12.5% off Rs 99.99 is Rs 12.50 (1250 paisa), not 1249.875.
 */
export function percentOf(paisa: number, percent: number): number {
  assertPaisa(paisa);
  if (!Number.isFinite(percent)) return 0;
  return roundToPaisa((paisa * percent) / 100);
}

/** Clamp a discount so it can never exceed the subtotal or go negative. */
export function clampDiscount(subtotalPaisa: number, discountPaisa: number): number {
  assertPaisa(subtotalPaisa);
  assertPaisa(discountPaisa);
  if (discountPaisa < 0) return 0;
  if (discountPaisa > subtotalPaisa) return subtotalPaisa;
  return discountPaisa;
}

/**
 * Round to whole paisa, half away from zero. Banker's rounding would quietly
 * lose a paisa on alternate lines and the day's till would not reconcile.
 */
export function roundToPaisa(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Nudge by an epsilon proportional to the magnitude, so that a product like
  // 3333 * 3 = 9998.999999999998 rounds to 9999 rather than 9998.
  const scaled = value + (value >= 0 ? 1 : -1) * 1e-9 * Math.max(1, Math.abs(value));
  return value >= 0 ? Math.round(scaled) : -Math.round(-scaled);
}

/** Quantities are REAL because weighed goods need decimals; three places max. */
export function roundQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  return Math.round((qty + Number.EPSILON * Math.max(1, Math.abs(qty))) * 1000) / 1000;
}

export function formatQty(qty: number): string {
  const rounded = roundQty(qty);
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

/** Margin as a percentage of the selling price, or null when price is zero. */
export function marginPercent(costPaisa: number, pricePaisa: number): number | null {
  assertPaisa(costPaisa, 'cost');
  assertPaisa(pricePaisa, 'price');
  if (pricePaisa === 0) return null;
  return Math.round(((pricePaisa - costPaisa) / pricePaisa) * 1000) / 10;
}

/** Quick-tender denominations, in paisa. */
export const TENDER_DENOMINATIONS = [50_00, 100_00, 500_00, 1000_00, 5000_00] as const;

function group(whole: number): string {
  const digits = String(whole);
  if (digits.length <= 3) return digits;
  let out = '';
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    out = digits[i]! + out;
    count += 1;
    if (count % 3 === 0 && i > 0) out = `,${out}`;
  }
  return out;
}

/** Arabic-Indic and Extended Arabic-Indic digits to Latin. */
function normaliseDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const code = char.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}
