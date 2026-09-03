/**
 * Invoice numbers.
 *
 * The number is produced inside the sale's own transaction, in SQL, by reading
 * and then incrementing settings.next_invoice_no. Doing it in JavaScript first
 * would leave a window where two sales could read the same value, and
 * sales.invoice_no is UNIQUE — the second sale would fail after the shopkeeper
 * had already taken the money.
 */

/** Zero-padded to six digits: INV-000123. Wide enough for a lifetime of sales. */
export const INVOICE_DIGITS = 6;

/**
 * The SQL expression that yields the next invoice number. Used as a value in
 * the INSERT that creates the sale.
 */
export const NEXT_INVOICE_SQL = `
  printf('%s-%0${INVOICE_DIGITS}d',
    (SELECT value FROM settings WHERE key = 'invoice_prefix'),
    CAST((SELECT value FROM settings WHERE key = 'next_invoice_no') AS INTEGER))`;

/** The statement that advances the counter. Must run in the same transaction. */
export const ADVANCE_INVOICE_SQL = `
  UPDATE settings
  SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
  WHERE key = 'next_invoice_no'`;

/** The same formatting in JavaScript, for previews and tests. */
export function formatInvoiceNo(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(INVOICE_DIGITS, '0')}`;
}
