/**
 * WhatsApp message builders.
 *
 * A wa.me link is the only URL this app ever opens, and it is always the result
 * of a deliberate tap. In Mandi Bahauddin a WhatsApp receipt will be used far
 * more than a printed one — the customer has the phone, the shop may not have
 * working paper in the printer.
 */

import { formatDate, formatDateTime } from './dates';
import { formatPKR, formatQty } from './money';
import type { SaleWithItems } from '../types/domain';

/**
 * Pakistani numbers arrive as 03001234567, 0300-1234567, +92 300 1234567 or
 * 92 300 1234567. wa.me wants digits only, with the country code and no plus.
 */
export function toWaNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return null;

  if (digits.startsWith('92') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('3')) return `92${digits}`;
  // Anything else is passed through: a foreign number is still a number, and
  // WhatsApp will tell the user if it is wrong better than we can.
  return digits;
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const number = toWaNumber(phone);
  const encoded = encodeURIComponent(text);
  return number ? `https://wa.me/${number}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export interface ShopDetails {
  name: string;
  phone: string;
  footer: string;
}

/** The receipt as plain text. No markdown, no emoji — this gets read aloud. */
export function receiptText(sale: SaleWithItems, shop: ShopDetails): string {
  const lines: string[] = [];
  if (shop.name.trim()) lines.push(shop.name.trim());
  lines.push(`${sale.invoiceNo} · ${formatDateTime(sale.createdAt)}`);
  if (sale.customerName) lines.push(sale.customerName);
  lines.push('');

  for (const item of sale.items) {
    lines.push(`${item.nameSnapshot}  ${formatQty(item.qty)} × ${formatPKR(item.pricePaisa)}`);
    lines.push(`   ${formatPKR(item.linePaisa)}`);
  }

  lines.push('');
  if (sale.discountPaisa > 0) {
    lines.push(`Subtotal: ${formatPKR(sale.subtotalPaisa)}`);
    lines.push(`Discount: ${formatPKR(sale.discountPaisa)}`);
  }
  lines.push(`Total: ${formatPKR(sale.totalPaisa)}`);
  lines.push(`Paid: ${formatPKR(sale.paidPaisa)}`);

  const due = sale.totalPaisa - sale.paidPaisa;
  if (due > 0) lines.push(`Udhaar: ${formatPKR(due)}`);

  if (shop.phone.trim()) lines.push('', shop.phone.trim());
  if (shop.footer.trim()) lines.push(shop.footer.trim());

  return lines.join('\n');
}

/**
 * A reminder about an outstanding balance. Polite, short, and editable before
 * sending — the shopkeeper knows the relationship, we do not.
 */
export function reminderText(
  customerName: string,
  balancePaisa: number,
  shop: ShopDetails,
  language: 'ur' | 'en',
): string {
  const amount = formatPKR(balancePaisa);
  const shopName = shop.name.trim() || 'Dukaan';

  if (language === 'ur') {
    return [
      `السلام علیکم ${customerName} صاحب،`,
      '',
      `${shopName} پر آپ کے ذمے ${amount} باقی ہیں۔`,
      'سہولت کے مطابق ادائیگی کر دیجیے گا۔',
      '',
      'شکریہ',
      shop.phone.trim(),
    ]
      .filter((line) => line !== undefined)
      .join('\n');
  }

  return [
    `Assalam o alaikum ${customerName},`,
    '',
    `Your balance at ${shopName} is ${amount}.`,
    'Please settle it whenever convenient.',
    '',
    'Thank you',
    shop.phone.trim(),
  ].join('\n');
}

/** Confirmation that a payment was received, sent right after taking it. */
export function paymentText(
  customerName: string,
  paidPaisa: number,
  balancePaisa: number,
  shop: ShopDetails,
  language: 'ur' | 'en',
): string {
  const shopName = shop.name.trim() || 'Dukaan';
  if (language === 'ur') {
    return [
      `${customerName} صاحب،`,
      `${formatPKR(paidPaisa)} وصول ہو گئے۔ شکریہ۔`,
      balancePaisa > 0 ? `باقی ${formatPKR(balancePaisa)} ہیں۔` : 'آپ کا حساب صاف ہے۔',
      '',
      shopName,
      formatDate(new Date().toISOString()),
    ].join('\n');
  }
  return [
    `${customerName},`,
    `Received ${formatPKR(paidPaisa)}. Thank you.`,
    balancePaisa > 0 ? `Balance remaining: ${formatPKR(balancePaisa)}.` : 'Your account is clear.',
    '',
    shopName,
    formatDate(new Date().toISOString()),
  ].join('\n');
}
