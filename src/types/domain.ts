/** Domain types. These mirror the schema; repositories return these, not rows. */

export type Unit = 'piece' | 'kg' | 'gram' | 'litre' | 'ml' | 'dozen' | 'metre' | 'packet';

export const UNITS: readonly Unit[] = [
  'piece',
  'kg',
  'gram',
  'litre',
  'ml',
  'dozen',
  'metre',
  'packet',
];

/** Units that are weighed or measured, so the number pad offers decimals. */
export const FRACTIONAL_UNITS: ReadonlySet<Unit> = new Set<Unit>([
  'kg',
  'gram',
  'litre',
  'ml',
  'metre',
]);

export type PaymentMethod = 'cash' | 'credit' | 'easypaisa' | 'jazzcash' | 'bank' | 'mixed';

/** Methods a payment can actually arrive by. 'credit' is an absence of payment. */
export type TenderMethod = 'cash' | 'easypaisa' | 'jazzcash' | 'bank';

export const TENDER_METHODS: readonly TenderMethod[] = ['cash', 'easypaisa', 'jazzcash', 'bank'];

export type SaleStatus = 'draft' | 'completed' | 'void';

export type LedgerKind = 'charge' | 'payment' | 'adjustment';

export type StockMovementKind =
  | 'purchase'
  | 'sale'
  | 'adjustment'
  | 'return'
  | 'damage'
  | 'opening';

export interface Category {
  id: number;
  nameEn: string | null;
  nameUr: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: number;
  sku: string | null;
  barcode: string | null;
  nameEn: string | null;
  nameUr: string | null;
  categoryId: number | null;
  unit: Unit;
  costPaisa: number;
  pricePaisa: number;
  stockQty: number;
  lowStockThreshold: number;
  isActive: boolean;
  hasPhoto: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDraft {
  id?: number;
  sku?: string | null;
  barcode?: string | null;
  nameEn?: string | null;
  nameUr?: string | null;
  categoryId?: number | null;
  unit: Unit;
  costPaisa: number;
  pricePaisa: number;
  /** Only honoured when creating: writes an `opening` stock movement. */
  openingQty?: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export interface ProductImage {
  productId: number;
  mime: string;
  width: number;
  height: number;
  bytes: Uint8Array;
  createdAt: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  creditLimitPaisa: number;
  isActive: boolean;
  hasPhoto: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerWithBalance extends Customer {
  /** Positive = owes the shop. Always derived from ledger_entries. */
  balancePaisa: number;
}

export interface SaleItem {
  id: number;
  saleId: number;
  productId: number | null;
  nameSnapshot: string;
  unitSnapshot: string;
  qty: number;
  pricePaisa: number;
  costPaisa: number;
  linePaisa: number;
}

export interface Sale {
  id: number;
  invoiceNo: string;
  customerId: number | null;
  subtotalPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  paidPaisa: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  note: string | null;
  createdAt: string;
  voidedAt: string | null;
}

export interface SaleWithItems extends Sale {
  items: SaleItem[];
  customerName: string | null;
  customerPhone: string | null;
}

export interface LedgerEntry {
  id: number;
  customerId: number;
  saleId: number | null;
  kind: LedgerKind;
  amountPaisa: number;
  method: TenderMethod | null;
  note: string | null;
  createdAt: string;
}

export interface LedgerEntryWithRunning extends LedgerEntry {
  runningPaisa: number;
  invoiceNo: string | null;
}

export interface StockMovement {
  id: number;
  productId: number;
  kind: StockMovementKind;
  qtyDelta: number;
  saleId: number | null;
  note: string | null;
  createdAt: string;
}

/** A line in the cart, before it becomes a sale_items row. */
export interface CartLine {
  /** Stable across re-renders; not a database id. */
  key: string;
  productId: number | null;
  name: string;
  unit: Unit;
  qty: number;
  /** Unit price for this sale. May differ from the product's price. */
  pricePaisa: number;
  /** Unit cost snapshotted when the line was added, for margin reporting. */
  costPaisa: number;
  /** True for a quick-sell line with no product behind it. */
  adHoc: boolean;
}

export interface HeldCart {
  id: number;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  totalPaisa: number;
}
