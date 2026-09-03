/**
 * Row shapes as SQLite returns them, and the mappers to domain objects.
 *
 * Kept in one place so that snake_case and integer booleans stop at the
 * repository boundary and never leak into a component.
 */

import type {
  Category,
  Customer,
  LedgerEntry,
  LedgerKind,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  SaleStatus,
  StockMovement,
  StockMovementKind,
  TenderMethod,
  Unit,
} from '../../types/domain';
import { UNITS } from '../../types/domain';

export interface ProductRow {
  id: number;
  sku: string | null;
  barcode: string | null;
  name_en: string | null;
  name_ur: string | null;
  category_id: number | null;
  unit: string;
  cost_paisa: number;
  price_paisa: number;
  stock_qty: number;
  low_stock_threshold: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  has_photo?: number;
}

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    nameEn: row.name_en,
    nameUr: row.name_ur,
    categoryId: row.category_id,
    unit: toUnit(row.unit),
    costPaisa: row.cost_paisa,
    pricePaisa: row.price_paisa,
    stockQty: row.stock_qty,
    lowStockThreshold: row.low_stock_threshold,
    isActive: row.is_active === 1,
    hasPhoto: (row.has_photo ?? 0) > 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Anything unrecognised falls back to `piece`; a bad unit must not break a row. */
export function toUnit(value: string): Unit {
  return (UNITS as readonly string[]).includes(value) ? (value as Unit) : 'piece';
}

export interface CategoryRow {
  id: number;
  name_en: string | null;
  name_ur: string | null;
  sort_order: number;
  created_at: string;
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    nameEn: row.name_en,
    nameUr: row.name_ur,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export interface CustomerRow {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  credit_limit_paisa: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  balance_paisa?: number;
}

export function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    creditLimitPaisa: row.credit_limit_paisa,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SaleRow {
  id: number;
  invoice_no: string;
  customer_id: number | null;
  subtotal_paisa: number;
  discount_paisa: number;
  total_paisa: number;
  paid_paisa: number;
  payment_method: string;
  status: string;
  note: string | null;
  created_at: string;
  voided_at: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
}

export function toSale(row: SaleRow): Sale {
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    customerId: row.customer_id,
    subtotalPaisa: row.subtotal_paisa,
    discountPaisa: row.discount_paisa,
    totalPaisa: row.total_paisa,
    paidPaisa: row.paid_paisa,
    paymentMethod: row.payment_method as PaymentMethod,
    status: row.status as SaleStatus,
    note: row.note,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
  };
}

export interface SaleItemRow {
  id: number;
  sale_id: number;
  product_id: number | null;
  name_snapshot: string;
  unit_snapshot: string;
  qty: number;
  price_paisa: number;
  cost_paisa: number;
  line_paisa: number;
}

export function toSaleItem(row: SaleItemRow): SaleItem {
  return {
    id: row.id,
    saleId: row.sale_id,
    productId: row.product_id,
    nameSnapshot: row.name_snapshot,
    unitSnapshot: row.unit_snapshot,
    qty: row.qty,
    pricePaisa: row.price_paisa,
    costPaisa: row.cost_paisa,
    linePaisa: row.line_paisa,
  };
}

export interface LedgerRow {
  id: number;
  customer_id: number;
  sale_id: number | null;
  kind: string;
  amount_paisa: number;
  method: string | null;
  note: string | null;
  created_at: string;
  invoice_no?: string | null;
}

export function toLedgerEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    customerId: row.customer_id,
    saleId: row.sale_id,
    kind: row.kind as LedgerKind,
    amountPaisa: row.amount_paisa,
    method: (row.method as TenderMethod | null) ?? null,
    note: row.note,
    createdAt: row.created_at,
  };
}

export interface StockMovementRow {
  id: number;
  product_id: number;
  kind: string;
  qty_delta: number;
  sale_id: number | null;
  note: string | null;
  created_at: string;
}

export function toStockMovement(row: StockMovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_id,
    kind: row.kind as StockMovementKind,
    qtyDelta: row.qty_delta,
    saleId: row.sale_id,
    note: row.note,
    createdAt: row.created_at,
  };
}
