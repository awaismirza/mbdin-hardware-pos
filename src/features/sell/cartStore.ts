import { create } from 'zustand';

import {
  clampDiscount,
  lineTotal,
  percentOf,
  roundQty,
  sumPaisa,
} from '../../lib/money';
import {
  holdCart,
  loadActiveCart,
  resumeHeldCart,
  saveActiveCart,
  type CartSnapshot,
} from '../../db/repos/salesRepo';
import type { CartLine, Product, Unit } from '../../types/domain';

export type DiscountMode = 'rupees' | 'percent';

interface CartState {
  lines: CartLine[];
  customerId: number | null;
  discountMode: DiscountMode;
  /** The raw figure the shopkeeper typed: paisa in rupees mode, percent in the other. */
  discountInput: number;
  restored: boolean;
  hydrated: boolean;

  hydrate(): Promise<void>;
  addProduct(product: Product, qty?: number): void;
  addAdHoc(label: string, pricePaisa: number): void;
  setQty(key: string, qty: number): void;
  bumpQty(key: string, delta: number): void;
  setPrice(key: string, pricePaisa: number): void;
  removeLine(key: string): void;
  setCustomer(customerId: number | null): void;
  setDiscount(mode: DiscountMode, value: number): void;
  clear(): void;
  hold(label: string | null): Promise<void>;
  resume(id: number): Promise<boolean>;
  acknowledgeRestore(): void;

  subtotalPaisa(): number;
  discountPaisa(): number;
  totalPaisa(): number;
  snapshot(): CartSnapshot;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `line-${String(Date.now())}-${String(keySeq)}`;
}

/**
 * The cart.
 *
 * Zustand holds it for rendering, but the database holds it for keeping: every
 * mutation writes the whole cart back to held_carts, so a power cut or a killed
 * tab loses nothing. The write is fire-and-forget — a sale must never wait on a
 * disk flush to put a line on the screen — and the next mutation supersedes any
 * write still in flight.
 */
export const useCart = create<CartState>((set, get) => {
  function persist(): void {
    void saveActiveCart(get().snapshot()).catch((error: unknown) => {
      console.warn('[cart] could not save the cart', error);
    });
  }

  function update(mutate: (state: CartState) => Partial<CartState>): void {
    set((state) => mutate(state));
    persist();
  }

  return {
    lines: [],
    customerId: null,
    discountMode: 'rupees',
    discountInput: 0,
    restored: false,
    hydrated: false,

    async hydrate() {
      if (get().hydrated) return;
      const saved = await loadActiveCart();
      set({
        hydrated: true,
        ...(saved
          ? {
              lines: saved.lines,
              customerId: saved.customerId,
              discountMode: 'rupees' as DiscountMode,
              discountInput: saved.discountPaisa,
              restored: saved.lines.length > 0,
            }
          : {}),
      });
    },

    addProduct(product, qty = 1) {
      const quantity = roundQty(qty);
      if (quantity <= 0) return;
      update((state) => {
        // Tapping the same tile again adds one more of it rather than a second
        // line — a shopkeeper tapping four times means four, not four lines.
        const existing = state.lines.find(
          (line) => line.productId === product.id && !line.adHoc,
        );
        if (existing) {
          return {
            lines: state.lines.map((line) =>
              line.key === existing.key ? { ...line, qty: roundQty(line.qty + quantity) } : line,
            ),
          };
        }
        const line: CartLine = {
          key: nextKey(),
          productId: product.id,
          name: product.nameUr?.trim() || product.nameEn?.trim() || '',
          unit: product.unit,
          qty: quantity,
          pricePaisa: product.pricePaisa,
          costPaisa: product.costPaisa,
          adHoc: false,
        };
        return { lines: [...state.lines, line] };
      });
    },

    addAdHoc(label, pricePaisa) {
      update((state) => ({
        lines: [
          ...state.lines,
          {
            key: nextKey(),
            productId: null,
            name: label,
            unit: 'piece' as Unit,
            qty: 1,
            pricePaisa,
            costPaisa: 0,
            adHoc: true,
          },
        ],
      }));
    },

    setQty(key, qty) {
      const rounded = roundQty(qty);
      if (rounded <= 0) {
        get().removeLine(key);
        return;
      }
      update((state) => ({
        lines: state.lines.map((line) => (line.key === key ? { ...line, qty: rounded } : line)),
      }));
    },

    bumpQty(key, delta) {
      const line = get().lines.find((entry) => entry.key === key);
      if (!line) return;
      get().setQty(key, line.qty + delta);
    },

    setPrice(key, pricePaisa) {
      update((state) => ({
        lines: state.lines.map((line) => (line.key === key ? { ...line, pricePaisa } : line)),
      }));
    },

    removeLine(key) {
      update((state) => ({ lines: state.lines.filter((line) => line.key !== key) }));
    },

    setCustomer(customerId) {
      update(() => ({ customerId }));
    },

    setDiscount(mode, value) {
      update(() => ({ discountMode: mode, discountInput: value }));
    },

    clear() {
      update(() => ({
        lines: [],
        customerId: null,
        discountMode: 'rupees' as DiscountMode,
        discountInput: 0,
        restored: false,
      }));
    },

    async hold(label) {
      const snapshot = get().snapshot();
      if (snapshot.lines.length === 0) return;
      await holdCart(snapshot, label);
      set({
        lines: [],
        customerId: null,
        discountMode: 'rupees',
        discountInput: 0,
        restored: false,
      });
    },

    async resume(id) {
      const snapshot = await resumeHeldCart(id);
      if (!snapshot) return false;
      set({
        lines: snapshot.lines,
        customerId: snapshot.customerId,
        discountMode: 'rupees',
        discountInput: snapshot.discountPaisa,
        restored: false,
      });
      persist();
      return true;
    },

    acknowledgeRestore() {
      set({ restored: false });
    },

    subtotalPaisa() {
      return sumPaisa(get().lines.map((line) => lineTotal(line.pricePaisa, line.qty)));
    },

    discountPaisa() {
      const { discountMode, discountInput } = get();
      const subtotal = get().subtotalPaisa();
      const raw =
        discountMode === 'percent' ? percentOf(subtotal, discountInput) : discountInput;
      return clampDiscount(subtotal, raw);
    },

    totalPaisa() {
      return get().subtotalPaisa() - get().discountPaisa();
    },

    snapshot() {
      const { lines, customerId } = get();
      return { lines, customerId, discountPaisa: get().discountPaisa() };
    },
  };
});
